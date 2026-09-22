// テスト6 トンネル飛行: Canvas描画、Pointer Events、開始・中断・結果画面。
// 座標変換・物理・衝突・採点は js/logic/t6.js に任せる。

import {
  computeTunnelLayout, pointerToSection, projectScale,
  createT6State, stepT6State, buildT6Record,
} from '../logic/t6.js';
import { createRng, randomSeed } from '../core/rng.js';
import { startTimer } from '../core/timer.js';
import { appendRecord } from '../core/storage.js';
import { renderResult } from '../core/result.js';
import { findTest, formatDetail } from '../core/catalog.js';
import { createLandscapeGuard } from '../core/landscape.js';

const DEG = Math.PI / 180;
const AIRCRAFT_SIZE_RATIO = 0.055;
const MIN_AIRCRAFT_SIZE_PX = 8;

function drawHalf(ctx, obstacle, cx, cy, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  if (obstacle.blockedSide === 'up') ctx.fillRect(cx - radius, cy - radius, radius * 2, radius);
  else if (obstacle.blockedSide === 'down') ctx.fillRect(cx - radius, cy, radius * 2, radius);
  else if (obstacle.blockedSide === 'left') ctx.fillRect(cx - radius, cy - radius, radius, radius * 2);
  else ctx.fillRect(cx, cy - radius, radius, radius * 2);
  ctx.restore();
}

function drawBlades(ctx, obstacle, cx, cy, radius, hubRatio) {
  for (let i = 0; i < 3; i++) {
    const center = obstacle.rotationDeg + 60 + i * 120;
    const start = -(center + 30) * DEG;
    const end = -(center - 30) * DEG;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, end);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, radius * hubRatio, 0, Math.PI * 2);
  ctx.fill();
}

