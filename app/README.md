# さかな図鑑 (sakana_zukan)

日本の市場魚介を網羅するオフライン図鑑 Flutter アプリ。

- 収録: 201 魚種 / 10 カテゴリ（`assets/data/fish.json`）
- 機能: 検索・カテゴリ/旬/お気に入りフィルタ・詳細（旬バー付き）
- 画像は後日 image2 で追加予定（現状はプレースホルダ自動生成）

## 開発

```bash
flutter pub get
flutter test
flutter analyze
flutter run                       # 実機/エミュ
flutter build web --no-tree-shake-icons --no-web-resources-cdn
```

## データ・フォントの再生成

```bash
# 魚種を追加したら（tool/gen_fish.py の DATA を編集後）
FISH_OUT="$PWD/assets/data/fish.json" python3 tool/gen_fish.py
# 新しい漢字を使ったらフォントを再サブセット
python3 tool/get_font.py
```

詳しい運用はリポジトリ直下の `AGENTS.md` / `CLAUDE_HANDOFF.md` を参照。
