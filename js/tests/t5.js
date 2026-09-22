// テスト5 点の数: Canvas描画、1000msごとの再配置、回答と時間切れ、保存。

import {
  generateT5Problem, reshuffleT5Dots, shuffleIndexAt, shouldTimeoutT5,
  createT5Tally, recordT5Answer, recordT5Unanswered, buildT5Record,
} from '../logic/t5.js';
import { createRng, randomSeed } from '../core/rng.js';
import { startTimer } from '../core/timer.js';
import { appendRecord } from '../core/storage.js';
import { renderResult } from '../core/result.js';
import { findTest, formatDetail } from '../core/catalog.js';

function drawDots(canvas, problem, p) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const radius = Math.max(1, Math.min(width, height) * 0.44);
  const cx = width / 2;
  const cy = height / 2;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface');
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text');
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text');
  for (const dot of problem.dots) {
    ctx.beginPath();
    ctx.arc(cx + dot.x * radius, cy - dot.y * radius, Math.max(4, p.dotRadiusRatio * radius), 0, Math.PI * 2);
    ctx.fill();
  }
}

export function mount(root, ctx) {
  const params = ctx.settings.t5;
  const meta = findTest('t5');
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
        <p>円の中の点を数え、3〜13の数字で答えます。点の数は同じまま、位置が1秒ごとに変わります。</p>
        <p>1問は <span data-ref="questionLimit"></span> 秒、全体は <span data-ref="duration"></span> 秒です。</p>
        <div class="actions">
          <button class="btn btn-primary btn-large" type="button" data-ref="start">開始</button>
          <a class="btn" href="#/">メニュー</a>
        </div>
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    $('title').textContent = meta.name;
    $('questionLimit').textContent = String(params.questionLimitSec);
    $('duration').textContent = String(params.durationSec);
    $('start').addEventListener('click', startPlay);
    $('start').focus();
  }

  function startPlay() {
    setPhase(null);
    const rng = createRng(randomSeed());
    let problem = generateT5Problem(rng, params);
    let tally = createT5Tally();
    let questionNumber = 1;
    let questionStartMs = 0;
    let lastShuffleIndex = 0;
    let currentElapsed = 0;
    let lastFrameTs = null;
    const pale = new Map();

    root.innerHTML = `
      <section class="t5-play">
        <div class="topbar">
          <span class="remaining" data-ref="remaining"></span>
          <strong data-ref="question"></strong>
          <button class="btn btn-quiet" type="button" data-ref="quit">途中終了</button>
        </div>
        <div class="t5-stage"><canvas data-ref="canvas" aria-label="点を数える円"></canvas></div>
        <div class="t5-buttons" data-ref="buttons"></div>
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    const canvas = $('canvas');
    for (let n = params.minDots; n <= params.maxDots; n++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 't5-number';
      button.dataset.answer = String(n);
      button.textContent = String(n);
      $('buttons').append(button);
    }
    const answerButtons = [...root.querySelectorAll('[data-answer]')];

    function draw() {
      $('question').textContent = `第${questionNumber}問`;
      drawDots(canvas, problem, params);
    }

    function nextQuestion(elapsed) {
      problem = generateT5Problem(rng, params, problem);
      questionNumber++;
      questionStartMs = elapsed;
      lastShuffleIndex = 0;
      draw();
    }

    function onAnswer(e) {
      const deadline = questionStartMs + params.questionLimitSec * 1000;
      if (currentElapsed >= deadline) return;
      const button = e.currentTarget;
      tally = recordT5Answer(tally, Number(button.dataset.answer), problem.count);
      button.classList.add('is-pressed');
      pale.set(button, e.timeStamp);
      nextQuestion(currentElapsed);
    }

    function abort(message) {
      setPhase(null);
      ctx.navigate('#/', message);
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') abort(`${meta.name}は、画面が切り替わったため中断しました(記録は保存していません)`);
    }

    function onResize() { draw(); }

    answerButtons.forEach(b => b.addEventListener('click', onAnswer));
    $('quit').addEventListener('click', () => { setPhase(null); ctx.navigate('#/'); });
    document.addEventListener('visibilitychange', onVisibility);
    globalThis.addEventListener('resize', onResize);
    draw();
    document.activeElement?.blur?.();

    const overallDeadline = params.durationSec * 1000;
    const timer = startTimer({
      durationMs: overallDeadline,
      remainingEl: $('remaining'),
      onFrame(elapsed, ts) {
        if (lastFrameTs !== null && ts - lastFrameTs > params.stallAbortMs) {
          abort('描画が止まったため中断しました(記録は保存していません)');
          return;
        }
        lastFrameTs = ts;
        currentElapsed = elapsed;
        const questionDeadline = questionStartMs + params.questionLimitSec * 1000;
        if (shouldTimeoutT5(elapsed, questionDeadline, overallDeadline)) {
          tally = recordT5Unanswered(tally);
          nextQuestion(elapsed);
        } else {
          const index = shuffleIndexAt(elapsed - questionStartMs, params);
          if (index > lastShuffleIndex) {
            problem = reshuffleT5Dots(problem, rng, params);
            lastShuffleIndex = index;
            draw();
          }
        }
        for (const [button, pressedAt] of pale) {
          if (ts - pressedAt >= params.answerFeedbackMs) {
            button.classList.remove('is-pressed');
            pale.delete(button);
          }
        }
      },
      onEnd() {
        const record = buildT5Record({ date: new Date().toISOString(), tally, settings: params });
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
      answerButtons.forEach(b => b.removeEventListener('click', onAnswer));
      document.removeEventListener('visibilitychange', onVisibility);
      globalThis.removeEventListener('resize', onResize);
    });
  }

  showStart();
  return () => setPhase(null);
}
