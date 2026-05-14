const express = require('express');
const router = express.Router();
const db = require('../db');
const { getCustomerById, getCustomerPoint, getPurchaseHistory } = require('../smaregi/api');

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
    const transactions = await getPurchaseHistory(customer.customerCode);
    console.log('[LIFF /history] transactions count:', transactions?.length, 'first:', JSON.stringify(transactions?.[0]));
    const history = transactions.map((t) => ({
      date: t.transactionDateTime?.slice(0, 10) ?? '',
      total: t.total ?? t.subtotal ?? 0,
      id: t.transactionHeadId,
    }));
    res.json({ history });
  } catch (err) {
    console.error('[LIFF /history Error]', err.message);
    res.status(500).json({ error: 'smaregi_error' });
  }
});

module.exports = router;
