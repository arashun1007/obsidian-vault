<%*
// 現在の日付を取得
let m = moment();

// もし今日が26日以降なら、フォルダ用日付を「翌月」として扱う
let folderM = moment();
if (m.date() > 25) {
  folderM = folderM.add(1, 'month');
}

// フォルダパスとファイル名の構成（10_work/日報/YYYY/MM/）
let folderPath = "10_work/日報/" + folderM.format("YYYY") + "/" + folderM.format("MM");
let fileName = m.format("YYYY-MM-DD") + "_work";

// 移動とリネームの実行
await tp.file.move(folderPath + "/" + fileName);
%>

## 基本情報

日付：
地域：
作業種別：
作業時間：
人数：
料金：
処分量：
天気：

## ご依頼内容

お客様の困りごと：

希望されていたこと：

作業前の状態：

## 作業内容

行った作業：

気をつけたこと：

危険・注意点：

使用した道具：

## 作業後

作業後の変化：

お客様の反応：

次回おすすめ時期：

次回提案：

## 写真

Before：

After：

作業中：

処分後：

Googleフォトリンク：

## AI生成用メモ

この現場で伝えたい価値：

使えそうなキーワード：
- 川崎市
- 庭木剪定
- 草刈り
- 伐採
- 空き家管理
- ハチ駆除
- 庭まわりの不安

## 生成したいもの

- GBP投稿
- 施工事例
- LINEお礼文
- 次回提案文
- チラシ短文
- 写真キャプション

→ このノートをClaudeに渡して「/work-content」または「営業コンテンツにして」と言う。
