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

  // LINEは200が返らないと再送するため、即座に返してから処理する
  res.sendStatus(200);

  Promise.all(events.map(handleEvent)).catch(err => {
    console.error('[LINE Webhook] 処理エラー:', err);
  });
}

async function handleEvent(event) {
  const lineUserId = event.source.userId;
  const replyToken = event.replyToken;

  try {
    if (event.type === 'follow') {
      // 友だち追加 → 会員番号の入力を促す
      await ensureMember(lineUserId);
      await getClient().replyMessage({
        replyToken,
        messages: [getWelcomeMessage()],
      });
      return;
    }

    if (event.type === 'message' && event.message.type === 'text') {
      const text = event.message.text.trim();
      const member = db.findMemberByLineId(lineUserId);

      // 未連携 かつ 数字のみのメッセージ → 会員番号として処理
      // 相談など文字を含むメッセージはスタッフが手動対応できるよう無視する
      if (!member || !member.smaregi_customer_id) {
        if (/^\d+$/.test(text)) {
          await handleMemberCodeInput(lineUserId, text, replyToken);
        }
        return;
      }

      // 連携済みの場合は何もしない（スタッフが手動対応）
    }
  } catch (err) {
    console.error('[LINE Handler Error]', err.message);
  }
}

/**
 * 会員番号入力の処理
 */
async function handleMemberCodeInput(lineUserId, memberCode, replyToken) {
  let customer;

  try {
    customer = await findCustomerByMemberCode(memberCode);
  } catch (err) {
    console.error('[Smaregi API Error]', err.message);
    await getClient().replyMessage({
      replyToken,
      messages: [{ type: 'text', text: 'エラーが発生しました。しばらくしてからお試しください。' }],
    });
    return;
  }

  if (!customer) {
    await getClient().replyMessage({
      replyToken,
      messages: [getLinkFailMessage()],
    });
    return;
  }

  // 会員情報を取得してLINEと紐付け
  const profile = await getClient().getProfile(lineUserId);
  db.createMember(lineUserId, profile.displayName);
  const customerName = [customer.lastName, customer.firstName].filter(Boolean).join(' ');
  db.linkMember(lineUserId, String(customer.customerId), String(customer.customerCode || ''), customerName);

  console.log(`[LINE] 紐付け完了: LINE=${lineUserId} ← スマレジ顧客ID=${customer.customerId} 会員番号=${customer.customerCode} 氏名=${customerName}`);

  await getClient().replyMessage({
    replyToken,
    messages: [getLinkSuccessMessage(profile.displayName)],
  });
  console.log(`[LINE] 連携完了メッセージ送信: ${lineUserId}`);
}

// 429時に最大3回リトライ（2秒→4秒→6秒待機）
async function pushMessageWithRetry(to, messages, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await getClient().pushMessage({ to, messages });
      console.log(`[LINE] pushMessage成功: ${to}`);
      return;
    } catch (err) {
      const status = err.status ?? err.statusCode ?? err.response?.status;
      console.error(`[LINE] pushMessage失敗 (試行${i + 1}/${maxRetries}): status=${status} ${err.message}`);
      if (status === 429 && i < maxRetries - 1) {
        const wait = (i + 1) * 2000;
        console.log(`[LINE] ${wait / 1000}秒後にリトライ...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
}

/**
 * 友だち追加時にDBにレコードを作る（未連携状態で保持）
 */
async function ensureMember(lineUserId) {
  const profile = await getClient().getProfile(lineUserId);
  db.createMember(lineUserId, profile.displayName);
}

module.exports = { handleLineWebhook, initLineClient, getClient };
