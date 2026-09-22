import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { DEFAULTS } from '../js/core/settings.js';
import {
  normalizeAngleDeg, angularDistanceDeg, toPolar, clampToTunnel,
  normalizeInput, keyboardInput, combineInputs, moveAircraft,
  computeTunnelLayout, stickInputAt,
  projectScale, baseSpeedAt, advanceSpeed, applyCollisionSpeed,
  createObstacle, createInitialObstacles, advanceObstacle, recycleObstacles, drawableObstacles,
  crossedAircraftPlane, isHalfOpeningSafe, isBladeOpeningSafe, isObstacleSafe,
  isSectorOpeningSafe, holeCenters, isHoleOpeningSafe,
  safeDirection, createT6State, stepT6State, summarizeT6, buildT6Record,
} from '../js/logic/t6.js';

const P = DEFAULTS.t6;
const approx = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

test('T6 の既定値は承認済みの数値', () => {
  assert.deepEqual(P, {
    durationSec: 180,
    moveSpeed: 1,
    collisionSpeedFactor: 0.5,
    initialSpeed: 0.8,
    acceleration: 0.02,
    recoveryAcceleration: 0.16,
    maxSpeed: 1.6,
    obstacleSpacing: 2.4,
    firstObstacleDistance: 5,
    bladeOpeningDeg: 60,
    bladeHubRadius: 0.18,
    bladeInitialAngularSpeedDegSec: 30,
    bladeAngularAccelerationDegSec2: 0.15,
    collisionPushMs: 350,
    collisionPushDistance: 0.28,
    aircraftMaxRadius: 0.86,
    canvasMarginPx: 8,
    stickRadiusRatio: 0.14,
    stickMinRadiusPx: 48,
    stickMaxRadiusPx: 90,
    layoutStackMinTunnelRatio: 0.3,
    stallAbortMs: 1000,
    perspectiveFocal: 1,
    collisionZ: 1,
    farZ: 12,
    tunnelRingSpacing: 0.75,
    sectorOpeningDeg: 90,
    holeSlotCount: 8,
    holeOpenCount: 3,
    holeRingRadius: 0.6,
    holeRadius: 0.2,
  });
});

test('角度を 0°以上360°未満へ正規化する', () => {
  assert.equal(normalizeAngleDeg(0), 0);
  assert.equal(normalizeAngleDeg(360), 0);
  assert.equal(normalizeAngleDeg(-10), 350);
  assert.equal(normalizeAngleDeg(725), 5);
});

test('角度差は 0°/360° をまたいだ短い側を使う', () => {
  assert.equal(angularDistanceDeg(350, 10), 20);
  assert.equal(angularDistanceDeg(10, 350), 20);
  assert.equal(angularDistanceDeg(0, 180), 180);
});

test('直交座標を極座標へ変換する', () => {
  assert.deepEqual(toPolar({ x: 1, y: 0 }), { radius: 1, angleDeg: 0 });
  assert.deepEqual(toPolar({ x: 0, y: 1 }), { radius: 1, angleDeg: 90 });
  assert.deepEqual(toPolar({ x: 0, y: -1 }), { radius: 1, angleDeg: 270 });
});

test('機体をトンネルの内側へ制限し、元の位置は書き換えない', () => {
  const pos = { x: 2, y: 0 };
  const got = clampToTunnel(pos, P.aircraftMaxRadius);
  approx(got.x, P.aircraftMaxRadius);
  approx(got.y, 0);
  assert.deepEqual(pos, { x: 2, y: 0 });
});

test('入力は長さ1で頭打ちにし、キーボードの斜め入力を正規化する', () => {
  assert.deepEqual(normalizeInput({ x: 0.3, y: -0.4 }), { x: 0.3, y: -0.4 });
  const diagonal = keyboardInput(new Set(['ArrowUp', 'ArrowRight']));
  approx(Math.hypot(diagonal.x, diagonal.y), 1);
  approx(diagonal.x, Math.SQRT1_2);
  approx(diagonal.y, Math.SQRT1_2);
});

