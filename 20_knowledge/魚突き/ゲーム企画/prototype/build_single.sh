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
  echo "→ $PUBLIC_OUT"
fi
