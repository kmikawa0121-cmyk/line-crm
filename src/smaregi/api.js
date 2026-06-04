const axios = require('axios');

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * スマレジOAuth2トークン取得（client_credentials）
 */
async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const { SMAREGI_CLIENT_ID, SMAREGI_CLIENT_SECRET, SMAREGI_CONTRACT_ID } = process.env;
  const tokenUrl = `https://id.smaregi.jp/app/${SMAREGI_CONTRACT_ID}/token`;

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('scope', 'pos.customers:read pos.transactions:read');

  const response = await axios.post(tokenUrl, params, {
    auth: {
      username: SMAREGI_CLIENT_ID,
      password: SMAREGI_CLIENT_SECRET,
    },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  cachedToken = response.data.access_token;
  tokenExpiresAt = Date.now() + response.data.expires_in * 1000 - 60000; // 1分前に更新
  return cachedToken;
}

/**
 * 会員番号（memberCode）でスマレジ顧客を検索
 * @param {string} memberCode
 * @returns {object|null} 顧客データ or null
 */
async function findCustomerByMemberCode(memberCode) {
  const token = await getAccessToken();
  const { SMAREGI_CONTRACT_ID } = process.env;

  const response = await axios.get(
    `https://api.smaregi.jp/${SMAREGI_CONTRACT_ID}/pos/customers`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { customer_code: memberCode, limit: 1 },
    }
  );

  const customers = response.data;
  return customers.length > 0 ? customers[0] : null;
}

/**
 * スマレジ顧客IDで顧客詳細（ポイント含む）を取得
 * @param {string} customerId
 */
async function getCustomerById(customerId) {
  const token = await getAccessToken();
  const { SMAREGI_CONTRACT_ID } = process.env;

  const response = await axios.get(
    `https://api.smaregi.jp/${SMAREGI_CONTRACT_ID}/pos/customers/${customerId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
}

/**
 * スマレジ顧客のポイント残高を取得
 * GET /pos/customers/point?customer_id={customerId}
 * @param {string} customerId
 * @returns {number} ポイント残高
 */
async function getCustomerPoint(customerId) {
  const token = await getAccessToken();
  const { SMAREGI_CONTRACT_ID } = process.env;

  const response = await axios.get(
    `https://api.smaregi.jp/${SMAREGI_CONTRACT_ID}/pos/customers/point`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { customer_id: customerId, limit: 1 },
    }
  );
  const data = response.data;
  return data.length > 0 ? Number(data[0].point) : 0;
}

/**
 * スマレジ顧客の購入履歴を取得（customerId使用、直近3ヶ月）
 * ※ トランザクションAPIは日付範囲必須・最大31日のため複数回呼び出す
 * @param {string} customerId  スマレジ内部顧客ID
 * @returns {Array} 取引一覧（日付降順）
 */
async function getPurchaseHistory(customerId) {
  const token = await getAccessToken();
  const { SMAREGI_CONTRACT_ID } = process.env;

  const allTransactions = [];
  const now = new Date();

  // 直近4ヶ月を30日ずつ4回に分けて取得（APIの31日制限対応）
  for (let i = 0; i < 4; i++) {
    const toDate = new Date(now);
    toDate.setDate(toDate.getDate() - i * 30);
    const fromDate = new Date(toDate);
    fromDate.setDate(fromDate.getDate() - 30);

    const fmt = (d) => d.toISOString().replace(/\.\d{3}Z$/, '+00:00');

    try {
      const response = await axios.get(
        `https://api.smaregi.jp/${SMAREGI_CONTRACT_ID}/pos/transactions`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            'transaction_date_time-from': fmt(fromDate),
            'transaction_date_time-to': fmt(toDate),
            limit: 1000,
          },
        }
      );
      if (Array.isArray(response.data)) {
        // 全取引のうちこの顧客のものだけを抽出
        const matched = response.data.filter(t =>
          String(t.customerId) === String(customerId)
        );
        console.log(`[getPurchaseHistory] window ${i}: total=${response.data.length} matched=${matched.length} (first raw: ${JSON.stringify(response.data[0]?.customerId)})`);
        allTransactions.push(...matched);
      }
    } catch (e) {
      const detail = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      console.error(`[getPurchaseHistory] window ${i} error: ${e.response?.status} / ${detail}`);
    }
  }

  // 日付降順でソート
  allTransactions.sort((a, b) =>
    new Date(b.transactionDateTime) - new Date(a.transactionDateTime)
  );

  return allTransactions;
}

/**
 * トランザクション詳細（商品明細）を取得
 * @param {string} transactionHeadId
 * @returns {Array} 明細一覧
 */
async function getTransactionDetails(transactionHeadId) {
  const token = await getAccessToken();
  const { SMAREGI_CONTRACT_ID } = process.env;

  const response = await axios.get(
    `https://api.smaregi.jp/${SMAREGI_CONTRACT_ID}/pos/transactions/${transactionHeadId}/details`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return Array.isArray(response.data) ? response.data : [];
}

module.exports = { findCustomerByMemberCode, getCustomerById, getCustomerPoint, getPurchaseHistory, getTransactionDetails };
