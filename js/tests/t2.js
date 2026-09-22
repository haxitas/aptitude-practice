// テスト2 同一図形の検出: 開始 → 本番 → 結果 の描画と入力。
// 判定・採点・系列の生成は js/logic/t2.js(純粋関数)に任せる。

import {
  generateSequence, displayCount, createDisplayState, registerPress, createTally, settleDisplay, buildRecord,
} from '../logic/t2.js';
import { createRng, randomSeed } from '../core/rng.js';
import { startTimer } from '../core/timer.js';
import { appendRecord } from '../core/storage.js';
import { renderResult } from '../core/result.js';
import { findTest, formatDetail } from '../core/catalog.js';

// 図形は SVG で描く(文字だとフォントによって大きさが揃わないため)。viewBox は 100×100
function starPoints(cx, cy, outer, inner) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}
const STAR = starPoints(50, 54, 46, 19);
const SHAPE_SVG = {
  triangle: { label: '△', body: '<polygon points="50,9 93,85 7,85" fill="none"/>' },
  starFilled: { label: '★', body: `<polygon points="${STAR}" fill="currentColor"/>` },
  circle: { label: '○', body: '<circle cx="50" cy="50" r="41" fill="none"/>' },
  square: { label: '□', body: '<rect x="13" y="13" width="74" height="74" fill="none"/>' },
  diamond: { label: '◇', body: '<polygon points="50,5 95,50 50,95 5,50" fill="none"/>' },
  starOutline: { label: '☆', body: `<polygon points="${STAR}" fill="none"/>` },
};

function drawShape(container, id) {
  const s = SHAPE_SVG[id];
  container.innerHTML =
    `<svg viewBox="0 0 100 100" class="shape-svg" stroke="currentColor" stroke-width="6" stroke-linejoin="round">${s.body}</svg>`;
  container.setAttribute('aria-label', s.label);
}

function isSpace(e) {
  return e.code === 'Space' || e.key === ' ';
}

