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
const { getChannels } = require('./channels');

const app = express();
const PORT = process.env.PORT || 3000;

// --- チャネル別 LINE Webhook 登録 ---
const channels = getChannels();

for (const [channelId, ch] of Object.entries(channels)) {
  const middleware = line.middleware({ channelSecret: ch.secret });

  // チャネル専用エンドポイント: /webhook/line/ch1, /webhook/line/ch2 ...
  app.post(`/webhook/line/${channelId}`, middleware, (req, res, next) => {
    req.channelId = channelId;
    next();
  }, handleLineWebhook);

  console.log(`[Route] /webhook/line/${channelId} → ${ch.name}`);
}

// 後方互換: /webhook/line → ch1 として処理
const ch1 = channels['ch1'];
if (ch1) {
  const ch1Middleware = line.middleware({ channelSecret: ch1.secret });
  app.post('/webhook/line', ch1Middleware, (req, res, next) => {
    req.channelId = 'ch1';
    next();
  }, handleLineWebhook);
}

// --- その他ルーティング ---

// スマレジ Webhook（JSON body parser）
app.post('/webhook/smaregi', express.json(), handleSmaregiWebhook);

// LIFF API
app.use('/api/liff', express.json(), liffRoutes);

// 管理画面
app.use('/admin', adminRouter);

// LIFF 画面（LIFF_ID・CHANNEL_IDを環境変数から埋め込んで配信）
// /liff?channel=ch1 または /liff?channel=ch2 でチャネルを指定
app.get('/liff', (req, res) => {
  const channelId = req.query.channel || 'ch1';
  const ch = channels[channelId] || channels['ch1'];
  const liffId = ch ? ch.liffId : (process.env.LIFF_ID || '');

  const filePath = path.join(__dirname, '../public/liff/index.html');
  let html = fs.readFileSync(filePath, 'utf8');
  html = html.replace('__LIFF_ID__', liffId);
  html = html.replace('__CHANNEL_ID__', channelId);
  res.send(html);
});

// 静的ファイル配信（public ディレクトリ）
app.use(express.static(path.join(__dirname, '../public')));

// ヘルスチェック
app.get('/', (req, res) => res.json({ status: 'ok', time: new Date().toISOString(), channels: Object.keys(channels) }));

async function backfillCustomerInfo() {
  const members = db.getMembersWithoutCustomerInfo();
  if (members.length === 0) return;
  console.log(`[Backfill] 会員情報を補完中... ${members.length}名`);
  let firstDone = false;
  for (const m of members) {
    try {
      const customer = await getCustomerById(m.smaregi_customer_id);
      if (!firstDone) {
        console.log('[Backfill] スマレジ顧客フィールド一覧:', Object.keys(customer).join(', '));
        firstDone = true;
      }
      const name = [customer.lastName, customer.firstName].filter(Boolean).join(' ');
      const code = customer.customerCode ? String(customer.customerCode) : null;
      const birthday = customer.birthDate || null;
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
