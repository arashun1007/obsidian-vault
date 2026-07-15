#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate species images with fal (GPT Image 2) and wire them into the app.

For each selected species this builds a consistent "field-guide" prompt from
assets/data/fish.json, calls fal's GPT Image 2 text-to-image endpoint, saves
the result to assets/images/<id>.jpg, and sets that species' `imageAsset` in
fish.json. The Flutter app already reads `imageAsset` and swaps the generated
placeholder for the real image with no code change.

Billing happens on YOUR fal account — set FAL_KEY first:

    export FAL_KEY=xxxxxxxx-....
    python3 tool/gen_images.py            # 10-species pilot (default)
    python3 tool/gen_images.py --all      # every species missing an image
    python3 tool/gen_images.py --ids madai,kuromaguro
    python3 tool/gen_images.py --quality high --size 1024x1024

GPT Image 2 medium quality is ~$0.02/image, so the 10-species pilot is ~$0.20.
"""
import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA = os.path.join(ROOT, "assets/data/fish.json")
IMG_DIR = os.path.join(ROOT, "assets/images")
FAL_ENDPOINT = "https://fal.run/openai/gpt-image-2"

# Default pilot: 10 species with distinct silhouettes across categories.
PILOT = [
    "madai", "kuromaguro", "maaji", "sanma", "torafugu",
    "unagi", "surumeika", "kurumaebi", "zuwaigani", "hotate",
]

# English common-name hints improve accuracy (models know Latin + English best).
EN_HINT = {
    "madai": "red sea bream", "kuromaguro": "Pacific bluefin tuna",
    "maaji": "Japanese horse mackerel", "sanma": "Pacific saury",
    "torafugu": "tiger pufferfish", "unagi": "Japanese eel",
    "surumeika": "Japanese flying squid", "kurumaebi": "kuruma prawn",
    "zuwaigani": "snow crab", "hotate": "Japanese scallop",
}

# Category → the noun and any framing tweak for the prompt.
CATEGORY_NOUN = {
    "blue": "fish", "white": "fish", "migratory": "fish", "rockfish": "fish",
    "deep": "fish", "freshwater": "fish", "other": "sea creature",
    "shellfish": "shellfish", "cephalopod": "sea creature",
    "crustacean": "crustacean",
}

STYLE = (
    "Scientific field-guide reference photograph of a single whole {noun}, "
    "shown in full side profile from head to tail, the entire body centered "
    "and fully visible, on a plain soft off-white (#F4F1EA) seamless studio "
    "background, even soft diffused lighting, natural accurate coloration and "
    "markings, sharp high detail, no text, no labels, no watermark, no props, "
    "no hands, no plate."
)


def build_prompt(sp):
    noun = CATEGORY_NOUN.get(sp["category"], "sea creature")
    en = EN_HINT.get(sp["id"])
    subject = f"{en} ({sp['scientificName']})" if en else sp["scientificName"]
    return (
        f"{STYLE.format(noun=noun)} The subject is a {subject}, "
        f"a Japanese market {noun}."
    )


def fal_generate(prompt, quality, size, fal_key, timeout=180):
    w, h = (int(x) for x in size.lower().split("x"))
    body = json.dumps({
        "prompt": prompt,
        "image_size": {"width": w, "height": h},
        "quality": quality,          # low | medium | high
        "num_images": 1,
        "output_format": "jpeg",
    }).encode()
    req = urllib.request.Request(
        FAL_ENDPOINT, data=body, method="POST",
        headers={
            "Authorization": f"Key {fal_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        out = json.load(r)
    # fal returns {"images": [{"url": "..."}], ...}
    images = out.get("images") or []
    if not images or "url" not in images[0]:
        raise RuntimeError(f"unexpected fal response: {str(out)[:300]}")
    return images[0]["url"]


def download(url, dest, timeout=120):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        data = r.read()
    with open(dest, "wb") as f:
        f.write(data)
    return len(data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", help="comma-separated species ids")
    ap.add_argument("--all", action="store_true",
                    help="all species that don't yet have an image")
    ap.add_argument("--quality", default="medium",
                    choices=["low", "medium", "high"])
    ap.add_argument("--size", default="1024x1024",
                    help="WxH, edges multiple of 16, max edge 3840")
    ap.add_argument("--overwrite", action="store_true")
    args = ap.parse_args()

    fal_key = os.environ.get("FAL_KEY")
    if not fal_key:
        sys.exit("FAL_KEY is not set. `export FAL_KEY=...` first "
                 "(billing is on your fal account).")

    with open(DATA, encoding="utf-8") as f:
        doc = json.load(f)
    by_id = {s["id"]: s for s in doc["species"]}

    if args.ids:
        ids = [i.strip() for i in args.ids.split(",") if i.strip()]
    elif args.all:
        ids = [s["id"] for s in doc["species"]
               if not s.get("imageAsset") or args.overwrite]
    else:
        ids = PILOT

    os.makedirs(IMG_DIR, exist_ok=True)
    est = {"low": 0.005, "medium": 0.02, "high": 0.19}.get(args.quality, 0.02)
    print(f"Generating {len(ids)} image(s) at {args.quality} "
          f"(~${est*len(ids):.2f} on your fal account)\n")

    done = 0
    for i, fid in enumerate(ids, 1):
        sp = by_id.get(fid)
        if not sp:
            print(f"[{i}/{len(ids)}] {fid}: NOT FOUND, skipping")
            continue
        rel = f"assets/images/{fid}.jpg"
        dest = os.path.join(ROOT, rel)
        if os.path.exists(dest) and not args.overwrite:
            print(f"[{i}/{len(ids)}] {sp['name']}: exists, skipping")
            sp["imageAsset"] = rel
            done += 1
            continue
        prompt = build_prompt(sp)
        try:
            url = fal_generate(prompt, args.quality, args.size, fal_key)
            n = download(url, dest)
            sp["imageAsset"] = rel
            done += 1
            print(f"[{i}/{len(ids)}] {sp['name']}: saved {rel} ({n//1024} KB)")
        except urllib.error.HTTPError as e:
            print(f"[{i}/{len(ids)}] {sp['name']}: HTTP {e.code} "
                  f"{e.read()[:200]!r}")
        except Exception as e:  # noqa: BLE001
            print(f"[{i}/{len(ids)}] {sp['name']}: ERROR {e}")
        time.sleep(0.3)

    # Persist imageAsset paths back into fish.json.
    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    print(f"\nDone: {done}/{len(ids)} images. Updated {DATA}.")
    print("Next: ensure `assets/images/` is listed in pubspec.yaml, then "
          "`flutter run`.")


if __name__ == "__main__":
    main()
