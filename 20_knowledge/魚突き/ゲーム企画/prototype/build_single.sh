#!/bin/bash
# 配布用の1ファイルHTMLを作る（assets/*.png があれば data URI で埋め込む）
set -e
cd "$(dirname "$0")"
OUT="${1:-dist/isomoguri.html}"
mkdir -p "$(dirname "$OUT")"

{
cat <<'EOF'
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>いそもぐり（仮）</title>
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
    echo "  \"$id\": \"data:image/png;base64,$(base64 -w0 "$f")\","
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
