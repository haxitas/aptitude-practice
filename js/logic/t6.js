// テスト6 トンネル飛行: 座標変換、疑似3D投影(一人称)、障害物、衝突、物理、採点。
// DOM と Canvas には触れない。
// 2026-09-30 本番に合わせて変更: 一人称視点、操縦の円の位置がそのまま自機の位置、衝突した障害物も当たり判定を残す、
// 中心を通れる羽根・扇形、回転する長方形。

const HALF_SIDES = Object.freeze(['up', 'down', 'left', 'right']);
const SECTOR_CENTERS = Object.freeze([45, 135, 225, 315]);
const ANGLE_EPSILON_DEG = 1e-9;

export function normalizeAngleDeg(angle) {
  const n = angle % 360;
  return n < 0 ? n + 360 : n;
}

export function angularDistanceDeg(a, b) {
  const d = Math.abs(normalizeAngleDeg(a) - normalizeAngleDeg(b));
  return Math.min(d, 360 - d);
}

export function toPolar({ x, y }) {
  const radius = Math.hypot(x, y);
  const angleDeg = radius === 0 ? 0 : normalizeAngleDeg(Math.atan2(y, x) * 180 / Math.PI);
  return { radius, angleDeg };
}

export function clampToTunnel(position, maxRadius) {
  const radius = Math.hypot(position.x, position.y);
  if (radius <= maxRadius || radius === 0) return { x: position.x, y: position.y };
  const k = maxRadius / radius;
  return { x: position.x * k, y: position.y * k };
}

export function normalizeInput(input) {
  const length = Math.hypot(input.x, input.y);
  if (length <= 1 || length === 0) return { x: input.x, y: input.y };
  return { x: input.x / length, y: input.y / length };
}

export function keyboardInput(keys) {
  return normalizeInput({
    x: (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0),
    y: (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0),
  });
}

export function moveAircraft(position, input, dtSec, p) {
  const normalized = normalizeInput(input);
  return clampToTunnel({
    x: position.x + normalized.x * p.moveSpeed * dtSec,
    y: position.y + normalized.y * p.moveSpeed * dtSec,
  }, p.aircraftMaxRadius);
}

function circleInside(circle, width, height, margin) {
  return circle.centerX - circle.radius >= margin
    && circle.centerX + circle.radius <= width - margin
    && circle.centerY - circle.radius >= margin
    && circle.centerY + circle.radius <= height - margin;
}

export function computeTunnelLayout(width, height, p, { topInset = 0, viewportWidth = width, viewportHeight = height } = {}) {
  if (!(width > 0) || !(height > 0)) throw new RangeError('画面が小さすぎて、上の帯の下に描画領域を確保できません');
  const margin = p.canvasMarginPx;
  const gap = margin;
  const usableHeight = height - topInset;
  const stacked = viewportHeight > viewportWidth;
  const minTunnel = Math.min(viewportWidth, viewportHeight) * p.tunnelMinRadiusRatio;
  const axis = stacked ? usableHeight : width;
  const cross = stacked ? width : usableHeight;
  const stickRadius = Math.min(p.stickMaxRadiusPx,
    Math.max(p.stickMinRadiusPx, Math.min(viewportWidth, viewportHeight) * p.stickRadiusRatio),
    cross / 2 - margin, (axis - 2 * margin - gap - 2 * minTunnel) / 2);
  const radius = Math.min(cross / 2 - margin, (axis - 2 * margin - gap - 2 * stickRadius) / 2);
  if (stickRadius < p.stickMinRadiusPx || radius < minTunnel) {
    throw new RangeError(`画面が小さすぎます。上の帯を除き、トンネル半径${Math.ceil(minTunnel)}px以上・操縦円半径${p.stickMinRadiusPx}px以上が必要です`);
  }
  let tunnel;
  let stick;
  let mode;
  if (stacked) {
    tunnel = { centerX: width / 2, centerY: topInset + margin + radius, radius };
    stick = { centerX: width / 2, centerY: height - margin - stickRadius, radius: stickRadius };
    mode = 'stacked';
  } else {
    tunnel = { centerX: margin + radius, centerY: topInset + usableHeight / 2, radius };
    stick = {
      centerX: width - margin - stickRadius,
      centerY: topInset + usableHeight / 2,
      radius: stickRadius,
    };
    if (p.stickSide === 'left') {
      tunnel.centerX = width - tunnel.centerX;
      stick.centerX = width - stick.centerX;
    }
    mode = 'side';
  }
  if (!(tunnel.radius > 0)
      || !circleInside(tunnel, width, height, 0)
      || !circleInside(stick, width, height, 0)
      || Math.hypot(tunnel.centerX - stick.centerX, tunnel.centerY - stick.centerY) < tunnel.radius + stick.radius) {
    throw new RangeError('Canvas が小さすぎてトンネルとスティックを配置できません');
  }
  return { width, height, tunnel, stick, mode };
}

