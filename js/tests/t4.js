// このファイルは単体テストからも読み込むため、読み込んだだけで DOM に触れないこと。
// テスト5 計器の読み取り(内部 id t4): SVG描画、3段階の解答操作、時間管理、保存。
// 2026-09-30 本番に合わせて変更: 左は GYRO、右は RBI。中央の電波局は NDB。

import {
  DIRECTIONS, generateT4Problem, headingIndexes, createT4Selection, createT4Example,
  selectT4Position, selectT4Heading, canSubmitT4,
  judgeT4, gyroNorthNeedleDeg, rbiNeedleDeg, planeRotationDeg,
  createT4Practice, answerT4Practice, advanceT4Practice, explainT4Solution,
  createT4Tally, recordT4Answer, buildT4Record, t4Feedback,
} from '../logic/t4.js';
import { createFeedbackSlot, feedbackSlotHtml } from '../core/feedback.js';
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

const polar = (deg, r) => {
  const a = deg * Math.PI / 180;
  return { x: +(100 + Math.sin(a) * r).toFixed(2), y: +(100 - Math.cos(a) * r).toFixed(2) };
};
const tick = (deg, outer, inner, className) => {
  const a = polar(deg, outer);
  const b = polar(deg, inner);
  return `<line class="${className}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
};

// GYRO: 文字盤(45°ごとの目盛り)は固定で上が機首。上に機首の印▲、中央に上向きの飛行機。
// 赤い針(北)と白い針(南)が、機首から見た北の方向を指す(2026-10-01 ユーザーの本番の記憶で確定。
// 以前の「機首が上」の羅針盤の針の形を元にした)
export function gyroSvg(headingIndex) {
  const ticks = Array.from({ length: 8 }, (_, i) => tick(i * 45, 90, 76, 't4-gyro-tick')).join('');
  return `<svg class="t4-instrument" viewBox="0 0 200 200" role="img" aria-label="GYRO">
    <circle cx="100" cy="100" r="92" class="t4-dial"/>
    ${ticks}
    <path class="t4-lubber" d="M100 12 L92 0 L108 0 Z"/>
    <path class="t4-gyro-plane" d="M100 58 L106 88 L140 104 L140 111 L106 103 L104 128 L116 136 L116 142 L100 137 L84 142 L84 136 L96 128 L94 103 L60 111 L60 104 L94 88 Z"/>
    <g class="t4-gyro-needle" transform="rotate(${gyroNorthNeedleDeg(headingIndex)} 100 100)"><polygon class="t4-gyro-south" points="100,164 93,100 100,100 107,100"/><polygon class="t4-gyro-north" points="100,36 107,100 100,100 93,100"/></g>
    <circle cx="100" cy="100" r="6" class="t4-hub"/>
  </svg>`;
}

// RBI: 0 を上に固定した文字盤(数字は ×10°、目盛りは10°ごとで30°ごとに長い)。青い針が NDB の相対方位を指す
export function rbiSvg(relativeIndex) {
  const ticks = Array.from({ length: 36 }, (_, i) => (i % 3 === 0
    ? tick(i * 10, 90, 76, 't4-rbi-tick is-long')
    : tick(i * 10, 90, 83, 't4-rbi-tick'))).join('');
  const numbers = Array.from({ length: 12 }, (_, i) => {
    const p = polar(i * 30, 64);
    return `<text x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" class="t4-rbi-number">${i * 3}</text>`;
  }).join('');
  return `<svg class="t4-instrument" viewBox="0 0 200 200" role="img" aria-label="RBI">
    <circle cx="100" cy="100" r="92" class="t4-dial"/>
    ${ticks}${numbers}
    <g class="t4-rbi-needle" transform="rotate(${rbiNeedleDeg(relativeIndex)} 100 100)"><line x1="100" y1="128" x2="100" y2="44"/><path d="M100 30 L91 50 L109 50 Z"/></g>
    <circle cx="100" cy="100" r="6" class="t4-hub"/>
  </svg>`;
}

