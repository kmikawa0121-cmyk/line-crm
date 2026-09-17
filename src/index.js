require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const line = require('@line/bot-sdk');
const { handleLineWebhook, initLineClient } = require('./line/handler');
const { handleSmaregiWebhook } = require('./smaregi/webhook');
const { startScheduler } = require('./scheduler');
const liffRoutes = require('./liff/routes');
const { router: adminRouter } = require('./admin/routes');
const db = require('./db');
const { getCustomerById } = require('./smaregi/api');
const { getChannels } = require('./channels');

const app = express();
const PORT = process.env.PORT || 3000;

// --- チャネル別 LINE Webhook 登録 ---
const channels = getChannels();

/**
 * 生のボディを受け取り、ch1 だけ総合受信箱にも転送する。
 *
 * 店舗用LINE（ch1）は委託会員カードが稼働しているため、LINE側の Webhook URL を
 * 総合受信箱に切り替えることができない。そこで、ここで受け取ったものを
 * そのまま横流しする。
 *
 * **生のバイト列のまま送ること。**JSON に直して送り直すと署名が合わず、
 * 受け取り側で弾かれる。
 *
 * **@line/bot-sdk の middleware より前に置くこと。**
 * middleware は本文を ①req.rawBody → ②req.body → ③ストリームを読む の順で探す。
 * express.raw() が req.body に Buffer を入れるので、それを req.rawBody に移してから
 * middleware に渡す。検証後に middleware が req.body をパース済みオブジェクトに
 * 置き換えるので、既存の handleLineWebhook はそのまま動く。
 *
 * **app.use() や express.json() での先読みは使わない。**
 * ストリームを先に消費すると ③ が空を読み、全チャネルの署名検証が落ちる。
 * ルート単位で閉じておけば、置き場所を間違えようがない。
 *
 * 転送は投げっぱなし。**受信箱が落ちていても会員カードの処理は止めない。**
 */
// 転送先。既定値を持たせてあるので、Railway の環境変数を設定しなくても動く。
// （Railway を操作できる人が限られているため、設定作業を増やさない）
//
// 上書きしたいときは CH1_FORWARD_URL に別のURLを、
// 止めたいときは CH1_FORWARD_URL=off を入れる。
//
// このURLは署名（HMAC-SHA256）で守られている。Channel secret を持たない相手が
// 叩いても、受け取り側で401になる。
const CH1_FORWARD_DEFAULT = 'https://inbox.mikawakampodo.com/webhook/line/bdd1ae6efe559510c92765e9';
const ch1ForwardUrl = String(process.env.CH1_FORWARD_URL ?? CH1_FORWARD_DEFAULT).trim();
const ch1ForwardOn = Boolean(ch1ForwardUrl) && ch1ForwardUrl.toLowerCase() !== 'off';

const rawAndForward = (channelId) => [
  express.raw({ type: '*/*', limit: '2mb' }),
  (req, res, next) => {
    req.rawBody = req.body;

    if (channelId === 'ch1' && ch1ForwardOn) {
      fetch(ch1ForwardUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-line-signature': req.get('x-line-signature') || '',
        },
        body: req.rawBody,
      }).catch((err) => {
        console.error('[Forward] 転送に失敗:', err.message);
      });
    }
    next();
  },
];

for (const [channelId, ch] of Object.entries(channels)) {
  const middleware = line.middleware({ channelSecret: ch.secret });

  // チャネル専用エンドポイント: /webhook/line/ch1, /webhook/line/ch2 ...
  app.post(`/webhook/line/${channelId}`, ...rawAndForward(channelId), middleware, (req, res, next) => {
    req.channelId = channelId;
    next();
  }, handleLineWebhook);

  console.log(`[Route] /webhook/line/${channelId} → ${ch.name}`);
}

// 後方互換: /webhook/line → ch1 として処理
const ch1 = channels['ch1'];
if (ch1) {
  const ch1Middleware = line.middleware({ channelSecret: ch1.secret });
  app.post('/webhook/line', ...rawAndForward('ch1'), ch1Middleware, (req, res, next) => {
    req.channelId = 'ch1';
    next();
  }, handleLineWebhook);
}

console.log(
  ch1ForwardOn
    ? `[Forward] ch1 → ${ch1ForwardUrl}`
    : '[Forward] ch1 の転送は無効（CH1_FORWARD_URL=off）'
);

// --- その他ルーティング ---

// スマレジ Webhook（JSON body parser）
app.post('/webhook/smaregi', express.json(), handleSmaregiWebhook);

// LIFF API
app.use('/api/liff', express.json(), liffRoutes);

// 管理画面
app.use('/admin', adminRouter);

// LIFF 画面（LIFF_ID・CHANNEL_IDを環境変数から埋め込んで配信）
// /liff?channel=ch1 または /liff?channel=ch2 でチャネルを指定
app.get('/liff', (req, res) => {
  const channelId = req.query.channel || 'ch1';
  const ch = channels[channelId] || channels['ch1'];
  const liffId = ch ? ch.liffId : (process.env.LIFF_ID || '');

  const filePath = path.join(__dirname, '../public/liff/index.html');
  let html = fs.readFileSync(filePath, 'utf8');
  html = html.replace('__LIFF_ID__', liffId);
  html = html.replace('__CHANNEL_ID__', channelId);
  res.send(html);
});

// 静的ファイル配信（public ディレクトリ）
app.use(express.static(path.join(__dirname, '../public')));

// ヘルスチェック
app.get('/', (req, res) => res.json({ status: 'ok', time: new Date().toISOString(), channels: Object.keys(channels) }));

async function backfillCustomerInfo() {
  const members = db.getMembersWithoutCustomerInfo();
  if (members.length === 0) return;
  console.log(`[Backfill] 会員情報を補完中... ${members.length}名`);
  let firstDone = false;
  for (const m of members) {
    try {
      const customer = await getCustomerById(m.smaregi_customer_id);
      if (!firstDone) {
        console.log('[Backfill] スマレジ顧客フィールド一覧:', Object.keys(customer).join(', '));
        firstDone = true;
      }
      const name = [customer.lastName, customer.firstName].filter(Boolean).join(' ');
      const code = customer.customerCode ? String(customer.customerCode) : null;
      const birthday = customer.birthDate || null;
      db.updateCustomerInfo(m.id, name || null, code, birthday);
      console.log(`[Backfill] 補完: ${name} (会員番号:${code}) 誕生日:${birthday || '未登録'}`);
    } catch (err) {
      console.error(`[Backfill] エラー member_id=${m.id}:`, err.message);
    }
  }
  console.log('[Backfill] 完了');
}

// --- 起動 ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`サーバー起動: PORT=${PORT}`);
  initLineClient();
  startScheduler();
  backfillCustomerInfo();
});
