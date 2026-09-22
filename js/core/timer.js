// requestAnimationFrame と performance.now() の時刻による共通ループ(setInterval は使わない)。
// startAt指定時はその時刻、未指定なら最初のフレームを開始時刻にする。
// 時間が来たら onEnd を1回だけ呼んで止まる。

export function formatRemaining(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function startTimer({ durationMs, onFrame, onEnd, remainingEl, startAt = null }) {
  let rafId = 0;
  let start = startAt;
  let running = true;
  let shown = '';

  function frame(ts) {
    if (!running) return;
    if (start === null) start = ts;
    const elapsed = ts - start;
    if (remainingEl) {
      const text = formatRemaining(durationMs - elapsed);
      if (text !== shown) remainingEl.textContent = shown = text;
    }
    if (elapsed >= durationMs) {
      running = false;
      onEnd?.(ts);
      return;
    }
    onFrame?.(elapsed, ts);
    if (running) rafId = requestAnimationFrame(frame);
  }

  if (remainingEl) remainingEl.textContent = shown = formatRemaining(durationMs);
  rafId = requestAnimationFrame(frame);

  return {
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
    },
    get running() {
      return running;
    },
  };
}
