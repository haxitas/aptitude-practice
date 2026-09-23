// テスト6 トンネル飛行: Canvas描画、Pointer Events、開始・中断・結果画面。
// 座標変換・物理・衝突・採点は js/logic/t6.js に任せる。

import {
  computeTunnelLayout, stickInputAt, keyboardInput, combineInputs,
  projectScale, drawableObstacles, holeCenters,
  createT6State, stepT6State, buildT6Record,
} from '../logic/t6.js';
import { createRng, randomSeed } from '../core/rng.js';
import { startTimer, formatDuration } from '../core/timer.js';
import { appendRecord, readSettingsRaw, saveSettings } from '../core/storage.js';
import { renderResult } from '../core/result.js';
import { findTest, formatDetail } from '../core/catalog.js';
import { T6_COLOR_OPTIONS } from '../core/settings.js';

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
  ctx.beginPath();
  if (obstacle.blockedSide === 'up' || obstacle.blockedSide === 'down') {
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
  } else {
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
  }
  ctx.stroke();
}

function drawBlades(ctx, obstacle, cx, cy, radius, hubRatio, openingDeg) {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  for (let i = 0; i < obstacle.openingCount; i++) {
    const center = obstacle.rotationDeg + i * 360 / obstacle.openingCount;
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, -(center + openingDeg / 2) * DEG, -(center - openingDeg / 2) * DEG);
    ctx.closePath();
  }
  ctx.fill('evenodd');
  ctx.beginPath();
  ctx.arc(cx, cy, radius * hubRatio, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < obstacle.openingCount; i++) {
    const center = obstacle.rotationDeg + i * 360 / obstacle.openingCount;
    for (const edge of [center - openingDeg / 2, center + openingDeg / 2]) {
      const rad = edge * DEG;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(rad) * radius * hubRatio, cy - Math.sin(rad) * radius * hubRatio);
      ctx.lineTo(cx + Math.cos(rad) * radius, cy - Math.sin(rad) * radius);
      ctx.stroke();
    }
  }
}

function drawSector(ctx, obstacle, cx, cy, radius, openingDeg) {
  const half = openingDeg / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.moveTo(cx, cy);
  ctx.arc(
    cx, cy, radius,
    -(obstacle.openCenterDeg - half) * DEG,
    -(obstacle.openCenterDeg + half) * DEG,
    true,
  );
  ctx.closePath();
  ctx.fill('evenodd');
  for (const edge of [obstacle.openCenterDeg - half, obstacle.openCenterDeg + half]) {
    const rad = edge * DEG;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * radius, cy - Math.sin(rad) * radius);
    ctx.stroke();
  }
}

