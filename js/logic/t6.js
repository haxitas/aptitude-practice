// テスト6 トンネル飛行: 座標変換、疑似3D投影、障害物、衝突、物理、採点。
// DOM と Canvas には触れない。

const HALF_SIDES = Object.freeze(['up', 'down', 'left', 'right']);
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

// 60Hz では差の followRate(既定20%)を進み、ほかのfpsでも同じ実時間なら同じ位置になる。
export function followPosition(position, target, dtMs, p) {
  const referenceMs = 1000 / p.followReferenceFps;
  const alpha = 1 - (1 - p.followRate) ** (dtMs / referenceMs);
  return {
    x: position.x + (target.x - position.x) * alpha,
    y: position.y + (target.y - position.y) * alpha,
  };
}

// タッチ位置を下へずらしても、機体を断面の下端へ置く指がCanvas内に収まる最大円を作る。
export function computeTunnelLayout(width, height, p) {
  if (!(width > 0) || !(height > 0)) throw new RangeError('Canvas の幅と高さは0より大きい必要があります');
  const margin = p.canvasMarginPx;
  const touchOffsetPx = height * p.touchOffsetRatio;
  const byWidth = width / 2 - margin;
  const byHeight = height / 2 - margin;
  const byTouch = (height - 2 * margin - touchOffsetPx) / (1 + p.aircraftMaxRadius);
  const radius = Math.min(byWidth, byHeight, byTouch);
  if (!(radius > 0)) throw new RangeError('Canvas が小さすぎてトンネルを配置できません');
  return {
    width, height, radius, touchOffsetPx,
    centerX: width / 2,
    centerY: margin + radius,
  };
}

export function sectionToPointer(position, layout, pointerType = 'mouse') {
  const offset = pointerType === 'touch' ? layout.touchOffsetPx : 0;
  return {
    x: layout.centerX + position.x * layout.radius,
    y: layout.centerY - position.y * layout.radius + offset,
  };
}

export function pointerToSection(pointer, layout, pointerType = 'mouse', maxRadius = 1) {
  const offset = pointerType === 'touch' ? layout.touchOffsetPx : 0;
  return clampToTunnel({
    x: (pointer.x - layout.centerX) / layout.radius,
    y: (layout.centerY - (pointer.y - offset)) / layout.radius,
  }, maxRadius);
}

