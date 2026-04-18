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
  params.append('scope', 'pos.customers:read');

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

module.exports = { findCustomerByMemberCode };