// 押し始め: 操縦の円の中なら、円の中の位置(中心0、縁で長さ1)。円の外なら null
export function stickInputAt(pointer, layout) {
  const dx = pointer.x - layout.stick.centerX;
  const dy = layout.stick.centerY - pointer.y;
  const length = Math.hypot(dx, dy);
  if (length > layout.stick.radius) return null;
  return normalizeInput({ x: dx / layout.stick.radius, y: dy / layout.stick.radius });
}

// 押したまま動かしているとき: 円の外へ出たら縁に収める
export function stickVectorAt(pointer, layout) {
  return normalizeInput({
    x: (pointer.x - layout.stick.centerX) / layout.stick.radius,
    y: (layout.stick.centerY - pointer.y) / layout.stick.radius,
  });
}

// 操縦の円の中の位置を、そのまま自機の位置にする(2026-09-30 本番に合わせて変更)。
// 円の中心 = トンネルの中心、円の縁 = 機体が動ける範囲の端(aircraftMaxRadius)
export function stickToPosition(vector, p) {
  const v = normalizeInput(vector);
  return clampToTunnel({ x: v.x * p.aircraftMaxRadius, y: v.y * p.aircraftMaxRadius }, p.aircraftMaxRadius);
}

export function projectScale(focal, z) {
  if (!Number.isFinite(z) || z <= 0) throw new RangeError('z は0より大きい有限値である必要があります');
  if (!Number.isFinite(focal) || focal <= 0) throw new RangeError('focal は0より大きい有限値である必要があります');
  return focal / z;
}

// 一人称視点(2026-09-30 本番に合わせて変更)。画面の中心(view の中心)が自機。
// 奥行き z のトンネルの断面は、(断面の中心 0 − 自機の位置) × トンネル半径 × 縮尺(z) だけ中心からずれる。
// 手前ほど大きくずれ、奥はほとんどずれない(消失点は画面の中心)。画面の y は下向き。
export function projectTunnelSection(position, z, view, p) {
  const k = view.radius * projectScale(p.perspectiveFocal, z);
  return {
    centerX: view.centerX - position.x * k,
    centerY: view.centerY + position.y * k,
    radius: k,
  };
}

// 画面の枠(2026-10-01 ユーザーの実機の感想で変更(7回目)): 描くのは、画面の外周の円(描く範囲)の塗り(トンネルの中と同じ暗い色)と枠線、
// 消失点(画面の中心)から外周の円の上まで伸ばす放射状の線だけ。自機の位置に合わせて動く縁の弧は描かないので、
// どこに寄っても画面の円の中はトンネルの中に見える。自機の位置は受け取らない。
// 6回目の壁の塗り(奥へ暗くなる明るい青の円の塗り重ね)はやめた。
export function tunnelBackdrop(view, radialCount) {
  const circle = { centerX: view.centerX, centerY: view.centerY, radius: view.radius };
  const radials = Array.from({ length: radialCount }, (_, i) => {
    const a = i * 2 * Math.PI / radialCount;
    return {
      kind: 'radial',
      from: { x: view.centerX, y: view.centerY },
      to: { x: view.centerX + Math.cos(a) * view.radius, y: view.centerY - Math.sin(a) * view.radius },
    };
  });
  return [{ kind: 'fill', circle, color: 'tunnel' }, ...radials, { kind: 'frame', circle: { ...circle } }];
}

export function isHalfOpeningSafe(position, blockedSide) {
  let dot;
  if (blockedSide === 'up') dot = position.y;
  else if (blockedSide === 'down') dot = -position.y;
  else if (blockedSide === 'left') dot = -position.x;
  else if (blockedSide === 'right') dot = position.x;
  else throw new RangeError(`不明な半円の向きです: ${blockedSide}`);
  return dot < 0; // 直径上は障害物の縁なので衝突
}

