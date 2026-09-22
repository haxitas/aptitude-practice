// テスト1 計算: 4択表示、回答、時間管理、保存。

import {
  generateT1Problem, judgeT1, createT1Tally, recordT1Answer, buildT1Record,
} from '../logic/t1.js';
import { createRng, randomSeed } from '../core/rng.js';
import { startTimer } from '../core/timer.js';
import { appendRecord } from '../core/storage.js';
import { renderResult } from '../core/result.js';
import { findTest, formatDetail } from '../core/catalog.js';

function formatChoice(value, unit) {
  return `${value}${unit}`;
}

export function mount(root, ctx) {
  const params = ctx.settings.t1;
  const meta = findTest('t1');
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
        <p>単位換算、速さ、出会い、追いつき、割合、割合の逆算、単価と合計、平均、経過時間の9種類を4択で答えます。</p>
        <p>回答するとすぐ次の問題へ進みます。制限時間は <span data-ref="duration"></span> 秒です。</p>
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
    let problem = generateT1Problem(rng, params);
    let tally = createT1Tally();
    let lastFrameTs = null;
    const pale = new Map();

    root.innerHTML = `
      <section class="t1-play">
        <div class="topbar">
          <span class="remaining" data-ref="remaining"></span>
          <button class="btn btn-quiet" type="button" data-ref="quit">途中終了</button>
        </div>
        <div class="t1-card">
          <p class="t1-kind" data-ref="kind"></p>
          <p class="t1-question" data-ref="question"></p>
          <div class="t1-choices" data-ref="choices">
            <button type="button" data-index="0"></button>
            <button type="button" data-index="1"></button>
            <button type="button" data-index="2"></button>
            <button type="button" data-index="3"></button>
          </div>
        </div>
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    const choiceButtons = [...root.querySelectorAll('[data-index]')];
    const kindLabels = { unit: '単位換算', speed: '速さ', meeting: '出会い', catchup: '追いつき', percentage: '割合', inversePercentage: '割合の逆算', price: '単価と合計', average: '平均', elapsed: '経過時間' };

    function drawProblem() {
      $('kind').textContent = kindLabels[problem.kind];
      $('question').textContent = problem.prompt;
      choiceButtons.forEach((button, index) => {
        button.textContent = formatChoice(problem.choices[index], problem.unit);
      });
    }

    function onAnswer(e) {
      const button = e.currentTarget;
      const correct = judgeT1(problem, Number(button.dataset.index));
      tally = recordT1Answer(tally, correct);
      button.classList.add('is-pressed');
      pale.set(button, e.timeStamp);
      problem = generateT1Problem(rng, params, problem);
      drawProblem();
    }

    function abort(message) {
      setPhase(null);
      ctx.navigate('#/', message);
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') abort(`${meta.name}は、画面が切り替わったため中断しました(記録は保存していません)`);
    }

    choiceButtons.forEach(button => button.addEventListener('click', onAnswer));
    $('quit').addEventListener('click', () => { setPhase(null); ctx.navigate('#/'); });
    document.addEventListener('visibilitychange', onVisibility);
    drawProblem();
    document.activeElement?.blur?.();

    const timer = startTimer({
      durationMs: params.durationSec * 1000,
      remainingEl: $('remaining'),
      onFrame(_elapsed, ts) {
        if (lastFrameTs !== null && ts - lastFrameTs > params.stallAbortMs) {
          abort('描画が止まったため中断しました(記録は保存していません)');
          return;
        }
        lastFrameTs = ts;
        for (const [button, pressedAt] of pale) {
          if (ts - pressedAt >= params.answerFeedbackMs) {
            button.classList.remove('is-pressed');
            pale.delete(button);
          }
        }
      },
      onEnd() {
        const record = buildT1Record({ date: new Date().toISOString(), tally, settings: params });
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
      choiceButtons.forEach(button => button.removeEventListener('click', onAnswer));
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  showStart();
  return () => setPhase(null);
}