export function projectScale(focal, z) {
  if (!Number.isFinite(z) || z <= 0) throw new RangeError('z は0より大きい有限値である必要があります');
  if (!Number.isFinite(focal) || focal <= 0) throw new RangeError('focal は0より大きい有限値である必要があります');
  return focal / z;
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

export function isBladeOpeningSafe(position, rotationDeg, p) {
  const { radius, angleDeg } = toPolar(position);
  if (radius <= p.bladeHubRadius) return false; // 中心円の縁も衝突
  const halfOpening = p.bladeOpeningDeg / 2;
  for (let i = 0; i < 3; i++) {
    const center = normalizeAngleDeg(rotationDeg + i * 120);
    if (angularDistanceDeg(angleDeg, center) < halfOpening - ANGLE_EPSILON_DEG) return true; // 開口の端は衝突
  }
  return false;
}

export function isObstacleSafe(obstacle, position, p) {
  if (obstacle.type === 'half') return isHalfOpeningSafe(position, obstacle.blockedSide);
  if (obstacle.type === 'blades') return isBladeOpeningSafe(position, obstacle.rotationDeg, p);
  throw new RangeError(`不明な障害物です: ${obstacle.type}`);
}

export function safeDirection(obstacle, position, p) {
  if (obstacle.type === 'half') {
    if (obstacle.blockedSide === 'up') return { x: 0, y: -1 };
    if (obstacle.blockedSide === 'down') return { x: 0, y: 1 };
    if (obstacle.blockedSide === 'left') return { x: 1, y: 0 };
    return { x: -1, y: 0 };
  }
  const angle = toPolar(position).angleDeg;
  let center = normalizeAngleDeg(obstacle.rotationDeg);
  let best = angularDistanceDeg(angle, center);
  for (let i = 1; i < 3; i++) {
    const candidate = normalizeAngleDeg(obstacle.rotationDeg + i * 120);
    const distance = angularDistanceDeg(angle, candidate);
    if (distance < best) {
      best = distance;
      center = candidate;
    }
  }
  const rad = center * Math.PI / 180;
  return { x: Math.cos(rad), y: Math.sin(rad) };
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

export function createObstacle(rng, z, id, p) {
  if (rng() < 0.5) {
    return {
      id, type: 'half', z,
      blockedSide: HALF_SIDES[Math.floor(rng() * HALF_SIDES.length)],
    };
  }
  return {
    id, type: 'blades', z,
    rotationDeg: rng() * 360,
    rotationDirection: rng() < 0.5 ? -1 : 1,
  };
}

export function createInitialObstacles(rng, p) {
  const out = [];
  let z = p.collisionZ + p.firstObstacleDistance;
  let id = 1;
  while (z <= p.farZ) {
    out.push(createObstacle(rng, z, id++, p));
    z += p.obstacleSpacing;
  }
  return out;
}

export function advanceObstacle(obstacle, distanceDelta, elapsedSec, dtSec, p) {
  const next = { ...obstacle, z: obstacle.z - distanceDelta };
  if (obstacle.type === 'blades') {
    const end = elapsedSec + dtSec;
    const turn = p.bladeInitialAngularSpeedDegSec * dtSec
      + 0.5 * p.bladeAngularAccelerationDegSec2 * (end * end - elapsedSec * elapsedSec);
    next.rotationDeg = normalizeAngleDeg(obstacle.rotationDeg + obstacle.rotationDirection * turn);
  }
  return next;
}

export function recycleObstacles(obstacles, rng, p) {
  const active = obstacles.filter(o => o.z > p.nearZ);
  let farthest = Math.max(p.farZ - p.obstacleSpacing, ...active.map(o => o.z));
  return obstacles.map(o => {
    if (o.z > p.nearZ) return o;
    farthest += p.obstacleSpacing;
    return createObstacle(rng, farthest, o.id, p);
  });
}

export function createT6State(rng, p) {
  return {
    elapsedSec: 0,
    speed: p.initialSpeed,
    distance: 0,
    maxSpeedReached: p.initialSpeed,
    position: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    obstacles: createInitialObstacles(rng, p),
    cleared: 0,
    collisions: 0,
    pushback: null,
  };
}

function movePosition(state, target, dtSec, p) {
  if (!state.pushback) {
    return {
      position: clampToTunnel(followPosition(state.position, target, dtSec * 1000, p), p.aircraftMaxRadius),
      pushback: null,
    };
  }
  const elapsedMs = Math.min(p.collisionPushMs, state.pushback.elapsedMs + dtSec * 1000);
  const k = elapsedMs / p.collisionPushMs;
  const position = {
    x: state.pushback.from.x + (state.pushback.to.x - state.pushback.from.x) * k,
    y: state.pushback.from.y + (state.pushback.to.y - state.pushback.from.y) * k,
  };
  return {
    position,
    pushback: elapsedMs >= p.collisionPushMs ? null : { ...state.pushback, elapsedMs },
  };
}

export function stepT6State(state, target, dtSec, p, rng) {
  if (!Number.isFinite(dtSec) || dtSec < 0) throw new RangeError('dtSec は0以上の有限値である必要があります');
  const nextElapsed = state.elapsedSec + dtSec;
  const clampedTarget = clampToTunnel(target, p.aircraftMaxRadius);
  const moved = movePosition(state, clampedTarget, dtSec, p);
  const speedBeforeCollision = advanceSpeed(state.speed, nextElapsed, dtSec, p);
  const distanceDelta = (state.speed + speedBeforeCollision) * 0.5 * dtSec;
  let speed = speedBeforeCollision;
  let cleared = state.cleared;
  let collisions = state.collisions;
  let pushback = moved.pushback;

  let obstacles = state.obstacles.map(o => advanceObstacle(o, distanceDelta, state.elapsedSec, dtSec, p));
  for (let i = 0; i < obstacles.length; i++) {
    const previous = state.obstacles[i];
    const obstacle = obstacles[i];
    if (!crossedAircraftPlane(previous.z, obstacle.z, p.collisionZ)) continue;
    if (isObstacleSafe(obstacle, moved.position, p)) {
      cleared++;
    } else {
      collisions++;
      speed = applyCollisionSpeed(speed, p);
      const direction = safeDirection(obstacle, moved.position, p);
      const to = clampToTunnel({
        x: moved.position.x + direction.x * p.collisionPushDistance,
        y: moved.position.y + direction.y * p.collisionPushDistance,
      }, p.aircraftMaxRadius);
      pushback = { from: moved.position, to, elapsedMs: 0 };
    }
  }
  obstacles = recycleObstacles(obstacles, rng, p);

  return {
    ...state,
    elapsedSec: nextElapsed,
    speed,
    distance: state.distance + distanceDelta,
    maxSpeedReached: Math.max(state.maxSpeedReached, speedBeforeCollision),
    position: moved.position,
    target: clampedTarget,
    obstacles,
    cleared,
    collisions,
    pushback,
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
