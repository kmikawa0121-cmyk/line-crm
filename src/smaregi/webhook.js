const db = require('../db');
const { getFollowUpDays } = require('../config/followup');
const { scheduleMessage, getPurchaseCount } = require('../db');
const { getTransactionById, getTransactionDetails } = require('./api');

/**
 * スマレジのWebhookイベントを処理する（プラットフォームAPI対応）
 *
 * Platform APIのWebhookはイベント名と主キーのみを送信するため、
 * 受信後に別途APIで完全なデータを取得する。
 * また3秒以内にレスポンスを返す必要があるため、先にres.sendStatus(200)を返してから処理する。
 */
async function handleSmaregiWebhook(req, res) {
  // 3秒タイムアウト制限のため即座に200を返す
  res.sendStatus(200);

  try {
    const payload = req.body;
    console.log('[Smaregi Webhook] 受信:', JSON.stringify(payload));

    const events = Array.isArray(payload) ? payload : [payload];

    for (const event of events) {
      // Platform API形式: { event: 'transactions', action: 'create', body: { transactionHeadId: '...' } }
      // または旧形式: { event: 'transactions.create', body: { ... } }
      const isCreate =
        (event.event === 'transactions' && event.action === 'create') ||
        event.event === 'transactions.create';

      if (!isCreate) continue;

      const transactionHeadId =
        event.body?.transactionHeadId ||
        event.body?.id ||
        event.body?.transaction_head_id;

      if (!transactionHeadId) {
        console.error('[Smaregi Webhook] transactionHeadId が見つかりません:', JSON.stringify(event.body));
        continue;
      }

      console.log(`[Smaregi Webhook] 取引ID=${transactionHeadId} のデータを取得中...`);

      // APIで取引ヘッダーと明細を並列取得
      const [transaction, details] = await Promise.all([
        getTransactionById(transactionHeadId),
        getTransactionDetails(transactionHeadId),
      ]);

      const smaregiCustomerId = transaction.customerId;

      // 非会員はスキップ
      if (!smaregiCustomerId) continue;

      // LINE連携済み会員か確認
      const member = db.findMemberBySmaregiId(String(smaregiCustomerId));
      if (!member) continue;

      // 購入商品コード一覧
      const productCodes = details.map((d) => d.productCode).filter(Boolean);

      // 購入をDB保存
      const result = db.savePurchase(
        member.id,
        String(transactionHeadId),
        productCodes,
        transaction.transactionDateTime || new Date().toISOString()
      );

      if (result.changes === 0) {
        // 重複トランザクション（既に処理済み）
        continue;
      }

      const purchaseId = result.lastInsertRowid;
      const purchasedAt = new Date(transaction.transactionDateTime || Date.now());

      // 初回購入のみフォローアップを送る
      const purchaseCount = getPurchaseCount(member.id);
      if (purchaseCount > 1) {
        console.log(`[Smaregi] 会員${member.id} → 2回目以降の購入のためフォローアップなし`);
        continue;
      }

      // フォローアップのスケジュール登録
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

        console.log(`[Smaregi] 会員${member.id} → ${day}日後にDMスケジュール`);
      }
    }
  } catch (err) {
    console.error('[Smaregi Webhook Error]', err.message);
  }
}

module.exports = { handleSmaregiWebhook };
