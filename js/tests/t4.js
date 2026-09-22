// テスト4 計器の読み取り: SVG描画、3段階の解答操作、時間管理、保存。

import {
  DIRECTIONS, generateT4Problem, createT4Selection,
  selectT4Position, selectT4Heading, canSubmitT4,
  judgeT4, createT4Tally, recordT4Answer, buildT4Record,
} from '../logic/t4.js';
import { createRng, randomSeed } from '../core/rng.js';
import { startTimer } from '../core/timer.js';
import { appendRecord } from '../core/storage.js';
import { renderResult } from '../core/result.js';
import { findTest, formatDetail } from '../core/catalog.js';

function instrumentSvg(index, relative = false) {
  const angle = index * 45;
  const labels = relative ? '' : DIRECTIONS.map((d, i) => {
    const a = i * 45 * Math.PI / 180;
    const x = 100 + Math.sin(a) * 75;
    const y = 100 - Math.cos(a) * 75;
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central">${d.key}</text>`;
  }).join('');
  return `<svg class="t4-instrument" viewBox="0 0 200 200" role="img" aria-label="${relative ? '相対方位計' : 'コンパス'}">
    <circle cx="100" cy="100" r="92" class="t4-dial"/>
    ${labels}
    <text x="100" y="25" text-anchor="middle" class="t4-nose">▲</text>
    <g transform="rotate(${angle} 100 100)" class="t4-needle">
      <line x1="100" y1="118" x2="100" y2="42"/>
      <path d="M100 28 L91 48 L109 48 Z"/>
    </g>
    <circle cx="100" cy="100" r="6" class="t4-hub"/>
  </svg>`;
}

export function mount(root, ctx) {
  const params = ctx.settings.t4;
  const meta = findTest('t4');
  let teardown = null;

  function setPhase(cleanup) {
    const previous = teardown;
    teardown = null;
    previous?.();
    teardown = cleanup ?? null;
  }

  function showStart() {
    setPhase(null);
    root.innerHTML = `
      <section class="screen">
        <h1 data-ref="title"></h1>
        <p>左のコンパスで機首の向き、右の相対方位計で電波塔の方向を読みます。</p>
        <p>自機のマスと向きを選び、「決定」を押してください。制限時間は <span data-ref="duration"></span> 秒です。</p>
        <div class="actions">
          <button class="btn btn-primary btn-large" type="button" data-ref="start">開始</button>
          <a class="btn" href="#/">メニュー</a>
        </div>
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    $('title').textContent = meta.name;
    $('duration').textContent = String(params.durationSec);
    $('start').addEventListener('click', startPlay);
    $('start').focus();
  }

  function startPlay() {
    setPhase(null);
    const rng = createRng(randomSeed());
    let problem = generateT4Problem(rng);
    let selection = createT4Selection();
    let tally = createT4Tally();
    let paleUntil = -Infinity;

    root.innerHTML = `
      <section class="t4-play">
        <div class="topbar">
          <span class="remaining" data-ref="remaining"></span>
          <button class="btn btn-quiet" type="button" data-ref="quit">途中終了</button>
        </div>
        <div class="t4-instruments">
          <figure><figcaption>機首の方位</figcaption><div data-ref="compass"></div></figure>
          <figure><figcaption>塔の相対方向</figcaption><div data-ref="adf"></div></figure>
        </div>
        <div class="t4-answer">
          <div class="t4-map" data-ref="map" aria-label="自機の位置"></div>
          <div class="t4-headings" data-ref="headings" aria-label="機首の向き"></div>
          <button class="btn btn-primary t4-submit" type="button" data-ref="submit" disabled>決定</button>
        </div>
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    const submit = $('submit');

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (row === 1 && col === 1) {
          const tower = document.createElement('div');
          tower.className = 't4-tower';
          tower.textContent = '塔';
          $('map').append(tower);
          continue;
        }
        const d = DIRECTIONS.find(x => x.row === row && x.col === col);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 't4-choice';
        button.dataset.position = d.key;
        button.setAttribute('aria-label', `${d.key}のマス`);
        button.textContent = d.label;
        $('map').append(button);
      }
    }
    for (const d of DIRECTIONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 't4-choice t4-heading';
      button.dataset.heading = d.key;
      button.setAttribute('aria-label', `機首${d.key}`);
      button.textContent = `${d.label} ${d.key}`;
      $('headings').append(button);
    }

    const positionButtons = [...root.querySelectorAll('[data-position]')];
    const headingButtons = [...root.querySelectorAll('[data-heading]')];

    function updateSelection() {
      positionButtons.forEach(b => b.classList.toggle('is-selected', b.dataset.position === selection.position));
      headingButtons.forEach(b => b.classList.toggle('is-selected', b.dataset.heading === selection.heading));
      submit.disabled = !canSubmitT4(selection);
    }

    function drawProblem() {
      $('compass').innerHTML = instrumentSvg(problem.headingIndex, false);
      $('adf').innerHTML = instrumentSvg(problem.relativeIndex, true);
      selection = createT4Selection();
      updateSelection();
    }

    function onPosition(e) {
      selection = selectT4Position(selection, e.currentTarget.dataset.position);
      updateSelection();
    }

    function onHeading(e) {
      selection = selectT4Heading(selection, e.currentTarget.dataset.heading);
      updateSelection();
    }

    function onSubmit(e) {
      if (!canSubmitT4(selection)) return;
      tally = recordT4Answer(tally, judgeT4(problem, selection));
      paleUntil = e.timeStamp + params.answerFeedbackMs;
      submit.classList.add('is-pressed');
      problem = generateT4Problem(rng, problem);
      drawProblem();
    }

    function abort(message) {
      setPhase(null);
      ctx.navigate('#/', message);
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') abort(`${meta.name}は、画面が切り替わったため中断しました(記録は保存していません)`);
    }

    positionButtons.forEach(b => b.addEventListener('click', onPosition));
    headingButtons.forEach(b => b.addEventListener('click', onHeading));
    submit.addEventListener('click', onSubmit);
    $('quit').addEventListener('click', () => { setPhase(null); ctx.navigate('#/'); });
    document.addEventListener('visibilitychange', onVisibility);
    drawProblem();
    document.activeElement?.blur?.();

    const timer = startTimer({
      durationMs: params.durationSec * 1000,
      remainingEl: $('remaining'),
      onFrame(_elapsed, ts) {
        if (ts >= paleUntil) submit.classList.remove('is-pressed');
      },
      onEnd() {
        const record = buildT4Record({ date: new Date().toISOString(), tally, settings: params });
        const saveResult = appendRecord(ctx.store, record);
        setPhase(null);
        renderResult(root, {
          testName: meta.name,
          score: record.score,
          details: meta.details.map(d => ({ label: d.label, value: formatDetail(d, record.detail[d.key]) })),
          saveResult,
          onRetry: showStart,
        });
      },
    });

    setPhase(() => {
      timer.stop();
      positionButtons.forEach(b => b.removeEventListener('click', onPosition));
      headingButtons.forEach(b => b.removeEventListener('click', onHeading));
      submit.removeEventListener('click', onSubmit);
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  showStart();
  return () => setPhase(null);
}
