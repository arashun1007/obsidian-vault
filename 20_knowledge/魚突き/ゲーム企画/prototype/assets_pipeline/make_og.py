#!/usr/bin/env python3
"""OGP用カード画像（1200x630）を作る。

アイコン（icon-512.png）と日本語タイトルを海色グラデーションに載せるだけ。
出力: docs/isomoguri/og-image.png

使い方:
  python3 make_og.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve()
# vault ルート（.../20_knowledge/魚突き/ゲーム企画/prototype/assets_pipeline/make_og.py）
VAULT = ROOT.parents[5]
DOCS = VAULT / "docs" / "isomoguri"

W, H = 1200, 630
TOP = (10, 60, 100)      # 海面近くの青
BOTTOM = (3, 16, 31)     # 深場の紺

FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"


def main():
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)

    # 縦グラデーション
    for y in range(H):
        t = y / H
        c = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
        d.line([(0, y), (W, y)], fill=c)

    # 光の筋（水面から差す光）。半透明ポリゴンを別レイヤーで合成する
    light = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(light)
    for x0, w in ((150, 90), (330, 60), (560, 110), (830, 70), (1020, 90)):
        ld.polygon([(x0, 0), (x0 + w, 0), (x0 + w - 140, H), (x0 - 140, H)],
                   fill=(200, 230, 255, 14))
    im = Image.alpha_composite(im.convert("RGBA"), light)
    d = ImageDraw.Draw(im)

    # 泡
    import random
    rng = random.Random(7)
    for _ in range(40):
        x = rng.randint(0, W)
        y = rng.randint(0, H)
        r = rng.randint(2, 7)
        d.ellipse([x - r, y - r, x + r, y + r], outline=(180, 220, 255, 60), width=2)

    # アイコン（左側に大きく）。白い余白ごと角丸マスクで抜く
    icon = Image.open(DOCS / "icon-512.png").convert("RGBA")
    bbox = icon.convert("RGB").point(lambda v: 0 if v > 245 else 255).convert("L").getbbox()
    if bbox:
        icon = icon.crop(bbox)
    icon = icon.resize((400, 400), Image.LANCZOS)
    mask = Image.new("L", (400, 400), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, 399, 399], radius=60, fill=255)
    im.paste(icon, (90, 115), mask)

    # タイトルと説明（右側）
    title_font = ImageFont.truetype(FONT, 120)
    sub_font = ImageFont.truetype(FONT, 44)
    url_font = ImageFont.truetype(FONT, 34)

    tx = 545
    # 影を敷いてから本体
    d.text((tx + 5, 195), "いそもぐり", font=title_font, fill=(0, 20, 40))
    d.text((tx, 190), "いそもぐり", font=title_font, fill=(240, 250, 255))
    d.text((tx + 3, 348), "素潜りで魚を突くミニゲーム", font=sub_font, fill=(0, 20, 40))
    d.text((tx, 345), "素潜りで魚を突くミニゲーム", font=sub_font, fill=(160, 210, 240))
    d.text((tx, 430), "ヌシを狙え。記録を塗り替えろ。", font=url_font, fill=(120, 180, 215))

    out = DOCS / "og-image.png"
    im.convert("RGB").save(out, optimize=True)
    print(f"→ {out} ({im.width}x{im.height})")


if __name__ == "__main__":
    main()
