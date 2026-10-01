import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { DEFAULTS } from '../js/core/settings.js';
import {
  normalizeAngleDeg, angularDistanceDeg, toPolar, clampToTunnel,
  normalizeInput, keyboardInput, moveAircraft,
  computeTunnelLayout, stickInputAt, stickVectorAt, stickToPosition, projectTunnelSection,
  tunnelBackdrop, centerRimArcs, holeRadiusFor,
  projectScale, baseSpeedAt, advanceSpeed, applyCollisionSpeed,
  createObstacle, createInitialObstacles, advanceObstacle, recycleObstacles, drawableObstacles,
  crossedAircraftPlane, isHalfOpeningSafe, isBladeOpeningSafe, isObstacleSafe,
  isSectorOpeningSafe, holeCenters, isHoleOpeningSafe, isBarSafe, isAircraftSafe,
  createT6State, stepT6State, summarizeT6, buildT6Record,
} from '../js/logic/t6.js';

const P = DEFAULTS.t6;
const approx = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

test('T6 の既定値は承認済みの数値', () => {
  assert.deepEqual(P, {
    durationSec: 180,
    obstacleColor: 'blue',
    obstacleEdgeColor: 'cyan',
    moveSpeed: 1,
    collisionSpeedFactor: 0.5,
    initialSpeed: 0.8,
    acceleration: 3,
    recoveryAcceleration: 3,
    maxSpeed: 15,
    recoveryCapSpeed: 2,
    obstacleSpacing: 8,
    firstObstacleDistance: 12,
    bladeOpeningDeg: 60,
    bladeOpen1Rate: 0.5,
    bladeOpen2Rate: 0.5,
    bladeOpen3Rate: 0,
    centerOpenRadius: 0.22,
    barWidth: 0.63,
    barLength: 1.5,
    bladeInitialAngularSpeedDegSec: 30,
    bladeAngularAccelerationDegSec2: 0.15,
    collisionPushMs: 350,
    collisionPullbackDistance: 2,
    aircraftMaxRadius: 0.86,
    hitRadius: 0.08,
    canvasMarginPx: 8,
    stickRadiusRatio: 0.14,
    stickMinRadiusPx: 60,
    stickMaxRadiusPx: 90,
    tunnelMinRadiusRatio: 0.3,
    stickSide: 'right',
    stallAbortMs: 1000,
    perspectiveFocal: 2.6,
    collisionZ: 1,
    farZ: 32,
    sectorOpeningDeg: 90,
    maxSameObstacleRun: 2,
    holeSlotCount: 4,
    holeThreeSlotCount: 3,
    holeOpenCounts: [1, 2, 3],
    holeRotationRate: 0.5,
    holeRingRadius: 0.6,
    holeRadius: 0.38,
    holeThreeRadius: 0.323,
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

test('位置は入力×moveSpeed×dtで動き、入力0なら止まり、刻みが違っても同じ', () => {
  const start = { x: 0, y: 0 };
  assert.deepEqual(moveAircraft(start, { x: 0, y: 0 }, 1, P), start);
  const once = moveAircraft(start, { x: 0.5, y: -0.25 }, 1, P);
  const half = moveAircraft(start, { x: 0.5, y: -0.25 }, 0.5, P);
  const twice = moveAircraft(half, { x: 0.5, y: -0.25 }, 0.5, P);
  approx(once.x, twice.x);
  approx(once.y, twice.y);
});

for (const [width, height, side] of [[1180,820,'right'], [1180,820,'left'], [390,844,'right'], [844,390,'right']]) {
  test(`${width}×${height} ${side}: 帯を避け画面内・非重複、トンネル短辺30%以上・スティック60px以上`, () => {
    const topInset = 80;
    const layout = computeTunnelLayout(width, height, { ...P, stickSide: side }, { topInset });
    assert.ok(layout.tunnel.radius >= Math.min(width,height)*0.3);
    assert.ok(layout.stick.radius >= 60);
    if (height > width) { assert.equal(layout.mode, 'stacked'); assert.ok(layout.stick.centerY>layout.tunnel.centerY); }
    else { assert.equal(layout.mode, 'side'); assert.equal(layout.stick.centerX>layout.tunnel.centerX, side==='right'); }
    for (const circle of [layout.tunnel, layout.stick]) {
      assert.ok(circle.centerX - circle.radius >= 0);
      assert.ok(circle.centerX + circle.radius <= width);
      assert.ok(circle.centerY - circle.radius >= topInset);
      assert.ok(circle.centerY + circle.radius <= height);
    }
    const distance = Math.hypot(
      layout.tunnel.centerX - layout.stick.centerX,
      layout.tunnel.centerY - layout.stick.centerY,
    );
    assert.ok(distance >= layout.tunnel.radius + layout.stick.radius);
  });
}

test('最低サイズを確保できない画面は理由付きで拒否する', () => {
  assert.throws(()=>computeTunnelLayout(240,200,P,{topInset:80}), /小さ|半径/);
});

test('Canvasが帯の下でも最低半径と縦横は画面全体を基準にする', () => {
  const layout=computeTunnelLayout(828,294,P,{viewportWidth:844,viewportHeight:390});
  assert.ok(layout.tunnel.radius>=117);
  assert.equal(layout.mode,'side');
});

test('スティックは中心で入力0、縁で長さ1、円外は無効', () => {
  const layout = computeTunnelLayout(1180, 820, P);
  const { centerX, centerY, radius } = layout.stick;
  assert.deepEqual(stickInputAt({ x: centerX, y: centerY }, layout), { x: 0, y: 0 });
  assert.deepEqual(stickInputAt({ x: centerX + radius, y: centerY }, layout), { x: 1, y: 0 });
  assert.equal(stickInputAt({ x: centerX + radius + 1, y: centerY }, layout), null);
});

// ---- 操作: 操縦の円の位置がそのまま自機の位置(2026-09-30 本番に合わせて変更) ----

test('操縦の円の中心はトンネルの中心、縁は機体が動ける範囲の端(aircraftMaxRadius)', () => {
  const layout = computeTunnelLayout(1180, 820, P);
  const { centerX, centerY, radius } = layout.stick;
  const at = (dx, dy) => stickToPosition(stickVectorAt({ x: centerX + dx, y: centerY + dy }, layout), P);
  assert.deepEqual(at(0, 0), { x: 0, y: 0 });
  const edge = at(radius, 0);
  approx(edge.x, P.aircraftMaxRadius);
  approx(edge.y, 0);
  const halfUp = at(0, -radius / 2); // 画面の上は y が正
  approx(halfUp.x, 0);
  approx(halfUp.y, P.aircraftMaxRadius / 2);
});

test('操縦の円の縁を超えて動かしたら、自機は縁(aircraftMaxRadius)に収まる', () => {
  const layout = computeTunnelLayout(1180, 820, P);
  const { centerX, centerY, radius } = layout.stick;
  const far = stickToPosition(stickVectorAt({ x: centerX + radius * 3, y: centerY - radius * 4 }, layout), P);
  approx(Math.hypot(far.x, far.y), P.aircraftMaxRadius);
  approx(far.x / far.y, 3 / 4); // 向きは保つ(右へ3・上へ4)
  // 押し始めは円の中だけ
  assert.equal(stickInputAt({ x: centerX + radius + 1, y: centerY }, layout), null);
});

test('操縦の円で動かすと自機の位置は即座にその位置になり、離したら最後の位置のまま止まる', () => {
  const start = { ...createT6State(createRng(20), P), obstacles: [], speed: 0 };
  // stick は操縦の円の中の位置(中心0、縁で長さ1)
  const moved = stepT6State(start, { stick: { x: 0.3, y: -0.4 } }, 1 / 60, P, createRng(21));
  approx(moved.position.x, 0.3 * P.aircraftMaxRadius);
  approx(moved.position.y, -0.4 * P.aircraftMaxRadius);
  let s = moved;
  for (let i = 0; i < 30; i++) s = stepT6State(s, { stick: null }, 1 / 60, P, createRng(22 + i));
  assert.deepEqual(s.position, moved.position);
});

test('矢印キーは自機の位置を moveSpeed で動かし、機体が動ける範囲に収める', () => {
  const start = { ...createT6State(createRng(20), P), obstacles: [], speed: 0 };
  const moved = stepT6State(start, { keys: { x: 1, y: 0 } }, 0.5, P, createRng(21));
  approx(moved.position.x, P.moveSpeed * 0.5);
  const far = stepT6State(moved, { keys: { x: 1, y: 0 } }, 5, P, createRng(22));
  approx(far.position.x, P.aircraftMaxRadius);
  const stopped = stepT6State(moved, { keys: { x: 0, y: 0 } }, 0.5, P, createRng(23));
  assert.deepEqual(stopped.position, moved.position);
});

test('巻き戻しの間は操縦を受け付けない', () => {
  const start = { ...createT6State(createRng(20), P), obstacles: [], speed: 0, position: { x: 0.1, y: 0.2 }, pushback: { elapsedMs: 0 } };
  const during = stepT6State(start, { stick: { x: 0.5, y: 0.5 }, keys: { x: 1, y: 0 } }, 0.1, P, createRng(21));
  assert.deepEqual(during.position, { x: 0.1, y: 0.2 });
});

// ---- 一人称視点(2026-09-30 本番に合わせて変更) ----

test('一人称: 奥行き z の断面は (物の位置 − 自機の位置) × トンネル半径 × 縮尺(z) だけ中心からずれる', () => {
  const view = { centerX: 400, centerY: 300, radius: 200 };
  const center = projectTunnelSection({ x: 0, y: 0 }, 2, view, P);
  assert.deepEqual(center, { centerX: 400, centerY: 300, radius: 200 * projectScale(P.perspectiveFocal, 2) });
  // 自機が右上(x=0.5, y=0.25)にいると、トンネルの中心は画面の左下にずれる(画面の y は下向き)
  const f = P.perspectiveFocal;
  const near = projectTunnelSection({ x: 0.5, y: 0.25 }, 1, view, P);
  approx(near.centerX, 400 - 0.5 * 200 * f / 1);
  approx(near.centerY, 300 + 0.25 * 200 * f / 1);
  approx(near.radius, 200 * f);
  const far = projectTunnelSection({ x: 0.5, y: 0.25 }, 4, view, P);
  approx(far.centerX, 400 - 0.5 * 200 * f / 4);
  approx(far.centerY, 300 + 0.25 * 200 * f / 4);
  approx(far.radius, 200 * f / 4);
});

test('一人称: 手前の物ほど大きくずれ、奥の物はほとんどずれない(消失点は画面の中心)', () => {
  const view = { centerX: 0, centerY: 0, radius: 100 };
  const position = { x: 0.8, y: 0 };
  const shifts = [0.5, 1, 4, 32, 10000].map(z => Math.abs(projectTunnelSection(position, z, view, P).centerX));
  for (let i = 1; i < shifts.length; i++) assert.ok(shifts[i] < shifts[i - 1], `${shifts}`);
  assert.ok(shifts.at(-1) < view.radius * 0.001, '十分奥はほとんどずれない(画面の半径の0.1%未満)');
});

test('一人称: 機体の面(collisionZ)では、断面上の自機の位置が画面の中心に来る', () => {
  const view = { centerX: 400, centerY: 300, radius: 200 };
  const position = { x: -0.3, y: 0.6 };
  const section = projectTunnelSection(position, P.collisionZ, view, P);
  // 断面の座標で自機の位置を画面に写すと、画面の中心(照準)になる
  approx(section.centerX + position.x * section.radius, view.centerX);
  approx(section.centerY - position.y * section.radius, view.centerY);
});

// ---- 画面の枠(2026-10-01 ユーザーの実機の感想で変更。7回目) ----
// 見える枠は画面の外周の円だけ。自機の位置に合わせて動く縁の弧は描かず、円の中はすべてトンネルの中と同じ暗い色。
// 放射状の線は画面の外周まで伸ばす。

test('画面の枠: 描く要素は外周の円の塗りと枠線と放射状の線だけで、ずらした縁の弧は無い', () => {
  const view = { centerX: 400, centerY: 300, radius: 200 };
  const items = tunnelBackdrop(view, 12);
  assert.deepEqual([...new Set(items.map(item => item.kind))].sort(), ['fill', 'frame', 'radial']);
  assert.ok(!items.some(item => item.kind === 'edge' || item.kind === 'wall'), 'ずらした縁の弧・壁の塗りは描かない');
  for (const item of items.filter(i => i.kind !== 'radial')) {
    assert.deepEqual(item.circle, { centerX: 400, centerY: 300, radius: 200 }, '塗りと枠線は画面の外周の円');
  }
  assert.equal(items.find(i => i.kind === 'fill').color, 'tunnel', 'トンネルの中と同じ暗い色');
  // 自機の位置を受け取らない(どこに寄っても同じ)
  assert.equal(tunnelBackdrop.length, 2);
});

test('画面の枠: 放射状の線は消失点(画面の中心)から、画面の外周の円の上まで伸ばす', () => {
  const view = { centerX: 400, centerY: 300, radius: 200 };
  const lines = tunnelBackdrop(view, 12).filter(i => i.kind === 'radial');
  assert.equal(lines.length, 12);
  for (const line of lines) {
    assert.deepEqual(line.from, { x: 400, y: 300 });
    approx(Math.hypot(line.to.x - 400, line.to.y - 300), 200);
  }
});

test('tunnelEdgeZ は使わなくなったので既定値に無い', () => {
  assert.equal('tunnelEdgeZ' in P, false);
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

test('中心の安全円: 3枚羽根と扇形は、中心から centerOpenRadius の円の中を安全にする(2026-09-30 本番に合わせて変更)', () => {
  const blocked = 90; // 羽根(開口0°・120°・240°)でも扇形(開口315°)でもふさがった向き
  const at = r => ({ x: Math.cos(blocked * Math.PI / 180) * r, y: Math.sin(blocked * Math.PI / 180) * r });
  for (const count of [1, 2, 3]) {
    assert.equal(isBladeOpeningSafe({ x: 0, y: 0 }, 0, P, count), true, `羽根${count} 中心`);
    assert.equal(isBladeOpeningSafe(at(P.centerOpenRadius - 0.001), 0, P, count), true, `羽根${count} 安全円の内側`);
    assert.equal(isBladeOpeningSafe(at(P.centerOpenRadius), 0, P, count), false, `羽根${count} 安全円の縁`);
    assert.equal(isBladeOpeningSafe(at(0.6), 0, P, count), false, `羽根${count} 外側`);
  }
  assert.equal(isSectorOpeningSafe({ x: 0, y: 0 }, 315, P), true);
  assert.equal(isSectorOpeningSafe(at(P.centerOpenRadius - 0.001), 315, P), true);
  assert.equal(isSectorOpeningSafe(at(P.centerOpenRadius), 315, P), false);
  assert.equal(isObstacleSafe({ type: 'sector', openCenterDeg: 315 }, { x: 0, y: 0 }, P), true);
  assert.equal(isObstacleSafe({ type: 'blades', rotationDeg: 0, openingCount: 3 }, { x: 0, y: 0 }, P), true);
});

test('3枚羽根は現在の回転角を衝突判定に使う', () => {
  const p = { x: 0.6, y: 0 };
  assert.equal(isBladeOpeningSafe(p, 0, P), true);
  assert.equal(isBladeOpeningSafe(p, 60, P), false);
  assert.equal(isObstacleSafe({ type: 'blades', rotationDeg: 60 }, p, P), false);
});

test('羽根の開口1・2・3個は等間隔で、1個なら他の角度は衝突', () => {
  const at = deg => ({ x: Math.cos(deg * Math.PI / 180) * 0.6, y: Math.sin(deg * Math.PI / 180) * 0.6 });
  for (const count of [1, 2, 3]) {
    for (let i = 0; i < count; i++) assert.equal(isBladeOpeningSafe(at(i * 360 / count), 0, P, count), true);
    assert.equal(isBladeOpeningSafe(at(30), 0, P, count), false);
  }
  for (const angle of [60, 120, 180, 240, 300]) assert.equal(isBladeOpeningSafe(at(angle), 0, P, 1), false);
});

test('羽根の開口数は 1つ50%・2つ50%で、開口3つ(放射能マーク)は出さない(2026-10-01 ユーザーの実機の感想で変更。設定値)', () => {
  const counts = new Map([[1, 0], [2, 0], [3, 0]]);
  for (let seed = 1; seed <= 20000; seed++) {
    const obstacle = createObstacle(createRng(seed), 6, seed, P);
    if (obstacle.type === 'blades') counts.set(obstacle.openingCount, counts.get(obstacle.openingCount) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  assert.equal(counts.get(3), 0, '開口3つは出さない');
  for (const [n, expected] of [[1, 0.5], [2, 0.5]]) {
    assert.ok(Math.abs(counts.get(n) / total - expected) < 0.03, `${n}つ: ${counts.get(n)}/${total}`);
  }
  // 設定で変えられる(3つだけにする)
  const only3 = { ...P, bladeOpen1Rate: 0, bladeOpen2Rate: 0, bladeOpen3Rate: 1 };
  for (let seed = 1; seed <= 500; seed++) {
    const obstacle = createObstacle(createRng(seed), 6, seed, only3);
    if (obstacle.type === 'blades') assert.equal(obstacle.openingCount, 3);
  }
});

test('扇形は90°の内側だけ安全で、辺は衝突', () => {
  const at = (deg, radius = 0.6) => ({
    x: Math.cos(deg * Math.PI / 180) * radius,
    y: Math.sin(deg * Math.PI / 180) * radius,
  });
  assert.equal(isSectorOpeningSafe(at(45), 45, P), true);
  assert.equal(isSectorOpeningSafe(at(0), 45, P), false); // 辺ちょうど
  assert.equal(isSectorOpeningSafe(at(90), 45, P), false); // 辺ちょうど
});

test('315°の扇形は0°/360°をまたいだ内側だけ安全', () => {
  const at = deg => ({ x: Math.cos(deg * Math.PI / 180) * 0.6, y: Math.sin(deg * Math.PI / 180) * 0.6 });
  assert.equal(isSectorOpeningSafe(at(350), 315, P), true);
  assert.equal(isSectorOpeningSafe(at(10), 315, P), false);
  assert.equal(isSectorOpeningSafe(at(270), 315, P), false); // 辺
  assert.equal(isSectorOpeningSafe(at(0), 315, P), false); // 反対側の辺
});

test('扇形は両方向に回転し、0°/360°をまたぎ、以前安全な位置も塞がる', () => {
  const at = deg => ({ x: Math.cos(deg * Math.PI / 180) * 0.6, y: Math.sin(deg * Math.PI / 180) * 0.6 });
  const cw = { id: 1, type: 'sector', z: 5, openCenterDeg: 315, rotationDirection: 1 };
  const ccw = { ...cw, rotationDirection: -1 };
  assert.equal(isObstacleSafe(cw, at(350), P), true);
  assert.equal(isObstacleSafe(cw, at(290), P), true);
  const turned = advanceObstacle(cw, 0, 0, 2, P);
  assert.ok(turned.openCenterDeg > 0 && turned.openCenterDeg < 90);
  assert.equal(isObstacleSafe(turned, at(290), P), false);
  const reverse = advanceObstacle(ccw, 0, 0, 2, P);
  assert.ok(reverse.openCenterDeg < 315);
  assert.equal(isObstacleSafe(reverse, at(270), P), true);
});

test('小穴は穴の中だけ安全で、縁・外・穴にしていない位置は衝突', () => {
  const obstacle = { type: 'holes', openSlots: [0, 2], rotationDeg: 0 };
  const centers = holeCenters(obstacle, P);
  assert.equal(centers.length, 2);
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

test('小穴の初期中心: 1つ・2つ空きは上下左右の4か所から、3つ空きは120°ずつ(1つは上下左右のどれか)。穴は重ならず円内に収まる', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    const obstacle = createObstacle(createRng(seed), 6, seed, P);
    if (obstacle.type !== 'holes') continue;
    assert.equal(new Set(obstacle.openSlots).size, obstacle.openSlots.length, `seed=${seed}`);
    const three = obstacle.openSlots.length === 3;
    const slotCount = three ? P.holeThreeSlotCount : P.holeSlotCount;
    assert.ok(obstacle.openSlots.every(slot => Number.isInteger(slot) && slot >= 0 && slot < slotCount));
    assert.ok([0, 90, 180, 270].includes(obstacle.rotationDeg), `seed=${seed}: ${obstacle.rotationDeg}`);
    const centers = holeCenters(obstacle, P);
    for (const [i, center] of centers.entries()) {
      approx(Math.hypot(center.x, center.y), P.holeRingRadius);
      if (!three || i === 0) assert.ok(Math.abs(center.x) < 1e-9 || Math.abs(center.y) < 1e-9, `seed=${seed}`);
      assert.ok(Math.hypot(center.x, center.y) + P.holeRadius <= 1);
    }
    for (let i = 0; i < centers.length; i++) for (let j = i + 1; j < centers.length; j++) {
      assert.ok(Math.hypot(centers[i].x - centers[j].x, centers[i].y - centers[j].y) > 2 * P.holeRadius);
    }
  }
});

test('小穴の開口数1〜3は均等に出て、回転するのは3穴だけ(1・2穴は静止)', () => {
  const counts = new Map([[1, 0], [2, 0], [3, 0]]);
  const threeModes = { static: 0, rotating: 0 };
  for (let seed = 1; seed <= 5000; seed++) {
    const obstacle = createObstacle(createRng(seed), 6, seed, P);
    if (obstacle.type !== 'holes') continue;
    const n = obstacle.openSlots.length;
    counts.set(n, (counts.get(n) ?? 0) + 1);
    if (n < 3) assert.equal(obstacle.rotationDirection, 0, `${n}穴は回転しない`);
    else threeModes[obstacle.rotationDirection === 0 ? 'static' : 'rotating']++;
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  for (const n of [1, 2, 3]) assert.ok(Math.abs(counts.get(n) - total / 3) < total * 0.1, `${n}: ${counts.get(n)}/${total}`);
  const three = threeModes.static + threeModes.rotating;
  assert.ok(Math.abs(threeModes.rotating / three - P.holeRotationRate) < 0.1, JSON.stringify(threeModes));
});

// ---- 3つ空きの小穴は120°ずつ(2026-10-01 ユーザーの実機の感想で変更) ----

test('小穴: 3つ空きのときは、穴を120°ずつの3等分の位置に置く(1つ・2つのときは今の4か所)', () => {
  const angle = c => normalizeAngleDeg(Math.atan2(c.y, c.x) * 180 / Math.PI);
  for (const rotationDeg of [0, 90, 180, 270]) {
    const three = { type: 'holes', openSlots: [0, 1, 2], rotationDeg, rotationDirection: 0 };
    const angles = holeCenters(three, P).map(angle);
    assert.equal(angles.length, 3);
    for (let i = 0; i < 3; i++) approx(angularDistanceDeg(angles[i], rotationDeg + i * 120), 0, 1e-9);
    for (let i = 0; i < 3; i++) approx(angularDistanceDeg(angles[i], angles[(i + 1) % 3]), 120, 1e-9);
  }
  // 1つ・2つのときは今までどおり90°ずつの4か所
  const two = { type: 'holes', openSlots: [1, 3], rotationDeg: 0, rotationDirection: 0 };
  assert.deepEqual(holeCenters(two, P).map(c => Math.round(angle(c))), [90, 270]);
  const one = { type: 'holes', openSlots: [2], rotationDeg: 0, rotationDirection: 0 };
  assert.deepEqual(holeCenters(one, P).map(c => Math.round(angle(c))), [180]);
  // 生成した3つ空きも120°ずつ
  let found = 0;
  for (let seed = 1; seed <= 3000; seed++) {
    const o = createObstacle(createRng(seed), 6, seed, P);
    if (o.type !== 'holes' || o.openSlots.length !== 3) continue;
    found++;
    assert.deepEqual([...o.openSlots].sort(), [0, 1, 2], `seed=${seed}`);
    const a = holeCenters(o, P).map(angle);
    for (let i = 0; i < 3; i++) approx(angularDistanceDeg(a[i], a[(i + 1) % 3]), 120, 1e-9);
  }
  assert.ok(found > 50, `${found}`);
});

test('小穴: 3つ空きの当たり判定も120°ずつの位置。穴と穴の間(60°ずれた所)は衝突', () => {
  const at = deg => ({ x: Math.cos(deg * Math.PI / 180) * P.holeRingRadius, y: Math.sin(deg * Math.PI / 180) * P.holeRingRadius });
  const three = { type: 'holes', openSlots: [0, 1, 2], rotationDeg: 90, rotationDirection: 0 };
  for (const deg of [90, 210, 330]) {
    assert.equal(isHoleOpeningSafe(at(deg), three, P), true, `${deg}°`);
    assert.equal(isAircraftSafe(three, at(deg), P), true, `${deg}° 当たり判定の円も収まる`);
  }
  for (const deg of [30, 150, 270]) {
    assert.equal(isHoleOpeningSafe(at(deg), three, P), false, `${deg}° は穴ではない`);
    assert.equal(isAircraftSafe(three, at(deg), P), false);
  }
});

test('小穴: 3つ空きの穴の半径は 0.323(1つ・2つ空きは 0.38 のまま)。当たり判定も同じ半径', () => {
  assert.equal(P.holeThreeRadius, 0.323);
  const three = { type: 'holes', openSlots: [0, 1, 2], rotationDeg: 90, rotationDirection: 0 };
  const two = { type: 'holes', openSlots: [0, 2], rotationDeg: 0, rotationDirection: 0 };
  assert.equal(holeRadiusFor(three, P), 0.323);
  assert.equal(holeRadiusFor(two, P), 0.38);
  const [c] = holeCenters(three, P); // 90°(上)の穴
  assert.equal(isHoleOpeningSafe({ x: c.x, y: c.y + 0.32 }, three, P), true, '0.323 の内側');
  assert.equal(isHoleOpeningSafe({ x: c.x, y: c.y + 0.33 }, three, P), false, '0.38 なら通れた所は衝突');
  assert.equal(isAircraftSafe(three, c, P), true, '穴の中心');
  assert.equal(isAircraftSafe(three, { x: c.x, y: c.y + 0.323 - P.hitRadius + 0.01 }, P), false, '当たり判定の円が縁にかかる');
  const [d] = holeCenters(two, P);
  assert.equal(isHoleOpeningSafe({ x: d.x + 0.37, y: d.y }, two, P), true, '2つ空きは 0.38 のまま');
});

test('小穴: 3つ空きは隣の穴と重ならない(120°ずつの弦 > 穴の直径)', () => {
  const chord = 2 * P.holeRingRadius * Math.sin(Math.PI / P.holeThreeSlotCount);
  assert.ok(2 * P.holeRadius < chord);
});

test('小穴の半径0.38は、隣の穴と重ならず、トンネルの内側に収まる', () => {
  const chord = 2 * P.holeRingRadius * Math.sin(Math.PI / P.holeSlotCount);
  assert.ok(2 * P.holeRadius < chord);
  assert.ok(P.holeRingRadius + P.holeRadius <= 1);
});

test('回転する小穴は時間で位置と当たり判定が変わり、静止穴は変わらない', () => {
  const rotating = { type: 'holes', z: 5, openSlots: [0, 2], rotationDeg: 0, rotationDirection: 1 };
  const initial = holeCenters(rotating, P)[0];
  assert.equal(isHoleOpeningSafe(initial, rotating, P), true);
  const turned = advanceObstacle(rotating, 0, 0, 3, P);
  assert.notDeepEqual(holeCenters(turned, P), holeCenters(rotating, P));
  assert.equal(isHoleOpeningSafe(initial, turned, P), false);
  assert.equal(isHoleOpeningSafe(holeCenters(turned, P)[0], turned, P), true);
  const staticHole = { ...rotating, rotationDirection: 0 };
  assert.deepEqual(holeCenters(advanceObstacle(staticHole, 0, 0, 3, P), P), holeCenters(staticHole, P));
});

test('障害物が機体面をまたいだ瞬間だけ判定する', () => {
  assert.equal(crossedAircraftPlane(1.1, 0.9, P.collisionZ), true);
  assert.equal(crossedAircraftPlane(1.1, 1.01, P.collisionZ), false);
  assert.equal(crossedAircraftPlane(1, 0.9, P.collisionZ), false);
});

test('衝突がなければ速度は baseSpeed と同じ', () => {
  for (const t of [0, 10, 40, 100]) {
    assert.equal(baseSpeedAt(t, P), Math.min(P.maxSpeed, P.initialSpeed + P.acceleration * t));
    assert.equal(advanceSpeed(baseSpeedAt(t, P), t + 1, 1, P), baseSpeedAt(t + 1, P));
  }
});

test('衝突で速度が50%になり、回復加速度で baseSpeed へ戻り、超えない', () => {
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

test('多数シードで5種類が均等に出て、半円4方向・羽根2回転方向・扇形4方向・長方形2回転方向が出る', () => {
  const types = new Map(), sides = new Set(), directions = new Set(), sectors = new Set(), sectorDirections = new Set(), barDirections = new Set();
  const total = 5000;
  for (let seed = 1; seed <= total; seed++) {
    const obstacle = createObstacle(createRng(seed), 6, seed, P);
    types.set(obstacle.type, (types.get(obstacle.type) ?? 0) + 1);
    if (obstacle.type === 'half') sides.add(obstacle.blockedSide);
    else if (obstacle.type === 'blades') directions.add(obstacle.rotationDirection);
    else if (obstacle.type === 'sector') { sectors.add(obstacle.openCenterDeg); sectorDirections.add(obstacle.rotationDirection); }
    else if (obstacle.type === 'bar') barDirections.add(obstacle.rotationDirection);
  }
  assert.deepEqual([...types.keys()].sort(), ['bar', 'blades', 'half', 'holes', 'sector']);
  for (const [type, count] of types) assert.ok(Math.abs(count / total - 0.2) < 0.03, `${type}: ${count}/${total}`);
  assert.deepEqual([...barDirections].sort((a, b) => a - b), [-1, 1]);
  assert.deepEqual([...sides].sort(), ['down', 'left', 'right', 'up']);
  assert.deepEqual([...directions].sort((a, b) => a - b), [-1, 1]);
  assert.deepEqual([...sectors].sort((a, b) => a - b), [45, 135, 225, 315]);
  assert.deepEqual([...sectorDirections].sort((a, b) => a - b), [-1, 1]);
});

test('回転する羽根は経過時間と回転方向で角度が変わる', () => {
  const cw = { id: 1, type: 'blades', z: 5, rotationDeg: 10, rotationDirection: 1 };
  const ccw = { ...cw, rotationDirection: -1 };
  assert.ok(advanceObstacle(cw, 0, 1, 1, P).rotationDeg > 10);
  assert.ok(normalizeAngleDeg(advanceObstacle(ccw, 0, 1, 1, P).rotationDeg - 10) > 180);
});

// ---- 回転する長方形(2026-09-30 本番に合わせて追加) ----

test('回転する長方形(反転): 中心を通る幅 barWidth の帯の中だけ通れ、帯の外はすべて衝突、帯の縁ちょうども衝突(2026-09-30 ユーザーの実機の感想で反転)', () => {
  const half = P.barWidth / 2;
  assert.equal(isBarSafe({ x: 0, y: 0 }, 0, P), true, '中心は帯の中');
  assert.equal(isBarSafe({ x: 0.7, y: 0 }, 0, P), true, '長さ1.5の長方形の中(端の近く)');
  assert.equal(isBarSafe({ x: -0.7, y: 0 }, 0, P), true);
  assert.equal(isBarSafe({ x: 0.5, y: half }, 0, P), false, '帯の縁ちょうど');
  assert.equal(isBarSafe({ x: 0.5, y: -half }, 0, P), false, '反対側の縁ちょうど');
  assert.equal(isBarSafe({ x: 0.5, y: half - 0.001 }, 0, P), true);
  assert.equal(isBarSafe({ x: 0.5, y: half + 0.001 }, 0, P), false);
  assert.equal(isBarSafe({ x: 0, y: 0.6 }, 0, P), false, '帯の外');
  // 90°回すと縦の帯になる
  assert.equal(isBarSafe({ x: 0, y: 0.6 }, 90, P), true);
  assert.equal(isBarSafe({ x: 0, y: 0.8 }, 90, P), false, '長さの外');
  assert.equal(isBarSafe({ x: 0.6, y: 0 }, 90, P), false);
  assert.equal(isObstacleSafe({ type: 'bar', rotationDeg: 90 }, { x: 0, y: 0.6 }, P), true);
});

test('回転する長方形の帯の幅は0.63(2026-10-01 0.35 → 0.7、7回目で 0.7 → 0.63)。当たり判定の円を含めて帯に収まれば通れる', () => {
  assert.equal(P.barWidth, 0.63);
  assert.equal(isBarSafe({ x: 0.3, y: 0.31 }, 0, P), true);
  assert.equal(isBarSafe({ x: 0.3, y: 0.32 }, 0, P), false);
  const bar = { type: 'bar', rotationDeg: 0 };
  assert.equal(isAircraftSafe(bar, { x: 0.3, y: 0.315 - P.hitRadius - 0.01 }, P), true);
  assert.equal(isAircraftSafe(bar, { x: 0.3, y: 0.315 - P.hitRadius + 0.01 }, P), false);
});

test('回転する長方形: 通れるのは長さ barLength(1.5)・幅 barWidth の長方形の中だけ。帯を延ばした先(長さの外)は衝突', () => {
  assert.equal(P.barLength, 1.5);
  const half = P.barLength / 2;
  assert.equal(isBarSafe({ x: 0, y: 0 }, 0, P), true, '中心');
  assert.equal(isBarSafe({ x: half - 0.001, y: 0 }, 0, P), true, '端の近く(長方形の中)');
  assert.equal(isBarSafe({ x: half, y: 0 }, 0, P), false, '端ちょうど');
  assert.equal(isBarSafe({ x: half + 0.05, y: 0 }, 0, P), false, '帯を延ばした先');
  assert.equal(isBarSafe({ x: -(half + 0.05), y: 0 }, 0, P), false, '反対側の先');
  // 45°回した帯の先も塞がる
  const at = r => ({ x: Math.cos(Math.PI / 4) * r, y: Math.sin(Math.PI / 4) * r });
  assert.equal(isBarSafe(at(0.7), 45, P), true);
  assert.equal(isBarSafe(at(0.8), 45, P), false);
  const bar = { type: 'bar', rotationDeg: 0 };
  assert.equal(isAircraftSafe(bar, { x: half - P.hitRadius - 0.01, y: 0 }, P), true);
  assert.equal(isAircraftSafe(bar, { x: half - P.hitRadius + 0.01, y: 0 }, P), false, '当たり判定の円が端にかかる');
});

// ---- 中心の円の枠線(2026-10-01 ユーザーの実機の感想で変更。7回目) ----

test('中心の円の半径は 0.22(0.2 から10%大きく)', () => {
  assert.equal(P.centerOpenRadius, 0.22);
  const at = r => ({ x: 0, y: r }); // 90°はどの羽根(開口0°)・扇形(開口315°)でも塞がった向き
  assert.equal(isBladeOpeningSafe(at(0.21), 0, P, 1), true);
  assert.equal(isBladeOpeningSafe(at(0.23), 0, P, 1), false);
  assert.equal(isSectorOpeningSafe(at(0.21), 315, P), true);
});

test('中心の円の枠線: 塞がった部分と接する弧にだけ描き、開いた方向には描かない', () => {
  const inside = (deg, arc) => normalizeAngleDeg(deg - arc.fromDeg) < normalizeAngleDeg(arc.toDeg - arc.fromDeg);
  const cases = [
    { type: 'blades', rotationDeg: 0, openingCount: 1 },
    { type: 'blades', rotationDeg: 37, openingCount: 2 },
    { type: 'sector', openCenterDeg: 315 },
    { type: 'sector', openCenterDeg: 100 },
  ];
  for (const obstacle of cases) {
    const arcs = centerRimArcs(obstacle, P);
    assert.ok(arcs.length >= 1);
    const r = P.centerOpenRadius + 0.01; // 中心の円のすぐ外
    for (let deg = 0; deg < 360; deg += 1) {
      const point = { x: Math.cos(deg * Math.PI / 180) * r, y: Math.sin(deg * Math.PI / 180) * r };
      const drawn = arcs.some(arc => inside(deg, arc));
      const blocked = !isObstacleSafe(obstacle, point, P);
      if (drawn) assert.ok(blocked, `${JSON.stringify(obstacle)} ${deg}° は開いているのに枠線がある`);
      // 開口の端から2°より内側の塞がった向きには、必ず枠線がある
      if (blocked && [-2, 2].every(d => !isObstacleSafe(obstacle, { x: Math.cos((deg + d) * Math.PI / 180) * r, y: Math.sin((deg + d) * Math.PI / 180) * r }, P))) {
        assert.ok(drawn, `${JSON.stringify(obstacle)} ${deg}° は塞がっているのに枠線が無い`);
      }
    }
  }
});

test('回転する長方形: 羽根と同じ速さで回り、回転後は以前安全だった位置がふさがる', () => {
  const bar = { id: 1, type: 'bar', z: 5, rotationDeg: 0, rotationDirection: 1 };
  const turned = advanceObstacle(bar, 0, 0, 2, P);
  const blade = advanceObstacle({ id: 2, type: 'blades', z: 5, rotationDeg: 0, rotationDirection: 1, openingCount: 3 }, 0, 0, 2, P);
  approx(turned.rotationDeg, blade.rotationDeg);
  // 回る前の帯の上(x 軸上)は安全、回った後はふさがる
  const point = { x: 0.6, y: 0 };
  assert.equal(isObstacleSafe(bar, point, P), true, '回る前は安全');
  assert.equal(isObstacleSafe(turned, point, P), false, '回った後はふさがる');
  const reverse = advanceObstacle({ ...bar, rotationDirection: -1 }, 0, 0, 2, P);
  approx(normalizeAngleDeg(reverse.rotationDeg + turned.rotationDeg), 0);
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
  const next = stepT6State(state, {}, 0.02, P, createRng(2));
  assert.equal(next.cleared, 1);
  assert.equal(next.collisions, 1);
  assert.equal(next.speed, applyCollisionSpeed(baseSpeedAt(next.elapsedSec, P), P));
  assert.ok(next.maxSpeedReached >= 1);
  // 通過した障害物は奥へ戻し、ぶつかった障害物は巻き戻しの間その場に残す(透過にはしない)
  assert.ok(next.obstacles.find(o => o.id === 1).z > P.collisionZ);
  const hit = next.obstacles.find(o => o.id === 2);
  assert.ok(hit.z <= P.collisionZ + 1e-9);
  assert.equal(hit.ghost, undefined);
});

test('状態を1フレーム進めても元の状態を書き換えない', () => {
  const state = createT6State(createRng(11), P);
  const before = structuredClone(state);
  stepT6State(state, { keys: { x: 0.5, y: -0.25 } }, 1 / 60, P, createRng(12));
  stepT6State(state, { stick: { x: 0.5, y: -0.25 } }, 1 / 60, P, createRng(12));
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

// ---- 衝突したときの巻き戻し(2026-09-27 ユーザーの判断で変更。2026-09-30 本番に合わせて透過をやめた) ----

const DT = 0.05; // 50ms。巻き戻しの350msは7回で終わる
const HIT_ID = 2;
const FAR_ID = 3;

// 機体は下側(y<0)にいて、下がふさがった半円にぶつかる。奥にもう1つ障害物を置く
function collisionStart() {
  return {
    ...createT6State(createRng(1), P),
    position: { x: 0.1, y: -0.6 },
    obstacles: [
      { id: HIT_ID, type: 'half', blockedSide: 'down', z: 1.01 },
      { id: FAR_ID, type: 'half', blockedSide: 'up', z: 9 },
    ],
    speed: 1,
    maxSpeedReached: 1,
  };
}
const obstacleOf = (state, id) => state.obstacles.find(o => o.id === id);

function runSteps(state, count, control = {}) {
  let s = state;
  for (let i = 0; i < count; i++) s = stepT6State(s, control, DT, P, createRng(100 + i));
  return s;
}

test('衝突: 機体の位置は横に動かず、巻き戻しの間は入力を受け付けない', () => {
  const start = collisionStart();
  const hit = stepT6State(start, {}, 0.02, P, createRng(2));
  assert.equal(hit.collisions, 1);
  assert.deepEqual(hit.position, start.position);
  assert.notEqual(hit.pushback, null);
  let s = hit;
  for (let i = 0; i < 6; i++) {
    s = stepT6State(s, { keys: { x: 1, y: 1 }, stick: { x: 0.5, y: 0.5 } }, DT, P, createRng(10 + i));
    assert.deepEqual(s.position, start.position, `step ${i}`);
  }
});

test('衝突: 障害物は時間とともに collisionPullbackDistance(2)だけ奥へ遠ざかり、進んだ距離も同じだけ減る', () => {
  const hit = stepT6State(collisionStart(), {}, 0.02, P, createRng(2));
  const farZ = obstacleOf(hit, FAR_ID).z;
  const halfway = runSteps(hit, 3); // 150ms
  approx(obstacleOf(halfway, FAR_ID).z, farZ + P.collisionPullbackDistance * 150 / P.collisionPushMs);
  approx(halfway.distance, hit.distance - P.collisionPullbackDistance * 150 / P.collisionPushMs);
  const done = runSteps(hit, 7); // 350ms
  assert.equal(done.pushback, null);
  approx(obstacleOf(done, FAR_ID).z, farZ + P.collisionPullbackDistance);
  approx(done.distance, hit.distance - P.collisionPullbackDistance);
});

test('衝突: ぶつかった障害物は当たり判定が消えず、巻き戻しのあと再び近づいて、よけなければまた衝突する', () => {
  const hit = stepT6State(collisionStart(), {}, 0.02, P, createRng(2));
  const afterPull = runSteps(hit, 7);
  const back = obstacleOf(afterPull, HIT_ID);
  assert.ok(back.z > P.collisionZ, '巻き戻しで機体の面より奥へ戻る');
  assert.equal(back.ghost, undefined, '透過にしない');
  assert.ok(drawableObstacles(afterPull.obstacles, P).some(o => o.id === HIT_ID));
  let s = afterPull;
  let steps = 0;
  while (s.collisions < 2 && steps < 400) {
    s = stepT6State(s, {}, DT, P, createRng(200 + steps));
    steps++;
  }
  assert.equal(s.collisions, 2, '同じ障害物にまた衝突する');
  assert.equal(s.cleared, afterPull.cleared, '通過には数えない');
  assert.ok(obstacleOf(s, HIT_ID).z <= P.collisionZ + 1e-9, '2回目も同じ障害物');
});

test('衝突: 巻き戻しのあとによければ、同じ障害物を通過に数える', () => {
  const hit = stepT6State(collisionStart(), {}, 0.02, P, createRng(2));
  let s = runSteps(hit, 7);
  let steps = 0;
  while (s.cleared === 0 && s.collisions < 2 && steps < 400) {
    s = stepT6State(s, { stick: { x: 0, y: 0.5 } }, DT, P, createRng(300 + steps)); // 上へよける
    steps++;
  }
  assert.equal(s.collisions, 1);
  assert.equal(s.cleared, 1);
  assert.ok(obstacleOf(s, HIT_ID).z > obstacleOf(s, FAR_ID).z, '通過したら奥で作り直す');
});

test('衝突: 速度は今までどおり50%になり、巻き戻しの間も回復する', () => {
  const hit = stepT6State(collisionStart(), {}, 0.02, P, createRng(2));
  assert.equal(hit.speed, applyCollisionSpeed(baseSpeedAt(hit.elapsedSec, P), P));
  const done = runSteps(hit, 7);
  assert.ok(done.speed > hit.speed);
  assert.ok(done.speed <= baseSpeedAt(done.elapsedSec, P));
});

// ---- 当たり判定の円(2026-09-30 ユーザーの実機の感想で追加) ----

test('当たり判定: 自機は半径 hitRadius の円で、縁だけ塞がった所にかかっても衝突', () => {
  const half = { type: 'half', blockedSide: 'down' }; // y < 0 が塞がる(y = 0 の直径も塞がる)
  assert.equal(isObstacleSafe(half, { x: 0, y: 0.05 }, P), true, '中心だけなら安全');
  assert.equal(isAircraftSafe(half, { x: 0, y: 0.05 }, P), false, '円の下の縁が塞がった所にかかる');
  assert.equal(isAircraftSafe(half, { x: 0, y: P.hitRadius + 0.01 }, P), true, '円全体が安全な側');
  const blades = { type: 'blades', rotationDeg: 0, openingCount: 1 }; // 開口は 0° の向き(±30°)
  const r = 0.6;
  const edge = 30 - (P.hitRadius / r) * 180 / Math.PI * 0.5; // 中心は開口の中、円の縁は開口の外
  const at = { x: Math.cos(edge * Math.PI / 180) * r, y: Math.sin(edge * Math.PI / 180) * r };
  assert.equal(isObstacleSafe(blades, at, P), true);
  assert.equal(isAircraftSafe(blades, at, P), false);
  assert.equal(isAircraftSafe(blades, { x: r, y: 0 }, P), true);
});

test('当たり判定の半径は0.08(2026-10-01 ユーザーの実機の感想で 0.06 → 0.08)', () => {
  assert.equal(P.hitRadius, 0.08);
  const half = { type: 'half', blockedSide: 'down' };
  assert.equal(isAircraftSafe(half, { x: 0, y: 0.07 }, P), false, '0.06 なら通れた位置でも、0.08 の円は塞がった所にかかる');
  assert.equal(isAircraftSafe(half, { x: 0, y: 0.07 }, { ...P, hitRadius: 0.06 }), true);
  assert.equal(isAircraftSafe(half, { x: 0, y: 0.09 }, P), true);
});

test('当たり判定の円は状態を進めるときにも使う(縁がかかったら衝突に数える)', () => {
  const state = {
    ...createT6State(createRng(1), P),
    position: { x: 0, y: 0.05 },
    obstacles: [{ id: 9, type: 'half', blockedSide: 'down', z: 1.01 }], speed: 1, maxSpeedReached: 1,
  };
  const next = stepT6State(state, {}, 0.02, P, createRng(2));
  assert.equal(next.collisions, 1);
  assert.equal(next.cleared, 0);
});

// ---- 衝突のあとの回復の上限(2026-09-30 ユーザーの実機の感想で追加) ----

function fastCollision() {
  return {
    ...createT6State(createRng(1), P),
    elapsedSec: 100, // 基準速度は最高速度 15
    speed: 15,
    maxSpeedReached: 15,
    position: { x: 0.1, y: -0.6 },
    obstacles: [
      { id: HIT_ID, type: 'half', blockedSide: 'down', z: 1.01 },
      { id: FAR_ID, type: 'half', blockedSide: 'up', z: 25 },
    ],
  };
}

test('回復の上限: ぶつかった障害物を通過するまでは速度を recoveryCapSpeed(2)より上げず、通過したら今までどおり加速する', () => {
  const hit = stepT6State(fastCollision(), {}, 0.001, P, createRng(2));
  assert.equal(hit.collisions, 1);
  assert.equal(hit.speed, P.recoveryCapSpeed, '50%(7.5)でも上限の2に抑える');
  assert.equal(hit.recoveryCapId, HIT_ID);
  let s = runSteps(hit, 7); // 巻き戻しが終わる
  let steps = 0;
  while (s.cleared === 0 && steps < 400) {
    s = stepT6State(s, { stick: { x: 0, y: 0.5 } }, DT, P, createRng(500 + steps)); // 上へよける
    assert.ok(s.speed <= P.recoveryCapSpeed + 1e-9 || s.cleared === 1, `通過する前に ${s.speed}`);
    steps++;
  }
  assert.equal(s.cleared, 1, 'ぶつかった障害物を通過した');
  assert.equal(s.recoveryCapId, null, '通過したら上限を外す');
  const later = runSteps(s, 10, { stick: { x: 0, y: 0.5 } });
  assert.ok(later.speed > P.recoveryCapSpeed + 0.5, `通過したあとは加速する: ${later.speed}`);
});

test('回復の上限: よけずに再びぶつかったら、また通過するまで2に抑える', () => {
  const hit = stepT6State(fastCollision(), {}, 0.001, P, createRng(2));
  let s = runSteps(hit, 7);
  let steps = 0;
  while (s.collisions < 2 && steps < 400) {
    s = stepT6State(s, {}, DT, P, createRng(700 + steps));
    assert.ok(s.speed <= P.recoveryCapSpeed + 1e-9, `${s.speed}`);
    steps++;
  }
  assert.equal(s.collisions, 2);
  assert.equal(s.recoveryCapId, HIT_ID);
  assert.ok(s.speed <= P.recoveryCapSpeed);
});

test('最高速度: 既定は15で、設定では20まで上げられる', () => {
  assert.equal(P.maxSpeed, 15);
  assert.equal(baseSpeedAt(1000, P), 15);
});

// ---- 同じ障害物の連続(2026-10-01 ユーザーの判断で追加) ----

function obstacleSequence(seed, recycles) {
  const rng = createRng(seed);
  let obstacles = createInitialObstacles(rng, P);
  const sequence = [...obstacles].sort((a, b) => a.z - b.z).map(o => o.type);
  for (let i = 0; i < recycles; i++) {
    // 一番手前の障害物を機体の面より手前へ進め、奥で作り直させる
    const nearest = obstacles.reduce((a, b) => (a.z < b.z ? a : b));
    obstacles = obstacles.map(o => (o === nearest ? { ...o, z: P.collisionZ - 0.1 } : o));
    obstacles = recycleObstacles(obstacles, rng, P);
    const farthest = obstacles.reduce((a, b) => (a.z > b.z ? a : b));
    sequence.push(farthest.type);
  }
  return sequence;
}

test('同じ種類の障害物は続けて2個まで(3個続けて出さない)。2個続くことはあり、5種類はほぼ同じ確率', () => {
  assert.equal(P.maxSameObstacleRun, 2);
  let pairs = 0;
  const counts = new Map();
  for (let seed = 1; seed <= 200; seed++) {
    const seq = obstacleSequence(seed, 300);
    let run = 1;
    for (let i = 1; i < seq.length; i++) {
      run = seq[i] === seq[i - 1] ? run + 1 : 1;
      assert.ok(run <= 2, `seed=${seed} ${i}: ${seq.slice(Math.max(0, i - 3), i + 1)}`);
      if (run === 2) pairs++;
    }
    for (const type of seq) counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  assert.ok(pairs > 1000, `2個続くことはある: ${pairs}`);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  for (const [type, count] of counts) assert.ok(Math.abs(count / total - 0.2) < 0.02, `${type}: ${count}/${total}`);
});

test('同じ種類の連続: 直前の2個が同じ種類なら、次はその種類を出さない', () => {
  for (let seed = 1; seed <= 2000; seed++) {
    const o = createObstacle(createRng(seed), 6, seed, P, ['bar', 'bar']);
    assert.notEqual(o.type, 'bar', `seed=${seed}`);
  }
  const types = new Set();
  for (let seed = 1; seed <= 2000; seed++) types.add(createObstacle(createRng(seed), 6, seed, P, ['bar', 'half']).type);
  assert.ok(types.has('bar'), '直前2個が違えば同じ種類も出る');
});