function drawAircraft(ctx, layout, position, pushing) {
  const x = layout.centerX + position.x * layout.radius;
  const y = layout.centerY - position.y * layout.radius;
  const size = Math.max(MIN_AIRCRAFT_SIZE_PX, layout.radius * AIRCRAFT_SIZE_RATIO);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = pushing ? '#ffcc4d' : '#69b7ff';
  ctx.strokeStyle = '#f4f8ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -size * 1.25);
  ctx.lineTo(size * 0.45, -size * 0.1);
  ctx.lineTo(size * 1.45, size * 0.45);
  ctx.lineTo(size * 0.28, size * 0.35);
  ctx.lineTo(0, size * 1.05);
  ctx.lineTo(-size * 0.28, size * 0.35);
  ctx.lineTo(-size * 1.45, size * 0.45);
  ctx.lineTo(-size * 0.45, -size * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawScene(ctx, layout, state, p) {
  const { width, height, centerX: cx, centerY: cy } = layout;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#07101f';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, layout.radius, 0, Math.PI * 2);
  ctx.clip();

  // トンネルの輪。距離に合わせて手前へ流す。
  const phase = state.distance % p.tunnelRingSpacing;
  ctx.strokeStyle = 'rgba(110, 170, 230, 0.32)';
  ctx.lineWidth = 1;
  for (let z = p.collisionZ + p.tunnelRingSpacing - phase; z <= p.farZ; z += p.tunnelRingSpacing) {
    const radius = layout.radius * projectScale(p.perspectiveFocal, z);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = i * 30 * DEG;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * layout.radius, cy + Math.sin(a) * layout.radius);
    ctx.stroke();
  }

  const visible = state.obstacles.filter(o => o.z > p.nearZ).sort((a, b) => b.z - a.z);
  for (const obstacle of visible) {
    const scale = projectScale(p.perspectiveFocal, obstacle.z);
    const radius = layout.radius * scale;
    const near = Math.max(0.2, Math.min(1, 1.2 - obstacle.z / p.farZ));
    ctx.fillStyle = `rgba(226, 80, 72, ${0.48 + near * 0.42})`;
    ctx.strokeStyle = `rgba(255, 205, 190, ${0.55 + near * 0.4})`;
    ctx.lineWidth = Math.max(1, 2.5 * scale);
    if (obstacle.type === 'half') drawHalf(ctx, obstacle, cx, cy, radius);
    else drawBlades(ctx, obstacle, cx, cy, radius, p.bladeHubRadius);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = '#75a8d8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, layout.radius, 0, Math.PI * 2);
  ctx.stroke();
  drawAircraft(ctx, layout, state.position, state.pushback !== null);

  if (state.pushback) {
    ctx.strokeStyle = 'rgba(255, 204, 77, 0.8)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, width - 6, height - 6);
  }
}

export function mount(root, ctx) {
  const params = ctx.settings.t6;
  const meta = findTest('t6');
  const guard = createLandscapeGuard();
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
      <section class="screen t6-start">
        <h1 data-ref="title"></h1>
        <p>指またはマウスで機体を動かし、半円と回転する3枚羽根の開口を通り抜けます。</p>
        <p class="muted">衝突すると速度が半分になり、安全な開口方向へ押し戻されます。制限時間は <span data-ref="duration"></span> 秒です。</p>
        <div class="actions">
          <button class="btn btn-primary btn-large" type="button" data-ref="start">開始</button>
          <a class="btn" href="#/">メニュー</a>
        </div>
      </section>`;
    root.querySelector('[data-ref="title"]').textContent = meta.name;
    root.querySelector('[data-ref="duration"]').textContent = String(params.durationSec);
    const startBtn = root.querySelector('[data-ref="start"]');
    guard.setOnChange(landscape => { startBtn.disabled = !landscape; });
    startBtn.addEventListener('click', () => {
      if (guard.isLandscape()) startPlay();
    });
    startBtn.focus();
    setPhase(() => guard.setOnChange(null));
  }

  function startPlay() {
    setPhase(null);
    const rng = createRng(randomSeed());
    let state = createT6State(rng, params);
    let target = { x: 0, y: 0 };
    let lastFrameTs = null;
    let layout = null;
    let disposed = false;

    root.innerHTML = `
      <section class="t6-play">
        <div class="topbar t6-topbar">
          <span class="remaining" data-ref="remaining"></span>
          <span class="t6-live" data-ref="live"></span>
          <button class="btn btn-quiet" type="button" data-ref="quit">途中終了</button>
        </div>
        <div class="t6-stage" data-ref="stage">
          <canvas data-ref="canvas" aria-label="トンネル飛行の画面"></canvas>
        </div>
      </section>`;
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    const canvas = $('canvas');
    const stage = $('stage');
    const live = $('live');
    const drawCtx = canvas.getContext('2d');

    function resizeCanvas() {
      const rect = stage.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      drawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout = computeTunnelLayout(width, height, params);
    }

    function updateTarget(e) {
      if (!layout) return;
      if (e.pointerType === 'touch') e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      target = pointerToSection({ x: e.clientX - rect.left, y: e.clientY - rect.top }, layout, e.pointerType, params.aircraftMaxRadius);
    }

    function onPointerDown(e) {
      canvas.setPointerCapture?.(e.pointerId);
      updateTarget(e);
    }

    function onPointerMove(e) {
      if (e.pointerType !== 'touch' || canvas.hasPointerCapture?.(e.pointerId)) updateTarget(e);
    }

    function abort(message) {
      if (disposed) return;
      setPhase(null);
      ctx.navigate('#/', message);
    }

    function onFrame(_elapsed, ts) {
      if (lastFrameTs !== null && ts - lastFrameTs > params.stallAbortMs) {
        abort('描画が止まったため中断しました(記録は保存していません)');
        return;
      }
      const dtSec = lastFrameTs === null ? 0 : (ts - lastFrameTs) / 1000;
      lastFrameTs = ts;
      state = stepT6State(state, target, dtSec, params, rng);
      resizeCanvas();
      drawScene(drawCtx, layout, state, params);
      live.textContent = `通過 ${state.cleared}　衝突 ${state.collisions}　速度 ${state.speed.toFixed(2)}`;
    }

    function onEnd() {
      const record = buildT6Record({ date: new Date().toISOString(), state, settings: params });
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

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    $('quit').addEventListener('click', onQuit);
    document.addEventListener('visibilitychange', onVisibility);
    globalThis.addEventListener('resize', resizeCanvas);
    guard.setOnChange(landscape => {
      if (!landscape) abort('端末が縦になったため中断しました(記録は保存していません)');
    });

    resizeCanvas();
    drawScene(drawCtx, layout, state, params);
    const timer = startTimer({
      durationMs: params.durationSec * 1000,
      onFrame,
      onEnd,
      remainingEl: $('remaining'),
    });

    setPhase(() => {
      disposed = true;
      timer.stop();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibility);
      globalThis.removeEventListener('resize', resizeCanvas);
      guard.setOnChange(null);
    });
  }

  showStart();
  return () => {
    setPhase(null);
    guard.destroy();
  };
}
