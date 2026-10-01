// テスト6 トンネル飛行: Canvas描画、Pointer Events、開始・中断・結果画面。
// 座標変換・物理・衝突・採点は js/logic/t6.js に任せる。
// 2026-09-30 本番に合わせて変更: 一人称視点(画面の中心が自機)。飛行機の絵と、手前に流れる輪はやめた。

import {
  computeTunnelLayout, stickInputAt, stickVectorAt, keyboardInput,
  projectScale, projectTunnelSection, tunnelBackdrop, centerRimArcs, drawableObstacles, holeCenters, holeRadiusFor,
  createT6State, stepT6State, buildT6Record,
} from '../logic/t6.js';
import { createRng, randomSeed } from '../core/rng.js';
import { startTimer, formatDuration } from '../core/timer.js';
import { appendRecord, readSettingsRaw, saveSettings } from '../core/storage.js';
import { withoutDefaults } from '../logic/settings-form.js';
import { renderResult } from '../core/result.js';
import { findTest, formatDetail } from '../core/catalog.js';
import { T6_COLOR_OPTIONS, DEFAULTS } from '../core/settings.js';

const DEG = Math.PI / 180;
const RADIAL_LINES = 12; // 消失点から画面の外周の円まで引く放射状の線の本数(2026-10-01 7回目で、ずらした縁までから変更)
// トンネルの中の暗い色。描く範囲の外(操縦の円のまわり)も同じ色
// (2026-10-01 7回目: 6回目の明るい青の壁の塗りをやめ、5回目までの暗い色に戻した)
const TUNNEL_COLOR = '#07101f';

// 中心の円の枠線: 塞がった部分と接する弧だけ(開いた方向には描かない。7回目)
function strokeCenterRim(ctx, obstacle, section, p) {
  for (const arc of centerRimArcs(obstacle, p)) {
    ctx.beginPath();
    ctx.arc(section.centerX, section.centerY, section.radius * p.centerOpenRadius, -arc.fromDeg * DEG, -arc.toDeg * DEG, true);
    ctx.stroke();
  }
}

// 断面の座標(トンネル半径1、y が上)を画面へ
function toScreen(section, x, y) {
  return { x: section.centerX + x * section.radius, y: section.centerY - y * section.radius };
}

// 角度 fromDeg から toDeg まで(反時計回り)の、内側の半径 inner〜外側 1 の帯を塗る
function fillAnnularSector(ctx, section, fromDeg, toDeg, inner) {
  const { centerX: cx, centerY: cy, radius } = section;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, -fromDeg * DEG, -toDeg * DEG, true);
  ctx.arc(cx, cy, radius * inner, -toDeg * DEG, -fromDeg * DEG, false);
  ctx.closePath();
  ctx.fill();
}

