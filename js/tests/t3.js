// テスト3 マルチタスク: 開始 → 本番 → 結果 の描画と入力、読み上げ(speechSynthesis)。
// 問題の生成・判定・音声タスクの進行・採点は js/logic/t3.js(純粋関数)に任せる。

import {
  pickVoice, generateShapeProblem, judgeShape, generateCalcProblem, judgeCalc, formatCalc,
  generateAudioSet, createAudioState, startAudioSet, stepAudio, audioEnded, answerAudio,
  createT3Tally, recordAnswer, recordUnanswered, buildT3Record,
  shapeTimedOut, shapeElapsedRatio, recordShapeUnanswered, skipAudio, recordSkip,
  t3ShapeFeedback, t3ShapeTimeoutFeedback, t3CalcFeedback, t3AudioFeedback,
} from '../logic/t3.js';
import { createFeedbackSlot, feedbackSlotHtml } from '../core/feedback.js';
import { createRng, randomSeed } from '../core/rng.js';
import { startTimer, formatDuration } from '../core/timer.js';
import { appendRecord } from '../core/storage.js';
import { renderResult } from '../core/result.js';
import { findTest, formatDetail } from '../core/catalog.js';

const synth = globalThis.speechSynthesis ?? null;

// 図形は SVG で描く。viewBox は 100×100
function shapeSvg(item) {
  let body;
  if (item.kind === 'circle') body = '<circle cx="50" cy="50" r="36" fill="none"/>';
  else if (item.kind === 'cross') body = '<path d="M20 20 L80 80 M80 20 L20 80" fill="none"/>';
  else if (item.kind === 'square') body = '<rect x="17" y="17" width="66" height="66" fill="none"/>';
  else {
    // 右向き(▷)を基準に、左向きは180°回し、さらに傾きを加える
    const deg = (item.dir === 'left' ? 180 : 0) + item.tiltDeg;
    body = `<polygon points="22,16 88,50 22,84" fill="none" transform="rotate(${deg.toFixed(2)} 50 50)"/>`;
  }
  return `<svg viewBox="0 0 100 100" class="shape-svg" stroke="currentColor" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;
}

function voiceLabel(pick, lang) {
  if (!pick.voice) return `読み上げの声: 指定なし(${lang} で読み上げます)`;
  const base = `読み上げの声: ${pick.voice.name}(${pick.voice.lang})`;
  return pick.rank === 3 ? `${base} ※ ${lang} の声が見つからないため代わりに使います` : base;
}

export function mount(root, ctx) {
  const params = ctx.settings.t3;
  const common = ctx.settings.common;
  const meta = findTest('t3');
  let teardown = null;

  function setPhase(cleanup) {
    const prev = teardown;
    teardown = null;
    prev?.();
    teardown = cleanup ?? null;
  }

  function showStart() {
    setPhase(null);
    root.innerHTML = `
      <section class="screen t3-start">
        <h1 data-ref="title"></h1>
        <p>本来は横画面で行います。画面をタップして開始します(音が出ます)</p>
        <ul>
          <li>図形: 三角形が左右どちらを向いているかを ◀ ▶ で答える(1問<span data-ref="shapeLimit"></span>秒。過ぎると未回答で次の図形へ)</li>
          <li>計算: <span data-ref="termCount"></span>つの数の足し算・引き算の式と右辺の答えを見て、答えが合っていれば「正しい」、違えば「誤り」を押す</li>
          <li>音声: 英単語5つの中に同じ語が2回出たかを答える。「スキップ」を押すとその組を飛ばして次の組へ進む(正答には数えない)</li>
        </ul>
        <p data-ref="desc"></p>
        <p class="muted small" data-ref="voice"></p>
        <p class="notice notice-error" data-ref="error" hidden></p>
        <div class="actions">
          <button class="btn btn-primary btn-large" type="button" data-ref="start">開始</button>
          <a class="btn" href="#/">ホーム</a>
        </div>
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    $('title').textContent = meta.name;
    $('shapeLimit').textContent = String(params.shapeLimitMs / 1000);
    $('termCount').textContent = String(params.calcTermCount);
    $('desc').textContent =
      `3つは同時に進みます。制限時間は${formatDuration(params.durationSec)}です。`;
    const startBtn = $('start');

    if (!synth || typeof globalThis.SpeechSynthesisUtterance !== 'function') {
      $('error').textContent = 'このブラウザは読み上げ(speechSynthesis)に対応していないため、テスト2(マルチタスク)を開始できません';
      $('error').hidden = false;
      startBtn.disabled = true;
      return;
    }

    const showVoice = () => {
      $('voice').textContent = voiceLabel(pickVoice(synth.getVoices(), params.speechLang), params.speechLang);
    };
    showVoice();
    // 声の一覧はあとから届くことがある
    synth.addEventListener?.('voiceschanged', showVoice);

    // iOS では、最初の読み上げをユーザーの操作の中で始めないと音が出ない。
    // そのため、この click の処理の中で同期的に1語目の speak() まで進める。
    const onStart = e => {
      if (e.target.closest('a')) return; // ホームへの移動では開始しない
      startPlay();
    };
    root.addEventListener('click', onStart);
    startBtn.focus();

    setPhase(() => {
      synth.removeEventListener?.('voiceschanged', showVoice);
      root.removeEventListener('click', onStart);
    });
  }

  function startPlay() {
    setPhase(null);
    synth.cancel(); // 前に残っている読み上げを消してから始める
    const pick = pickVoice(synth.getVoices(), params.speechLang);
    const rng = createRng(randomSeed());

    root.innerHTML = `
      <section class="t3-play">
        <div class="topbar">
          <span class="remaining" data-ref="remaining"></span>
          <span class="muted small t3-voice" data-ref="voice"></span>
          <button class="btn btn-quiet" type="button" data-ref="quit">途中終了</button>
        </div>
        <p class="notice notice-error t3-speech-error" data-ref="speechError" hidden></p>
        <div class="t3-grid">
          <div class="t3-panel t3-shape-task">
            <div class="t3-shapes" data-ref="shapes"></div>
            <div class="t3-dir-buttons">
              <button class="t3-btn" type="button" data-dir="left" aria-label="左向き">◀</button>
              <button class="t3-btn" type="button" data-dir="right" aria-label="右向き">▶</button>
            </div>
            <div class="t3-shape-timer" role="progressbar" aria-label="図形の経過時間" aria-valuemin="0" aria-valuemax="100" data-ref="shapeTimer">
              <div class="t3-shape-timer-fill" data-ref="shapeTimerFill"></div>
            </div>
            ${feedbackSlotHtml('shapeFeedback')}
          </div>
          <div class="t3-panel t3-calc-task">
            <div class="t3-calc-expr" data-ref="expr"></div>
            <div class="t3-choices t3-judge-buttons">
              <button class="t3-btn" type="button" data-calc="yes">正しい</button>
              <button class="t3-btn" type="button" data-calc="no">誤り</button>
            </div>
            ${feedbackSlotHtml('calcFeedback')}
          </div>
          <div class="t3-panel t3-audio-task">
            <div class="t3-audio-status" data-ref="audioStatus"></div>
            <div class="t3-audio-buttons">
              <button class="t3-btn" type="button" data-dup="yes" disabled>重複あり</button>
              <button class="t3-btn" type="button" data-dup="no" disabled>重複なし</button>
            </div>
            <div class="t3-skip-row">
              <button class="t3-btn t3-skip" type="button" data-ref="skip" disabled>スキップ</button>
            </div>
            ${feedbackSlotHtml('audioFeedback')}
          </div>
        </div>
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    $('voice').textContent = voiceLabel(pick, params.speechLang);
    const shapesEl = $('shapes');
    const exprEl = $('expr');
    const calcBtns = [...root.querySelectorAll('[data-calc]')];
    const skipBtn = $('skip');
    const shapeTimer = $('shapeTimer');
    const shapeTimerFill = $('shapeTimerFill');
    // 経過時間の棒(縦長。下から上へ増え、いっぱいで時間切れ)
    function drawShapeTimer(ts) {
      const ratio = shapeElapsedRatio(shapeShownAt, ts, params);
      if (shapeTimerFill.style) shapeTimerFill.style.transform = `scaleY(${ratio})`;
      shapeTimer.setAttribute?.('aria-valuenow', String(Math.round(ratio * 100)));
    }
    const dirBtns = [...root.querySelectorAll('[data-dir]')];
    const dupBtns = [...root.querySelectorAll('[data-dup]')];
    const audioStatus = $('audioStatus');
    const speechError = $('speechError');
    // 3つの枠それぞれに独立して判定を出す
    const slot = ref => createFeedbackSlot($(ref), { durationMs: common.feedbackMs });
    const shapeFeedback = slot('shapeFeedback');
    const calcFeedback = slot('calcFeedback');
    const audioFeedback = slot('audioFeedback');

    let tally = createT3Tally();
    let shapeQ = null;
    let shapeShownAt = 0; // 図形の1問ごとの制限時間を数える起点
    let calcQ = null;
    let audio = createAudioState();
    let lastFrameTs = null;
    let disposed = false;
    const utterances = []; // onend が来なくなるのを防ぐため、組が終わるまで参照を持つ
    const pale = new Map(); // 押したボタン → 押した時刻(rAF のループで元に戻す)

    function nextShape(ts) {
      shapeQ = generateShapeProblem(rng, params, shapeQ);
      shapeShownAt = ts;
      shapesEl.innerHTML = shapeQ.items.map(it => `<div class="t3-shape">${shapeSvg(it)}</div>`).join('');
    }
    function nextCalc() {
      calcQ = generateCalcProblem(rng, params);
      exprEl.textContent = `${formatCalc(calcQ)} = ${calcQ.shown}`;
    }
    function markPressed(btn, ts) {
      btn.classList.add('is-pressed');
      pale.set(btn, ts);
    }
    function setAudioButtons(enabled) {
      dupBtns.forEach(b => { b.disabled = !enabled; });
    }
    // スキップは読み上げ中と回答待ちのときだけ押せる
    function setSkip(enabled) {
      skipBtn.disabled = !enabled;
    }

    function speakWord(word, index, setSeq) {
      const u = new SpeechSynthesisUtterance(word);
      u.lang = params.speechLang;
      u.rate = params.speechRate;
      if (pick.voice) u.voice = pick.voice;
      u.onend = () => {
        if (!disposed) audio = audioEnded(audio, setSeq, index, performance.now());
      };
      u.onerror = e => {
        if (disposed) return;
        audio = audioEnded(audio, setSeq, index, performance.now());
        // cancel() による中断は正常な動き
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          speechError.textContent = `音声を再生できませんでした(${e.error})`;
          speechError.hidden = false;
        }
      };
      utterances.push(u);
      synth.speak(u);
    }

    function runAudio(now) {
      const idle = !synth.speaking && !synth.pending;
      const r = stepAudio(audio, now, params, rng, { idle });
      audio = r.state;
      for (const a of r.actions) {
        if (a.type === 'newSet') {
          utterances.length = 0;
          setSkip(true);
        } else if (a.type === 'speak') {
          audioStatus.textContent = `聞いてください(${a.index + 1}/${audio.set.words.length})`;
          speakWord(a.word, a.index, audio.setSeq);
        } else if (a.type === 'enableAnswer') {
          audioStatus.textContent = '同じ単語は2回出ましたか?';
          setAudioButtons(true);
        } else if (a.type === 'timeout') {
          tally = recordUnanswered(tally);
          setAudioButtons(false);
          setSkip(false);
          audioStatus.textContent = '次の単語を待っています';
        }
      }
    }

    function onDir(e) {
      const btn = e.currentTarget;
      const correct = judgeShape(shapeQ, btn.dataset.dir);
      tally = recordAnswer(tally, 'shape', correct);
      shapeFeedback?.show(t3ShapeFeedback(shapeQ, correct), e.timeStamp);
      markPressed(btn, e.timeStamp);
      nextShape(e.timeStamp);
    }
    function onCalc(e) {
      const btn = e.currentTarget;
      const correct = judgeCalc(calcQ, btn.dataset.calc === 'yes');
      tally = recordAnswer(tally, 'calc', correct);
      calcFeedback?.show(t3CalcFeedback(calcQ, correct), e.timeStamp);
      markPressed(btn, e.timeStamp);
      nextCalc();
    }
    function onDup(e) {
      const btn = e.currentTarget;
      const r = answerAudio(audio, e.timeStamp, btn.dataset.dup === 'yes');
      if (!r.accepted) return;
      audioFeedback?.show(t3AudioFeedback(audio.set, r.correct), e.timeStamp);
      audio = r.state;
      tally = recordAnswer(tally, 'audio', r.correct);
      markPressed(btn, e.timeStamp);
      setAudioButtons(false);
      setSkip(false);
      audioStatus.textContent = '次の単語を待っています';
    }
    // スキップ: その組を飛ばす(正答には数えない)。読み上げ中なら止め、speechNextDelayMs 後に次の組
    function onSkip(e) {
      const r = skipAudio(audio, e.timeStamp);
      if (!r.accepted) return;
      audio = r.state;
      tally = recordSkip(tally);
      synth.cancel();
      markPressed(skipBtn, e.timeStamp);
      setAudioButtons(false);
      setSkip(false);
      audioStatus.textContent = '次の単語を待っています';
    }

    // 中断: 記録は保存しない
    function abort(message) {
      setPhase(null);
      ctx.navigate('#/', message);
    }

    function onFrame(elapsed, ts) {
      // 描画が止まっていたら(フレームの間隔が長すぎたら)中断する
      if (lastFrameTs !== null && ts - lastFrameTs > params.stallAbortMs) {
        abort('描画が止まったため中断しました(記録は保存していません)');
        return;
      }
      lastFrameTs = ts;
      // 図形は1問ごとの制限時間を過ぎたら未回答にして次の図形へ
      if (shapeTimedOut(shapeShownAt, ts, params)) {
        tally = recordShapeUnanswered(tally);
        shapeFeedback.show(t3ShapeTimeoutFeedback(shapeQ), ts);
        nextShape(ts);
      }
      drawShapeTimer(ts);
      runAudio(ts);
      for (const f of [shapeFeedback, calcFeedback, audioFeedback]) f?.tick(ts);
      for (const [btn, t] of pale) {
        if (ts - t >= params.answerFeedbackMs) {
          btn.classList.remove('is-pressed');
          pale.delete(btn);
        }
      }
    }

    function onEnd() {
      // 終了時刻に残っていた問題・読み上げ中や回答待ちの組は数えない
      const record = buildT3Record({ date: new Date().toISOString(), tally, settings: params });
      setPhase(null);
      const saveResult = appendRecord(ctx.store, record);
      renderResult(root, {
        testName: meta.name,
        score: record.score,
        details: meta.details.map(d => ({ label: d.label, value: formatDetail(d, record.detail[d.key]) })),
        saveResult,
        onRetry: showStart,
      });
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        abort(`${meta.name}は、画面が切り替わったため中断しました(記録は保存していません)`);
      }
    }
    function onQuit() {
      setPhase(null);
      ctx.navigate('#/');
    }

    dirBtns.forEach(b => b.addEventListener('click', onDir));
    calcBtns.forEach(b => b.addEventListener('click', onCalc));
    skipBtn.addEventListener('click', onSkip);
    dupBtns.forEach(b => b.addEventListener('click', onDup));
    $('quit').addEventListener('click', onQuit);
    document.addEventListener('visibilitychange', onVisibility);

    // 1組目の1語目は、この click の処理の中で読み始める
    const now = performance.now();
    nextShape(now);
    nextCalc();
    setSkip(true);
    audio = startAudioSet(audio, generateAudioSet(rng, params), now);
    runAudio(now);

    const timer = startTimer({
      durationMs: params.durationSec * 1000,
      onFrame,
      onEnd,
      remainingEl: $('remaining'),
    });

    setPhase(() => {
      disposed = true;
      timer.stop();
      synth.cancel();
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  showStart();
  return () => {
    setPhase(null);
  };
}
