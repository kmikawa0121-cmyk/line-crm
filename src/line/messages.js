/**
 * LINEに送るメッセージテンプレート
 * message_type と日数に応じて内容を変える
 */

function getFollowUpMessage(messageType, displayName) {
  const name = displayName || 'お客様';

  const templates = {
    '3day': {
      type: 'text',
      text: `${name}、先日はご来店ありがとうございました！\n\nその後、ご購入いただいた商品はいかがでしょうか？\nご不明な点がございましたら、お気軽にご相談ください😊`,
    },
    '7day': {
      type: 'text',
      text: `${name}、ご購入から1週間が経ちました！\n\n商品の使い心地はいかがですか？\nまたのご来店をお待ちしております🙏`,
    },
    '1month': {
      type: 'text',
      text: `${name}、ご購入から約1ヶ月が経ちました。\n\n商品はそろそろ補充のタイミングかもしれません。\n次回のご来店時にスタッフにお声がけください✨`,
    },
  };

  return templates[messageType] || {
    type: 'text',
    text: `${name}、いつもご利用ありがとうございます。またのご来店をお待ちしております。`,
  };
}

function getWelcomeMessage() {
  return {
    type: 'text',
    text: '友だち追加ありがとうございます！\n\nLINEと会員情報を連携すると、購入後のフォロー情報をお届けします。\n\n会員番号をこのトークに入力してください👇',
  };
}

function getLinkSuccessMessage(displayName) {
  return {
    type: 'text',
    text: `${displayName || 'お客様'}、連携が完了しました✅\n\nこれからご来店・ご購入後に、役立つ情報をお届けします。`,
  };
}

function getLinkFailMessage() {
  return {
    type: 'text',
    text: '会員番号が見つかりませんでした。\n\n番号をご確認の上、再度入力してください。\nご不明な点は店頭スタッフにお声がけください。',
  };
}

module.exports = {
  getFollowUpMessage,
  getWelcomeMessage,
  getLinkSuccessMessage,
  getLinkFailMessage,
};
