// 履歴画面: テストを選び、直近の記録を新しい順に表で出す。最高点・直近平均・回数も出す。
// グラフと「既定値と違う回の印」は Phase4。

import { TESTS, findTest, formatDetail } from './core/catalog.js';
import { readResults } from './core/storage.js';
import { summarize } from './core/stats.js';
import { DEFAULTS, DISPLAY } from './core/settings.js';
import { makeChartLayout, makeHistoryModel } from './logic/history.js';

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

function formatAxisDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function chartOptions() {
  return {
    left: DISPLAY.historyChartLeft,
    right: DISPLAY.historyChartRight,
    top: DISPLAY.historyChartTop,
    bottom: DISPLAY.historyChartBottom,
    preferredTickCount: DISPLAY.historyChartPreferredTickCount,
  };
}

function canvasColor(canvas, name) {
  return getComputedStyle(canvas).getPropertyValue(name).trim();
}

function dateLabelIndexes(length) {
  if (length <= DISPLAY.historyChartMaxDateLabels) return Array.from({ length }, (_, i) => i);
  const indexes = new Set();
  for (let i = 0; i < DISPLAY.historyChartMaxDateLabels; i++) {
    indexes.add(Math.round((i * (length - 1)) / (DISPLAY.historyChartMaxDateLabels - 1)));
  }
  return [...indexes];
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
      <div class="history-chart-wrap" data-ref="chartWrap">
        <canvas data-ref="chart" aria-label="直近20回の点数グラフ"></canvas>
        <p class="history-chart-detail muted" data-ref="chartDetail" aria-live="polite">点を選ぶと日時と点数を表示します</p>
        <p class="history-chart-legend"><span aria-hidden="true">◎</span> 既定値と異なる設定で実施</p>
      </div>
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
  const canvas = $('chart');
  let chartLayout = null;

  function drawChart(chartRecords) {
    const width = Math.max(280, Math.round(canvas.getBoundingClientRect().width));
    const height = DISPLAY.historyChartHeight;
    const ratio = Math.max(1, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = `${height}px`;
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    chartLayout = makeChartLayout(chartRecords, width, height, chartOptions());

    const grid = canvasColor(canvas, '--chart-grid');
    const label = canvasColor(canvas, '--chart-label');
    const line = canvasColor(canvas, '--chart-line');
    const point = canvasColor(canvas, '--chart-point');
    const custom = canvasColor(canvas, '--chart-custom');
    context.font = '12px system-ui, sans-serif';
    context.lineWidth = 1;
    context.strokeStyle = grid;
    context.fillStyle = label;

    for (const tick of chartLayout.ticks) {
      const y = chartLayout.yMax - (tick / chartLayout.yScoreMax) * (chartLayout.yMax - chartLayout.yMin);
      context.beginPath();
      context.moveTo(chartLayout.xMin, y);
      context.lineTo(chartLayout.xMax, y);
      context.stroke();
      context.textAlign = 'right';
      context.textBaseline = 'middle';
      context.fillText(String(tick), chartLayout.xMin - 7, y);
    }

    const points = chartLayout.points;
    if (points.length > 1) {
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (const p of points.slice(1)) context.lineTo(p.x, p.y);
      context.strokeStyle = line;
      context.lineWidth = 2;
      context.stroke();
    }

    for (const p of points) {
      context.beginPath();
      context.arc(p.x, p.y, DISPLAY.historyChartPointRadius, 0, Math.PI * 2);
      context.fillStyle = point;
      context.fill();
      if (p.record.customSettings) {
        context.beginPath();
        context.arc(p.x, p.y, DISPLAY.historyChartCustomPointRadius, 0, Math.PI * 2);
        context.strokeStyle = custom;
        context.lineWidth = 3;
        context.stroke();
      }
    }

    context.fillStyle = label;
    context.textAlign = 'center';
    context.textBaseline = 'top';
    for (const index of dateLabelIndexes(points.length)) {
      const p = points[index];
      context.fillText(formatAxisDate(p.record.date), p.x, chartLayout.yMax + 9);
    }
  }

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
    head.replaceChildren(cell('th', '日時'), cell('th', '点数'), cell('th', '設定'), ...cols.map(d => cell('th', d.label)));

    const body = $('body');
    body.replaceChildren();
    const model = makeHistoryModel(records, test.id, DEFAULTS[test.id], DISPLAY.historyRows);
    const rows = model.tableRecords;
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.append(cell('td', formatDate(r.date)), cell('td', String(r.score)), cell('td', r.customSettings ? '※' : ''));
      for (const d of cols) tr.append(cell('td', formatDetail(d, r.detail?.[d.key])));
      body.append(tr);
    }
    drawChart(model.chartRecords);
    $('empty').hidden = rows.length > 0;
  }

  select.addEventListener('change', show);
  canvas.addEventListener('pointerdown', event => {
    if (!chartLayout?.points.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const nearest = chartLayout.points
      .map(p => ({ p, distance: Math.hypot(p.x - x, p.y - y) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest.distance > DISPLAY.historyChartHitRadius) return;
    const r = nearest.p.record;
    $('chartDetail').textContent = `${formatDate(r.date)} / ${r.score}点 / ${r.customSettings ? '設定変更あり' : '既定値'}`;
  });

  const resizeObserver = new ResizeObserver(() => show());
  resizeObserver.observe($('chartWrap'));
  const colorScheme = matchMedia('(prefers-color-scheme: dark)');
  const onColorScheme = () => show();
  colorScheme.addEventListener?.('change', onColorScheme);
  show();
  return () => {
    resizeObserver.disconnect();
    colorScheme.removeEventListener?.('change', onColorScheme);
  };
}
