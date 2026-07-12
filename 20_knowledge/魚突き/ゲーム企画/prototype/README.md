# いそもぐり（仮）プロトタイプ

## 遊ぶ

- `index.html` をブラウザで開くだけ（スマホは `dist/isomoguri.html` の1ファイル版をダウンロードして開くのが楽）。
- 操作: ドラッグ=泳ぐ／魚の近くでタップ=構え／ゲージ中央でタップ=突く／暴れたら連打。

## falでアセットを生成する

1. https://fal.ai でAPIキーを取得（課金設定は本人が行う）。
2. Claude Code（Web）の場合: 環境設定 → 環境変数に `FAL_KEY` を追加。
   ローカルの場合: `export FAL_KEY="..."`。
3. 生成:
   ```bash
   python3 assets_pipeline/generate.py            # 全部
   python3 assets_pipeline/generate.py hakofugu   # 1種だけ
   python3 assets_pipeline/generate.py --dummy    # API無しで後処理テスト
   ```
4. `assets/*.png` が出来る。ゲームは起動時にこれを自動で使う（無い魚種は仮ドット絵）。
   生成直後の原画は `assets_pipeline/raw/` に残るので検品に使う。

## 配布用1ファイル版を作る

```bash
bash build_single.sh          # → dist/isomoguri.html（assetsを埋め込み）
```

## ファイル構成

- `index.html` / `game.js` — ゲーム本体（依存ゼロ・Canvas 2D）
- `assets_pipeline/generate.py` — fal生成→チョロマキー→縮小→量子化
- `assets/` — 生成済みスプライト（ゲームが読む）
- `build_single.sh` — 単一HTML書き出し