test('キーボードとスティックの入力を足して長さ1で頭打ちにする', () => {
  const got = combineInputs({ x: 1, y: 0 }, { x: 0, y: 1 });
  approx(Math.hypot(got.x, got.y), 1);
  approx(got.x, Math.SQRT1_2);
  approx(got.y, Math.SQRT1_2);
});

test('位置は入力×moveSpeed×dtで動き、入力0なら止まり、刻みが違っても同じ', () => {
  const start = { x: 0, y: 0 };
  assert.deepEqual(moveAircraft(start, { x: 0, y: 0 }, 1, P), start);
  const once = moveAircraft(start, { x: 0.5, y: -0.25 }, 1, P);
  const half = moveAircraft(start, { x: 0.5, y: -0.25 }, 0.5, P);
  const twice = moveAircraft(half, { x: 0.5, y: -0.25 }, 0.5, P);
  approx(once.x, twice.x);
  approx(once.y, twice.y);
});

for (const [width, height] of [[1180, 820], [844, 390]]) {
  test(`${width}×${height}: トンネルとスティックは重ならず画面内で、スティック半径44px以上`, () => {
    const layout = computeTunnelLayout(width, height, P);
    assert.ok(layout.tunnel.radius > 0);
    assert.ok(layout.stick.radius >= 44);
    for (const circle of [layout.tunnel, layout.stick]) {
      assert.ok(circle.centerX - circle.radius >= 0);
      assert.ok(circle.centerX + circle.radius <= width);
      assert.ok(circle.centerY - circle.radius >= 0);
      assert.ok(circle.centerY + circle.radius <= height);
    }
    const distance = Math.hypot(
      layout.tunnel.centerX - layout.stick.centerX,
      layout.tunnel.centerY - layout.stick.centerY,
    );
    assert.ok(distance >= layout.tunnel.radius + layout.stick.radius);
  });
}

test('スティックは中心で入力0、縁で長さ1、円外は無効', () => {
  const layout = computeTunnelLayout(1180, 820, P);
  const { centerX, centerY, radius } = layout.stick;
  assert.deepEqual(stickInputAt({ x: centerX, y: centerY }, layout), { x: 0, y: 0 });
  assert.deepEqual(stickInputAt({ x: centerX + radius, y: centerY }, layout), { x: 1, y: 0 });
  assert.equal(stickInputAt({ x: centerX + radius + 1, y: centerY }, layout), null);
});

test('投影倍率は z が2倍なら半分になる', () => {
  approx(projectScale(P.perspectiveFocal, 2), projectScale(P.perspectiveFocal, 1) / 2);
});

test('投影は z が0以下・非数なら拒否する', () => {
  for (const z of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => projectScale(P.perspectiveFocal, z), /z は0より大きい有限値/);
  }
});

test('半円型は上下左右の塞がる側を判定し、直径上は衝突', () => {
  const cases = [
    ['up', { x: 0, y: 0.5 }, { x: 0, y: -0.5 }],
    ['down', { x: 0, y: -0.5 }, { x: 0, y: 0.5 }],
    ['left', { x: -0.5, y: 0 }, { x: 0.5, y: 0 }],
    ['right', { x: 0.5, y: 0 }, { x: -0.5, y: 0 }],
  ];
  for (const [side, blocked, open] of cases) {
    assert.equal(isHalfOpeningSafe(blocked, side), false, side);
    assert.equal(isHalfOpeningSafe(open, side), true, side);
    assert.equal(isHalfOpeningSafe({ x: side === 'up' || side === 'down' ? 0.5 : 0, y: side === 'left' || side === 'right' ? 0.5 : 0 }, side), false, `${side} boundary`);
  }
});

