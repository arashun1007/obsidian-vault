#!/usr/bin/env python3
"""いそもぐり（仮）アセット生成パイプライン

fal API（FLUX系）でドット絵スプライトを生成し、
チョロマキー→トリミング→縮小→パレット量子化 して
../assets/{id}.png に保存する。

使い方:
  export FAL_KEY="..."          # fal.ai のAPIキー（環境変数で渡す）
  python3 generate.py            # 全スプライト生成
  python3 generate.py mebaru     # 1種だけ生成
  python3 generate.py --dummy    # APIを呼ばず後処理だけテスト
  python3 generate.py --from-raw # raw/ の原画から再処理（API呼び出しなし）

モデル切り替え:
  python3 generate.py --model fal-ai/flux/dev        # 既定
  python3 generate.py --model fal-ai/flux-lora --lora <LoRA URL>
"""
import io
import json
import os
import sys
import urllib.request
from pathlib import Path

from PIL import Image

OUT_DIR = Path(__file__).parent.parent / "assets"
RAW_DIR = Path(__file__).parent / "raw"  # 生成直後の原画（検品用）

# 背景はマゼンタ単色で生成させ、チョロマキーで抜く（rembg等の重い依存を避ける）
BG_PROMPT = "solid flat magenta background, plain #FF00FF backdrop"
STYLE = (
    "cute pixel art game sprite, 16-bit SNES style, chunky pixels, "
    "thick dark outline, big round cute eye, side view facing left, "
    "full body, centered, no text, no watermark"
)

# id: (プロンプト用の説明, 出力幅px)
SPRITES = {
    "mebaru":   ("Japanese black rockfish (mebaru), dark brown chunky fish with big eyes and spiky dorsal fin", 32),
    "mejina":   ("largescale blackfish (mejina), dark blue-grey oval sea chub", 32),
    "kasago":   ("Japanese scorpionfish (kasago), mottled red-brown rockfish with wide mouth and spiky fins", 32),
    "nizadai":  ("sawtail surgeonfish (nizadai), plain grey fish with small tail spikes", 34),
    "ishidai":  ("striped beakfish (ishidai), white fish with bold black vertical stripes and parrot-like beak", 38),
    "hakofugu": ("yellow boxfish (hakofugu), cube-shaped bright yellow fish with black dots, very cute", 28),
    "hiramasa": ("yellowtail amberjack (hiramasa), sleek silver torpedo-shaped fish with a yellow horizontal "
                 "stripe from nose to tail and yellow fins, streamlined fast predator", 46),
    "kue":      ("longtooth grouper (kue), huge chunky brown-grey grouper with mottled darker vertical bands, "
                 "big mouth with thick lips, heavy body", 48),
    "diver":    ("freediver spearfisher in black wetsuit, dive mask and snorkel, long yellow freediving fins, "
                 "weight belt, holding small flashlight in left hand and a very long wooden pole spear, "
                 "horizontal swimming pose facing left", 52),
}


