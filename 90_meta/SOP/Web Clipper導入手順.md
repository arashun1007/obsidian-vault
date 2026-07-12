# Obsidian Web Clipper 導入手順（Brain教材の取り込み）

ブラウザで開いたページ（購入済みBrain教材を含む）をワンタップでvaultに保存し、
obsidian-git → GitHub 経由でClaudeに読ませるための手順。

## 全体の流れ

```
ブラウザでBrain教材を開く
  → Web Clipper拡張でクリップ（20_knowledge/教材/Brain/ に保存）
  → Obsidianで確認・「自分のメモ」を追記
  → obsidian-git で commit & push
  → Claude Code から「教材を踏まえて相談」
```

## 1. 拡張をインストールする（初回のみ）

1. https://obsidian.md/clipper を開き、使っているブラウザ用の拡張を入れる
   （Chrome / Edge / Firefox / Safari。iPhoneのSafari拡張もある）。
2. クリップ先のデバイスに **Obsidian本体とこのvaultが入っていること**が前提。
   Web Clipperは開いているObsidianアプリ経由でファイルを作る。

## 2. 拡張の初期設定（初回のみ）

1. 拡張のアイコン → 歯車（Settings）を開く。
2. **General → Vaults** に、このvaultの名前をObsidianの表示名どおりに追加する。

## 3. テンプレートを取り込む（初回のみ）

テンプレJSONは `90_meta/テンプレ/` に2つ置いてある。

| ファイル | 用途 | 保存先 |
|---|---|---|
| `webclipper_Brain教材.json` | brain-market.com を開くと自動選択される | `20_knowledge/教材/Brain/` |
| `webclipper_汎用クリップ.json` | その他のページ用 | `00_inbox/`（週次整理で振り分け） |

1. 拡張のSettings → **Templates** → 右上の **Import**。
2. 自分のPC上のvaultフォルダから上のJSONを選ぶ
   （またはJSONの中身をコピーして New Template に貼り付け）。

## 4. クリップする（毎回）

1. ブラウザでBrainにログインし、購入済み教材のページを開く。
2. 拡張アイコンを押す。URLがbrain-market.comならテンプレ「Brain教材」が自動で選ばれる。
3. プレビューを確認して **Add to Obsidian**。
4. 本文が途中までしか取れないとき（購入者限定部分が長いときに起きがち）:
   - 取り込みたい範囲をマウスで**選択してから**クリップすると選択範囲だけ保存できる。
   - 長い教材は章ごとに選択→クリップして、あとで1ノートに結合してもよい。
5. 保存されたノートの末尾「自分のメモ」に一言書く（省略可だが推奨）。

## 5. 同期してClaudeに読ませる

1. Obsidianの obsidian-git で commit & push（普段の同期と同じ）。
2. Claude Code でこのリポジトリを開き、こう頼む:
   - 「教材を踏まえて◯◯を相談したい」
   - 「今月の日報と教材の内容を突き合わせて改善点を出して」

## 注意

- **著作権**: 教材はこのprivate vaultの外に出さない。公開コンテンツへの転載・言い換え流用は禁止。
  詳細は `20_knowledge/教材/_教材フォルダの使い方.md`。
- **動画教材**はクリップできない。視聴しながら自分の言葉でメモを `20_knowledge/教材/Brain/` に作る。
- クリップが失敗するときは、拡張の設定でvault名がObsidianの表示名と一致しているか確認する。
