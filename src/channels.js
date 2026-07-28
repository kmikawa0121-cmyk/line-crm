// チャネル設定ローダー
// 環境変数 LINE_CHANNEL_1_SECRET, LINE_CHANNEL_2_SECRET ... を読み込む
// 旧形式（LINE_CHANNEL_SECRET）も ch1 として後方互換対応

function getChannels() {
  const channels = {};

  let i = 1;
  while (process.env[`LINE_CHANNEL_${i}_SECRET`]) {
    const id = `ch${i}`;
    channels[id] = {
      id,
      name: process.env[`LINE_CHANNEL_${i}_NAME`] || id,
      secret: process.env[`LINE_CHANNEL_${i}_SECRET`],
      accessToken: process.env[`LINE_CHANNEL_${i}_ACCESS_TOKEN`],
      liffId: process.env[`LINE_CHANNEL_${i}_LIFF_ID`] || '',
    };
    i++;
  }

  // 旧形式の環境変数（後方互換）→ ch1 として扱う
  if (Object.keys(channels).length === 0 && process.env.LINE_CHANNEL_SECRET) {
    channels['ch1'] = {
      id: 'ch1',
      name: process.env.LINE_CHANNEL_1_NAME || '美川漢方堂',
      secret: process.env.LINE_CHANNEL_SECRET,
      accessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
      liffId: process.env.LIFF_ID || '',
    };
  }

  return channels;
}

module.exports = { getChannels };
