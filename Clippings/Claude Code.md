---
title: "Claude Code"
source: "https://claude.ai/code/session_01VfK3RHX69AXfrUfZTxVuBq"
author:
published: 2026-07-12
created: 2026-07-12
description: "A shared Claude Code session on claude.ai/code"
tags:
  - "clippings"
---
Obsidian web clipper setup

obsidian-vault

obsidianのwebclipperを導入してAIにbrain教材を学習させて業務改善や相談に活かしたい。やり方を教えて。あなたが手伝える部分は手伝って

了解です。まず vault の現状を確認して、Web Clipper のテンプレート仕様も最新ドキュメントで確かめてから、こちらで用意できるファイル一式を作ります。

公式ヘルプが403で読めなかったので、Web検索でテンプレートのJSON仕様を確認します。

仕様が確認できました。次に vault の命名ルールと既存スキルの形式を確認します。

仕様が確認できたので、ファイル一式を作成します。まず作業ブランチを用意します。

Failed to create designated feature branch

ブランチは既に用意されています。ファイルを作成します。

Next, the setup SOP and the consultation skill:

準備が整いました。ブランチ `claude/obsidian-web-clipper-setup-rukm8t` にコミット＆プッシュ済みです。仕組みはこうなります: **ブラウザでBrain教材をクリップ → vaultの `20_knowledge/教材/Brain/` に保存 → obsidian-gitで同期 → Claudeが相談時に参照** 。

## こちらで作ったもの（vaultにマージすれば使える）

