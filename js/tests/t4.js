// テスト4 計器の読み取り: SVG描画、3段階の解答操作、時間管理、保存。

import {
  DIRECTIONS, generateT4Problem, createT4Selection, createT4Example,
  selectT4Position, selectT4Heading, canSubmitT4,
  judgeT4, previousT4Feedback, compassNeedleAngle, explainT4Solution,
  createT4Tally, recordT4Answer, buildT4Record,
} from '../logic/t4.js';
import { createRng, randomSeed } from '../core/rng.js';
import { startTimer, formatDuration } from '../core/timer.js';
import { appendRecord } from '../core/storage.js';
import { renderResult } from '../core/result.js';
import { findTest, formatDetail } from '../core/catalog.js';

export function instrumentSvg(index, relative = false, compassMode = 'noseUp') {
  const angle = relative ? index * 45 : compassNeedleAngle(index, compassMode);
  const labels = relative ? `<text x="169" y="77" text-anchor="middle" class="t4-adf-mark">右90°</text>
    <text x="100" y="175" text-anchor="middle" class="t4-adf-mark">後ろ180°</text>
    <text x="31" y="77" text-anchor="middle" class="t4-adf-mark">左270°</text>` : compassMode === 'northUp' ? DIRECTIONS.map((d, i) => {
    const a = i * 45 * Math.PI / 180;
    const x = 100 + Math.sin(a) * 75;
    const y = 100 - Math.cos(a) * 75;
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central">${d.key}</text>`;
  }).join('') : '';
  const tip = relative
    ? `<line x1="100" y1="118" x2="100" y2="42"/><path d="M100 28 L91 48 L109 48 Z"/>`
    : compassMode === 'northUp'
      ? `<line x1="100" y1="118" x2="100" y2="55"/><path class="t4-aircraft" d="M100 37 L103 48 L112 52 L112 56 L103 54 L103 62 L106 65 L106 67 L100 64 L94 67 L94 65 L97 62 L97 54 L88 56 L88 52 L97 48 Z"/>`
      : `<line x1="100" y1="118" x2="100" y2="67"/><path d="M100 57 L92 70 L108 70 Z"/><text x="100" y="49" text-anchor="middle" class="t4-north-label" transform="rotate(${-angle} 100 49)">北</text>`;
  return `<svg class="t4-instrument" viewBox="0 0 200 200" role="img" aria-label="${relative ? '相対方位計' : 'コンパス'}">
    <circle cx="100" cy="100" r="92" class="t4-dial"/>
    ${labels}
    ${relative || compassMode === 'noseUp' ? '<text x="100" y="25" text-anchor="middle" class="t4-nose">▲</text>' : ''}
    <g transform="rotate(${angle} 100 100)" class="t4-needle">
      ${tip}
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
    showBoard(true);
  }

  // 例題と本番は計器・マス・矢印の描画を共用する。例題ではタイマーを作らない。
  function showBoard(example = false, startAt = performance.now()) {
    setPhase(null);
    const rng = createRng(randomSeed());
    const sample = createT4Example(params.compassMode);
    let problem = example ? sample.problem : generateT4Problem(rng);
    let selection = createT4Selection();
    let tally = createT4Tally();
    let lastFeedback = null;
    let lastExplanation = [];
    let paleUntil = -Infinity;
    const modeName = params.compassMode === 'noseUp' ? '機首が上・針が北' : '北が上・針が機首';

    root.innerHTML = `
      <section class="t4-play">
        <div class="topbar">
          <span class="remaining" data-ref="remaining"></span>
          <button class="btn btn-quiet" type="button" data-ref="quit">途中終了</button>
        </div>
        <p class="t4-mode">計器の流儀: ${modeName}</p>
        ${example ? `<p class="t4-example-note"><strong>例題 — 画面をタップして本番開始</strong><br>
          この例題の流儀: ${modeName}<br>
          <span class="t4-explanation" data-ref="exampleSteps"></span><br>
          本番はマス→向き→決定。制限時間${formatDuration(params.durationSec)}はタップから数えます。</p>` : ''}
        <div class="t4-instruments">
          <figure><figcaption>自機の機首の向き(コンパス)</figcaption><div data-ref="compass"></div><small class="t4-dial-mode">${params.compassMode === 'noseUp' ? '機首が上' : '北が上'}</small></figure>
          <figure><figcaption>塔はどちらにあるか(機首を上とした相対方向)</figcaption><div data-ref="adf"></div></figure>
        </div>
        <div class="t4-answer">
          <div class="t4-answer-field"><p>自機の位置(中央が塔)</p><div class="t4-map" data-ref="map" aria-label="自機の位置"></div></div>
          <div class="t4-answer-field"><p>自機の機首の向き</p><div class="t4-headings" data-ref="headings" aria-label="機首の向き"></div></div>
          <button class="btn btn-primary t4-submit" type="button" data-ref="submit" disabled>決定</button>
        </div>
        <p class="t4-previous" data-ref="previous" aria-live="polite" hidden></p>
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    const submit = $('submit');
    if (example) $('exampleSteps').textContent = explainT4Solution(sample.problem, params.compassMode).join('\n');

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
      $('compass').innerHTML = instrumentSvg(problem.headingIndex, false, params.compassMode);
      $('adf').innerHTML = instrumentSvg(problem.relativeIndex, true);
      selection = example ? { ...sample.selection } : createT4Selection();
      updateSelection();
      $('previous').hidden = !params.showPreviousAnswer || !lastFeedback || example;
      if (!$('previous').hidden) {
        const answer = `前問の正解: ${lastFeedback.position}のマス / 向き ${lastFeedback.heading}　あなたの答え: ${lastFeedback.correct ? '○' : '×'}`;
        $('previous').textContent = [answer, ...lastExplanation].join('\n');
      }
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
      lastFeedback = previousT4Feedback(problem, selection);
      lastExplanation = lastFeedback.correct ? [] : explainT4Solution(problem, params.compassMode);
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

    if (example) {
      $('remaining').textContent = '例題';
      $('quit').textContent = 'メニュー';
      const onStart = e => {
        if (e.target.closest('[data-ref="quit"]')) { setPhase(null); ctx.navigate('#/'); return; }
        showBoard(false, performance.now());
      };
      drawProblem();
      root.addEventListener('click', onStart);
      setPhase(() => root.removeEventListener('click', onStart));
      return;
    }

    positionButtons.forEach(b => b.addEventListener('click', onPosition));
    headingButtons.forEach(b => b.addEventListener('click', onHeading));
    submit.addEventListener('click', onSubmit);
    $('quit').addEventListener('click', () => { setPhase(null); ctx.navigate('#/'); });
    document.addEventListener('visibilitychange', onVisibility);
    drawProblem();
    document.activeElement?.blur?.();

    const timer = startTimer({
      startAt,
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
