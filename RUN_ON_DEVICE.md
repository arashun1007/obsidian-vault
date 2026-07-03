# 実機で動かす手順（さかな図鑑）

手元のPCから `flutter run` でアプリを起動する手順です。所要 20〜40分（初回のFlutter導入込み）。

## 0. 準備するもの
- PC（Windows / Mac / Linux いずれか）
- 触りたい実機（Android スマホ推奨）と USBケーブル
  - ※ iPhone実機は Mac + Xcode + Apple ID 署名が必要でやや手間。まずは Android か、下の「PCのブラウザ」が手軽。

## 1. Flutter をインストール
公式手順に沿って入れるのが確実です → https://docs.flutter.dev/get-started/install

インストール後、ターミナル（Windowsは PowerShell）で確認:
```bash
flutter --version
flutter doctor        # 不足があれば案内が出る
```
Android実機で動かす場合は `flutter doctor` の「Android toolchain」に ✓ が付くまで、
Android Studio 経由で Android SDK を入れてください（doctor が指示してくれます）。

## 2. リポジトリを取得してブランチを切り替え
このアプリは `claude/flutter-fish-species-d646qf` ブランチにあります（main未マージ）。
```bash
git clone https://github.com/arashun1007/obsidian-vault.git
cd obsidian-vault
git checkout claude/flutter-fish-species-d646qf
cd app
flutter pub get
```

## 3. 起動する

### A. まず手軽に試す（PCのChromeブラウザ）
```bash
flutter run -d chrome
```
起動後、Chromeの開発者ツールで「スマホ表示」に切り替えるとモバイルの見た目で触れます。

### B. Android実機で触る（本命）
1. スマホで「開発者向けオプション」→「USBデバッグ」をON
   （設定→端末情報→ビルド番号を7回タップで開発者オプションが出ます）
2. USBでPCに接続し、スマホ側の「USBデバッグを許可」を承認
3. 認識されているか確認:
   ```bash
   flutter devices
   ```
4. 起動（自動で実機にインストールされます）:
   ```bash
   flutter run
   ```
   複数デバイスがある場合は `flutter run -d <デバイスID>`。

### C. インストール用APKだけ欲しい場合
```bash
flutter build apk --debug
# 出力: build/app/outputs/flutter-apk/app-debug.apk
```
このAPKファイルをスマホに転送し、タップしてインストール（提供元不明アプリの許可が必要）。

## つまずいたら
- `flutter doctor` の指示に従うのが基本です。
- Android で `no devices` の場合: USBデバッグの承認ダイアログを見落としていないか、
  ケーブルがデータ転送対応かを確認。
- それでも動かない場合は `flutter run -v` の最後の数十行を貼ってくれれば見ます。
