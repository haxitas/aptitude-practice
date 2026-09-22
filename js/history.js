// 履歴画面: テストを選び、直近の記録を新しい順に表で出す。最高点・直近平均・回数も出す。
// グラフと「既定値と違う回の印」は Phase4。

import { TESTS, findTest, formatDetail } from './core/catalog.js';
import { readResults } from './core/storage.js';
import { summarize, recentRecords } from './core/stats.js';
import { DISPLAY } from './core/settings.js';

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function cell(tag, text) {
  const c = document.createElement(tag);
  c.textContent = text;
  return c;
}

let lastSelected = 't2'; // 画面を出し直しても選んだテストを覚えておく

export function mount(root, ctx) {
  root.innerHTML = `
    <section class="screen history">
      <h1>履歴</h1>
      <label class="field">テスト
        <select data-ref="select"></select>
      </label>
      <p class="notice notice-error" data-ref="error" hidden></p>
      <dl class="stats" data-ref="stats"></dl>
      <div class="table-wrap">
        <table class="history-table">
          <thead><tr data-ref="head"></tr></thead>
          <tbody data-ref="body"></tbody>
        </table>
      </div>
      <p class="muted" data-ref="empty" hidden>まだ記録がありません</p>
      <div class="actions"><a class="btn" href="#/">メニュー</a></div>
    </section>`;
  const $ = name => root.querySelector(`[data-ref="${name}"]`);

  const select = $('select');
  for (const t of TESTS) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.implemented ? t.name : `${t.name}(準備中)`;
    select.append(o);
  }
  select.value = lastSelected;

  const results = readResults(ctx.store);
  if (!results.ok) {
    $('error').textContent = `成績データを読めません: ${results.message}`;
    $('error').hidden = false;
  }
  const records = results.ok ? results.records : [];

  function show() {
    const test = findTest(select.value);
    lastSelected = test.id;

    const s = summarize(records, test.id);
    const stats = $('stats');
    stats.replaceChildren();
    for (const [label, value] of [
      ['最高点', s.best ?? '—'],
      [`直近${DISPLAY.recentAvgCount}回の平均`, s.recentAvg === null ? '—' : s.recentAvg.toFixed(1)],
      ['回数', `${s.count}回`],
    ]) {
      stats.append(cell('dt', label), cell('dd', String(value)));
    }

    const cols = test.details.filter(d => d.inHistory !== false);
    const head = $('head');
    head.replaceChildren(cell('th', '日時'), cell('th', '点数'), ...cols.map(d => cell('th', d.label)));

    const body = $('body');
    body.replaceChildren();
    const rows = recentRecords(records, test.id, DISPLAY.historyRows);
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.append(cell('td', formatDate(r.date)), cell('td', String(r.score)));
      for (const d of cols) tr.append(cell('td', formatDetail(d, r.detail?.[d.key])));
      body.append(tr);
    }
    $('empty').hidden = rows.length > 0;
  }

  select.addEventListener('change', show);
  show();
}