def call_fal(prompt: str, model: str, lora: str | None) -> bytes:
    key = os.environ.get("FAL_KEY")
    if not key:
        sys.exit("FAL_KEY が未設定です。環境変数に fal.ai のAPIキーを設定してください。")
    body = {
        "prompt": prompt,
        "image_size": {"width": 512, "height": 512},
        "num_images": 1,
        "num_inference_steps": 28,
        "enable_safety_checker": True,
    }
    if lora:
        body["loras"] = [{"path": lora, "scale": 1.0}]
    req = urllib.request.Request(
        f"https://fal.run/{model}",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Key {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        res = json.load(r)
    url = res["images"][0]["url"]
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def dummy_image() -> bytes:
    """後処理テスト用: マゼンタ背景に魚っぽい楕円を描いた画像"""
    from PIL import ImageDraw
    im = Image.new("RGB", (512, 512), (255, 0, 255))
    d = ImageDraw.Draw(im)
    d.ellipse([100, 180, 380, 330], fill=(80, 90, 110), outline=(20, 25, 40), width=8)
    d.polygon([(380, 255), (450, 200), (450, 310)], fill=(60, 70, 90))
    d.ellipse([140, 220, 180, 260], fill=(255, 255, 255))
    d.ellipse([152, 232, 170, 250], fill=(10, 10, 10))
    return _to_png(im)


def _to_png(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def chroma_key(im: Image.Image) -> Image.Image:
    """背景を透過に。

    生成モデルは指定色を無視してピンク等で塗ってくることがあるので、
    四隅から背景色をサンプリングし、外周からの塗りつぶしで背景を除去する。
    塗りつぶし方式なら背景と似た色の魚（カサゴ等）も輪郭線の内側は守られる。
    最後に最大連結成分だけ残し、床の影や泡などの浮遊ピクセルを消す。
    """
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size

    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))
    # 背景はほぼ単色（ばらつき±10程度）なので、しきい値は小さく。
    # 大きくするとイシダイの赤いくちばし等（背景との距離50台）が消える。
    tol2 = 40 * 40

    def is_bg(p):
        dr, dg, db = p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]
        return dr * dr + dg * dg + db * db < tol2

    # 外周から背景色を塗りつぶし
    seen = bytearray(w * h)
    stack = []
    for x in range(w):
        stack += [(x, 0), (x, h - 1)]
    for y in range(h):
        stack += [(0, y), (w - 1, y)]
    while stack:
        x, y = stack.pop()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not is_bg(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        if x > 0: stack.append((x - 1, y))
        if x < w - 1: stack.append((x + 1, y))
        if y > 0: stack.append((x, y - 1))
        if y < h - 1: stack.append((x, y + 1))

    # 本体に接した床の影（背景色と暗色の中間色）を透過境界から剥がす。
    # 影は必ずスプライト下部にあるので、強いしきい値は下部30%の行だけに使う。
    # 全体に強くかけると、背景と色が近いパーツ（イシダイの赤いくちばし等）まで消える。
    bbox = im.getbbox()
    shadow_y = bbox[1] + (bbox[3] - bbox[1]) * 7 // 10 if bbox else h
    tol2_weak = 40 * 40
    tol2_strong = 115 * 115
    changed = True
    while changed:
        changed = False
        for y in range(h):
            tol2b = tol2_strong if y >= shadow_y else tol2_weak
            for x in range(w):
                p = px[x, y]
                if p[3] == 0:
                    continue
                dr, dg, db = p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]
                if dr * dr + dg * dg + db * db >= tol2b:
                    continue
                for nx, ny in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                        px[x, y] = (0, 0, 0, 0)
                        changed = True
                        break

    # 最大連結成分（＝スプライト本体）以外の不透明ピクセルを除去
    comp = [0] * (w * h)
    sizes = {0: 0}
    cid = 0
    for sy in range(h):
        for sx in range(w):
            if comp[sy * w + sx] or px[sx, sy][3] == 0:
                continue
            cid += 1
            size = 0
            stack = [(sx, sy)]
            comp[sy * w + sx] = cid
            while stack:
                x, y = stack.pop()
                size += 1
                for nx, ny in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if not comp[j] and px[nx, ny][3] > 0:
                            comp[j] = cid
                            stack.append((nx, ny))
            sizes[cid] = size
    if cid > 1:
        main = max(sizes, key=sizes.get)
        for y in range(h):
            for x in range(w):
                if px[x, y][3] > 0 and comp[y * w + x] != main:
                    px[x, y] = (0, 0, 0, 0)
    return im


def postprocess(png: bytes, target_w: int) -> Image.Image:
    im = chroma_key(Image.open(io.BytesIO(png)))
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    # 縮小（NEAREST でドット感を残す）
    ratio = target_w / im.width
    im = im.resize((target_w, max(1, round(im.height * ratio))), Image.NEAREST)
    # パレット量子化（透過を保持するため一旦RGBで量子化して透過を書き戻す）
    alpha = im.getchannel("A")
    quant = im.convert("RGB").quantize(colors=14, method=Image.MEDIANCUT).convert("RGBA")
    quant.putalpha(alpha)
    return quant


def main():
    args = [a for a in sys.argv[1:]]
    dummy = "--dummy" in args
    from_raw = "--from-raw" in args
    model = "fal-ai/flux/dev"
    lora = None
    if "--model" in args:
        model = args[args.index("--model") + 1]
    if "--lora" in args:
        lora = args[args.index("--lora") + 1]
    only = [a for a in args if not a.startswith("--") and a != model and a != lora]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    for sid, (desc, tw) in SPRITES.items():
        if only and sid not in only:
            continue
        print(f"[{sid}] ", end="", flush=True)
        if dummy:
            png = dummy_image()
        elif from_raw:
            raw = RAW_DIR / f"{sid}_raw.png"
            if not raw.exists():
                print(f"スキップ（{raw} が無い）")
                continue
            png = raw.read_bytes()
        else:
            prompt = f"{STYLE}, {desc}, {BG_PROMPT}"
            png = call_fal(prompt, model, lora)
            (RAW_DIR / f"{sid}_raw.png").write_bytes(png)
        out = postprocess(png, tw)
        out.save(OUT_DIR / f"{sid}.png")
        # カットイン（格闘・キープ演出）用のアップ画像。ダイバーは使わないので省く
        if sid != "diver":
            big = postprocess(png, min(150, tw * 4))
            big.save(OUT_DIR / f"{sid}_big.png")
        print(f"→ assets/{sid}.png ({out.width}x{out.height})")

    print("完了。ゲームをリロードすると生成アセットが使われます（無い分は仮ドット絵）。")


if __name__ == "__main__":
    main()
