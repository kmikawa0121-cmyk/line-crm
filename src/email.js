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
 * 紙DMリマインドメールを送信
 * @param {string} subject
 * @param {string} body
 */
async function sendDmReminder(subject, body) {
  const to = process.env.ADMIN_EMAIL || process.env.GMAIL_USER;
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"美川漢方堂 CRM" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text: body,
  });

  console.log(`[Email] 送信完了: ${subject}`);
}

module.exports = { sendDmReminder };
