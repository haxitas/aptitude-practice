// 共通の結果画面: 点数・内訳・保存の結果・「もう一度」「メニュー」
// 静的な枠は HTML で書き、値はすべて textContent で入れる。

// details: [{ label, value }](value は表示用の文字列)
// saveResult: storage.appendRecord の戻り値
export function renderResult(root, { testName, score, details, saveResult, onRetry }) {
  root.innerHTML = `
    <section class="screen result">
      <h1 data-ref="title"></h1>
      <p class="result-score"><span class="result-score-num" data-ref="score"></span><span> 点</span></p>
      <dl class="result-details" data-ref="details"></dl>
      <p class="notice" data-ref="save"></p>
      <div class="actions">
        <button class="btn btn-primary" type="button" data-ref="retry">もう一度</button>
        <a class="btn" href="#/">メニュー</a>
      </div>
    </section>`;
  const $ = name => root.querySelector(`[data-ref="${name}"]`);

  $('title').textContent = testName;
  $('score').textContent = String(score);
  for (const d of details) {
    const dt = document.createElement('dt');
    dt.textContent = d.label;
    const dd = document.createElement('dd');
    dd.textContent = d.value;
    $('details').append(dt, dd);
  }
  const save = $('save');
  if (saveResult.ok) {
    save.classList.add('notice-ok');
    save.textContent = '記録を保存しました';
  } else {
    save.classList.add('notice-error');
    save.setAttribute('role', 'alert');
    save.textContent = `保存できませんでした(${saveResult.message})`;
  }
  $('retry').addEventListener('click', onRetry);
  // 「もう一度」にフォーカスを当てない。終了直後に押したスペースキーで結果画面が消えないようにする
  document.activeElement?.blur?.();
}
