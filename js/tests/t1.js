// テスト1 計算: 4択表示、回答、時間管理、保存。

import {
  generateT1Problem, judgeT1, t1MistakeEntry, t1ReviewSummary, formatT1Answer, createT1Tally, recordT1Answer, buildT1Record,
} from '../logic/t1.js';
import { createRng, randomSeed } from '../core/rng.js';
import { startTimer, formatDuration } from '../core/timer.js';
import { appendRecord } from '../core/storage.js';
import { renderResult } from '../core/result.js';
import { findTest, formatDetail } from '../core/catalog.js';
import { mountCalculator } from '../calculator.js';

// 結果画面の「間違えた問題」: 問題文・あなたの答え・正解・式
function reviewSection(summary, mistakes) {
  const section = document.createElement('section');
  section.className = 't1-review';
  const heading = document.createElement('h2');
  heading.textContent = summary;
  section.append(heading);
  if (mistakes.length) {
    const list = document.createElement('ol');
    for (const m of mistakes) {
      const item = document.createElement('li');
      const prompt = document.createElement('p');
      prompt.className = 't1-review-prompt';
      prompt.textContent = m.prompt;
      const answers = document.createElement('p');
      answers.textContent = `あなたの答え: ${m.yourAnswer} / 正解: ${m.correctAnswer}`;
      const formula = document.createElement('p');
      formula.className = 't1-review-formula';
      formula.textContent = m.formula;
      item.append(prompt, answers, formula);
      list.append(item);
    }
    section.append(list);
  }
  return section;
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
        <p>単位換算、速さ、出会い、追いつき、割合、割合の逆算、単価と合計、平均、経過時間、図形、仕事算、速さと時間、時給、円筒の容積の14種類の文章題を4択で答えます。</p>
        <p>回答するとすぐ次の問題へ進みます。制限時間は <span data-ref="duration"></span>です。</p>
        <div class="actions">
          <button class="btn btn-primary btn-large" type="button" data-ref="start">開始</button>
          <a class="btn" href="#/">ホーム</a>
        </div>
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    $('title').textContent = meta.name;
    $('duration').textContent = formatDuration(params.durationSec);
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
        <div class="t1-main">
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
        ${params.calculatorDuringTest ? '<div class="t1-calculator" data-ref="calculator"></div>' : ''}
        </div>
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    const choiceButtons = [...root.querySelectorAll('[data-index]')];
    const kindLabels = { unit: '単位換算', speed: '速さ', meeting: '出会い', catchup: '追いつき', percentage: '割合', inversePercentage: '割合の逆算', price: '単価と合計', average: '平均', elapsed: '経過時間', geometry: '図形',
      work: '仕事算', speedTime: '速さと時間', wage: '時給', cylinder: '円筒の容積' };
    const cleanupCalculator = params.calculatorDuringTest ? mountCalculator($('calculator')) : null;
    const mistakes = []; // 結果画面で振り返る(テスト中は正誤を出さない)

    function drawProblem() {
      $('kind').textContent = kindLabels[problem.kind];
      $('question').textContent = problem.prompt;
      choiceButtons.forEach((button, index) => {
        button.textContent = formatT1Answer(problem, problem.choices[index]);
      });
    }

    function onAnswer(e) {
      const button = e.currentTarget;
      const correct = judgeT1(problem, Number(button.dataset.index));
      tally = recordT1Answer(tally, correct);
      const mistake = t1MistakeEntry(problem, Number(button.dataset.index));
      if (mistake) mistakes.push(mistake);
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
          extra: reviewSection(t1ReviewSummary(tally.answered, mistakes), mistakes),
        });
        root.querySelector('.result .actions')?.insertAdjacentHTML('beforeend', '<a class="btn" href="#/calc">電卓</a>');
      },
    });

    setPhase(() => {
      timer.stop();
      choiceButtons.forEach(button => button.removeEventListener('click', onAnswer));
      document.removeEventListener('visibilitychange', onVisibility);
      cleanupCalculator?.();
    });
  }

  showStart();
  return () => setPhase(null);
}
