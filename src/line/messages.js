/**
 * LINEに送るメッセージテンプレート
 * message_type と日数に応じて内容を変える
 */

function getFollowUpMessage(messageType, displayName) {
  const name = displayName || 'お客様';

  const templates = {
    '3day': {
      type: 'text',
      text: `${name}様、先日はご来店いただきありがとうございました。\n\n商品は今日も飲めていますでしょうか？☕\n\n漢方や健康食品は、毎日の小さな積み重ねが、やがて大きな変化へとつながっていきます。\n\n「続ける」ということ自体が、体へのやさしい贈り物です🌿\n\n飲むタイミングを決めきれていない方は、朝食後や就寝前など、毎日の習慣と合わせると忘れにくくなりますのでぜひお試しくださいね。\n\n何かご不明な点やご不安があれば、いつでも気軽にご連絡くださいませ。`,
    },
    '7day': {
      type: 'text',
      text: `${name}様、商品をご購入頂いて1週間が経ちました。\n\nご体調の様子はいかがでしょうか？まだ大きな変化は感じにくいかもしれません。それで大丈夫です。\n\n美川漢方堂の商品は、体の内側からゆっくりと、確かに働きかけています。\n目に見えないところで、今日もあなたの体を支えています🌱\n\n「続けること」に意味があるのは、そういうことです。\n\n焦らず、コツコツと一緒に続けていきましょう。\nいつでもご相談お待ちしております。`,
    },
    '1month': {
      type: 'text',
      text: `${name}様、1ヶ月が経ちました。ここまで続けてくださって、ありがとうございます。\n\n漢方・健康食品の真価は、3ヶ月、6ヶ月と続けることで、少しずつ${name}様の体に現れてきます。\n今${name}様の体に起きている変化は、${name}様が続けてきた証です🍃\n\n「最近飲み忘れが増えてきた」\n「なんとなく効いているのか不安」\n\nそんな時は、どうかひとりで抱え込まずにぜひご相談ください。体質やご体調に合わせた、より良い飲み方をご提案させていただきます。\n\nそろそろお手持ちの商品も残り少なくなってきた頃ではないでしょうか？\n次のご来店・ご注文の際は、スタッフまでお気軽にお声がけください。${name}様のご来店をお待ちしております🌿`,
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
    text: '美川漢方堂のLINEへようこそ🌿\n\nご来店いただきありがとうございます。\n\nこのLINEでは、お買い求めいただいた漢方・健康食品を「続けるためのサポート」をお届けしています。\n\n飲み忘れのリマインドや、体に寄り添うメッセージを定期的にお送りします。\n\n会員番号を下のトークに入力してください👇',
  };
}

function getLinkSuccessMessage(displayName) {
  return {
    type: 'text',
    text: `${displayName || 'お客様'}、連携が完了しました✅\n\nこれから、あなたの体づくりに寄り添うメッセージをお届けします。\n\n漢方や健康食品は、毎日続けることで、じわじわと体の奥から整えていくものです。\n\n「続けること」が、きっと未来のあなたへの贈り物になります🌿\n\nいつでも相談してください。一緒に歩んでいきましょう。`,
  };
}

function getLinkFailMessage() {
  return {
    type: 'text',
    text: '会員番号が見つかりませんでした。\n\n番号をご確認の上、再度入力してください。\nご不明な点は店頭スタッフにお声がけください。',
  };
}

/**
 * 補充リマインドメッセージ
 * @param {'30day'|'60day'|'90day'} reminderType
 * @param {string} displayName
 */
function getReorderReminderMessage(reminderType, displayName) {
  const name = displayName || 'お客様';

  const templates = {
    '30day': {
      type: 'text',
      text: `${name}様、こんにちは。美川漢方堂です🌿\n\nご購入から1ヶ月が経ちました。\n商品はそろそろ残り少なくなってきた頃ではないでしょうか？\n\n漢方・健康食品は途切れずに続けることが大切です。補充のタイミングでお声がけいただければ、スムーズにご用意できます。\n\nご来店・ご注文はお気軽にどうぞ😊`,
    },
    '60day': {
      type: 'text',
      text: `${name}様、お久しぶりです。美川漢方堂です🌿\n\n最後のご購入から2ヶ月が経ちました。\nお体の調子はいかがでしょうか？\n\n商品が切れてしまうと、これまでの積み重ねがリセットされてしまいます。\nもし飲み切ってしまっていたら、ぜひ早めにご相談ください。\n\nいつでもお待ちしております🙏`,
    },
    '90day': {
      type: 'text',
      text: `${name}様、美川漢方堂です。\n\nお久しぶりですね。最後のご購入から3ヶ月が経ちました。\n\nその後、お体の具合はいかがですか？\n\n漢方・健康食品は、続けることで本来の力を発揮します。もし何かご不安やお悩みがあれば、どんな小さなことでもご相談ください。\n\n${name}様のご来店を心よりお待ちしております🌱`,
    },
  };

  return templates[reminderType] || {
    type: 'text',
    text: `${name}様、お体の調子はいかがでしょうか？美川漢方堂より近況のご確認でご連絡しました。いつでもご相談ください🌿`,
  };
}

/**
 * 長期未来店リマインドメッセージ
 * @param {'6month'|'1year'} reminderType
 * @param {string} displayName
 */
function getLongAbsenceMessage(reminderType, displayName) {
  const name = displayName || 'お客様';

  const templates = {
    '6month': {
      type: 'text',
      text: `${name}様、美川漢方堂です。\n\nお元気にお過ごしでしょうか？\n最後にご来店いただいてから、半年が経ちました。\n\nその後、お体の調子はいかがですか？\n季節の変わり目は、体が思いがけないサインを出すことがあります。\n\n「なんとなく調子が悪い」「最近疲れやすい」など、小さなことでも構いません。どうぞ気軽にご相談ください。\n\n${name}様のお顔を見られる日を、スタッフ一同楽しみにしております🌿`,
    },
    '1year': {
      type: 'text',
      text: `${name}様、美川漢方堂です。\n\nご無沙汰しております。お変わりなくお過ごしでしょうか？\n\n最後のご来店から、1年が経ちました。\n\n1年という時間の中で、お体にはさまざまな変化があったことと思います。\n\n年齢とともに、体が必要とするものも変わっていきます。今のお体の状態に合わせた漢方・健康食品を、改めてご提案させていただけたら嬉しいです。\n\nいつでもお待ちしております。久しぶりに、お顔を見せにいらしてください🌱`,
    },
  };

  return templates[reminderType] || {
    type: 'text',
    text: `${name}様、お久しぶりです。美川漢方堂です。お体の調子はいかがでしょうか？またお気軽にご相談ください🌿`,
  };
}

/**
 * 誕生日メッセージ
 * @param {string} displayName
 */
function getBirthdayMessage(displayName) {
  const name = displayName || 'お客様';
  return {
    type: 'text',
    text: `${name}様、お誕生日おめでとうございます🎂\n\n美川漢方堂スタッフ一同より、心よりお祝い申し上げます。\n\nお誕生日という特別な節目に、改めてご自身の体と向き合っていただけると嬉しいです。\n\n健康は、毎日の小さな積み重ねから生まれます。これからも${name}様の健やかな毎日を、美川漢方堂はそばで支えてまいります🌿\n\n素敵な一日をお過ごしください✨`,
  };
}

module.exports = {
  getFollowUpMessage,
  getReorderReminderMessage,
  getLongAbsenceMessage,
  getBirthdayMessage,
  getWelcomeMessage,
  getLinkSuccessMessage,
  getLinkFailMessage,
};
