// テスト3 同一図形の検出(内部 id t2): 開始 → 本番 → 結果 の描画と入力。
// 系列・進行・判定・採点は js/logic/t2.js(純粋関数)に任せる。
// 2026-09-30 本番に合わせて変更: 同じ図形は押すまで止まり、matchWaitMs 以内に押せなければ最初からやり直し。

import {
  validateT2Params, createT2Run, pressT2, tickT2, createT2Tally, buildRecord, t2PressFeedback,
} from '../logic/t2.js';
import { createFeedbackSlot, feedbackSlotHtml } from '../core/feedback.js';
import { createRng, randomSeed } from '../core/rng.js';
import { startTimer, formatDuration } from '../core/timer.js';
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
  // 太い十字: □の四隅を欠いたような、線のとても太い十字(2026-09-30 中が抜けた星の代わりに追加)
  thickCross: { label: '太い十字', body: '<polygon points="30,8 70,8 70,30 92,30 92,70 70,70 70,92 30,92 30,70 8,70 8,30 30,30" fill="currentColor"/>' },
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
  const common = ctx.settings.common;
  const meta = findTest('t2');
  let teardown = null; // いま表示している段階の後片付け

  function setPhase(cleanup) {
    const prev = teardown;
    teardown = null;
    prev?.();
    teardown = cleanup ?? null;
  }

  // notice: やり直しになったときの知らせ
  function showStart(notice = '') {
    setPhase(null);
    root.innerHTML = `
      <section class="screen t2-start">
        <h1 data-ref="title"></h1>
        <p class="notice notice-warn" data-ref="notice" hidden></p>
        <p data-ref="desc"></p>
        <p class="notice notice-error" data-ref="error" hidden></p>
        <div class="actions">
          <button class="btn btn-primary btn-large" type="button" data-ref="start">開始</button>
          <a class="btn" href="#/">ホーム</a>
        </div>
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    $('title').textContent = meta.name;
    if (notice) {
      $('notice').textContent = notice;
      $('notice').hidden = false;
    }
    $('desc').textContent =
      `左右の図形が同じときだけ「同じ」を押します(キーボードはスペースキー)。` +
      `同じ図形は押すまで止まり、${params.matchWaitMs / 1000}秒以内に押せないと最初からやり直しです。` +
      `違う図形は ${params.intervalMs / 1000} 秒ごとに切り替わり、押すと誤押しになります。制限時間は${formatDuration(params.durationSec)}です。`;

    try {
      validateT2Params(params);
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
    const rng = createRng(randomSeed());

    root.innerHTML = `
      <section class="t2-play has-feedback">
        <div class="topbar">
          <span class="remaining" data-ref="remaining"></span>
          <button class="btn btn-quiet" type="button" data-ref="quit">途中終了</button>
        </div>
        <div class="t2-shapes">
          <div class="t2-shape" role="img" data-ref="left"></div>
          <div class="t2-shape" role="img" data-ref="right"></div>
        </div>
        <div class="t2-bottom">
          ${feedbackSlotHtml()}
          <button class="t2-same" type="button" data-ref="same">同じ</button>
        </div>
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    const leftEl = $('left');
    const rightEl = $('right');
    const sameBtn = $('same');
    const feedback = createFeedbackSlot($('feedback'), { durationMs: common.feedbackMs });

    let run = null; // 最初のフレームで始める
    let lastFrameTs = null;

    // フォーカスのあるボタンがスペースキーで押されないように外しておく
    document.activeElement?.blur?.();

    // 押したことを見せる: 誤押しの表示が終わるまで、かつ押してから pressFeedbackMs たつまで薄くする
    let lastPressTs = -Infinity;
    let pale = false;
    function setPale(on) {
      if (on === pale) return;
      pale = on;
      sameBtn.classList.toggle('is-pressed', on);
    }

    function draw() {
      drawShape(leftEl, run.display.left);
      drawShape(rightEl, run.display.right);
    }

    function press(ts) {
      if (!run) return;
      const r = pressT2(run, ts, params, rng);
      if (r.result === 'ignored') return;
      run = r.state;
      lastPressTs = ts;
      setPale(true);
      if (r.result === 'hit') {
        feedback.show(t2PressFeedback(true, r.rtMs), ts);
        draw(); // 押したらすぐ次の表示
      } else {
        feedback.show(t2PressFeedback(false), ts);
      }
    }

    function abort(message) {
      setPhase(null);
      ctx.navigate('#/', message);
    }

    function onFrame(_elapsed, ts) {
      if (lastFrameTs !== null && ts - lastFrameTs > params.stallAbortMs) {
        abort('描画が止まったため中断しました(記録は保存していません)');
        return;
      }
      lastFrameTs = ts;
      if (!run) {
        run = createT2Run(params, rng, ts);
        draw();
      } else {
        const t = tickT2(run, ts, params, rng);
        if (t.event === 'restart') {
          // 同じ図形を時間内に押せなかった: この回は保存せず、開始画面に戻る
          showStart(`${params.matchWaitMs / 1000}秒以内に押せなかったため、最初からやり直します`);
          return;
        }
        run = t.state;
        if (t.event === 'advanced') draw();
      }
      feedback.tick(ts);
      setPale(run.pressed || ts - lastPressTs < params.pressFeedbackMs);
    }

    function onEnd() {
      const tally = run ? run.tally : createT2Tally();
      const record = buildRecord({ date: new Date().toISOString(), tally, settings: params });
      const saveResult = appendRecord(ctx.store, record);
      setPhase(null); // 入力の受け付けを外す
      renderResult(root, {
        testName: meta.name,
        score: record.score,
        details: meta.details.map(d => ({ label: d.label, value: formatDetail(d, record.detail[d.key]), emphasis: d.emphasis })),
        saveResult,
        onRetry: () => showStart(),
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
        abort(`${meta.name}は、画面が切り替わったため中断しました(記録は保存していません)`);
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

    // 制限時間は、同じ図形で止まっている間も進む
    const timer = startTimer({
      durationMs: params.durationSec * 1000,
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
