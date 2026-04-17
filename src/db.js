const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data.db'));

// テーブル初期化
db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_user_id TEXT UNIQUE NOT NULL,
    smaregi_customer_id TEXT UNIQUE,
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

function linkMember(lineUserId, smaregiCustomerId) {
  return db.prepare(
    'UPDATE members SET smaregi_customer_id = ? WHERE line_user_id = ?'
  ).run(smaregiCustomerId, lineUserId);
}

// --- purchases ---

function savePurchase(memberId, transactionId, productCodes, purchasedAt) {
  return db.prepare(
    'INSERT OR IGNORE INTO purchases (member_id, transaction_id, product_codes, purchased_at) VALUES (?, ?, ?, ?)'
  ).run(memberId, transactionId, JSON.stringify(productCodes), purchasedAt);
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

module.exports = {
  findMemberByLineId,
  findMemberBySmaregiId,
  createMember,
  linkMember,
  savePurchase,
  scheduleMessage,
  getPendingMessages,
  markMessageSent,
  markMessageFailed,
};
