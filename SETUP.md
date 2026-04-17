# セットアップ手順

## STEP 1: Node.js インストール（あなたが行う）

1. https://nodejs.org/ja/ を開く
2. 「LTS」版をダウンロードしてインストール
3. インストール後、コマンドプロンプトで確認:
   ```
   node --version
   npm --version
   ```

## STEP 2: パッケージインストール（あなたが行う）

コマンドプロンプトで:
```
cd C:\Users\kmika\Desktop\line-crm
npm install
```

## STEP 3: .env に認証情報を入力（あなたが行う）

`line-crm` フォルダの `.env` ファイルを開いて入力:

### LINE
- LINE_CHANNEL_SECRET → LINE Developers > チャネル基本設定 > Channel Secret
- LINE_CHANNEL_ACCESS_TOKEN → Messaging API設定 > Channel access token（長期）を発行

### スマレジ
- SMAREGI_CLIENT_ID → スマレジデベロッパープラットフォーム > アプリ > クライアントID
- SMAREGI_CLIENT_SECRET → 同上 > クライアントシークレット
- SMAREGI_CONTRACT_ID → スマレジ管理画面のURL内の数字（例: https://www.smaregi.jp/manage/XXXXXXX/）

## STEP 4: GitHubにプッシュ（あなたが行う）

```
cd C:\Users\kmika\Desktop\line-crm
git init
git add .
git commit -m "initial commit"
```
GitHubで新しいリポジトリを作って push する

## STEP 5: Railwayにデプロイ（あなたが行う）

1. https://railway.app にアクセス → GitHubでログイン
2. 「New Project」→「Deploy from GitHub repo」
3. line-crm のリポジトリを選択
4. 「Variables」タブで .env の内容を1つずつ入力
5. デプロイ完了後、「Settings」→「Domains」→ 自動生成されたURLをコピー

## STEP 6: Webhook URL を登録（あなたが行う）

RailwayのURLを `https://XXXXX.railway.app` とすると:

### LINE Developers
- Webhook URL: `https://XXXXX.railway.app/webhook/line`
- 「Webhookの利用」をオンにする
- 「検証」ボタンで確認

### スマレジ デベロッパープラットフォーム
- Webhook URL: `https://XXXXX.railway.app/webhook/smaregi`
- イベント: `transactions.create` を選択

## STEP 7: 動作確認

1. LINEで公式アカウントを友だち追加
2. 会員番号を送信 → 「連携完了」メッセージが来ればOK
3. スマレジで会計 → 3日後・7日後にDMが届けばOK
