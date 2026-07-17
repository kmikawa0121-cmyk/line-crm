const db = require('../db');
const { scheduleMessage, getPurchaseCount } = require('../db');
const { getTransactionById, getTransactionDetails } = require('./api');
const { getFollowUpDays } = require('../config/followup');

/**
 * スマレジのWebhookイベントを処理する（プラットフォームAPI対応）
 *
 * 受信フォーマット:
 * { contractId, event: 'pos:transactions', action: 'created', transactionHeadIds: ['1242'] }
 */
async function handleSmaregiWebhook(req, res) {
  res.sendStatus(200);

  try {
    const payload = req.body;
    console.log('[Smaregi Webhook] 受信:', JSON.stringify(payload));

    const events = Array.isArray(payload) ? payload : [payload];

    for (const event of events) {
      const isCreate =
        (event.event === 'pos:transactions' && event.action === 'created') ||
        (event.event === 'transactions' && event.action === 'create') ||
        event.event === 'transactions.create';

      if (!isCreate) {
        console.log(`[Smaregi Webhook] スキップ: event=${event.event} action=${event.action}`);
        continue;
      }

      // transactionHeadIds（配列）または従来のbody形式に対応
      const ids = event.transactionHeadIds
        || (event.body?.transactionHeadId ? [event.body.transactionHeadId] : null)
        || (event.body?.id ? [event.body.id] : null)
        || [];

      if (ids.length === 0) {
        console.error('[Smaregi Webhook] transactionHeadId が見つかりません:', JSON.stringify(event));
        continue;
      }

      for (const transactionHeadId of ids) {
        await processTransaction(transactionHeadId);
      }
    }
  } catch (err) {
    console.error('[Smaregi Webhook Error]', err.message);
  }
}

async function processTransaction(transactionHeadId) {
  console.log(`[Smaregi Webhook] 取引ID=${transactionHeadId} のデータを取得中...`);

  const [transaction, details] = await Promise.all([
    getTransactionById(transactionHeadId),
    getTransactionDetails(transactionHeadId),
  ]);

  const smaregiCustomerId = transaction.customerId;

  if (!smaregiCustomerId) {
    console.log(`[Smaregi Webhook] 取引ID=${transactionHeadId} は非会員のためスキップ`);
    return;
  }

  const member = db.findMemberBySmaregiId(String(smaregiCustomerId));
  if (!member) {
    console.log(`[Smaregi Webhook] スマレジ顧客ID=${smaregiCustomerId} はLINE未連携のためスキップ`);
    return;
  }

  const productCodes = details.map((d) => d.productCode).filter(Boolean);

  const result = db.savePurchase(
    member.id,
    String(transactionHeadId),
    productCodes,
    transaction.transactionDateTime || new Date().toISOString()
  );

  if (result.changes === 0) {
    console.log(`[Smaregi Webhook] 取引ID=${transactionHeadId} は処理済みのためスキップ`);
    return;
  }

  const purchaseId = result.lastInsertRowid;
  const purchasedAt = new Date(transaction.transactionDateTime || Date.now());

  const purchaseCount = getPurchaseCount(member.id);
  if (purchaseCount > 1) {
    console.log(`[Smaregi] 会員${member.id} → 2回目以降の購入のためフォローアップなし`);
    return;
  }

  const days = getFollowUpDays(productCodes);

  for (const day of days) {
    const scheduledAt = new Date(purchasedAt);
    scheduledAt.setDate(scheduledAt.getDate() + day);

    const messageType = day === 3 ? '3day' : day === 7 ? '7day' : '1month';

    scheduleMessage(
      member.id,
      purchaseId,
      messageType,
      scheduledAt.toISOString().replace('T', ' ').slice(0, 19)
    );

    console.log(`[Smaregi] 会員${member.id} → ${day}日後にDMスケジュール (${messageType})`);
  }

  console.log(`[Smaregi Webhook] 取引ID=${transactionHeadId} 処理完了`);
}

module.exports = { handleSmaregiWebhook };