// 即時判定の不正解で出す小さな3×3のイラスト。中央が NDB で、正しいマスに正しい向きの飛行機を描く
function solutionMiniMap(solution) {
  const map = document.createElement('div');
  map.className = 't4-mini-map';
  map.setAttribute('role', 'img');
  map.setAttribute('aria-label', `正解: ${solution.position}のマス・向き${solution.heading}`);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cell = document.createElement('div');
      cell.className = 't4-mini-cell';
      if (row === 1 && col === 1) {
        cell.classList.add('is-tower');
        cell.textContent = 'NDB';
      } else if (DIRECTIONS.find(d => d.row === row && d.col === col).key === solution.position) {
        cell.classList.add('is-answer');
        cell.innerHTML = planeSvg(solution.heading);
      }
      map.append(cell);
    }
  }
  return map;
}

export function mount(root, ctx) {
  const params = ctx.settings.t4;
  const common = ctx.settings.common;
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
      showBoard('practice', performance.now(), createT4Practice(rng, state.lastProblem, params.headingDirections), rng);
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
    const sample = createT4Example(params.headingDirections);
    let problem = example ? sample.problem : isPractice ? practice.problem : generateT4Problem(rng, null, params.headingDirections);
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
          <figure><figcaption>GYRO</figcaption><div data-ref="gyro"></div></figure>
          <figure><figcaption>RBI</figcaption><div data-ref="rbi"></div></figure>
        </div>
        <div class="t4-answer">
          <div class="t4-answer-field"><p>自機の位置(中央が NDB)</p><div class="t4-map" data-ref="map" aria-label="自機の位置"></div></div>
          <div class="t4-answer-field"><p>自機の機首の向き</p><div class="t4-headings" data-ref="headings" aria-label="機首の向き"></div></div>
          ${!example && !explaining ? '<button class="btn btn-primary t4-submit" type="button" data-ref="submit" disabled>決定</button>' : ''}
          ${mode === 'test' ? feedbackSlotHtml('feedback', 't4-feedback') : ''}
        </div>
        ${example ? '<div class="actions t4-start-actions"><button class="btn" type="button" data-ref="practiceStart">練習問題を解く</button><button class="btn btn-primary" type="button" data-ref="start">始める</button></div>' : ''}
        ${explaining ? `<div class="t4-practice-feedback" data-ref="practiceFeedback"></div>
          <div class="actions"><button class="btn btn-primary" type="button" data-ref="next">${practice.index === 2 ? '結果へ' : '次へ'}</button></div>` : ''}
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    const submit = $('submit');
    // テスト4の判定は、イラストを読む時間が要るため次の決定まで出し続ける
    const feedback = mode === 'test'
      ? createFeedbackSlot($('feedback'), { durationMs: common.feedbackMs, sticky: true }) : null;
    if (example) $('exampleSteps').textContent = explainT4Solution(sample.problem).join('\n');

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (row === 1 && col === 1) {
          const tower = document.createElement('div');
          tower.className = 't4-tower';
          tower.textContent = 'NDB';
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
    // 向きのボタンは、機首の向きの数(4 なら N・E・S・W)だけ出す
    for (const d of headingIndexes(params.headingDirections).map(i => DIRECTIONS[i])) {
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
      $('gyro').innerHTML = gyroSvg(problem.headingIndex);
      $('rbi').innerHTML = rbiSvg(problem.relativeIndex);
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
      if (feedback) {
        const message = t4Feedback(problem, selection);
        feedback.show(message, e.timeStamp, message.solution ? solutionMiniMap(message.solution) : null);
      }
      paleUntil = e.timeStamp + params.answerFeedbackMs;
      submit.classList.add('is-pressed');
      problem = generateT4Problem(rng, problem, params.headingDirections);
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
      $('quit').textContent = 'ホーム';
      drawProblem();
      $('quit').addEventListener('click', () => { setPhase(null); ctx.navigate('#/'); });
      $('start').addEventListener('click', () => showBoard('test', performance.now()));
      $('practiceStart').addEventListener('click', () => {
        const practiceRng = createRng(randomSeed());
        showBoard('practice', performance.now(), createT4Practice(practiceRng, sample.problem, params.headingDirections), practiceRng);
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
          ...explainT4Solution(practice.problem),
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
