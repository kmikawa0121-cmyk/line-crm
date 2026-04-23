const cron = require('node-cron');
const db = require('./db');
const { getClient } = require('./line/handler');
const { getFollowUpMessage, getReorderReminderMessage, getLongAbsenceMessage } = require('./line/messages');
const { getPurchaseHistory } = require('./smaregi/api');

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

  // 毎日朝10時に補充リマインドチェック
  cron.schedule('0 10 * * *', async () => {
    console.log('[Reorder] 補充リマインドチェック開始...');
    const members = db.getAllLinkedMembers();

    for (const member of members) {
      try {
        const transactions = await getPurchaseHistory(member.smaregi_customer_id);
        if (!transactions || transactions.length === 0) continue;

        // 最終購入日を取得
        const lastTx = transactions[0];
        const lastDate = lastTx.transactionDateTime?.slice(0, 10);
        if (!lastDate) continue;

        const daysSince = Math.floor(
          (Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)
        );

        // 30日・60日・90日のいずれかに該当するか判定
        const thresholds = [
          { days: 30, type: '30day' },
          { days: 60, type: '60day' },
          { days: 90, type: '90day' },
        ];

        for (const { days, type } of thresholds) {
          if (daysSince >= days && daysSince < days + 3) {
            // すでに送信済みか確認
            if (db.hasReorderReminder(member.id, type, lastDate)) continue;

            // LINEの表示名を取得
            let displayName = member.display_name;
            try {
              const profile = await getClient().getProfile(member.line_user_id);
              displayName = profile.displayName;
            } catch (_) {}

            // リマインド送信
            await getClient().pushMessage({
              to: member.line_user_id,
              messages: [getReorderReminderMessage(type, displayName)],
            });

            db.saveReorderReminder(member.id, type, lastDate);
            console.log(`[Reorder] 送信完了: ${member.line_user_id} type=${type} lastDate=${lastDate}`);
          }
        }
      } catch (err) {
        console.error(`[Reorder] エラー: member_id=${member.id}`, err.message);
      }
    }

    console.log('[Reorder] 補充リマインドチェック完了');
  });

  console.log('[Scheduler] 補充リマインド起動（毎日10:00に実行）');

  // 毎日朝11時に長期未来店チェック
  cron.schedule('0 11 * * *', async () => {
    console.log('[Absence] 長期未来店チェック開始...');
    const members = db.getAllLinkedMembers();

    for (const member of members) {
      try {
        const transactions = await getPurchaseHistory(member.smaregi_customer_id);
        if (!transactions || transactions.length === 0) continue;

        const lastDate = transactions[0].transactionDateTime?.slice(0, 10);
        if (!lastDate) continue;

        const daysSince = Math.floor(
          (Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)
        );

        const thresholds = [
          { days: 180, type: '6month' },
          { days: 365, type: '1year' },
        ];

        for (const { days, type } of thresholds) {
          if (daysSince >= days && daysSince < days + 3) {
            if (db.hasReorderReminder(member.id, type, lastDate)) continue;

            let displayName = member.display_name;
            try {
              const profile = await getClient().getProfile(member.line_user_id);
              displayName = profile.displayName;
            } catch (_) {}

            await getClient().pushMessage({
              to: member.line_user_id,
              messages: [getLongAbsenceMessage(type, displayName)],
            });

            db.saveReorderReminder(member.id, type, lastDate);
            console.log(`[Absence] 送信完了: ${member.line_user_id} type=${type}`);
          }
        }
      } catch (err) {
        console.error(`[Absence] エラー: member_id=${member.id}`, err.message);
      }
    }

    console.log('[Absence] 長期未来店チェック完了');
  });

  console.log('[Scheduler] 長期未来店リマインド起動（毎日11:00に実行）');
}

module.exports = { startScheduler };
