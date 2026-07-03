#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build a subset Noto Sans JP covering exactly the glyphs the app uses.

Gathers every character from the dataset and the Dart/UI source, then asks
Google Fonts (css2 `text=` param) for a subset per weight. The `text=`
parameter is length-capped, so the characters are requested in chunks and
the resulting .ttf slices are merged into one font per weight.

Run this after editing the dataset or UI strings so newly used kanji are
covered:  python3 tool/get_font.py
"""
import glob, os, re, subprocess, tempfile, urllib.parse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FONT_DIR = os.path.join(ROOT, "assets/fonts")
os.makedirs(FONT_DIR, exist_ok=True)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")
CHUNK = 60  # characters per css2 request (well under the length cap)


def collect_chars():
    chars = set()
    with open(os.path.join(ROOT, "assets/data/fish.json"), encoding="utf-8") as f:
        chars.update(f.read())
    for path in glob.glob(os.path.join(ROOT, "lib/**/*.dart"), recursive=True):
        with open(path, encoding="utf-8") as f:
            chars.update(f.read())
    chars = {c for c in chars if c.isprintable() and c != " "}
    chars.update("0123456789〜・（）()、。！？ '/月種全約最大")
    return "".join(sorted(chars))


def fetch_slice(weight, txt):
    from fontTools.ttLib import TTFont

    fam = urllib.parse.quote(f"Noto Sans JP:wght@{weight}")
    url = (f"https://fonts.googleapis.com/css2?family={fam}"
           f"&text={urllib.parse.quote(txt)}")
    css = subprocess.run(["curl", "-sS", "-A", UA, url],
                         capture_output=True, text=True).stdout
    # The chunk endpoint serves woff2 via a /l/font?kit=... URL.
    m = re.search(r"src:\s*url\((https://fonts\.gstatic\.com/[^)]+)\)", css)
    if not m:
        raise SystemExit("no font url for chunk; css head:\n" + css[:300])
    raw = tempfile.NamedTemporaryFile(suffix=".bin", delete=False).name
    subprocess.run(["curl", "-sS", "-A", UA, "-o", raw, m.group(1)], check=True)
    # Normalise to plain TTF (input may be woff2; brotli handles decode).
    font = TTFont(raw)
    font.flavor = None
    dest = tempfile.NamedTemporaryFile(suffix=".ttf", delete=False).name
    font.save(dest)
    os.remove(raw)
    return dest


def build_weight(weight, text, out_name):
    from fontTools.ttLib import TTFont
    from fontTools.merge import Merger

    slices = []
    for i in range(0, len(text), CHUNK):
        slices.append(fetch_slice(weight, text[i:i + CHUNK]))

    # Merge all slices into one font, de-duplicating glyphs by codepoint.
    if len(slices) == 1:
        merged = slices[0]
    else:
        merged = tempfile.NamedTemporaryFile(suffix=".ttf", delete=False).name
        Merger().merge(slices).save(merged)

    # Verify coverage before writing the final asset.
    font = TTFont(merged)
    cmap = font.getBestCmap()
    missing = [c for c in text if ord(c) not in cmap]
    dest = os.path.join(FONT_DIR, out_name)
    font.save(dest)
    for s in slices:
        try:
            os.remove(s)
        except OSError:
            pass
    print(f"{out_name}: {os.path.getsize(dest)} bytes, "
          f"{len(cmap)} glyphs, {len(missing)} missing")
    if missing:
        print("  missing sample:", "".join(missing[:20]))


def main():
    text = collect_chars()
    print(f"unique glyphs requested: {len(text)}")
    build_weight(400, text, "NotoSansJP-Regular.ttf")
    build_weight(700, text, "NotoSansJP-Bold.ttf")


if __name__ == "__main__":
    main()
