const express = require('express');
const router = express.Router();
const db = require('../db');
const { getCustomerById, getCustomerPoint, getPurchaseHistory, getTransactionDetails, updateCustomer } = require('../smaregi/api');

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
      birthday: customer.birthDate ?? null,
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

/**
 * POST /api/liff/profile
 * 顧客が誕生日を自己入力 → スマレジ＆ローカルDBに反映
 * body: { lineUserId, birthYear, birthMonth, birthDay }
 */
router.post('/profile', async (req, res) => {
  const { lineUserId, birthYear, birthMonth, birthDay } = req.body || {};

  if (!lineUserId) return res.status(400).json({ error: 'lineUserId is required' });

  const member = db.findMemberByLineId(lineUserId);
  if (!member || !member.smaregi_customer_id) {
    return res.status(404).json({ error: 'not_linked' });
  }

  const month = parseInt(birthMonth, 10);
  const day = parseInt(birthDay, 10);

  if (!birthMonth) {
    return res.status(400).json({ error: '月を選択してください' });
  }
  if (month < 1 || month > 12) {
    return res.status(400).json({ error: '月は1〜12で入力してください' });
  }
  if (birthDay && (day < 1 || day > 31)) {
    return res.status(400).json({ error: '日は1〜31で入力してください' });
  }

  const yyyy = birthYear ? String(parseInt(birthYear, 10)).padStart(4, '0') : '0000';
  const mm = String(month).padStart(2, '0');
  const dd = birthDay ? String(day).padStart(2, '0') : '00';
  const birthDate = `${yyyy}-${mm}-${dd}`;

  try {
    await updateCustomer(member.smaregi_customer_id, { birthDate });
    db.updateMemberBirthday(member.id, birthDate);
    console.log(`[LIFF /profile] 誕生日更新: member_id=${member.id} → ${birthDate}`);
    res.json({ success: true, birthDate });
  } catch (err) {
    console.error('[LIFF /profile Error]', err.response?.data || err.message);
    res.status(500).json({ error: 'update_failed', detail: err.response?.data });
  }
});

module.exports = router;
