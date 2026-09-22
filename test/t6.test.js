import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { DEFAULTS } from '../js/core/settings.js';
import {
  normalizeAngleDeg, angularDistanceDeg, toPolar, clampToTunnel,
  followPosition, computeTunnelLayout, sectionToPointer, pointerToSection,
  projectScale, baseSpeedAt, advanceSpeed, applyCollisionSpeed,
  createObstacle, createInitialObstacles, advanceObstacle, recycleObstacles,
  crossedAircraftPlane, isHalfOpeningSafe, isBladeOpeningSafe, isObstacleSafe,
  safeDirection, createT6State, stepT6State, summarizeT6, buildT6Record,
} from '../js/logic/t6.js';

const P = DEFAULTS.t6;
const approx = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

test('T6 の既定値は承認済みの数値', () => {
  assert.deepEqual(P, {
    durationSec: 180,
    followRate: 0.2,
    followReferenceFps: 60,
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
    touchOffsetRatio: 0.12,
    aircraftMaxRadius: 0.86,
    canvasMarginPx: 8,
    stallAbortMs: 1000,
    perspectiveFocal: 1,
    collisionZ: 1,
    nearZ: 0.35,
    farZ: 12,
    tunnelRingSpacing: 0.75,
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

test('追従は60Hzの1フレームで差の20%進む', () => {
  const got = followPosition({ x: 0, y: 0 }, { x: 1, y: -1 }, 1000 / 60, P);
  approx(got.x, 0.2);
  approx(got.y, -0.2);
});

test('追従はフレームの刻みが違っても同じ実時間なら同じ位置', () => {
  const start = { x: 0, y: 0 }, target = { x: 0.8, y: -0.4 };
  const once = followPosition(start, target, 1000 / 30, P);
  const half = followPosition(start, target, 1000 / 60, P);
  const twice = followPosition(half, target, 1000 / 60, P);
  approx(once.x, twice.x);
  approx(once.y, twice.y);
});

for (const [width, height] of [[1180, 820], [844, 390]]) {
  test(`${width}×${height}: 指で機体を上下左右の端へ置ける`, () => {
    const layout = computeTunnelLayout(width, height, P);
    assert.ok(layout.radius > 0);
    for (const position of [
      { x: P.aircraftMaxRadius, y: 0 }, { x: -P.aircraftMaxRadius, y: 0 },
      { x: 0, y: P.aircraftMaxRadius }, { x: 0, y: -P.aircraftMaxRadius },
    ]) {
      const pointer = sectionToPointer(position, layout, 'touch');
      assert.ok(pointer.x >= 0 && pointer.x <= width, `x=${pointer.x}`);
      assert.ok(pointer.y >= 0 && pointer.y <= height, `y=${pointer.y}`);
      const roundTrip = pointerToSection(pointer, layout, 'touch', P.aircraftMaxRadius);
      approx(roundTrip.x, position.x);
      approx(roundTrip.y, position.y);
    }
  });
}

test('タッチだけ機体を指の12%上へずらし、マウスはずらさない', () => {
  const layout = computeTunnelLayout(1180, 820, P);
  const center = { x: 0, y: 0 };
  const touch = sectionToPointer(center, layout, 'touch');
  const mouse = sectionToPointer(center, layout, 'mouse');
  approx(touch.y - mouse.y, 820 * P.touchOffsetRatio);
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

test('障害物が機体面をまたいだ瞬間だけ判定する', () => {
  assert.equal(crossedAircraftPlane(1.1, 0.9, P.collisionZ), true);
  assert.equal(crossedAircraftPlane(1.1, 1.01, P.collisionZ), false);
  assert.equal(crossedAircraftPlane(1, 0.9, P.collisionZ), false);
});

test('衝突時の安全方向を返す', () => {
  assert.deepEqual(safeDirection({ type: 'half', blockedSide: 'up' }, { x: 0, y: 0 }, P), { x: 0, y: -1 });
  const d = safeDirection({ type: 'blades', rotationDeg: 0 }, { x: 0, y: 0 }, P);
  approx(Math.hypot(d.x, d.y), 1);
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

test('多数シードで半円4方向と羽根2回転方向が出る', () => {
  const types = new Set(), sides = new Set(), directions = new Set();
  for (let seed = 1; seed <= 500; seed++) {
    const obstacle = createObstacle(createRng(seed), 6, seed, P);
    types.add(obstacle.type);
    if (obstacle.type === 'half') sides.add(obstacle.blockedSide);
    else directions.add(obstacle.rotationDirection);
  }
  assert.deepEqual([...types].sort(), ['blades', 'half']);
  assert.deepEqual([...sides].sort(), ['down', 'left', 'right', 'up']);
  assert.deepEqual([...directions].sort((a, b) => a - b), [-1, 1]);
});

test('回転する羽根は経過時間と回転方向で角度が変わる', () => {
  const cw = { id: 1, type: 'blades', z: 5, rotationDeg: 10, rotationDirection: 1 };
  const ccw = { ...cw, rotationDirection: -1 };
  assert.ok(advanceObstacle(cw, 0, 1, 1, P).rotationDeg > 10);
  assert.ok(normalizeAngleDeg(advanceObstacle(ccw, 0, 1, 1, P).rotationDeg - 10) > 180);
});

test('nearZ 以下へ進んだ障害物は描画範囲の奥へ戻る', () => {
  const expired = { id: 1, type: 'half', blockedSide: 'up', z: P.nearZ };
  const far = { id: 2, type: 'half', blockedSide: 'down', z: 8 };
  const got = recycleObstacles([expired, far], createRng(3), P);
  assert.ok(got.every(o => o.z > P.nearZ));
  assert.ok(got.find(o => o.id === 1).z > far.z);
});

test('T6 状態は安全通過と衝突を別に数え、実際の最高速度を持つ', () => {
  const openObstacle = { id: 1, type: 'half', blockedSide: 'up', z: 1.01 };
  const hitObstacle = { id: 2, type: 'half', blockedSide: 'down', z: 1.01 };
  const state = {
    ...createT6State(createRng(1), P),
    position: { x: 0, y: -0.6 }, target: { x: 0, y: -0.6 },
    obstacles: [openObstacle, hitObstacle], speed: 1, maxSpeedReached: 1,
  };
  const next = stepT6State(state, { x: 0, y: -0.6 }, 0.02, P, createRng(2));
  assert.equal(next.cleared, 1);
  assert.equal(next.collisions, 1);
  assert.equal(next.speed, applyCollisionSpeed(baseSpeedAt(next.elapsedSec, P), P));
  assert.ok(next.maxSpeedReached >= 1);
});

test('状態を1フレーム進めても元の状態を書き換えない', () => {
  const state = createT6State(createRng(11), P);
  const before = structuredClone(state);
  stepT6State(state, { x: 0.5, y: -0.25 }, 1 / 60, P, createRng(12));
  assert.deepEqual(state, before);
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