// 中心の円の枠線を描く弧({M}): 塞がった部分と接する弧だけ(開いた方向には描かない)。
// { fromDeg, toDeg } は fromDeg から反時計回りに toDeg まで
export function centerRimArcs(obstacle, p) {
  if (obstacle.type === 'blades') {
    const n = obstacle.openingCount ?? 3;
    const half = p.bladeOpeningDeg / 2;
    return Array.from({ length: n }, (_, i) => ({
      fromDeg: normalizeAngleDeg(obstacle.rotationDeg + i * 360 / n + half),
      toDeg: normalizeAngleDeg(obstacle.rotationDeg + (i + 1) * 360 / n - half),
    }));
  }
  if (obstacle.type === 'sector') {
    const half = p.sectorOpeningDeg / 2;
    return [{ fromDeg: normalizeAngleDeg(obstacle.openCenterDeg + half), toDeg: normalizeAngleDeg(obstacle.openCenterDeg - half) }];
  }
  return [];
}

// 羽根と扇形は、中心から centerOpenRadius の円の中を安全にする(2026-09-30 本番に合わせて変更。円の縁は開口の判定に従う)
function insideCenterOpening(radius, p) {
  return radius < p.centerOpenRadius;
}

export function isBladeOpeningSafe(position, rotationDeg, p, openingCount = 3) {
  const { radius, angleDeg } = toPolar(position);
  if (insideCenterOpening(radius, p)) return true;
  const halfOpening = p.bladeOpeningDeg / 2;
  for (let i = 0; i < openingCount; i++) {
    const center = normalizeAngleDeg(rotationDeg + i * 360 / openingCount);
    if (angularDistanceDeg(angleDeg, center) < halfOpening - ANGLE_EPSILON_DEG) return true; // 開口の端は衝突
  }
  return false;
}

export function isSectorOpeningSafe(position, openCenterDeg, p) {
  const { radius, angleDeg } = toPolar(position);
  if (insideCenterOpening(radius, p)) return true;
  return angularDistanceDeg(angleDeg, openCenterDeg) < p.sectorOpeningDeg / 2 - ANGLE_EPSILON_DEG;
}

// 穴の位置: 1つ・2つ空きは90°ずつの4か所(holeSlotCount)、3つ空きは120°ずつの3か所(holeThreeSlotCount)。
// (2026-10-01 ユーザーの実機の感想で、3つ空きを120°ずつに変更)
export function holeCenters(obstacle, p) {
  const slotCount = obstacle.openSlots.length === 3 ? p.holeThreeSlotCount : p.holeSlotCount;
  return obstacle.openSlots.map(slot => {
    const angle = slot * 360 / slotCount + (obstacle.rotationDeg ?? 0);
    const rad = angle * Math.PI / 180;
    return { x: Math.cos(rad) * p.holeRingRadius, y: Math.sin(rad) * p.holeRingRadius };
  });
}

// 穴の半径: 3つ空きは holeThreeRadius(0.323)、1つ・2つ空きは holeRadius(0.38)({M})
export function holeRadiusFor(obstacle, p) {
  return obstacle.openSlots.length === 3 ? p.holeThreeRadius : p.holeRadius;
}

export function isHoleOpeningSafe(position, obstacle, p) {
  const radius = holeRadiusFor(obstacle, p);
  const limitSquared = radius * radius;
  return holeCenters(obstacle, p).some(center => {
    const dx = position.x - center.x;
    const dy = position.y - center.y;
    return dx * dx + dy * dy < limitSquared - Number.EPSILON;
  });
}

// 回転する長方形(2026-09-30 本番に合わせて追加。ユーザーの実機の感想で反転): トンネルの中心を通り直径いっぱいに伸びる
// 幅 barWidth の帯の中だけが通れる場所で、帯の外はすべて衝突。帯の縁ちょうども衝突。帯の向きは rotationDeg。
// 帯の両端も塞ぐ: 通れるのは長さ barLength・幅 barWidth の長方形の中だけ({M})
export function isBarSafe(position, rotationDeg, p) {
  const rad = rotationDeg * Math.PI / 180;
  const distance = Math.abs(-position.x * Math.sin(rad) + position.y * Math.cos(rad));
  const along = Math.abs(position.x * Math.cos(rad) + position.y * Math.sin(rad));
  return distance < p.barWidth / 2 - Number.EPSILON && along < p.barLength / 2 - Number.EPSILON;
}

export function isObstacleSafe(obstacle, position, p) {
  if (obstacle.type === 'half') return isHalfOpeningSafe(position, obstacle.blockedSide);
  if (obstacle.type === 'blades') return isBladeOpeningSafe(position, obstacle.rotationDeg, p, obstacle.openingCount ?? 3);
  if (obstacle.type === 'sector') return isSectorOpeningSafe(position, obstacle.openCenterDeg, p);
  if (obstacle.type === 'holes') return isHoleOpeningSafe(position, obstacle, p);
  if (obstacle.type === 'bar') return isBarSafe(position, obstacle.rotationDeg, p);
  throw new RangeError(`不明な障害物です: ${obstacle.type}`);
}

