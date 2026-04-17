const line = require('@line/bot-sdk');
const db = require('../db');
const { findCustomerByMemberCode } = require('../smaregi/api');
const {
  getWelcomeMessage,
  getLinkSuccessMessage,
  getLinkFailMessage,
} = require('./messages');

let client;

function initLineClient() {
  client = new line.messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });
  return client;
}

function getClient() {
  if (!client) initLineClient();
  return client;
}

/**
 * LINEのWebhookイベントを処理する
 */
async function handleLineWebhook(req, res) {
  const events = req.body.events || [];

  await Promise.all(events.map(handleEvent));
  res.sendStatus(200);
}

async function handleEvent(event) {
  const lineUserId = event.source.userId;

  try {
    if (event.type === 'follow') {
      // 友だち追加 → 会員番号の入力を促す
      await ensureMember(lineUserId);
      await getClient().pushMessage({
        to: lineUserId,
        messages: [getWelcomeMessage()],
      });
      return;
    }

    if (event.type === 'message' && event.message.type === 'text') {
      const text = event.message.text.trim();
      const member = db.findMemberByLineId(lineUserId);

      // 未連携の場合 → 会員番号として処理
      if (!member || !member.smaregi_customer_id) {
        await handleMemberCodeInput(lineUserId, text);
        return;
      }

      // 連携済みの場合は何もしない（または将来的に問い合わせ対応）
    }
  } catch (err) {
    console.error('[LINE Handler Error]', err.message);
  }
}

/**
 * 会員番号入力の処理
 */
async function handleMemberCodeInput(lineUserId, memberCode) {
  let customer;

  try {
    customer = await findCustomerByMemberCode(memberCode);
  } catch (err) {
    console.error('[Smaregi API Error]', err.message);
    await getClient().pushMessage({
      to: lineUserId,
      messages: [{ type: 'text', text: 'エラーが発生しました。しばらくしてからお試しください。' }],
    });
    return;
  }

  if (!customer) {
    await getClient().pushMessage({
      to: lineUserId,
      messages: [getLinkFailMessage()],
    });
    return;
  }

  // 会員情報を取得してLINEと紐付け
  const profile = await getClient().getProfile(lineUserId);
  db.createMember(lineUserId, profile.displayName);
  db.linkMember(lineUserId, String(customer.customerId));

  console.log(`[LINE] 紐付け完了: LINE=${lineUserId} ← スマレジ顧客ID=${customer.customerId}`);

  await getClient().pushMessage({
    to: lineUserId,
    messages: [getLinkSuccessMessage(profile.displayName)],
  });
}

/**
 * 友だち追加時にDBにレコードを作る（未連携状態で保持）
 */
async function ensureMember(lineUserId) {
  const profile = await getClient().getProfile(lineUserId);
  db.createMember(lineUserId, profile.displayName);
}

module.exports = { handleLineWebhook, initLineClient, getClient };