export function mount(root, ctx) {
  const params = ctx.settings.t2;
  const meta = findTest('t2');
  let teardown = null; // いま表示している段階の後片付け

  function setPhase(cleanup) {
    const prev = teardown;
    teardown = null;
    prev?.();
    teardown = cleanup ?? null;
  }

  function showStart() {
    setPhase(null);
    root.innerHTML = `
      <section class="screen t2-start">
        <h1 data-ref="title"></h1>
        <p data-ref="desc"></p>
        <p class="notice notice-error" data-ref="error" hidden></p>
        <div class="actions">
          <button class="btn btn-primary btn-large" type="button" data-ref="start">開始</button>
          <a class="btn" href="#/">メニュー</a>
        </div>
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    $('title').textContent = meta.name;
    $('desc').textContent =
      `左右の図形が同じときだけ「同じ」を押します(キーボードはスペースキー)。` +
      `表示は ${params.intervalMs / 1000} 秒ごとに切り替わり、${(displayCount(params) * params.intervalMs) / 1000} 秒で終わります。`;

    // 設定が実現できるかを先に確かめる
    try {
      generateSequence(params, createRng(1));
    } catch (e) {
      $('error').textContent = e.message;
      $('error').hidden = false;
      $('start').disabled = true;
      return;
    }
    $('start').addEventListener('click', startPlay);
    $('start').focus();
  }

  function startPlay() {
    const seq = generateSequence(params, createRng(randomSeed()));
    const N = seq.length;

    root.innerHTML = `
      <section class="t2-play">
        <div class="topbar">
          <span class="remaining" data-ref="remaining"></span>
          <button class="btn btn-quiet" type="button" data-ref="quit">途中終了</button>
        </div>
        <div class="t2-shapes">
          <div class="t2-shape" role="img" data-ref="left"></div>
          <div class="t2-shape" role="img" data-ref="right"></div>
        </div>
        <div class="t2-bottom">
          <button class="t2-same" type="button" data-ref="same">同じ</button>
        </div>
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    const leftEl = $('left');
    const rightEl = $('right');
    const sameBtn = $('same');

    let cur = -1; // いま表示している番号
    let frameTs = 0; // その表示を描いたフレームの時刻
    let ds = createDisplayState();
    let tally = createTally();

    // フォーカスのあるボタンがスペースキーで押されないように外しておく
    document.activeElement?.blur?.();

    // 押したことを見せる: 受け付けた押下のあと、その表示が終わるまで、かつ押してから
    // pressFeedbackMs たつまではボタンを薄くする(表示が切り替わっても最低時間は保つ)。
    // 時間の管理は rAF のループ(onFrame)で行う。正誤は出さない。
    let lastPressTs = -Infinity;
    let pale = false;
    function setPale(on) {
      if (on === pale) return;
      pale = on;
      sameBtn.classList.toggle('is-pressed', on);
    }

    function press(ts) {
      if (cur < 0) return;
      // 判定は押した時点の表示に対して行う(薄いあいだでも、新しい表示なら受け付ける)
      const r = registerPress(ds, Math.max(0, ts - frameTs));
      if (!r.accepted) return;
      ds = r.state;
      lastPressTs = ts;
      setPale(true);
    }

    // 描画が止まって表示が1つ以上飛んだ回は、非表示のときと同じく中断して保存しない
    function abortStalled() {
      setPhase(null);
      ctx.navigate('#/', '描画が止まったため中断しました(記録は保存していません)');
    }

    function onFrame(elapsed, ts) {
      const i = Math.min(N - 1, Math.floor(elapsed / params.intervalMs));
      if (i !== cur) {
        if (i > cur + 1) {
          abortStalled();
          return;
        }
        // 前の表示の判定を確定してから次を描く
        if (cur >= 0) tally = settleDisplay(tally, seq[cur].match, ds);
        cur = i;
        ds = createDisplayState();
        drawShape(leftEl, seq[i].left);
        drawShape(rightEl, seq[i].right);
        frameTs = ts;
      }
      // いまの表示で押したか、押してから最低時間がたっていなければ薄いまま
      setPale(ds.pressed || ts - lastPressTs < params.pressFeedbackMs);
    }

    function onEnd() {
      // 止まっている間に終了時刻を過ぎ、最後の表示まで描けていない場合も中断する
      if (cur < N - 1) {
        abortStalled();
        return;
      }
      tally = settleDisplay(tally, seq[cur].match, ds);
      const record = buildRecord({ date: new Date().toISOString(), tally, settings: params });
      const saveResult = appendRecord(ctx.store, record);
      setPhase(null); // 入力の受け付けを外す
      renderResult(root, {
        testName: meta.name,
        score: record.score,
        details: meta.details.map(d => ({ label: d.label, value: formatDetail(d, record.detail[d.key]) })),
        saveResult,
        onRetry: showStart,
      });
    }

    function onPointerDown(e) {
      e.preventDefault();
      press(e.timeStamp);
    }
    function onKeyDown(e) {
      if (!isSpace(e)) return;
      e.preventDefault();
      if (e.repeat) return;
      press(e.timeStamp);
    }
    function onKeyUp(e) {
      if (isSpace(e)) e.preventDefault();
    }
    // アプリ切り替え・画面ロックは途中終了として扱い、保存しない
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        setPhase(null);
        ctx.navigate('#/', `${meta.name}は、画面が切り替わったため中断しました(記録は保存していません)`);
      }
    }
    function onQuit() {
      setPhase(null);
      ctx.navigate('#/');
    }

    sameBtn.addEventListener('pointerdown', onPointerDown);
    $('quit').addEventListener('click', onQuit);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('visibilitychange', onVisibility);

    const timer = startTimer({
      durationMs: N * params.intervalMs, // 終了は N×間隔の時点
      onFrame,
      onEnd,
      remainingEl: $('remaining'),
    });

    setPhase(() => {
      timer.stop();
      sameBtn.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  showStart();
  return () => setPhase(null);
}
