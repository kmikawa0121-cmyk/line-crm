require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const line = require('@line/bot-sdk');
const { handleLineWebhook, initLineClient } = require('./line/handler');
const { handleSmaregiWebhook } = require('./smaregi/webhook');
const { startScheduler } = require('./scheduler');
const liffRoutes = require('./liff/routes');
const { router: adminRouter } = require('./admin/routes');
const db = require('./db');
const { getCustomerById } = require('./smaregi/api');

const app = express();
const PORT = process.env.PORT || 3000;

// LINE署名検証ミドルウェア（LINEルートのみ）
const lineMiddleware = line.middleware({
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

// --- ルーティング ---

// LINE Webhook
app.post('/webhook/line', lineMiddleware, handleLineWebhook);

// スマレジ Webhook（JSON body parser）
app.post('/webhook/smaregi', express.json(), handleSmaregiWebhook);

// LIFF API
app.use('/api/liff', express.json(), liffRoutes);

// 管理画面
app.use('/admin', adminRouter);

// LIFF 画面（LIFF_IDを環境変数から埋め込んで配信）
app.get('/liff', (req, res) => {
  const filePath = path.join(__dirname, '../public/liff/index.html');
  let html = fs.readFileSync(filePath, 'utf8');
  html = html.replace('__LIFF_ID__', process.env.LIFF_ID || '');
  res.send(html);
});

// 静的ファイル配信（public ディレクトリ）
app.use(express.static(path.join(__dirname, '../public')));

// ヘルスチェック
app.get('/', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

async function backfillCustomerInfo() {
  const members = db.getMembersWithoutCustomerInfo();
  if (members.length === 0) return;
  console.log(`[Backfill] 会員情報を補完中... ${members.length}名`);
  let firstDone = false;
  for (const m of members) {
    try {
      const customer = await getCustomerById(m.smaregi_customer_id);
      // 最初の1件だけキー一覧をログ出力（フィールド名確認用）
      if (!firstDone) {
        console.log('[Backfill] スマレジ顧客フィールド一覧:', Object.keys(customer).join(', '));
        firstDone = true;
      }
      const name = [customer.lastName, customer.firstName].filter(Boolean).join(' ');
      const code = customer.customerCode ? String(customer.customerCode) : null;
      const birthday = customer.birthday || null;
      db.updateCustomerInfo(m.id, name || null, code, birthday);
      console.log(`[Backfill] 補完: ${name} (会員番号:${code}) 誕生日:${birthday || '未登録'}`);
    } catch (err) {
      console.error(`[Backfill] エラー member_id=${m.id}:`, err.message);
    }
  }
  console.log('[Backfill] 完了');
}

// --- 起動 ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`サーバー起動: PORT=${PORT}`);
  initLineClient();
  startScheduler();
  backfillCustomerInfo();
});