function drawHoles(ctx, obstacle, cx, cy, radius, p) {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  for (const center of holeCenters(obstacle, p)) {
    const x = cx + center.x * radius;
    const y = cy - center.y * radius;
    const holeRadius = p.holeRadius * radius;
    ctx.moveTo(x + holeRadius, y);
    ctx.arc(x, y, holeRadius, 0, Math.PI * 2);
  }
  ctx.fill('evenodd');
  for (const center of holeCenters(obstacle, p)) {
    ctx.beginPath();
    ctx.arc(cx + center.x * radius, cy - center.y * radius, p.holeRadius * radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawAircraft(ctx, layout, position, pushing) {
  const x = layout.tunnel.centerX + position.x * layout.tunnel.radius;
  const y = layout.tunnel.centerY - position.y * layout.tunnel.radius;
  const size = Math.max(MIN_AIRCRAFT_SIZE_PX, layout.tunnel.radius * AIRCRAFT_SIZE_RATIO);
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

function drawStick(ctx, layout, input) {
  const { centerX, centerY, radius } = layout.stick;
  ctx.save();
  ctx.fillStyle = 'rgba(30, 55, 83, 0.82)';
  ctx.strokeStyle = '#75a8d8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const knobX = centerX + input.x * radius;
  const knobY = centerY - input.y * radius;
  ctx.fillStyle = '#69b7ff';
  ctx.strokeStyle = '#f4f8ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(knobX, knobY, Math.max(12, radius * 0.28), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawScene(ctx, layout, state, p, stickInput) {
  const { width, height } = layout;
  const { centerX: cx, centerY: cy, radius: tunnelRadius } = layout.tunnel;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#07101f';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, tunnelRadius, 0, Math.PI * 2);
  ctx.clip();

  // トンネルの輪。距離に合わせて手前へ流す。
  const phase = state.distance % p.tunnelRingSpacing;
  ctx.strokeStyle = 'rgba(110, 170, 230, 0.32)';
  ctx.lineWidth = 1;
  for (let z = p.collisionZ + p.tunnelRingSpacing - phase; z <= p.farZ; z += p.tunnelRingSpacing) {
    const radius = tunnelRadius * projectScale(p.perspectiveFocal, z);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = i * 30 * DEG;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * tunnelRadius, cy + Math.sin(a) * tunnelRadius);
    ctx.stroke();
  }

  const visible = drawableObstacles(state.obstacles, p).sort((a, b) => b.z - a.z);
  for (const obstacle of visible) {
    const scale = projectScale(p.perspectiveFocal, obstacle.z);
    const radius = tunnelRadius * scale;
    ctx.fillStyle = T6_COLOR_OPTIONS.obstacle.find(color => color.name === p.obstacleColor)?.value ?? T6_COLOR_OPTIONS.obstacle[0].value;
    ctx.strokeStyle = T6_COLOR_OPTIONS.edge.find(color => color.name === p.obstacleEdgeColor)?.value ?? T6_COLOR_OPTIONS.edge[0].value;
    ctx.lineWidth = Math.max(1.5, 4 * scale);
    if (obstacle.type === 'half') drawHalf(ctx, obstacle, cx, cy, radius);
    else if (obstacle.type === 'blades') drawBlades(ctx, obstacle, cx, cy, radius, p.bladeHubRadius, p.bladeOpeningDeg);
    else if (obstacle.type === 'sector') drawSector(ctx, obstacle, cx, cy, radius, p.sectorOpeningDeg);
    else drawHoles(ctx, obstacle, cx, cy, radius, p);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = '#75a8d8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, tunnelRadius, 0, Math.PI * 2);
  ctx.stroke();
  drawAircraft(ctx, layout, state.position, state.pushback !== null);
  drawStick(ctx, layout, stickInput);

  if (state.pushback) {
    ctx.strokeStyle = 'rgba(255, 204, 77, 0.8)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, width - 6, height - 6);
  }
}

export function mount(root, ctx) {
  const params = { ...ctx.settings.t6 };
  const meta = findTest('t6');
  let teardown = null;

  function setPhase(cleanup) {
    const prev = teardown;
    teardown = null;
    prev?.();
    teardown = cleanup ?? null;
  }

  // 準備中と本番で同じ帯・stageを使い、開始可否も実際の描画領域で測る。
  function shell(intro = '') {
    return `<section class="t6-play">
      <div class="topbar t6-topbar">
        <span class="remaining" data-ref="remaining">準備</span>
        <button class="btn btn-quiet" type="button" data-ref="side"></button>
        <button class="btn btn-quiet" type="button" data-ref="quit">${intro ? 'メニュー' : '途中終了'}</button>
        <span class="t6-live" data-ref="live">矢印キー / 操縦円</span>
      </div>
      <p class="notice notice-error t6-message" data-ref="message" hidden></p>
      <div class="t6-stage" data-ref="stage">
        <canvas data-ref="canvas" aria-label="トンネル飛行の画面"></canvas>
        ${intro ? `<div class="t6-intro">${intro}</div>` : ''}
      </div>
    </section>`;
  }

  function updateSideLabel() {
    root.querySelector('[data-ref="side"]').textContent = params.stickSide === 'left' ? '操縦円: 左 → 右へ' : '操縦円: 右 → 左へ';
  }

  function swapSide() {
    const side = params.stickSide === 'left' ? 'right' : 'left';
    const raw = readSettingsRaw(ctx.store);
    const saved = raw.value ?? {};
    const result = raw.ok ? saveSettings(ctx.store, { ...saved, t6: { ...(saved.t6 ?? {}), stickSide: side } }) : raw;
    const message = root.querySelector('[data-ref="message"]');
    message.hidden = result.ok;
    message.textContent = result.ok ? '' : result.message;
    if (!result.ok) return false;
    params.stickSide = side;
    updateSideLabel();
    return true;
  }

  function layoutForStage(stage) {
    return computeTunnelLayout(stage.clientWidth, stage.clientHeight, params, {
      viewportWidth: globalThis.innerWidth, viewportHeight: globalThis.innerHeight,
    });
  }

  function showStart() {
    setPhase(null);
    root.innerHTML = shell(`<section class="t6-start">
      <h1 data-ref="title"></h1>
      <p>矢印キー、または操縦用の円を指・マウスで動かして機体を操縦します。横画面では左右ボタンで円の側を選べます。縦画面ではトンネルが上、操縦円が下です。</p>
          <p>半円、回転する羽根(開口1〜3個)、回転する扇形、縁の小穴(開口1〜3個)を通り抜けます。</p>
      <p class="muted">衝突すると速度が半分になり、安全な開口方向へ押し戻されます。制限時間は <span data-ref="duration"></span>です。</p>
      <p class="notice notice-error" data-ref="layoutError" hidden></p>
      <button class="btn btn-primary btn-large" type="button" data-ref="start">開始</button>
    </section>`);
    root.querySelector('[data-ref="title"]').textContent = meta.name;
    root.querySelector('[data-ref="duration"]').textContent = formatDuration(params.durationSec);
    const startBtn = root.querySelector('[data-ref="start"]');
    const checkSize = () => {
      const error = root.querySelector('[data-ref="layoutError"]');
      try { layoutForStage(root.querySelector('[data-ref="stage"]')); startBtn.disabled = false; error.hidden = true; }
      catch (e) { startBtn.disabled = true; error.textContent = e.message; error.hidden = false; }
    };
    startBtn.addEventListener('click', () => { checkSize(); if (!startBtn.disabled) startPlay(); });
    root.querySelector('[data-ref="side"]').addEventListener('click', () => { swapSide(); checkSize(); });
    root.querySelector('[data-ref="quit"]').addEventListener('click', () => ctx.navigate('#/'));
    globalThis.addEventListener('resize', checkSize);
    updateSideLabel();
    checkSize();
    startBtn.focus();
    setPhase(() => globalThis.removeEventListener('resize', checkSize));
  }

  function startPlay() {
    setPhase(null);
    const rng = createRng(randomSeed());
    let state = createT6State(rng, params);
    const pressedKeys = new Set();
    let stickInput = { x: 0, y: 0 };
    let activePointerId = null;
    let lastFrameTs = null;
    let layout = null;
    let disposed = false;

    root.innerHTML = shell();
    updateSideLabel();
    const $ = name => root.querySelector(`[data-ref="${name}"]`);
    const canvas = $('canvas');
    const stage = $('stage');
    const live = $('live');
    const drawCtx = canvas.getContext('2d');

    function resizeCanvas() {
      layout = layoutForStage(stage);
      const { width, height } = layout;
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
    }

    function pointerPosition(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function onPointerDown(e) {
      if (!layout || activePointerId !== null) return;
      const input = stickInputAt(pointerPosition(e), layout);
      if (input === null) return;
      e.preventDefault();
      activePointerId = e.pointerId;
      canvas.setPointerCapture?.(e.pointerId);
      stickInput = input;
    }

    function onPointerMove(e) {
      if (e.pointerId !== activePointerId || !layout) return;
      e.preventDefault();
      const point = pointerPosition(e);
      const dx = point.x - layout.stick.centerX;
      const dy = layout.stick.centerY - point.y;
      stickInput = combineInputs({ x: 0, y: 0 }, {
        x: dx / layout.stick.radius,
        y: dy / layout.stick.radius,
      });
    }

    function stopPointer(e) {
      if (e.pointerId !== activePointerId) return;
      stickInput = { x: 0, y: 0 };
      activePointerId = null;
    }

    function onKeyDown(e) {
      if (!e.key.startsWith('Arrow')) return;
      e.preventDefault();
      pressedKeys.add(e.key);
    }

    function onKeyUp(e) {
      if (!e.key.startsWith('Arrow')) return;
      e.preventDefault();
      pressedKeys.delete(e.key);
    }

    function clearControls() {
      pressedKeys.clear();
      stickInput = { x: 0, y: 0 };
      if (activePointerId !== null && canvas.hasPointerCapture?.(activePointerId)) canvas.releasePointerCapture(activePointerId);
      activePointerId = null;
    }

    function onResize() {
      clearControls();
      try { resizeCanvas(); }
      catch (e) { abort(`${e.message}(記録は保存していません)`); }
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
      try { resizeCanvas(); }
      catch (e) { abort(`${e.message}(記録は保存していません)`); return; }
      const input = combineInputs(keyboardInput(pressedKeys), stickInput);
      state = stepT6State(state, input, dtSec, params, rng);
      drawScene(drawCtx, layout, state, params, stickInput);
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
        clearControls();
        abort(`${meta.name}は、画面が切り替わったため中断しました(記録は保存していません)`);
      }
    }

    function onQuit() {
      setPhase(null);
      ctx.navigate('#/');
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', stopPointer);
    canvas.addEventListener('pointercancel', stopPointer);
    canvas.addEventListener('lostpointercapture', stopPointer);
    document.addEventListener('keydown', onKeyDown, { passive: false });
    document.addEventListener('keyup', onKeyUp, { passive: false });
    globalThis.addEventListener('blur', clearControls);
    $('quit').addEventListener('click', onQuit);
    $('side').addEventListener('click', () => { clearControls(); swapSide(); onResize(); });
    document.addEventListener('visibilitychange', onVisibility);
    globalThis.addEventListener('resize', onResize);

    resizeCanvas();
    drawScene(drawCtx, layout, state, params, stickInput);
    const timer = startTimer({
      durationMs: params.durationSec * 1000,
      onFrame,
      onEnd,
      remainingEl: $('remaining'),
    });

    setPhase(() => {
      disposed = true;
      timer.stop();
      clearControls();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', stopPointer);
      canvas.removeEventListener('pointercancel', stopPointer);
      canvas.removeEventListener('lostpointercapture', stopPointer);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      globalThis.removeEventListener('blur', clearControls);
      document.removeEventListener('visibilitychange', onVisibility);
      globalThis.removeEventListener('resize', onResize);
    });
  }

  showStart();
  return () => {
    setPhase(null);
  };
}
