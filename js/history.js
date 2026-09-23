// 履歴一覧と、テスト別の直近20回の詳細。

import { TESTS, findTest, formatDetail } from './core/catalog.js';
import { readResults } from './core/storage.js';
import { summarize } from './core/stats.js';
import { DEFAULTS, DISPLAY } from './core/settings.js';
import { makeChartLayout, makeHistoryModel, makeHistoryOverview, parseHistoryRoute } from './logic/history.js';

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

function drawSparkline(canvas, scores) {
  const width = Math.max(1, Math.round(canvas.getBoundingClientRect().width));
  const height = 54;
  const ratio = Math.max(1, globalThis.devicePixelRatio || 1);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const max = Math.max(1, ...scores);
  const x = index => scores.length === 1 ? width / 2 : 5 + (width - 10) * index / (scores.length - 1);
  const y = score => height - 5 - score / max * (height - 10);
  context.strokeStyle = canvasColor(canvas, '--chart-line');
  context.fillStyle = canvasColor(canvas, '--chart-point');
  context.lineWidth = 2;
  context.beginPath();
  scores.forEach((score, index) => index ? context.lineTo(x(index), y(score)) : context.moveTo(x(index), y(score)));
  context.stroke();
  scores.forEach((score, index) => {
    context.beginPath();
    context.arc(x(index), y(score), 3, 0, Math.PI * 2);
    context.fill();
  });
}

function mountOverview(root, records, error) {
  root.innerHTML = '<section class="screen history"><h1>履歴</h1><p class="notice notice-error" data-ref="error" hidden></p><div class="history-overview" data-ref="overview"></div><div class="actions"><a class="btn" href="#/">メニュー</a></div></section>';
  if (error) {
    const notice = root.querySelector('[data-ref="error"]');
    notice.textContent = `成績データを読めません: ${error}`;
    notice.hidden = false;
  }
  const entries = makeHistoryOverview(records, TESTS, DISPLAY.recentAvgCount, DISPLAY.historySparkRows);
  const canvases = [];
  for (const item of entries) {
    const card = document.createElement('a');
    card.className = 'history-overview-card';
    card.href = `#/history/${item.id}`;
    const title = document.createElement('h2');
    title.textContent = item.name;
    card.append(title);
    if (!item.count) {
      card.append(cell('p', '記録なし'));
    } else {
      const stats = document.createElement('dl');
      stats.className = 'history-overview-stats';
      for (const [label, value] of [
        ['最高点', item.best], ['前回', item.last], ['回数', `${item.count}回`],
        ['直近5回の平均', item.recentAvg.toFixed(1)],
      ]) stats.append(cell('dt', label), cell('dd', String(value)));
      card.append(stats);
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-label', `直近${item.sparkScores.length}回の点数推移`);
      card.append(canvas);
      canvases.push({ canvas, scores: item.sparkScores });
    }
    root.querySelector('[data-ref="overview"]').append(card);
  }
  const redraw = () => canvases.forEach(({ canvas, scores }) => drawSparkline(canvas, scores));
  const observer = new ResizeObserver(redraw);
  observer.observe(root.querySelector('[data-ref="overview"]'));
  const colorScheme = matchMedia('(prefers-color-scheme: dark)');
  colorScheme.addEventListener?.('change', redraw);
  redraw();
  return () => {
    observer.disconnect();
    colorScheme.removeEventListener?.('change', redraw);
  };
}

export function mount(root, ctx, hash = location.hash) {
  const route = parseHistoryRoute(hash, TESTS.map(test => test.id));
  if (route.kind === 'overview' && hash !== '#/history') {
    ctx.navigate('#/history');
    return null;
  }
  const results = readResults(ctx.store);
  const records = results.ok ? results.records : [];
  if (route.kind === 'overview') return mountOverview(root, records, results.ok ? null : results.message);
  const test = findTest(route.testId);
  root.innerHTML = `
    <section class="screen history">
      <h1 data-ref="title"></h1>
      <div class="actions history-back"><a class="btn" href="#/history">一覧へ戻る</a></div>
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
  $('title').textContent = `${test.name}の履歴`;
  if (!results.ok) {
    $('error').textContent = `成績データを読めません: ${results.message}`;
    $('error').hidden = false;
  }
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
