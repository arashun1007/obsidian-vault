#!/bin/bash
# 配布用の1ファイルHTMLを作る（assets/*.png があれば data URI で埋め込む）
set -e
cd "$(dirname "$0")"
OUT="${1:-dist/isomoguri.html}"
PUBLIC_OUT="${2:-}"
mkdir -p "$(dirname "$OUT")"

{
cat <<'EOF'
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>いそもぐり</title>
<style>
  html, body {
    margin: 0; padding: 0; background: #04121f;
    height: 100%; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    touch-action: none; overscroll-behavior: none;
  }
  canvas {
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    background: #06263f;
  }
</style>
</head>
<body>
<canvas id="game"></canvas>
<script>
EOF

# アセット埋め込み
if ls assets/*.png >/dev/null 2>&1; then
  echo "window.__ASSETS = {"
  for f in assets/*.png; do
    id="$(basename "$f" .png)"
    data="$(base64 < "$f" | tr -d '\n')"
    echo "  \"$id\": \"data:image/png;base64,$data\","
  done
  echo "};"
fi

cat game.js
cat <<'EOF'
</script>
</body>
</html>
EOF
} > "$OUT"
echo "→ $OUT"

if [ -n "$PUBLIC_OUT" ]; then
  mkdir -p "$(dirname "$PUBLIC_OUT")"
  cp "$OUT" "$PUBLIC_OUT"
  # 公開版にはPWA用のマニフェスト・アイコン・Service Worker登録を差し込む
  # （manifest.json / service-worker.js / icon-*.png は docs/isomoguri/ に置いてある）
  python3 - "$PUBLIC_OUT" <<'PYEOF'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
head = """<meta name="theme-color" content="#06263f">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="icon-192.png">
<link rel="manifest" href="manifest.json">
<meta name="description" content="素潜りで魚を突くミニゲーム。ヌシを狙え。記録を塗り替えろ。">
<meta property="og:type" content="website">
<meta property="og:site_name" content="いそもぐり">
<meta property="og:title" content="いそもぐり">
<meta property="og:description" content="素潜りで魚を突くミニゲーム。ヌシを狙え。記録を塗り替えろ。">
<meta property="og:url" content="https://isomoguri.arai10070223.workers.dev/">
<meta property="og:image" content="https://isomoguri.arai10070223.workers.dev/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="いそもぐり">
<meta name="twitter:description" content="素潜りで魚を突くミニゲーム。ヌシを狙え。記録を塗り替えろ。">
<meta name="twitter:image" content="https://isomoguri.arai10070223.workers.dev/og-image.png">"""
sw = """<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js')
        .then(reg => console.log('Service Worker registered with scope:', reg.scope))
        .catch(err => console.error('Service Worker registration failed:', err));
    });
  }
</script>"""
s = s.replace("<title>いそもぐり</title>", "<title>いそもぐり</title>\n" + head, 1)
s = s.replace("</body>", sw + "\n</body>", 1)
open(p, "w", encoding="utf-8").write(s)
PYEOF
  echo "→ $PUBLIC_OUT (PWA対応)"
fi
