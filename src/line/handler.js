const line = require('@line/bot-sdk');
const db = require('../db');
const { findCustomerByMemberCode } = require('../smaregi/api');
const { findMemberByEmail: findMakeShopMemberByEmail } = require('../makeshop/api');
const {
  getWelcomeMessage,
  getLinkSuccessMessage,
  getLinkFailMessage,
  getCh2WelcomeMessage,
  getCh2LinkSuccessMessage,
  getCh2LinkFailMessage,
} = require('./messages');

// チャネルIDごとのLINEクライアントを管理
const clients = {};

function initLineClient() {
  const { getChannels } = require('../channels');
  const channels = getChannels();
  for (const [id, ch] of Object.entries(channels)) {
    clients[id] = new line.messagingApi.MessagingApiClient({
      channelAccessToken: ch.accessToken,
    });
  }
  console.log(`[LINE] クライアント初期化: ${Object.keys(clients).join(', ')}`);
}

function getClient(channelId = 'ch1') {
  if (Object.keys(clients).length === 0) initLineClient();
  return clients[channelId] || clients[Object.keys(clients)[0]];
}

/**
 * LINEのWebhookイベントを処理する
 * req.channelId にチャネルIDがセットされている前提
 */
async function handleLineWebhook(req, res) {
  const channelId = req.channelId || 'ch1';
  const events = req.body.events || [];

  // LINEは200が返らないと再送するため、即座に返してから処理する
  res.sendStatus(200);

  Promise.all(events.map(e => handleEvent(e, channelId))).catch(err => {
    console.error('[LINE Webhook] 処理エラー:', err);
  });
}

async function handleEvent(event, channelId = 'ch1') {
  const lineUserId = event.source.userId;
  const replyToken = event.replyToken;

  try {
    if (event.type === 'follow') {
      await ensureMember(lineUserId, channelId);
      const welcomeMsg = channelId === 'ch2' ? getCh2WelcomeMessage() : getWelcomeMessage();
      await getClient(channelId).replyMessage({ replyToken, messages: [welcomeMsg] });
      return;
    }

    if (event.type === 'message' && event.message.type === 'text') {
      const text = event.message.text.trim();
      const member = db.findMemberByLineId(lineUserId);

      if (channelId === 'ch2') {
        // ch2: メールアドレスで連携
        if (!member || !member.makeshop_member_id) {
          if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
            await handleEmailInput(lineUserId, text, replyToken, channelId);
          }
        }
        return;
      }

      // ch1: 数字のみ → 会員番号として処理
      if (!member || !member.smaregi_customer_id) {
        if (/^\d+$/.test(text)) {
          await handleMemberCodeInput(lineUserId, text, replyToken, channelId);
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
 * ch2: メールアドレス入力の処理
 */
async function handleEmailInput(lineUserId, email, replyToken, channelId = 'ch2') {
  let makeshopMember;
  try {
    makeshopMember = await findMakeShopMemberByEmail(email);
  } catch (err) {
    console.error('[MakeShop API Error]', err.message);
    await getClient(channelId).replyMessage({
      replyToken,
      messages: [{ type: 'text', text: 'エラーが発生しました。しばらくしてからお試しください。' }],
    });
    return;
  }

  if (!makeshopMember) {
    await getClient(channelId).replyMessage({ replyToken, messages: [getCh2LinkFailMessage()] });
    return;
  }

  const profile = await getClient(channelId).getProfile(lineUserId);
  db.createMember(lineUserId, profile.displayName, channelId);
  db.linkMakeShopMember(lineUserId, makeshopMember.memberId, makeshopMember.name);

  console.log(`[LINE] ch2連携完了: LINE=${lineUserId} ← MakeShop=${makeshopMember.memberId} 氏名=${makeshopMember.name}`);

  await getClient(channelId).replyMessage({ replyToken, messages: [getCh2LinkSuccessMessage(profile.displayName)] });
}

/**
 * 会員番号入力の処理
 */
async function handleMemberCodeInput(lineUserId, memberCode, replyToken, channelId = 'ch1') {
  let customer;

  try {
    customer = await findCustomerByMemberCode(memberCode);
  } catch (err) {
    console.error('[Smaregi API Error]', err.message);
    await getClient(channelId).replyMessage({
      replyToken,
      messages: [{ type: 'text', text: 'エラーが発生しました。しばらくしてからお試しください。' }],
    });
    return;
  }

  if (!customer) {
    await getClient(channelId).replyMessage({
      replyToken,
      messages: [getLinkFailMessage()],
    });
    return;
  }

  // 会員情報を取得してLINEと紐付け
  const profile = await getClient(channelId).getProfile(lineUserId);
  db.createMember(lineUserId, profile.displayName, channelId);
  const customerName = [customer.lastName, customer.firstName].filter(Boolean).join(' ');
  db.linkMember(lineUserId, String(customer.customerId), String(customer.customerCode || ''), customerName);

  console.log(`[LINE] 紐付け完了: LINE=${lineUserId} ← スマレジ顧客ID=${customer.customerId} 会員番号=${customer.customerCode} 氏名=${customerName} チャネル=${channelId}`);

  await getClient(channelId).replyMessage({
    replyToken,
    messages: [getLinkSuccessMessage(profile.displayName)],
  });
  console.log(`[LINE] 連携完了メッセージ送信: ${lineUserId}`);
}

// 429時に最大3回リトライ（2秒→4秒→6秒待機）
async function pushMessageWithRetry(channelId, to, messages, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await getClient(channelId).pushMessage({ to, messages });
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
async function ensureMember(lineUserId, channelId = 'ch1') {
  const profile = await getClient(channelId).getProfile(lineUserId);
  db.createMember(lineUserId, profile.displayName, channelId);
}

module.exports = { handleLineWebhook, initLineClient, getClient, pushMessageWithRetry };
