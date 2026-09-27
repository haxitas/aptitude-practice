// 即時判定の共通部品。見た目はテスト1〜5で同じにする。
// 読み込んだだけでは DOM に触れない(単体テストとテスト3・4の画面から読み込むため)。
// 判定の文言は { kind: 'correct' | 'wrong' | 'miss', text } で表し、色だけでなく ○ × △ の記号を必ず付ける。

export function correctFeedback() {
  return { kind: 'correct', text: '○ 正解' };
}

export function wrongFeedback(answerText) {
  return { kind: 'wrong', text: `× 正解は ${answerText}` };
}

export function missFeedback() {
  return { kind: 'miss', text: '△ 見逃し' };
}

// 表示した時刻から durationMs たったら消す。sticky(テスト4)は次の判定まで消さない。
export function feedbackExpired(shownAt, now, durationMs, sticky = false) {
  if (sticky || shownAt === null) return false;
  return now - shownAt >= durationMs;
}

// 記録の settings に、その回の即時判定のオン/オフを入れる(元の設定は書き換えない)
export function recordSettingsWithFeedback(params, common) {
  return { ...params, instantFeedback: common?.instantFeedback === true };
}

// プレイ画面の上部に出す小さな表示
export function instantFeedbackBadge(common) {
  return common?.instantFeedback ? '<span class="feedback-badge">即時判定 ON</span>' : '';
}

// 判定を出す枠。回答ボタンの近くに置き、pointer-events を無効にして次の入力を邪魔しない。
// 時間の管理はテストの rAF のループから tick(ts) を呼んで行う(setTimeout は使わない)。
export function feedbackSlotHtml(ref = 'feedback', extraClass = '') {
  return `<div class="feedback-slot ${extraClass}" data-ref="${ref}" aria-live="polite"></div>`;
}

export function createFeedbackSlot(slot, { durationMs, sticky = false }) {
  let shownAt = null;
  let currentSticky = sticky;
  function hide() {
    shownAt = null;
    slot.textContent = '';
    slot.classList?.remove('is-visible');
  }
  return {
    // extra: 文言の下に並べる要素(テスト4の3×3のイラスト、テスト1の式)
    // options.sticky: この表示だけ次の判定まで残す(テスト1の不正解)
    show(message, ts, extra = null, options = {}) {
      const line = document.createElement('p');
      line.className = `feedback feedback-${message.kind}`;
      line.textContent = message.text;
      slot.replaceChildren(line, ...(extra ? [extra] : []));
      slot.classList?.add('is-visible');
      shownAt = ts;
      currentSticky = options.sticky ?? sticky;
    },
    tick(ts) {
      if (feedbackExpired(shownAt, ts, durationMs, currentSticky)) hide();
    },
    hide,
  };
}
