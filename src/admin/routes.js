const express = require('express');
const path = require('path');
const router = express.Router();
const db = require('../db');

// 簡易パスワード認証ミドルウェア
function requireAuth(req, res, next) {
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="管理画面"');
    return res.status(401).send('認証が必要です');
  }

  const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf-8');
  const [, pass] = decoded.split(':');

  if (pass !== password) {
    res.set('WWW-Authenticate', 'Basic realm="管理画面"');
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

// CSVダウンロード
router.get('/api/members/csv', requireAuth, (req, res) => {
  const members = db.getAllLinkedMembers();
  const header = 'LINE表示名,スマレジ顧客ID,連携日時\n';
  const rows = members.map(m =>
    `"${m.display_name || (m.line_user_id || '')}","${m.smaregi_customer_id || ''}","${m.registered_at || ''}"`
  ).join('\n');

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="members.csv"');
  res.send('﻿' + header + rows); // BOM付き（Excel対応）
});

module.exports = { router, requireAuth };
