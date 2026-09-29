// テスト4 点の数(内部 id t5): Canvas描画、shuffleIntervalMs ごとの再配置、回答と時間切れ、保存。
// 2026-09-30 本番に合わせて変更: 点の数は段階で決め(js/logic/t5.js)、答えは連続した5つの数から選ぶ。

import {
  generateT5Problem, reshuffleT5Dots, shuffleIndexAt, shouldTimeoutT5,
  pairDotPositions, interpolateDotPositions,
  t5Feedback, createT5Level, nextT5Level,
  createT5Tally, recordT5Answer, recordT5Unanswered, buildT5Record,
} from '../logic/t5.js';
import { createFeedbackSlot, feedbackSlotHtml } from '../core/feedback.js';
import { createRng, randomSeed } from '../core/rng.js';
import { startTimer, formatDuration } from '../core/timer.js';
import { appendRecord } from '../core/storage.js';
import { renderResult } from '../core/result.js';
import { findTest, formatDetail } from '../core/catalog.js';

function drawDots(canvas, problem, p) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
  if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const radius = Math.max(1, Math.min(width, height) * 0.44 * p.fieldScale);
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
  const common = ctx.settings.common;
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
        <p>円の中の点を数え、下の<span data-ref="choiceCount"></span>つの数から答えます。1問の中では点の数は同じまま、開始直後から位置が約<span data-ref="interval"></span>秒ごとに変わります。</p>
        <p><span data-ref="questionLimit"></span> 全体は <span data-ref="duration"></span>です。</p>
        <div class="actions">
          <button class="btn btn-primary btn-large" type="button" data-ref="start">開始</button>
          <a class="btn" href="#/">ホーム</a>
        </div>
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    $('title').textContent = meta.name;
    $('choiceCount').textContent = String(params.choiceCount);
    $('interval').textContent = String(Math.round(params.shuffleIntervalMs / 100) / 10);
    $('questionLimit').textContent = params.questionLimitSec === 0
      ? '1問の時間制限はなく、答えるまで次に進みません。'
      : `1問は${params.questionLimitSec}秒で、過ぎると未回答で次へ進みます。`;
    $('duration').textContent = formatDuration(params.durationSec);
    $('start').addEventListener('click', startPlay);
    $('start').focus();
  }

  function startPlay() {
    setPhase(null);
    const rng = createRng(randomSeed());
    let level = createT5Level(params);
    let problem = generateT5Problem(rng, params, null, level.level);
    let tally = createT5Tally();
    let questionNumber = 1;
    let questionStartMs = 0;
    let lastShuffleIndex = 0;
    let currentElapsed = 0;
    let movement = null;
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
        ${feedbackSlotHtml('feedback', 't5-feedback')}
        <div class="t5-buttons" data-ref="buttons"></div>
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    const canvas = $('canvas');
    // テスト5の判定は、時間制限なしで数える間に見返せるよう次に答えるまで残す
    const feedback = createFeedbackSlot($('feedback'), { durationMs: common.feedbackMs, sticky: true });
    // 選択肢のボタンは choiceCount 個。数字は問題ごとに書き換える
    for (let i = 0; i < params.choiceCount; i++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 't5-number';
      $('buttons').append(button);
    }
    $('buttons').style.gridTemplateColumns = `repeat(${params.choiceCount}, 1fr)`;
    const answerButtons = [...$('buttons').children];

    function showChoices() {
      answerButtons.forEach((button, i) => {
        button.dataset.answer = String(problem.choices[i]);
        button.textContent = String(problem.choices[i]);
      });
    }

    function draw() {
      $('question').textContent = `第${questionNumber}問`;
      drawDots(canvas, { ...problem, dots: visibleDots() }, params);
    }

    function visibleDots() {
      return movement ? interpolateDotPositions(movement.pairs, currentElapsed - movement.startedAt, params.dotMoveMs) : problem.dots;
    }

    function nextQuestion(elapsed, answer) {
      // 答えた問題の正誤を出す(未回答では出さない)。段階は正解で+1、続けて不正解で−1(未回答は不正解と同じ)
      if (answer !== null) feedback.show(t5Feedback(problem.count, answer), performance.now());
      level = nextT5Level(level, answer === problem.count, params);
      problem = generateT5Problem(rng, params, problem, level.level);
      showChoices();
      movement = null;
      questionNumber++;
      questionStartMs = elapsed;
      lastShuffleIndex = 0;
      draw();
    }

    function onAnswer(e) {
      const deadline = questionStartMs + params.questionLimitSec * 1000;
      if (params.questionLimitSec > 0 && currentElapsed >= deadline) return;
      const button = e.currentTarget;
      tally = recordT5Answer(tally, Number(button.dataset.answer), problem.count);
      button.classList.add('is-pressed');
      pale.set(button, e.timeStamp);
      nextQuestion(currentElapsed, Number(button.dataset.answer));
    }

    function abort(message) {
      setPhase(null);
      ctx.navigate('#/', message);
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') abort(`${meta.name}は、画面が切り替わったため中断しました(記録は保存していません)`);
    }

    function onResize() { draw(); }

    showChoices();
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
        if (shouldTimeoutT5(elapsed, questionStartMs, params, overallDeadline)) {
          tally = recordT5Unanswered(tally);
          nextQuestion(elapsed, null);
        } else {
          const index = shuffleIndexAt(elapsed - questionStartMs, params);
          if (index > lastShuffleIndex) {
            const from = visibleDots(); // 前の移動が途中でも、その表示位置から続ける
            problem = reshuffleT5Dots(problem, rng, params);
            movement = { pairs: pairDotPositions(from, problem.dots), startedAt: elapsed };
            lastShuffleIndex = index;
          }
        }
        draw(); // 共通の1本のrAFで補間も描く
        for (const [button, pressedAt] of pale) {
          if (ts - pressedAt >= params.answerFeedbackMs) {
            button.classList.remove('is-pressed');
            pale.delete(button);
          }
        }
      },
      onEnd() {
        const record = buildT5Record({ date: new Date().toISOString(), tally, level, settings: params });
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
