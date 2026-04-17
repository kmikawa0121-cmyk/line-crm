require('dotenv').config();

const express = require('express');
const line = require('@line/bot-sdk');
const { handleLineWebhook, initLineClient } = require('./line/handler');
const { handleSmaregiWebhook } = require('./smaregi/webhook');
const { startScheduler } = require('./scheduler');

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

// ヘルスチェック
app.get('/', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// --- 起動 ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`サーバー起動: PORT=${PORT}`);
  initLineClient();
  startScheduler();
});
