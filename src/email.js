const { Resend } = require('resend');

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY が未設定です');
  return new Resend(apiKey);
}

/**
 * 紙DMリマインドメールをCSV添付で送信
 * @param {string} subject
 * @param {string} body
 * @param {Array} targets - DMリマインド対象者リスト
 * @param {string} dateStr - ファイル名用の日付文字列
 */
async function sendDmReminder(subject, body, targets = [], dateStr = '') {
  const resend = getResend();
  const to = process.env.ADMIN_EMAIL;
  if (!to) throw new Error('ADMIN_EMAIL が未設定です');

  const emailOptions = {
    from: '美川漢方堂 CRM <noreply@mikawakampodo.com>',
    to,
    subject,
    text: body,
  };

  if (targets.length > 0) {
    const csv = buildCsv(targets);
    const filename = `DM送付リスト_${dateStr || 'today'}.csv`;
    emailOptions.attachments = [
      {
        filename,
        content: Buffer.from('﻿' + csv, 'utf-8'), // BOM付き（Excel対応）
        contentType: 'text/csv',
      },
    ];
  }

  await resend.emails.send(emailOptions);
  console.log(`[Email] 送信完了: ${subject}`);
}

function buildCsv(targets) {
  const header = '氏名,スマレジID,郵便番号,住所,電話番号,理由,基準日,購入商品';
  const rows = targets.map(t => {
    const c = t.customer;
    const fullName = c ? [c.lastName, c.firstName].filter(Boolean).join(' ') || t.name : t.name;
    const zip = c?.zipCode || '';
    const address = c?.address || '';
    const tel = c?.phoneNumber || c?.mobilePhoneNumber || '';
    const products = t.products && t.products.length > 0
      ? t.products.map(p => `${p.name} ¥${p.price}×${p.qty}`).join(' / ')
      : '';

    return [fullName, t.smaregiId, zip, address, tel, t.reason, t.refDate, products]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(',');
  });

  return [header, ...rows].join('\r\n');
}

module.exports = { sendDmReminder };
