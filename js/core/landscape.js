// 横画面が前提の画面(テスト3・テスト6)で使う。
// 縦のときは画面全体に「端末を横にしてください」を出す。開始できるかどうかは isLandscape() で確かめる。

export function createLandscapeGuard({ onChange } = {}) {
  const mq = window.matchMedia('(orientation: portrait)');
  const overlay = document.createElement('div');
  overlay.className = 'rotate-overlay';
  overlay.setAttribute('role', 'alert');
  overlay.textContent = '端末を横にしてください';
  document.body.append(overlay);

  let listener = onChange ?? null;
  function update() {
    const landscape = !mq.matches;
    overlay.hidden = landscape;
    listener?.(landscape);
  }
  // 古い Safari は addListener しか持たない
  if (mq.addEventListener) mq.addEventListener('change', update);
  else mq.addListener(update);
  update();

  return {
    isLandscape: () => !mq.matches,
    // 開始画面とプレイ中で、向きが変わったときの処理を切り替える。登録したときに、いまの向きで1回呼ぶ
    setOnChange(fn) {
      listener = fn ?? null;
      listener?.(!mq.matches);
    },
    destroy() {
      listener = null;
      if (mq.removeEventListener) mq.removeEventListener('change', update);
      else mq.removeListener(update);
      overlay.remove();
    },
  };
}
