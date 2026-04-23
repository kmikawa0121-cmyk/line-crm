require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const line = require('@line/bot-sdk');
const { handleLineWebhook, initLineClient } = require('./line/handler');
const { handleSmaregiWebhook } = require('./smaregi/webhook');
const { startScheduler } = require('./scheduler');
const liffRoutes = require('./liff/routes');

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

// LIFF 画面（LIFF_IDを環境変数から埋め込んで配信）
app.get('/liff', (req, res) => {
  const filePath = path.join(__dirname, '../public/liff/index.html');
  let html = fs.readFileSync(filePath, 'utf8');
  html = html.replace('__LIFF_ID__', process.env.LIFF_ID || '');
  res.send(html);
});

// ヘルスチェック
app.get('/', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// --- 起動 ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`サーバー起動: PORT=${PORT}`);
  initLineClient();
  startScheduler();
});
