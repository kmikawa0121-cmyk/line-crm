const axios = require('axios');

const ENDPOINT = 'https://app-api.makeshop.jp/v1/graphql';

function getHeaders() {
  return {
    'authorization': `Bearer ${process.env.MAKESHOP_ACCESS_TOKEN}`,
    'x-api-key': process.env.MAKESHOP_API_KEY,
    'x-timestamp': String(Math.floor(Date.now() / 1000)),
    'content-type': 'application/json',
  };
}

async function graphql(query, variables = {}) {
  const response = await axios.post(ENDPOINT, { query, variables }, { headers: getHeaders() });
  if (response.data.errors) {
    throw new Error(`[MakeShop] ${response.data.errors[0].message}`);
  }
  return response.data.data;
}

async function findMemberByEmail(email) {
  const data = await graphql(`{
    searchMember(input: { page: 1, limit: 1, email: "${email.replace(/"/g, '')}" }) {
      members { memberId name email }
    }
  }`);
  const members = data.searchMember?.members || [];
  return members.length > 0 ? members[0] : null;
}

module.exports = { findMemberByEmail };
