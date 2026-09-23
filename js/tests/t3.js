// テスト3 マルチタスク: 開始 → 本番 → 結果 の描画と入力、読み上げ(speechSynthesis)。
// 問題の生成・判定・音声タスクの進行・採点は js/logic/t3.js(純粋関数)に任せる。

import {
  pickVoice, generateShapeProblem, judgeShape, generateCalcProblem, judgeCalc, formatCalc,
  generateAudioSet, createAudioState, startAudioSet, stepAudio, audioEnded, answerAudio,
  createT3Tally, recordAnswer, recordUnanswered, buildT3Record,
} from '../logic/t3.js';
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
          <li>図形: 三角形が左右どちらを向いているかを答える</li>
          <li>計算: 4つの数の足し算・引き算の答えを4択から選ぶ</li>
          <li>音声: 英単語5つの中に同じ語が2回出たかを答える</li>
        </ul>
        <p data-ref="desc"></p>
        <p class="muted small" data-ref="voice"></p>
        <p class="notice notice-error" data-ref="error" hidden></p>
        <div class="actions">
          <button class="btn btn-primary btn-large" type="button" data-ref="start">開始</button>
          <a class="btn" href="#/">メニュー</a>
        </div>
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    $('title').textContent = meta.name;
    $('desc').textContent =
      `3つは同時に進みます。制限時間は${formatDuration(params.durationSec)}です。`;
    const startBtn = $('start');

    if (!synth || typeof globalThis.SpeechSynthesisUtterance !== 'function') {
      $('error').textContent = 'このブラウザは読み上げ(speechSynthesis)に対応していないため、テスト3を開始できません';
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
      if (e.target.closest('a')) return; // メニューへの移動では開始しない
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
          </div>
          <div class="t3-panel t3-calc-task">
            <div class="t3-calc-expr" data-ref="expr"></div>
            <div class="t3-choices" data-ref="choices">
              <button class="t3-btn" type="button" data-idx="0"></button>
              <button class="t3-btn" type="button" data-idx="1"></button>
              <button class="t3-btn" type="button" data-idx="2"></button>
              <button class="t3-btn" type="button" data-idx="3"></button>
            </div>
          </div>
          <div class="t3-panel t3-audio-task">
            <div class="t3-audio-status" data-ref="audioStatus"></div>
            <div class="t3-audio-buttons">
              <button class="t3-btn" type="button" data-dup="yes" disabled>重複あり</button>
              <button class="t3-btn" type="button" data-dup="no" disabled>重複なし</button>
            </div>
          </div>
        </div>
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    $('voice').textContent = voiceLabel(pick, params.speechLang);
    const shapesEl = $('shapes');
    const exprEl = $('expr');
    const choiceBtns = [...root.querySelectorAll('[data-idx]')];
    const dirBtns = [...root.querySelectorAll('[data-dir]')];
    const dupBtns = [...root.querySelectorAll('[data-dup]')];
    const audioStatus = $('audioStatus');
    const speechError = $('speechError');

    let tally = createT3Tally();
    let shapeQ = null;
    let calcQ = null;
    let audio = createAudioState();
    let lastFrameTs = null;
    let disposed = false;
    const utterances = []; // onend が来なくなるのを防ぐため、組が終わるまで参照を持つ
    const pale = new Map(); // 押したボタン → 押した時刻(rAF のループで元に戻す)

    function nextShape() {
      shapeQ = generateShapeProblem(rng, params, shapeQ);
      shapesEl.innerHTML = shapeQ.items.map(it => `<div class="t3-shape">${shapeSvg(it)}</div>`).join('');
    }
    function nextCalc() {
      calcQ = generateCalcProblem(rng, params);
      exprEl.textContent = `${formatCalc(calcQ)} =`;
      choiceBtns.forEach((b, i) => { b.textContent = String(calcQ.choices[i]); });
    }
    function markPressed(btn, ts) {
      btn.classList.add('is-pressed');
      pale.set(btn, ts);
    }
    function setAudioButtons(enabled) {
      dupBtns.forEach(b => { b.disabled = !enabled; });
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
        } else if (a.type === 'speak') {
          audioStatus.textContent = `聞いてください(${a.index + 1}/${audio.set.words.length})`;
          speakWord(a.word, a.index, audio.setSeq);
        } else if (a.type === 'enableAnswer') {
          audioStatus.textContent = '同じ単語は2回出ましたか?';
          setAudioButtons(true);
        } else if (a.type === 'timeout') {
          tally = recordUnanswered(tally);
          setAudioButtons(false);
          audioStatus.textContent = '次の単語を待っています';
        }
      }
    }

    function onDir(e) {
      const btn = e.currentTarget;
      tally = recordAnswer(tally, 'shape', judgeShape(shapeQ, btn.dataset.dir));
      markPressed(btn, e.timeStamp);
      nextShape();
    }
    function onChoice(e) {
      const btn = e.currentTarget;
      tally = recordAnswer(tally, 'calc', judgeCalc(calcQ, Number(btn.dataset.idx)));
      markPressed(btn, e.timeStamp);
      nextCalc();
    }
    function onDup(e) {
      const btn = e.currentTarget;
      const r = answerAudio(audio, e.timeStamp, btn.dataset.dup === 'yes');
      if (!r.accepted) return;
      audio = r.state;
      tally = recordAnswer(tally, 'audio', r.correct);
      markPressed(btn, e.timeStamp);
      setAudioButtons(false);
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
      runAudio(ts);
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
    choiceBtns.forEach(b => b.addEventListener('click', onChoice));
    dupBtns.forEach(b => b.addEventListener('click', onDup));
    $('quit').addEventListener('click', onQuit);
    document.addEventListener('visibilitychange', onVisibility);

    nextShape();
    nextCalc();
    // 1組目の1語目は、この click の処理の中で読み始める
    const now = performance.now();
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