test('3枚羽根は開口中心だけ安全で、ちょうど端は衝突', () => {
  const at = deg => ({ x: Math.cos(deg * Math.PI / 180) * 0.6, y: Math.sin(deg * Math.PI / 180) * 0.6 });
  assert.equal(isBladeOpeningSafe(at(0), 0, P), true);
  assert.equal(isBladeOpeningSafe(at(29.999), 0, P), true);
  assert.equal(isBladeOpeningSafe(at(30), 0, P), false);
  assert.equal(isBladeOpeningSafe(at(30.001), 0, P), false);
});

test('3枚羽根は0°/360°をまたぐ開口を判定する', () => {
  const at = deg => ({ x: Math.cos(deg * Math.PI / 180) * 0.6, y: Math.sin(deg * Math.PI / 180) * 0.6 });
  assert.equal(isBladeOpeningSafe(at(350), 0, P), true);
  assert.equal(isBladeOpeningSafe(at(10), 0, P), true);
  assert.equal(isBladeOpeningSafe(at(330), 0, P), false);
});

test('3枚羽根は中心小円の内側と縁を塞ぐ', () => {
  assert.equal(isBladeOpeningSafe({ x: 0, y: 0 }, 0, P), false);
  assert.equal(isBladeOpeningSafe({ x: P.bladeHubRadius, y: 0 }, 0, P), false);
  assert.equal(isBladeOpeningSafe({ x: P.bladeHubRadius + 0.001, y: 0 }, 0, P), true);
});

test('3枚羽根は現在の回転角を衝突判定に使う', () => {
  const p = { x: 0.6, y: 0 };
  assert.equal(isBladeOpeningSafe(p, 0, P), true);
  assert.equal(isBladeOpeningSafe(p, 60, P), false);
  assert.equal(isObstacleSafe({ type: 'blades', rotationDeg: 60 }, p, P), false);
});

test('扇形は90°の内側だけ安全で、辺・中心は衝突', () => {
  const at = (deg, radius = 0.6) => ({
    x: Math.cos(deg * Math.PI / 180) * radius,
    y: Math.sin(deg * Math.PI / 180) * radius,
  });
  assert.equal(isSectorOpeningSafe(at(45), 45, P), true);
  assert.equal(isSectorOpeningSafe(at(0), 45, P), false); // 辺ちょうど
  assert.equal(isSectorOpeningSafe(at(90), 45, P), false); // 辺ちょうど
  assert.equal(isSectorOpeningSafe({ x: 0, y: 0 }, 45, P), false);
});

test('315°の扇形は0°/360°をまたいだ内側だけ安全', () => {
  const at = deg => ({ x: Math.cos(deg * Math.PI / 180) * 0.6, y: Math.sin(deg * Math.PI / 180) * 0.6 });
  assert.equal(isSectorOpeningSafe(at(350), 315, P), true);
  assert.equal(isSectorOpeningSafe(at(10), 315, P), false);
  assert.equal(isSectorOpeningSafe(at(270), 315, P), false); // 辺
  assert.equal(isSectorOpeningSafe(at(0), 315, P), false); // 反対側の辺
});

test('小穴は穴の中だけ安全で、縁・外・穴にしていない位置は衝突', () => {
  const obstacle = { type: 'holes', openSlots: [4, 2, 5] };
  const centers = holeCenters(obstacle, P);
  assert.equal(centers.length, 3);
  const open = centers[0];
  assert.equal(isHoleOpeningSafe(open, obstacle, P), true);
  assert.equal(isHoleOpeningSafe({ x: open.x + P.holeRadius, y: open.y }, obstacle, P), false);
  assert.equal(isHoleOpeningSafe({ x: open.x + P.holeRadius + 0.001, y: open.y }, obstacle, P), false);
  const closedAngle = 1 * 360 / P.holeSlotCount;
  const closed = {
    x: Math.cos(closedAngle * Math.PI / 180) * P.holeRingRadius,
    y: Math.sin(closedAngle * Math.PI / 180) * P.holeRingRadius,
  };
  assert.equal(isHoleOpeningSafe(closed, obstacle, P), false);
});