| ファイル | 中身 |
| --- | --- |
| `90_meta/テンプレ/webclipper_Brain教材.json` | Web Clipperにインポートするテンプレ。brain-market.com を開くと自動選択され、タイトル・URL・クリップ日つきで `20_knowledge/教材/Brain/` に保存。末尾に「業務に使えそうな点／疑問／試すこと」のメモ欄が付く |
| `90_meta/テンプレ/webclipper_汎用クリップ.json` | Brain以外のページ用。 `00_inbox/` に入るので、いつもの週次整理の流れに乗る |
| `90_meta/SOP/Web Clipper導入手順.md` | 初期設定からクリップ・同期までの手順書 |
| `20_knowledge/教材/_教材フォルダの使い方.md` | 置き場所と著作権ルール |
| [`.claude/skills/material-consult/SKILL.md`](https://github.com/arashun1007/obsidian-vault/blob/claude/obsidian-web-clipper-setup-rukm8t/.claude/skills/material-consult/SKILL.md) | 新スキル。「教材を踏まえて相談」と言えば、教材＋日報・記事メトリクスの実データを突き合わせて答える |

## あなたにしかできない部分（拡張はブラウザ側なので）

1. [https://obsidian.md/clipper](https://obsidian.md/clipper) から使っているブラウザの拡張を入れる（iPhoneのSafari拡張もあり。ただしObsidian本体＋このvaultが入っている端末で）
2. 拡張の Settings → **Vaults** にvault名をObsidianの表示どおり追加
3. Settings → **Templates → Import** で上のJSON 2つを取り込み（同期後、PCのvaultフォルダから選べます）
4. Brainにログインして購入済み教材を開き、拡張アイコン → Add to Obsidian。 **購入者限定部分が全部取れないときは、範囲選択してからクリップ** すると確実です
5. obsidian-gitでpushしたら、あとは「教材を踏まえて◯◯を相談」と言うだけ

## 先に釘を刺しておく点（反対尋問役として）

- **著作権**: 購入済み教材の私的複製をprivate vaultに置くのは問題ないですが、教材本文をSubstack記事・GBP・チラシに転載・言い換え流用するのはアウトです。スキルにもこの禁止を組み込みました。使えるのは「学んで自分の実践に落とした結果」だけ。
- **動画メインの教材はクリップ不可** 。その場合は自分の言葉のメモを同フォルダに置く運用です（PDF配布ならPDFを置けば読めます）。
- 「AIに学習させる」と言っても実態は「相談のたびに参照する」です。教材を溜めるほど賢くなるわけではなく、 **クリップ後にメモ欄を一言埋めるかどうか** が効き目を左右します。

なお、CLAUDE.mdのスキル一覧表への `material-consult` の追記は、既存ファイル編集にあたるためやっていません。追記してよければ次回言ってください。

Sources: [Obsidian Web Clipper templates (community repo)](https://github.com/obsidian-community/web-clipper-templates) / [Templates - Obsidian Help](https://obsidian.md/help/web-clipper/templates)

38 minutes ago

２からよく分からない。初心者向けに簡単に教えて

6 minutes ago

わかりました。専門用語を使わずに、順番にやることだけ説明しますね。 **スマホではなく、Obsidianが入っているパソコンでやるのが一番簡単です。**

---

### ステップ1: 拡張機能を入れる（済んでいたら飛ばす）

1. パソコンのブラウザ（ChromeやEdge）で [https://obsidian.md/clipper](https://obsidian.md/clipper) を開く
2. 青い「Get for Chrome」みたいなボタンを押す → 「拡張機能を追加」を押す
3. ブラウザの右上に、Obsidianのマーク（紫のダイヤみたいなアイコン）が増えたら成功

※アイコンが見当たらないときは、右上のパズルピースのマーク🧩を押すと中に隠れています。ピンのマークを押すと常に表示されます。

---

### ステップ2: 「どのvaultに保存するか」を教えてあげる

拡張機能は、あなたのObsidianの保管庫（vault）の **名前** を知らないと保存できません。

1. まずObsidianを開いて、 **左上に表示されている保管庫の名前** を確認する（例:「obsidian-vault」など）
2. ブラウザで紫のObsidianアイコンをクリック → 出てきた画面の **歯車マーク⚙️** をクリック
3. 「Vaults」という入力欄があるので、さっき確認した保管庫の名前を **一字一句そのまま** 入力してEnter

これで「保存先はここだよ」と教えたことになります。

---

### ステップ3: テンプレート（保存の型紙）を取り込む

ぼくが作った「型紙」を拡張機能に読み込ませます。これをやると、Brainのページをクリップしたとき自動で `20_knowledge/教材/Brain` フォルダに、日付やURL付きで保存されるようになります。

**その前に1つだけ**: この作業内容はまだGitHubの別ブランチにあるので、mainに取り込んでObsidianに同期される必要があります。GitHubのこのリンクからプルリクエストを作ってマージしてください（ここが分からなければ言ってください、代わりにやれます）:  
[https://github.com/arashun1007/obsidian-vault/pull/new/claude/obsidian-web-clipper-setup-rukm8t](https://github.com/arashun1007/obsidian-vault/pull/new/claude/obsidian-web-clipper-setup-rukm8t)

同期できたら:

1. ブラウザの紫アイコン → 歯車⚙️ → 左側の「 **Templates** 」をクリック
2. 右上の「 **Import** 」ボタンをクリック
3. ファイル選択画面が出るので、パソコンの中のvaultフォルダを開いて  
	`90_meta/テンプレ/webclipper_Brain教材.json` を選ぶ
4. 「Brain教材」というテンプレートが一覧に増えたら成功
5. 同じ手順で `webclipper_汎用クリップ.json` も取り込む

---

### ステップ4: 実際にクリップしてみる

1. ブラウザでBrainにログインして、買った教材のページを開く
2. 紫のObsidianアイコンをクリック
3. プレビューが出る。Brainのページなら自動で「Brain教材」テンプレートが選ばれています
4. 「 **Add to Obsidian** 」を押す → Obsidianが自動で開いて、ノートが保存される

**コツ**: 教材の本文が途中までしか保存されないことがあります。そのときは、保存したい文章をマウスでドラッグして選択した状態でアイコンを押すと、選択した部分だけ確実に保存できます。

---

### ステップ5: いつもの同期をするだけ

Obsidianでいつも通りobsidian-gitの同期（commit & push）をすれば、ぼくが読める状態になります。あとは「教材を踏まえて◯◯を相談したい」と言ってもらえればOKです。

---

どこかで画面が説明と違ったら、その画面に何が表示されているか教えてください。そこから案内します。まずはステップ2の「保管庫の名前の確認」からどうぞ。