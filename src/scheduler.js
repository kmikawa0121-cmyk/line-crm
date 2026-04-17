const cron = require('node-cron');
const db = require('./db');
const { getClient } = require('./line/handler');
const { getFollowUpMessage } = require('./line/messages');

/**
 * 毎時0分に未送信のスケジュールメッセージを確認して送信
 */
function startScheduler() {
  cron.schedule('0 * * * *', async () => {
    console.log('[Scheduler] 送信チェック開始...');
    const pending = db.getPendingMessages();

    if (pending.length === 0) {
      console.log('[Scheduler] 送信対象なし');
      return;
    }

    console.log(`[Scheduler] ${pending.length}件を送信します`);

    for (const msg of pending) {
      try {
        const message = getFollowUpMessage(msg.message_type, null);

        // LINE表示名を取得してパーソナライズ
        let displayName = null;
        try {
          const profile = await getClient().getProfile(msg.line_user_id);
          displayName = profile.displayName;
        } catch (_) {}

        const personalizedMessage = getFollowUpMessage(msg.message_type, displayName);

        await getClient().pushMessage({
          to: msg.line_user_id,
          messages: [personalizedMessage],
        });

        db.markMessageSent(msg.id);
        console.log(`[Scheduler] 送信完了: ID=${msg.id} type=${msg.message_type} → ${msg.line_user_id}`);
      } catch (err) {
        db.markMessageFailed(msg.id);
        console.error(`[Scheduler] 送信失敗: ID=${msg.id}`, err.message);
      }
    }
  });

  console.log('[Scheduler] スケジューラー起動（毎時0分に実行）');
}

module.exports = { startScheduler };
