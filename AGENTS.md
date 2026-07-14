# AGENTS.md — さかな図鑑 (sakana_zukan)

日本の市場魚介を網羅するオフライン図鑑 Flutter アプリ。エージェント（Claude 等）
が作業を引き継ぐための運用ガイド。

## このリポジトリについて

- ルートは元々 Obsidian 保管庫（`ようこそ.md` 等）。Flutter アプリは **`app/`** 配下。
- アプリ本体・データ・ツールはすべて `app/` の中で完結する。

## セットアップ

Flutter SDK は環境に同梱されない場合がある。無ければ stable を入れる:

```bash
# 例: /opt に stable を展開して PATH を通す
export PATH="$PATH:/opt/flutter/bin"
cd app
flutter pub get
```

## よく使うコマンド（すべて `app/` で実行）

| 目的 | コマンド |
|------|----------|
| 依存取得 | `flutter pub get` |
| 静的解析 | `flutter analyze` |
| ユニットテスト | `flutter test` |
| Web ビルド（オフライン用） | `flutter build web --no-tree-shake-icons --no-web-resources-cdn` |
| 実機/エミュ実行 | `flutter run` |

> Web ビルドで CanvasKit を CDN から取れない環境では
> `--no-web-resources-cdn` を必ず付ける（ローカル同梱になる）。

## データの増やし方（最重要）

魚種データは手書き JSON ではなく **ジェネレータ** で生成する。

1. `app/tool/gen_fish.py` の `DATA` に行（タプル）を追記する。
   形式: `(id, 和名, かな, 学名, 科, 旬[月のリスト], 最大cm, 分布, 味, [料理], [別名], 解説)`
   カテゴリは `DATA` のキー（`blue`/`white`/`migratory`/`rockfish`/`deep`/
   `freshwater`/`shellfish`/`cephalopod`/`crustacean`/`other`）。
   **評価は自動生成**（食味/価格帯/希少度＋味わいレーダー5軸）。カテゴリ基準＋
   決定的ジッターで付与されるので通常は追記不要。高級魚や安価な種で調整したい
   場合のみ `tool/gen_fish.py` の `OVERRIDES` に `id: {"taste":.., "price":..}` を追加。
2. 生成:
   ```bash
   cd app
   FISH_OUT="$PWD/assets/data/fish.json" python3 tool/gen_fish.py
   ```
3. **フォントの再サブセット**（新しい漢字を使ったら必須）:
   ```bash
   python3 tool/get_font.py
   ```
   データ／UI 文字列から使用文字を集め、Noto Sans JP を必要分だけ再生成する。
4. `flutter test && flutter analyze` を通してからコミット。

## 画像について

- 各魚種は `imageAsset`（現状すべて `null`）を持つ。
- 画像は後日 **image2** パイプラインで生成し `app/assets/images/` に配置する予定。
- 置いたら `pubspec.yaml` の `assets:` に `assets/images/` を追加、`fish.json` の
  `imageAsset` にパスを入れるだけ。**アプリのコード変更は不要**
  （`FishImage` が自動でプレースホルダから実画像に切り替わる）。

## コード構成（`app/lib/`）

- `models/fish.dart` — `Fish` / `FishCategory` モデル、検索・旬判定ロジック。
- `data/fish_repository.dart` — JSON を一度読み込みメモリ保持。
- `data/favorites_service.dart` — お気に入り（shared_preferences）。
- `util/season.dart` — 旬の月リスト → 「3〜5月」等の整形。
- `widgets/star_rating.dart` — 星評価（ハーフ対応）と `LabeledStars`。
- `widgets/flavor_radar.dart` — 味わい5軸レーダー（CustomPainter）。
- `widgets/fish_image.dart` — 画像 or 生成プレースホルダ（image2 切替フック）。
- `widgets/fish_card.dart` — グリッドのカード。
- `screens/home_screen.dart` — 検索・カテゴリ/旬/お気に入りフィルタ・グリッド。
- `screens/detail_screen.dart` — 詳細（旬バー・基本情報・料理）。

## 規約

- 変更後は必ず `flutter analyze`（警告ゼロ維持）と `flutter test`。
- データは事実ベースで。学名・科・旬は正確さを優先する。
- モデル定義を変えたら `tool/gen_fish.py` の出力スキーマと同期させる。
