const express = require('express');
const router = express.Router();
const db = require('../db');
const { getCustomerById, getCustomerPoint, getPurchaseHistory, getTransactionDetails } = require('../smaregi/api');

/**
 * GET /api/liff/member?lineUserId=xxx
 * LINEユーザーIDからポイント・顧客情報を返す
 */
router.get('/member', async (req, res) => {
  const { lineUserId } = req.query;
  if (!lineUserId) return res.status(400).json({ error: 'lineUserId is required' });

  const member = db.findMemberByLineId(lineUserId);
  if (!member || !member.smaregi_customer_id) {
    return res.status(404).json({ error: 'not_linked' });
  }

  try {
    const [customer, point] = await Promise.all([
      getCustomerById(member.smaregi_customer_id),
      getCustomerPoint(member.smaregi_customer_id),
    ]);
    res.json({
      displayName: member.display_name,
      point: point,
      rank: customer.memberRank?.memberRankName ?? null,
      customerCode: customer.customerCode ?? null,
      birthday: customer.birthday ?? null,
    });
  } catch (err) {
    console.error('[LIFF /member Error]', err.message);
    res.status(500).json({ error: 'smaregi_error' });
  }
});

/**
 * GET /api/liff/history?lineUserId=xxx
 * LINEユーザーIDから購入履歴を返す
 */
router.get('/history', async (req, res) => {
  const { lineUserId } = req.query;
  if (!lineUserId) return res.status(400).json({ error: 'lineUserId is required' });

  const member = db.findMemberByLineId(lineUserId);
  if (!member || !member.smaregi_customer_id) {
    return res.status(404).json({ error: 'not_linked' });
  }

  try {
    const customer = await getCustomerById(member.smaregi_customer_id);
    console.log('[LIFF /history] customerId:', member.smaregi_customer_id, '/ customerCode:', customer.customerCode);
    const transactions = await getPurchaseHistory(member.smaregi_customer_id);
    console.log('[LIFF /history] transactions count:', transactions?.length, 'first:', JSON.stringify(transactions?.[0]));
    const baseHistory = transactions.map((t) => ({
      date: t.transactionDateTime?.slice(0, 10) ?? '',
      total: t.total ?? t.subtotal ?? 0,
      id: t.transactionHeadId,
    }));

    // 各取引の商品明細を並列取得
    const history = await Promise.all(
      baseHistory.map(async (item) => {
        try {
          const details = await getTransactionDetails(item.id);
          const items = details.map((d) => ({
            name: d.productName ?? d.productCode ?? '商品',
            price: Number(d.price ?? 0),
            qty: Number(d.quantity ?? 1),
          }));
          return { ...item, items };
        } catch (e) {
          return { ...item, items: [] };
        }
      })
    );
    res.json({ history });
  } catch (err) {
    console.error('[LIFF /history Error]', err.message);
    res.status(500).json({ error: 'smaregi_error' });
  }
});

module.exports = router;