function strokeRadialEdge(ctx, section, deg, inner) {
  const rad = deg * DEG;
  const from = toScreen(section, Math.cos(rad) * inner, Math.sin(rad) * inner);
  const to = toScreen(section, Math.cos(rad), Math.sin(rad));
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function strokeCircle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHalf(ctx, obstacle, section) {
  const { centerX: cx, centerY: cy, radius } = section;
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

// 羽根: 開口の間をふさぐ。中心の安全円(centerOpenRadius)は抜く(2026-09-30 本番に合わせて変更)。
// 中心の円の縁には、塞がった部分と接する弧にだけ枠線を描く(2026-10-01 6回目で消し、7回目で開いた方向を除いて戻した)
function drawBlades(ctx, obstacle, section, p) {
  const count = obstacle.openingCount;
  const half = p.bladeOpeningDeg / 2;
  const inner = p.centerOpenRadius;
  for (let i = 0; i < count; i++) {
    const center = obstacle.rotationDeg + i * 360 / count;
    const next = obstacle.rotationDeg + (i + 1) * 360 / count;
    fillAnnularSector(ctx, section, center + half, next - half, inner);
  }
  for (let i = 0; i < count; i++) {
    const center = obstacle.rotationDeg + i * 360 / count;
    strokeRadialEdge(ctx, section, center - half, inner);
    strokeRadialEdge(ctx, section, center + half, inner);
  }
  strokeCenterRim(ctx, obstacle, section, p);
}

// 扇形: 90°だけ開き、中心の安全円は抜く(2026-09-30 本番に合わせて変更)
function drawSector(ctx, obstacle, section, p) {
  const half = p.sectorOpeningDeg / 2;
  const inner = p.centerOpenRadius;
  fillAnnularSector(ctx, section, obstacle.openCenterDeg + half, obstacle.openCenterDeg + 360 - half, inner);
  strokeRadialEdge(ctx, section, obstacle.openCenterDeg - half, inner);
  strokeRadialEdge(ctx, section, obstacle.openCenterDeg + half, inner);
  strokeCenterRim(ctx, obstacle, section, p);
}

function drawHoles(ctx, obstacle, section, p) {
  const { centerX: cx, centerY: cy, radius } = section;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  for (const center of holeCenters(obstacle, p)) {
    const { x, y } = toScreen(section, center.x, center.y);
    const holeRadius = holeRadiusFor(obstacle, p) * radius;
    ctx.moveTo(x + holeRadius, y);
    ctx.arc(x, y, holeRadius, 0, Math.PI * 2);
  }
  ctx.fill('evenodd');
  for (const center of holeCenters(obstacle, p)) {
    const { x, y } = toScreen(section, center.x, center.y);
    strokeCircle(ctx, x, y, holeRadiusFor(obstacle, p) * radius);
  }
}

// 回転する長方形: 中心を通る長さ barLength・幅 barWidth の長方形の中だけが通れるので、
// 長方形の穴が開いた板の形に描き、長方形の4辺に枠線を引く(2026-09-30 追加。反転を経て、7回目で両端も塞いだ)
function drawBar(ctx, obstacle, section, p) {
  const rad = obstacle.rotationDeg * DEG;
  const u = { x: Math.cos(rad), y: Math.sin(rad) };
  const n = { x: -u.y, y: u.x };
  const l = p.barLength / 2;
  const w = p.barWidth / 2;
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => toScreen(section, u.x * l * a + n.x * w * b, u.y * l * a + n.y * w * b));
  ctx.save();
  ctx.beginPath();
  ctx.arc(section.centerX, section.centerY, section.radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(section.centerX - section.radius, section.centerY - section.radius, section.radius * 2, section.radius * 2);
  corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
  ctx.closePath();
  ctx.fill('evenodd');
  ctx.beginPath();
  corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// 操縦の円。つまみは自機の位置(円の縁 = 機体が動ける範囲の端)
function drawStick(ctx, layout, position, p) {
  const { centerX, centerY, radius } = layout.stick;
  ctx.save();
  ctx.fillStyle = 'rgba(30, 55, 83, 0.82)';
  ctx.strokeStyle = '#75a8d8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const knobX = centerX + position.x / p.aircraftMaxRadius * radius;
  const knobY = centerY - position.y / p.aircraftMaxRadius * radius;
  ctx.fillStyle = '#69b7ff';
  ctx.strokeStyle = '#f4f8ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(knobX, knobY, Math.max(12, radius * 0.28), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawScene(ctx, layout, state, p) {
  const { width, height } = layout;
  const view = layout.tunnel;
  const { centerX: cx, centerY: cy, radius: viewRadius } = view;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = TUNNEL_COLOR;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, viewRadius, 0, Math.PI * 2);
  ctx.clip();

  // 画面の枠(7回目): 外周の円の中はトンネルの中と同じ暗い色のまま。放射状の線は外周まで伸ばす。
  // 自機の位置に合わせて動く縁の弧は描かない
  const backdrop = tunnelBackdrop(view, RADIAL_LINES);
  ctx.strokeStyle = 'rgba(110, 170, 230, 0.32)';
  ctx.lineWidth = 1;
  for (const line of backdrop.filter(item => item.kind === 'radial')) {
    ctx.beginPath();
    ctx.moveTo(line.from.x, line.from.y);
    ctx.lineTo(line.to.x, line.to.y);
    ctx.stroke();
  }

  const fill = T6_COLOR_OPTIONS.obstacle.find(color => color.name === p.obstacleColor)?.value ?? T6_COLOR_OPTIONS.obstacle[0].value;
  const stroke = T6_COLOR_OPTIONS.edge.find(color => color.name === p.obstacleEdgeColor)?.value ?? T6_COLOR_OPTIONS.edge[0].value;
  const visible = drawableObstacles(state.obstacles, p).sort((a, b) => b.z - a.z);
  for (const obstacle of visible) {
    const section = projectTunnelSection(state.position, obstacle.z, view, p);
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1.5, 4 * projectScale(p.perspectiveFocal, obstacle.z));
    if (obstacle.type === 'half') drawHalf(ctx, obstacle, section);
    else if (obstacle.type === 'blades') drawBlades(ctx, obstacle, section, p);
    else if (obstacle.type === 'sector') drawSector(ctx, obstacle, section, p);
    else if (obstacle.type === 'bar') drawBar(ctx, obstacle, section, p);
    else drawHoles(ctx, obstacle, section, p);
    strokeCircle(ctx, section.centerX, section.centerY, section.radius);
  }
  ctx.restore();

  // 画面の外枠(描く範囲)は動かさない。見える枠の線はこの円だけ(7回目)
  ctx.strokeStyle = 'rgba(117, 168, 216, 0.45)';
  ctx.lineWidth = 2;
  strokeCircle(ctx, cx, cy, viewRadius);
  drawStick(ctx, layout, state.position, p);

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
        <button class="btn btn-quiet" type="button" data-ref="quit">${intro ? 'ホーム' : '途中終了'}</button>
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
    // 既定値と違う項目だけを保存する(2026-10-01 7回目で変更)
    const result = raw.ok ? saveSettings(ctx.store, { ...saved, t6: withoutDefaults({ ...(saved.t6 ?? {}), stickSide: side }, DEFAULTS.t6) }) : raw;
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
      <p>トンネルの中を進みます。画面の中心が自分の位置です。操縦用の円の中の位置が、そのまま自分の位置になります(円の中心 = トンネルの中心、指・マウスを離すとその位置のまま)。矢印キーでも動かせます。横画面では左右ボタンで円の側を選べます。縦画面ではトンネルが上、操縦円が下です。</p>
      <p>半円、回転する羽根(開口1〜2個)、回転する扇形、縁の小穴(開口1〜3個)、回転する長方形(長方形の穴の中だけ通れる)を通り抜けます。羽根と扇形は中心も通れます。</p>
      <p class="muted">衝突すると速度が落ち、少し手前へ巻き戻されます。ぶつかった障害物を通過するまでは遅いままです。よけなければ、同じ障害物にまた衝突します。制限時間は <span data-ref="duration"></span>です。</p>
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
    let stickVector = null; // 操縦の円を押している間の、円の中の位置(離したら null。自機はその位置のまま)
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
      stickVector = input;
    }

    function onPointerMove(e) {
      if (e.pointerId !== activePointerId || !layout) return;
      e.preventDefault();
      stickVector = stickVectorAt(pointerPosition(e), layout); // 円の外へ出たら縁に収める
    }

    function stopPointer(e) {
      if (e.pointerId !== activePointerId) return;
      stickVector = null;
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
      stickVector = null;
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
      state = stepT6State(state, { stick: stickVector, keys: keyboardInput(pressedKeys) }, dtSec, params, rng);
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
