const db = require('../db');
const { getFollowUpDays } = require('../config/followup');
const { scheduleMessage } = require('../db');

/**
 * スマレジのWebhookイベントを処理する
 * 対象イベント: transactions.create（会計完了）
 */
async function handleSmaregiWebhook(req, res) {
  try {
    const payload = req.body;

    // スマレジのWebhookは複数イベントをまとめて送ってくることがある
    const events = Array.isArray(payload) ? payload : [payload];

    for (const event of events) {
      if (event.event !== 'transactions.create') continue;

      const transaction = event.body;
      const smaregiCustomerId = transaction.customerId;

      // 顧客IDなし（非会員）はスキップ
      if (!smaregiCustomerId) continue;

      // LINE連携済み会員か確認
      const member = db.findMemberBySmaregiId(String(smaregiCustomerId));
      if (!member) continue;

      // 購入商品コード一覧を取得
      const productCodes = (transaction.details || []).map((d) => d.productCode).filter(Boolean);

      // 購入をDB保存
      const result = db.savePurchase(
        member.id,
        String(transaction.transactionHeadId),
        productCodes,
        transaction.transactionDateTime || new Date().toISOString()
      );

      if (result.changes === 0) {
        // 重複トランザクション（既に処理済み）
        continue;
      }

      const purchaseId = result.lastInsertRowid;
      const purchasedAt = new Date(transaction.transactionDateTime || Date.now());

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

    res.sendStatus(200);
  } catch (err) {
    console.error('[Smaregi Webhook Error]', err.message);
    res.sendStatus(500);
  }
}

module.exports = { handleSmaregiWebhook };