test('小穴の3か所はすべて異なる', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const obstacle = createObstacle(createRng(seed), 6, seed, P);
    if (obstacle.type !== 'holes') continue;
    assert.equal(obstacle.openSlots.length, P.holeOpenCount);
    assert.equal(new Set(obstacle.openSlots).size, P.holeOpenCount, `seed=${seed}`);
  }
});

test('障害物が機体面をまたいだ瞬間だけ判定する', () => {
  assert.equal(crossedAircraftPlane(1.1, 0.9, P.collisionZ), true);
  assert.equal(crossedAircraftPlane(1.1, 1.01, P.collisionZ), false);
  assert.equal(crossedAircraftPlane(1, 0.9, P.collisionZ), false);
});

test('衝突時の安全方向を返す', () => {
  assert.deepEqual(safeDirection({ type: 'half', blockedSide: 'up' }, { x: 0, y: 0 }, P), { x: 0, y: -1 });
  const d = safeDirection({ type: 'blades', rotationDeg: 0 }, { x: 0, y: 0 }, P);
  approx(Math.hypot(d.x, d.y), 1);
  const sector = safeDirection({ type: 'sector', openCenterDeg: 135 }, { x: 0, y: 0 }, P);
  approx(sector.x, -Math.SQRT1_2);
  approx(sector.y, Math.SQRT1_2);
  const holes = safeDirection({ type: 'holes', openSlots: [0, 2, 4] }, { x: 0.2, y: 0 }, P);
  approx(holes.x, 1);
  approx(holes.y, 0);
});

test('衝突がなければ速度は baseSpeed と同じ', () => {
  for (const t of [0, 10, 40, 100]) {
    assert.equal(baseSpeedAt(t, P), Math.min(P.maxSpeed, P.initialSpeed + P.acceleration * t));
    assert.equal(advanceSpeed(baseSpeedAt(t, P), t + 1, 1, P), baseSpeedAt(t + 1, P));
  }
});

test('衝突で速度が50%になり、約5秒で baseSpeed へ戻り、超えない', () => {
  const t = 100;
  const base = baseSpeedAt(t, P);
  let speed = applyCollisionSpeed(base, P);
  assert.equal(speed, base * 0.5);
  for (let i = 1; i <= 5; i++) {
    speed = advanceSpeed(speed, t + i, 1, P);
    assert.ok(speed <= baseSpeedAt(t + i, P));
  }
  approx(speed, baseSpeedAt(t + 5, P));
});

test('障害物生成は同じシードで同じになり、初期配置は一定間隔', () => {
  assert.deepEqual(createObstacle(createRng(7), 6, 1, P), createObstacle(createRng(7), 6, 1, P));
  const obs = createInitialObstacles(createRng(9), P);
  assert.ok(obs.length >= 2);
  for (let i = 1; i < obs.length; i++) approx(obs[i].z - obs[i - 1].z, P.obstacleSpacing);
});

test('多数シードで4種類・半円4方向・羽根2回転方向・扇形4方向が出る', () => {
  const types = new Set(), sides = new Set(), directions = new Set(), sectors = new Set();
  for (let seed = 1; seed <= 500; seed++) {
    const obstacle = createObstacle(createRng(seed), 6, seed, P);
    types.add(obstacle.type);
    if (obstacle.type === 'half') sides.add(obstacle.blockedSide);
    else if (obstacle.type === 'blades') directions.add(obstacle.rotationDirection);
    else if (obstacle.type === 'sector') sectors.add(obstacle.openCenterDeg);
  }
  assert.deepEqual([...types].sort(), ['blades', 'half', 'holes', 'sector']);
  assert.deepEqual([...sides].sort(), ['down', 'left', 'right', 'up']);
  assert.deepEqual([...directions].sort((a, b) => a - b), [-1, 1]);
  assert.deepEqual([...sectors].sort((a, b) => a - b), [45, 135, 225, 315]);
});

