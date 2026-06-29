const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// DB_PATH 環境変数があればそこに保存（Railway Volume用）、なければローカル
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data.db');

// ディレクトリが存在しない場合は作成
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// テーブル初期化
db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_user_id TEXT UNIQUE NOT NULL,
    smaregi_customer_id TEXT UNIQUE,
    customer_code TEXT,
    display_name TEXT,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    transaction_id TEXT UNIQUE NOT NULL,
    product_codes TEXT NOT NULL,  -- JSON配列 例: ["P001","P002"]
    purchased_at DATETIME NOT NULL,
    FOREIGN KEY (member_id) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS scheduled_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    purchase_id INTEGER NOT NULL,
    message_type TEXT NOT NULL,   -- '3day' | '7day' | '1month'
    scheduled_at DATETIME NOT NULL,
    sent_at DATETIME,
    status TEXT DEFAULT 'pending', -- pending | sent | failed
    FOREIGN KEY (member_id) REFERENCES members(id),
    FOREIGN KEY (purchase_id) REFERENCES purchases(id)
  );

  CREATE TABLE IF NOT EXISTS birthday_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(member_id, year),
    FOREIGN KEY (member_id) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS reorder_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    reminder_type TEXT NOT NULL,        -- '30day' | '60day' | '90day'
    last_purchase_date TEXT NOT NULL,   -- リマインド時点の最終購入日
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS dm_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    reminder_type TEXT NOT NULL,   -- 'first_3day' | '30day' | '60day'
    reference_date TEXT NOT NULL,  -- 基準日（初回購入日 or 最終購入日）
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(member_id, reminder_type, reference_date),
    FOREIGN KEY (member_id) REFERENCES members(id)
  );
`);

// --- members ---

function findMemberByLineId(lineUserId) {
  return db.prepare('SELECT * FROM members WHERE line_user_id = ?').get(lineUserId);
}

function findMemberBySmaregiId(smaregiCustomerId) {
  return db.prepare('SELECT * FROM members WHERE smaregi_customer_id = ?').get(smaregiCustomerId);
}

function createMember(lineUserId, displayName) {
  return db.prepare(
    'INSERT OR IGNORE INTO members (line_user_id, display_name) VALUES (?, ?)'
  ).run(lineUserId, displayName);
}

function linkMember(lineUserId, smaregiCustomerId, customerCode, customerName) {
  return db.prepare(
    'UPDATE members SET smaregi_customer_id = ?, customer_code = ?, customer_name = ? WHERE line_user_id = ?'
  ).run(smaregiCustomerId, customerCode || null, customerName || null, lineUserId);
}

// 既存DBへの列追加（マイグレーション）
for (const col of ['customer_code TEXT', 'customer_name TEXT']) {
  try { db.exec(`ALTER TABLE members ADD COLUMN ${col}`); } catch (_) {}
}

// --- purchases ---

function savePurchase(memberId, transactionId, productCodes, purchasedAt) {
  return db.prepare(
    'INSERT OR IGNORE INTO purchases (member_id, transaction_id, product_codes, purchased_at) VALUES (?, ?, ?, ?)'
  ).run(memberId, transactionId, JSON.stringify(productCodes), purchasedAt);
}

function getPurchaseCount(memberId) {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM purchases WHERE member_id = ?').get(memberId);
  return row.cnt;
}

// --- scheduled_messages ---

function scheduleMessage(memberId, purchaseId, messageType, scheduledAt) {
  return db.prepare(
    'INSERT INTO scheduled_messages (member_id, purchase_id, message_type, scheduled_at) VALUES (?, ?, ?, ?)'
  ).run(memberId, purchaseId, messageType, scheduledAt);
}

function getPendingMessages() {
  return db.prepare(`
    SELECT sm.*, m.line_user_id, p.product_codes, p.purchased_at
    FROM scheduled_messages sm
    JOIN members m ON sm.member_id = m.id
    JOIN purchases p ON sm.purchase_id = p.id
    WHERE sm.status = 'pending' AND sm.scheduled_at <= datetime('now')
  `).all();
}

function markMessageSent(id) {
  return db.prepare(
    "UPDATE scheduled_messages SET status = 'sent', sent_at = datetime('now') WHERE id = ?"
  ).run(id);
}

function markMessageFailed(id) {
  return db.prepare(
    "UPDATE scheduled_messages SET status = 'failed' WHERE id = ?"
  ).run(id);
}

// --- reorder_reminders ---

// --- birthday_messages ---

function hasBirthdayMessage(memberId, year) {
  const row = db.prepare(
    'SELECT id FROM birthday_messages WHERE member_id = ? AND year = ?'
  ).get(memberId, year);
  return !!row;
}

function saveBirthdayMessage(memberId, year) {
  return db.prepare(
    'INSERT OR IGNORE INTO birthday_messages (member_id, year) VALUES (?, ?)'
  ).run(memberId, year);
}

function getAllLinkedMembers() {
  return db.prepare(
    'SELECT * FROM members WHERE smaregi_customer_id IS NOT NULL'
  ).all();
}

function hasReorderReminder(memberId, reminderType, lastPurchaseDate) {
  const row = db.prepare(
    'SELECT id FROM reorder_reminders WHERE member_id = ? AND reminder_type = ? AND last_purchase_date = ?'
  ).get(memberId, reminderType, lastPurchaseDate);
  return !!row;
}

function saveReorderReminder(memberId, reminderType, lastPurchaseDate) {
  return db.prepare(
    'INSERT INTO reorder_reminders (member_id, reminder_type, last_purchase_date) VALUES (?, ?, ?)'
  ).run(memberId, reminderType, lastPurchaseDate);
}

// --- dm_reminders ---

function hasDmReminder(memberId, reminderType, referenceDate) {
  const row = db.prepare(
    'SELECT id FROM dm_reminders WHERE member_id = ? AND reminder_type = ? AND reference_date = ?'
  ).get(memberId, reminderType, referenceDate);
  return !!row;
}

function saveDmReminder(memberId, reminderType, referenceDate) {
  return db.prepare(
    'INSERT OR IGNORE INTO dm_reminders (member_id, reminder_type, reference_date) VALUES (?, ?, ?)'
  ).run(memberId, reminderType, referenceDate);
}

// 初回購入日を取得
function getFirstPurchase(memberId) {
  return db.prepare(
    'SELECT * FROM purchases WHERE member_id = ? ORDER BY purchased_at ASC LIMIT 1'
  ).get(memberId);
}

module.exports = {
  findMemberByLineId,
  findMemberBySmaregiId,
  createMember,
  linkMember,
  savePurchase,
  getPurchaseCount,
  scheduleMessage,
  getPendingMessages,
  markMessageSent,
  markMessageFailed,
  getAllLinkedMembers,
  hasReorderReminder,
  saveReorderReminder,
  hasBirthdayMessage,
  saveBirthdayMessage,
  hasDmReminder,
  saveDmReminder,
  getFirstPurchase,
};
