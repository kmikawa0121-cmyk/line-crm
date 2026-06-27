const nodemailer = require('nodemailer');

function createTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error('GMAIL_USER または GMAIL_APP_PASSWORD が未設定です');

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

/**
 * 紙DMリマインドメールをCSV添付で送信
 * @param {string} subject
 * @param {string} body
 * @param {Array} targets - DMリマインド対象者リスト
 * @param {string} dateStr - ファイル名用の日付文字列
 */
async function sendDmReminder(subject, body, targets = [], dateStr = '') {
  const to = process.env.ADMIN_EMAIL || process.env.GMAIL_USER;
  const transporter = createTransporter();

  const mailOptions = {
    from: `"美川漢方堂 CRM" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text: body,
  };

  if (targets.length > 0) {
    const csv = buildCsv(targets);
    const filename = `DM送付リスト_${dateStr || 'today'}.csv`;
    mailOptions.attachments = [
      {
        filename,
        content: '﻿' + csv, // BOM付き（Excel対応）
        contentType: 'text/csv; charset=utf-8',
      },
    ];
  }

  await transporter.sendMail(mailOptions);
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
