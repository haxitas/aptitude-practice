// テスト4 計器の読み取り: SVG描画、3段階の解答操作、時間管理、保存。

import {
  DIRECTIONS, generateT4Problem, createT4Selection, createT4Example,
  selectT4Position, selectT4Heading, canSubmitT4,
  judgeT4, compassNeedleVertices, planeRotationDeg,
  createT4Practice, answerT4Practice, advanceT4Practice, explainT4Solution,
  createT4Tally, recordT4Answer, buildT4Record,
} from '../logic/t4.js';
import { createRng, randomSeed } from '../core/rng.js';
import { startTimer, formatDuration } from '../core/timer.js';
import { appendRecord } from '../core/storage.js';
import { renderResult } from '../core/result.js';
import { findTest, formatDetail } from '../core/catalog.js';

export function planeSvg(heading) {
  return `<svg class="t4-plane" viewBox="0 0 100 100" aria-hidden="true" style="transform: rotate(${planeRotationDeg(heading)}deg)">
    <path d="M50 5 L56 37 L82 52 L82 60 L57 53 L56 75 L66 82 L66 87 L50 82 L34 87 L34 82 L44 75 L43 53 L18 60 L18 52 L44 37 Z"/>
  </svg>`;
}

export function instrumentSvg(index, relative = false, compassMode = 'noseUp') {
  const angle = index * 45;
  const labels = !relative ? DIRECTIONS.map((d, i) => {
    const a = i * 45 * Math.PI / 180;
    const x = 100 + Math.sin(a) * 75;
    const y = 100 - Math.cos(a) * 75;
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central">${d.key}</text>`;
  }).join('') : '';
  const guide = [0, 45, 90, 135].map(deg => `<line class="t4-guide" x1="100" y1="12" x2="100" y2="188" transform="rotate(${deg} 100 100)"/>`).join('');
  const points = polygon => polygon.map(p => `${p.x},${p.y}`).join(' ');
  const needle = relative
    ? `<g transform="rotate(${angle} 100 100)" class="t4-adf-needle"><line x1="100" y1="118" x2="100" y2="42"/><path d="M100 28 L91 48 L109 48 Z"/></g>`
    : (() => {
      const shape = compassNeedleVertices(index, compassMode);
      return `<polygon class="t4-compass-pale" points="${points(shape.oppositeHalf)}"/>
        <polygon class="t4-compass-red" points="${points(shape.pointingHalf)}"/>`;
    })();
  return `<svg class="t4-instrument" viewBox="0 0 200 200" role="img" aria-label="${relative ? '相対方位計' : 'コンパス'}">
    <circle cx="100" cy="100" r="92" class="t4-dial"/>
    ${guide}
    ${labels}
    ${relative ? '<text x="100" y="25" text-anchor="middle" class="t4-nose">▲</text>' : compassMode === 'noseUp' ? '<path class="t4-nose" d="M100 1 L94 13 L106 13 Z"/>' : ''}
    ${needle}
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
    showBoard('example');
  }

  function showPracticeComplete(state) {
    setPhase(null);
    root.innerHTML = `<section class="screen t4-practice-complete"><h1>練習終了</h1>
      <p>3問中${state.answers.filter(answer => answer.correct).length}問正解</p>
      <div class="actions"><button class="btn" type="button" data-ref="again">もう一度解く</button>
      <button class="btn btn-primary" type="button" data-ref="start">本番を始める</button></div></section>`;
    root.querySelector('[data-ref="again"]').addEventListener('click', () => {
      const rng = createRng(randomSeed());
      showBoard('practice', performance.now(), createT4Practice(rng, state.lastProblem), rng);
    });
    root.querySelector('[data-ref="start"]').addEventListener('click', () => showBoard('test', performance.now()));
  }

  // 例題・練習・本番は計器・マス・矢印の描画を共用する。
  function showBoard(mode = 'example', startAt = performance.now(), practice = null, practiceRng = null) {
    setPhase(null);
    const example = mode === 'example';
    const isPractice = mode === 'practice';
    const explaining = isPractice && practice.phase === 'explanation';
    const rng = createRng(randomSeed());
    const sample = createT4Example(params.compassMode);
    let problem = example ? sample.problem : isPractice ? practice.problem : generateT4Problem(rng);
    let selection = createT4Selection();
    let tally = createT4Tally();
    let paleUntil = -Infinity;

    root.innerHTML = `
      <section class="t4-play">
        <div class="topbar">
          <span class="remaining" data-ref="remaining"></span>
          <button class="btn btn-quiet" type="button" data-ref="quit">途中終了</button>
        </div>
        ${example ? `<p class="t4-example-note"><strong>例題</strong><br>
          <span class="t4-explanation" data-ref="exampleSteps"></span><br>
          本番はマス→向き→決定。制限時間${formatDuration(params.durationSec)}は「始める」から数えます。</p>` : ''}
        <div class="t4-instruments">
          <figure><figcaption>コンパス</figcaption><div data-ref="compass"></div></figure>
          <figure><figcaption>ADF</figcaption><div data-ref="adf"></div></figure>
        </div>
        <div class="t4-answer">
          <div class="t4-answer-field"><p>自機の位置(中央が塔)</p><div class="t4-map" data-ref="map" aria-label="自機の位置"></div></div>
          <div class="t4-answer-field"><p>自機の機首の向き</p><div class="t4-headings" data-ref="headings" aria-label="機首の向き"></div></div>
          ${!example && !explaining ? '<button class="btn btn-primary t4-submit" type="button" data-ref="submit" disabled>決定</button>' : ''}
        </div>
        ${example ? '<div class="actions t4-start-actions"><button class="btn" type="button" data-ref="practiceStart">練習問題を解く</button><button class="btn btn-primary" type="button" data-ref="start">始める</button></div>' : ''}
        ${explaining ? `<div class="t4-practice-feedback" data-ref="practiceFeedback"></div>
          <div class="actions"><button class="btn btn-primary" type="button" data-ref="next">${practice.index === 2 ? '結果へ' : '次へ'}</button></div>` : ''}
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
      positionButtons.forEach(b => {
        const selected = b.dataset.position === selection.position;
        b.classList.toggle('is-selected', selected);
        b.textContent = b.dataset.position === selection.position && selection.heading
          ? '' : DIRECTIONS.find(d => d.key === b.dataset.position).label;
        if (selected && selection.heading) {
          b.innerHTML = planeSvg(selection.heading);
        }
      });
      headingButtons.forEach(b => b.classList.toggle('is-selected', b.dataset.heading === selection.heading));
      if (submit) submit.disabled = !canSubmitT4(selection);
    }

    function drawProblem() {
      $('compass').innerHTML = instrumentSvg(problem.headingIndex, false, params.compassMode);
      $('adf').innerHTML = instrumentSvg(problem.relativeIndex, true);
      selection = example ? { ...sample.selection } : explaining
        ? { position: practice.feedback.solution.position, heading: practice.feedback.solution.heading }
        : createT4Selection();
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

    if (example) {
      $('remaining').textContent = '例題';
      $('quit').textContent = 'メニュー';
      drawProblem();
      $('quit').addEventListener('click', () => { setPhase(null); ctx.navigate('#/'); });
      $('start').addEventListener('click', () => showBoard('test', performance.now()));
      $('practiceStart').addEventListener('click', () => {
        const practiceRng = createRng(randomSeed());
        showBoard('practice', performance.now(), createT4Practice(practiceRng, sample.problem), practiceRng);
      });
      return;
    }

    if (isPractice) {
      $('remaining').textContent = `練習 ${practice.index + 1}/3`;
      $('quit').textContent = '例題へ';
      $('quit').addEventListener('click', showStart);
      drawProblem();
      if (explaining) {
        const { feedback } = practice;
        $('practiceFeedback').textContent = [
          `あなたの答え: ${feedback.selection.position}のマス / 向き ${feedback.selection.heading}　${feedback.correct ? '○' : '×'}`,
          `正解: ${feedback.solution.position}のマス / 向き ${feedback.solution.heading}`,
          ...explainT4Solution(practice.problem, params.compassMode),
        ].join('\n');
        $('next').addEventListener('click', () => {
          const next = advanceT4Practice(practice, practiceRng);
          if (next.phase === 'complete') showPracticeComplete(next);
          else showBoard('practice', performance.now(), next, practiceRng);
        });
      } else {
        positionButtons.forEach(b => b.addEventListener('click', onPosition));
        headingButtons.forEach(b => b.addEventListener('click', onHeading));
        submit.addEventListener('click', () => {
          if (!canSubmitT4(selection)) return;
          showBoard('practice', performance.now(), answerT4Practice(practice, selection), practiceRng);
        });
      }
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
