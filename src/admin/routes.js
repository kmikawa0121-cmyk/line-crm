const express = require('express');
const path = require('path');
const axios = require('axios');
const router = express.Router();
const db = require('../db');
const { getClient } = require('../line/handler');
const { getCustomerById } = require('../smaregi/api');

// 簡易パスワード認証ミドルウェア
function requireAuth(req, res, next) {
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('認証が必要です');
  }

  const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf-8');
  const [, pass] = decoded.split(':');

  if (pass !== password) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('パスワードが違います');
  }

  next();
}

// 管理画面HTML
router.get('/', requireAuth, (req, res) => {
  const filePath = path.resolve(__dirname, '../../public/admin/index.html');
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('[Admin] sendFile error:', err);
      res.status(500).send('管理画面の読み込みに失敗しました');
    }
  });
});

// 会員一覧API
router.get('/api/members', requireAuth, (req, res) => {
  const members = db.getAllLinkedMembers();
  res.json(members);
});

// スマレジから会員情報を再同期
router.post('/api/members/sync', requireAuth, async (req, res) => {
  const members = db.getAllLinkedMembers();
  let updated = 0;
  for (const m of members) {
    try {
      const customer = await getCustomerById(m.smaregi_customer_id);
      const name = [customer.lastName, customer.firstName].filter(Boolean).join(' ');
      const code = customer.customerCode ? String(customer.customerCode) : null;
      db.updateCustomerInfo(m.id, name || null, code);
      updated++;
    } catch (err) {
      console.error(`[Sync] エラー member_id=${m.id}:`, err.message);
    }
  }
  res.json({ updated, total: members.length });
});

// CSVダウンロード
router.get('/api/members/csv', requireAuth, (req, res) => {
  const members = db.getAllLinkedMembers();
  const header = '会員名,LINE表示名,会員番号,スマレジ顧客ID,連携日時\n';
  const rows = members.map(m =>
    `"${m.customer_name || ''}","${m.display_name || ''}","${m.customer_code || ''}","${m.smaregi_customer_id || ''}","${m.registered_at || ''}"`
  ).join('\n');

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="members.csv"');
  res.send('﻿' + header + rows); // BOM付き（Excel対応）
});

// Instagram最新投稿取得
router.get('/api/instagram/latest', requireAuth, async (req, res) => {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return res.status(400).json({ error: 'INSTAGRAM_ACCESS_TOKEN未設定' });

  try {
    const response = await axios.get('https://graph.instagram.com/me/media', {
      params: {
        fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp',
        limit: 6,
        access_token: token,
      },
    });
    res.json(response.data);
  } catch (err) {
    console.error('[Instagram API Error]', err.response?.data || err.message);
    res.status(500).json({ error: 'Instagram取得失敗', detail: err.response?.data });
  }
});

// LINE一斉配信
router.post('/api/broadcast', requireAuth, express.json(), async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messagesが必要です' });
  }

  const members = db.getAllLinkedMembers();
  const userIds = members.map((m) => m.line_user_id).filter(Boolean);

  if (userIds.length === 0) return res.json({ sent: 0 });

  const client = getClient();
  let sent = 0;

  // multicastは500件ずつ
  for (let i = 0; i < userIds.length; i += 500) {
    const chunk = userIds.slice(i, i + 500);
    await client.multicast(chunk, messages);
    sent += chunk.length;
  }

  console.log(`[Broadcast] ${sent}名に送信完了`);
  res.json({ sent });
});

module.exports = { router, requireAuth };