test('回転する羽根は経過時間と回転方向で角度が変わる', () => {
  const cw = { id: 1, type: 'blades', z: 5, rotationDeg: 10, rotationDirection: 1 };
  const ccw = { ...cw, rotationDirection: -1 };
  assert.ok(advanceObstacle(cw, 0, 1, 1, P).rotationDeg > 10);
  assert.ok(normalizeAngleDeg(advanceObstacle(ccw, 0, 1, 1, P).rotationDeg - 10) > 180);
});

test('判定後はその場で奥へ戻り、描画対象はすべて機体面より奥', () => {
  const expired = { id: 1, type: 'half', blockedSide: 'up', z: P.collisionZ };
  const far = { id: 2, type: 'half', blockedSide: 'down', z: 8 };
  const got = recycleObstacles([expired, far], createRng(3), P);
  assert.ok(got.every(o => o.z > P.collisionZ));
  assert.ok(got.find(o => o.id === 1).z > far.z);
  assert.ok(drawableObstacles(got, P).every(o => o.z > P.collisionZ));
  assert.deepEqual(drawableObstacles([{ ...far, z: P.collisionZ }, far], P), [far]);
});

test('T6 状態は安全通過と衝突を別に数え、実際の最高速度を持つ', () => {
  const openObstacle = { id: 1, type: 'half', blockedSide: 'up', z: 1.01 };
  const hitObstacle = { id: 2, type: 'half', blockedSide: 'down', z: 1.01 };
  const state = {
    ...createT6State(createRng(1), P),
    position: { x: 0, y: -0.6 },
    obstacles: [openObstacle, hitObstacle], speed: 1, maxSpeedReached: 1,
  };
  const next = stepT6State(state, { x: 0, y: 0 }, 0.02, P, createRng(2));
  assert.equal(next.cleared, 1);
  assert.equal(next.collisions, 1);
  assert.equal(next.speed, applyCollisionSpeed(baseSpeedAt(next.elapsedSec, P), P));
  assert.ok(next.maxSpeedReached >= 1);
  assert.ok(next.obstacles.every(o => o.z > P.collisionZ));
});

test('状態を1フレーム進めても元の状態を書き換えない', () => {
  const state = createT6State(createRng(11), P);
  const before = structuredClone(state);
  stepT6State(state, { x: 0.5, y: -0.25 }, 1 / 60, P, createRng(12));
  assert.deepEqual(state, before);
});

test('入力で移動し、入力を離すと即停止し、押し戻し中は入力を無視する', () => {
  const rng = createRng(20);
  const initial = { ...createT6State(rng, P), obstacles: [], speed: 0 };
  const moved = stepT6State(initial, { x: 1, y: 0 }, 0.5, P, createRng(21));
  approx(moved.position.x, 0.5);
  const stopped = stepT6State(moved, { x: 0, y: 0 }, 0.5, P, createRng(22));
  approx(stopped.position.x, moved.position.x);
  const pushing = {
    ...stopped,
    pushback: { from: stopped.position, to: { x: -0.2, y: 0 }, elapsedMs: 0 },
  };
  const duringPush = stepT6State(pushing, { x: 1, y: 0 }, 0.1, P, createRng(23));
  assert.ok(duringPush.position.x < pushing.position.x);
});

test('採点と記録は成功通過数、衝突、距離、実際の最高速度を保存する', () => {
  const state = { ...createT6State(createRng(1), P), cleared: 7, collisions: 2, distance: 12.345, maxSpeedReached: 1.2345 };
  assert.deepEqual(summarizeT6(state), {
    score: 7,
    detail: { collisions: 2, distance: 12.3, maxSpeed: 1.23 },
  });
  const date = '2026-09-23T10:15:00.000Z';
  const record = buildT6Record({ date, state, settings: P });
  assert.equal(record.id, `${date}-t6`);
  assert.equal(record.test, 't6');
  assert.deepEqual(record.settings, { ...P });
  assert.notEqual(record.settings, P);
});