// 当たり判定の円(2026-09-30 ユーザーの実機の感想で追加): 自機を半径 hitRadius の円とし、
// 中心と円周上の8点がすべて安全なときだけ通過。どこか1点でも塞がった所にかかれば衝突
const HIT_CIRCLE_POINTS = 8;
export function isAircraftSafe(obstacle, position, p) {
  if (!isObstacleSafe(obstacle, position, p)) return false;
  for (let i = 0; i < HIT_CIRCLE_POINTS; i++) {
    const a = i * 2 * Math.PI / HIT_CIRCLE_POINTS;
    const point = { x: position.x + Math.cos(a) * p.hitRadius, y: position.y + Math.sin(a) * p.hitRadius };
    if (!isObstacleSafe(obstacle, point, p)) return false;
  }
  return true;
}

export function crossedAircraftPlane(previousZ, nextZ, collisionZ) {
  return previousZ > collisionZ && nextZ <= collisionZ;
}

export function baseSpeedAt(elapsedSec, p) {
  return Math.min(p.maxSpeed, p.initialSpeed + p.acceleration * elapsedSec);
}

export function advanceSpeed(currentSpeed, elapsedSec, dtSec, p) {
  const base = baseSpeedAt(elapsedSec, p);
  if (currentSpeed >= base) return base;
  return Math.min(base, currentSpeed + p.recoveryAcceleration * dtSec);
}

export function applyCollisionSpeed(speed, p) {
  return speed * p.collisionSpeedFactor;
}

// 羽根の開口の数: 1つ・2つ・3つを bladeOpen1Rate・bladeOpen2Rate・bladeOpen3Rate の比で選ぶ
// (2026-09-30 ユーザーの実機の感想で 40%・40%・20%。7回目で 50%・50%・0%: 放射能マークは出さない)
export function pickBladeOpeningCount(rng, p) {
  const rates = [p.bladeOpen1Rate, p.bladeOpen2Rate, p.bladeOpen3Rate];
  let r = rng() * rates.reduce((sum, v) => sum + v, 0);
  for (let i = 0; i < rates.length; i++) {
    if (r < rates[i]) return i + 1;
    r -= rates[i];
  }
  return rates.findLastIndex(v => v > 0) + 1;
}

// 5種類(半円・3枚羽根・扇形・小穴・回転する長方形)を同じ確率で出す
export const OBSTACLE_TYPES = Object.freeze(['half', 'blades', 'sector', 'holes', 'bar']);

// 同じ種類は続けて maxSameObstacleRun(2)個まで(2026-10-01 ユーザーの判断で追加)。
// recent: 手前から奥の順の、直前に並んだ障害物の種類。最後の maxSameObstacleRun 個が同じ種類なら、その種類を除いて選ぶ
function pickObstacleType(rng, p, recent) {
  const run = p.maxSameObstacleRun;
  const tail = recent.slice(-run);
  const banned = tail.length === run && tail.every(type => type === tail[0]) ? tail[0] : null;
  const allowed = OBSTACLE_TYPES.filter(type => type !== banned);
  return allowed[Math.floor(rng() * allowed.length)];
}

export function createObstacle(rng, z, id, p, recent = []) {
  const typeIndex = OBSTACLE_TYPES.indexOf(pickObstacleType(rng, p, recent));
  if (typeIndex === 0) {
    return {
      id, type: 'half', z,
      blockedSide: HALF_SIDES[Math.floor(rng() * HALF_SIDES.length)],
    };
  }
  if (typeIndex === 1) {
    return {
      id, type: 'blades', z,
      rotationDeg: rng() * 360,
      rotationDirection: rng() < 0.5 ? -1 : 1,
      openingCount: pickBladeOpeningCount(rng, p),
    };
  }
  if (typeIndex === 2) {
    return {
      id, type: 'sector', z,
      openCenterDeg: SECTOR_CENTERS[Math.floor(rng() * SECTOR_CENTERS.length)],
      rotationDirection: rng() < 0.5 ? -1 : 1,
    };
  }
  if (typeIndex === 4) {
    return { id, type: 'bar', z, rotationDeg: rng() * 180, rotationDirection: rng() < 0.5 ? -1 : 1 };
  }
  const openCount = p.holeOpenCounts[Math.floor(rng() * p.holeOpenCounts.length)];
  if (openCount === 3) {
    // 3つ空きは120°ずつの3か所すべて。1つが上下左右のどれかに来るよう、向きを90°ずつから選ぶ
    const rotationDeg = 90 * Math.floor(rng() * 4);
    // 回転するのは3穴だけ(確率 holeRotationRate)。1穴・2穴は回転しない(2026-09-30 本番に合わせて変更)
    const rotationDirection = rng() >= p.holeRotationRate ? 0 : (rng() < 0.5 ? -1 : 1);
    return { id, type: 'holes', z, openSlots: Array.from({ length: p.holeThreeSlotCount }, (_, i) => i), rotationDeg, rotationDirection };
  }
  const slots = Array.from({ length: p.holeSlotCount }, (_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return { id, type: 'holes', z, openSlots: slots.slice(0, openCount), rotationDeg: 0, rotationDirection: 0 };
}

export function createInitialObstacles(rng, p) {
  const out = [];
  let z = p.collisionZ + p.firstObstacleDistance;
  let id = 1;
  while (z <= p.farZ) {
    out.push(createObstacle(rng, z, id++, p, out.map(o => o.type)));
    z += p.obstacleSpacing;
  }
  return out;
}

export function advanceObstacle(obstacle, distanceDelta, elapsedSec, dtSec, p) {
  const next = { ...obstacle, z: obstacle.z - distanceDelta };
  if (obstacle.type === 'blades' || obstacle.type === 'sector' || obstacle.type === 'bar'
      || (obstacle.type === 'holes' && obstacle.rotationDirection !== 0)) {
    const end = elapsedSec + dtSec;
    const turn = p.bladeInitialAngularSpeedDegSec * dtSec
      + 0.5 * p.bladeAngularAccelerationDegSec2 * (end * end - elapsedSec * elapsedSec);
    if (obstacle.type !== 'sector') next.rotationDeg = normalizeAngleDeg((obstacle.rotationDeg ?? 0) + obstacle.rotationDirection * turn);
    else next.openCenterDeg = normalizeAngleDeg(obstacle.openCenterDeg + obstacle.rotationDirection * turn);
  }
  return next;
}

// 機体の面を過ぎた障害物を奥で作り直す。
// holdHit(巻き戻しの間)は、ぶつかった障害物(held)をその場に残す。巻き戻しで奥へ戻り、再び近づいてくる
export function recycleObstacles(obstacles, rng, p, holdHit = false) {
  const active = obstacles.filter(o => o.z > p.collisionZ);
  let farthest = Math.max(p.farZ - p.obstacleSpacing, ...active.map(o => o.z));
  const kept = o => o.z > p.collisionZ || (holdHit && o.held);
  // 奥に並んでいる順の種類(作り直した障害物は一番奥に足す)。同じ種類が続きすぎないように使う
  const recent = obstacles.filter(kept).sort((a, b) => a.z - b.z).map(o => o.type);
  return obstacles.map(o => {
    if (kept(o)) return o;
    farthest += p.obstacleSpacing;
    const made = createObstacle(rng, farthest, o.id, p, recent);
    recent.push(made.type);
    return made;
  });
}

export function drawableObstacles(obstacles, p) {
  return obstacles.filter(o => o.z > p.collisionZ);
}

export function createT6State(rng, p) {
  return {
    elapsedSec: 0,
    speed: p.initialSpeed,
    distance: 0,
    maxSpeedReached: p.initialSpeed,
    position: { x: 0, y: 0 },
    obstacles: createInitialObstacles(rng, p),
    cleared: 0,
    collisions: 0,
    pushback: null,
    recoveryCapId: null, // ぶつかった障害物の id。これを通過するまで速度を recoveryCapSpeed に抑える
  };
}

// 衝突したときの巻き戻し(2026-09-27 ユーザーの判断で変更)。
// 機体は横に動かさず、collisionPushMs かけて進行を collisionPullbackDistance だけなめらかに戻す。
// この間は入力を受け付けない。戻り値の pullDistance は、この1歩で戻す距離。
function advancePullback(pushback, dtSec, p) {
  if (!pushback) return { pushback: null, pullSec: 0, pullDistance: 0 };
  const remainingMs = Math.max(0, p.collisionPushMs - pushback.elapsedMs);
  const usedMs = Math.min(remainingMs, dtSec * 1000);
  const fraction = p.collisionPushMs > 0 ? usedMs / p.collisionPushMs : 1;
  const elapsedMs = pushback.elapsedMs + usedMs;
  return {
    pushback: elapsedMs >= p.collisionPushMs ? null : { elapsedMs },
    pullSec: usedMs / 1000,
    pullDistance: p.collisionPullbackDistance * fraction,
  };
}

// 操縦: control.stick(操縦の円の中の位置。押していなければ null)があれば、その位置がそのまま自機の位置。
// なければ control.keys(矢印キー)で moveSpeed だけ動かす。どちらも無ければ最後の位置のまま。
// 巻き戻しの間は操縦を受け付けない。
function steer(state, control, dtSec, p) {
  if (state.pushback) return state.position;
  if (control.stick) return stickToPosition(control.stick, p);
  return moveAircraft(state.position, control.keys ?? { x: 0, y: 0 }, dtSec, p);
}

export function stepT6State(state, control, dtSec, p, rng) {
  if (!Number.isFinite(dtSec) || dtSec < 0) throw new RangeError('dtSec は0以上の有限値である必要があります');
  const nextElapsed = state.elapsedSec + dtSec;
  const pull = advancePullback(state.pushback, dtSec, p);
  const position = steer(state, control ?? {}, dtSec, p);
  // 衝突のあとは、ぶつかった障害物を通過するまで速度を recoveryCapSpeed より上げない(2026-09-30 ユーザーの実機の感想で追加)
  let recoveryCapId = state.recoveryCapId ?? null;
  const capped = speed => (recoveryCapId === null ? speed : Math.min(speed, p.recoveryCapSpeed));
  const speedBeforeCollision = capped(advanceSpeed(state.speed, nextElapsed, dtSec, p));
  // 巻き戻しの間は前へ進まない。巻き戻しがこの1歩の途中で終われば、残りの時間だけ進む
  const forwardSec = dtSec - pull.pullSec;
  const distanceDelta = (state.speed + speedBeforeCollision) * 0.5 * forwardSec - pull.pullDistance;
  let speed = speedBeforeCollision;
  let cleared = state.cleared;
  let collisions = state.collisions;
  let pushback = pull.pushback;

  let obstacles = state.obstacles.map(o => {
    const moved = advanceObstacle(o, distanceDelta, state.elapsedSec, dtSec, p);
    // ぶつかった障害物は、巻き戻しで機体の面より奥へ戻ったら普通の障害物に戻す(当たり判定は消さない)
    if (moved.held && moved.z > p.collisionZ) delete moved.held;
    return moved;
  });
  for (let i = 0; i < obstacles.length; i++) {
    const previous = state.obstacles[i];
    const obstacle = obstacles[i];
    if (!crossedAircraftPlane(previous.z, obstacle.z, p.collisionZ)) continue;
    if (isAircraftSafe(obstacle, position, p)) {
      cleared++;
      if (obstacle.id === recoveryCapId) recoveryCapId = null; // ぶつかった障害物を通過したら、今までどおり加速する
    } else {
      // 衝突はそのたびに数える。ぶつかった障害物は巻き戻しの間その場に残し、再び近づいてくる
      collisions++;
      recoveryCapId = obstacle.id;
      speed = capped(applyCollisionSpeed(speed, p));
      obstacles[i] = { ...obstacle, held: true };
      pushback = { elapsedMs: 0 };
    }
  }
  // 巻き戻しで奥へ戻らずに作り直される(巻き戻し距離0など)ときは、上限も外す
  if (recoveryCapId !== null && pushback === null
      && obstacles.some(o => o.id === recoveryCapId && o.held && o.z <= p.collisionZ)) recoveryCapId = null;
  obstacles = recycleObstacles(obstacles, rng, p, pushback !== null);

  return {
    ...state,
    elapsedSec: nextElapsed,
    speed,
    distance: state.distance + distanceDelta,
    maxSpeedReached: Math.max(state.maxSpeedReached, speedBeforeCollision),
    position,
    obstacles,
    cleared,
    collisions,
    pushback,
    recoveryCapId,
  };
}

export function summarizeT6(state) {
  return {
    score: state.cleared,
    detail: {
      collisions: state.collisions,
      distance: Math.round(state.distance * 10) / 10,
      maxSpeed: Math.round(state.maxSpeedReached * 100) / 100,
    },
  };
}

export function buildT6Record({ date, state, settings }) {
  const { score, detail } = summarizeT6(state);
  return { id: `${date}-t6`, test: 't6', date, score, detail, settings: { ...settings } };
}
