// テスト6 トンネル飛行: 座標変換、疑似3D投影、障害物、衝突、物理、採点。
// DOM と Canvas には触れない。

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

export function combineInputs(a, b) {
  return normalizeInput({ x: a.x + b.x, y: a.y + b.y });
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

export function stickInputAt(pointer, layout) {
  const dx = pointer.x - layout.stick.centerX;
  const dy = layout.stick.centerY - pointer.y;
  const length = Math.hypot(dx, dy);
  if (length > layout.stick.radius) return null;
  return normalizeInput({ x: dx / layout.stick.radius, y: dy / layout.stick.radius });
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

export function isSectorOpeningSafe(position, openCenterDeg, p) {
  const { radius, angleDeg } = toPolar(position);
  if (radius === 0) return false;
  return angularDistanceDeg(angleDeg, openCenterDeg) < p.sectorOpeningDeg / 2 - ANGLE_EPSILON_DEG;
}

export function holeCenters(obstacle, p) {
  return obstacle.openSlots.map(slot => {
    const angle = slot * 360 / p.holeSlotCount;
    const rad = angle * Math.PI / 180;
    return { x: Math.cos(rad) * p.holeRingRadius, y: Math.sin(rad) * p.holeRingRadius };
  });
}

export function isHoleOpeningSafe(position, obstacle, p) {
  const limitSquared = p.holeRadius * p.holeRadius;
  return holeCenters(obstacle, p).some(center => {
    const dx = position.x - center.x;
    const dy = position.y - center.y;
    return dx * dx + dy * dy < limitSquared - Number.EPSILON;
  });
}

export function isObstacleSafe(obstacle, position, p) {
  if (obstacle.type === 'half') return isHalfOpeningSafe(position, obstacle.blockedSide);
  if (obstacle.type === 'blades') return isBladeOpeningSafe(position, obstacle.rotationDeg, p);
  if (obstacle.type === 'sector') return isSectorOpeningSafe(position, obstacle.openCenterDeg, p);
  if (obstacle.type === 'holes') return isHoleOpeningSafe(position, obstacle, p);
  throw new RangeError(`不明な障害物です: ${obstacle.type}`);
}

export function safeDirection(obstacle, position, p) {
  if (obstacle.type === 'half') {
    if (obstacle.blockedSide === 'up') return { x: 0, y: -1 };
    if (obstacle.blockedSide === 'down') return { x: 0, y: 1 };
    if (obstacle.blockedSide === 'left') return { x: 1, y: 0 };
    return { x: -1, y: 0 };
  }
  if (obstacle.type === 'sector') {
    const rad = obstacle.openCenterDeg * Math.PI / 180;
    return { x: Math.cos(rad), y: Math.sin(rad) };
  }
  if (obstacle.type === 'holes') {
    const centers = holeCenters(obstacle, p);
    let nearest = centers[0];
    let best = (position.x - nearest.x) ** 2 + (position.y - nearest.y) ** 2;
    for (let i = 1; i < centers.length; i++) {
      const distance = (position.x - centers[i].x) ** 2 + (position.y - centers[i].y) ** 2;
      if (distance < best) {
        best = distance;
        nearest = centers[i];
      }
    }
    const dx = nearest.x - position.x;
    const dy = nearest.y - position.y;
    const length = Math.hypot(dx, dy);
    if (length > 0) return { x: dx / length, y: dy / length };
    return normalizeInput(nearest);
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
  const typeIndex = Math.floor(rng() * 4);
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
    };
  }
  if (typeIndex === 2) {
    return {
      id, type: 'sector', z,
      openCenterDeg: SECTOR_CENTERS[Math.floor(rng() * SECTOR_CENTERS.length)],
    };
  }
  const slots = Array.from({ length: p.holeSlotCount }, (_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return { id, type: 'holes', z, openSlots: slots.slice(0, p.holeOpenCount) };
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
  const active = obstacles.filter(o => o.z > p.collisionZ);
  let farthest = Math.max(p.farZ - p.obstacleSpacing, ...active.map(o => o.z));
  return obstacles.map(o => {
    if (o.z > p.collisionZ) return o;
    farthest += p.obstacleSpacing;
    return createObstacle(rng, farthest, o.id, p);
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
  };
}

function movePosition(state, input, dtSec, p) {
  if (!state.pushback) {
    return {
      position: moveAircraft(state.position, input, dtSec, p),
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

export function stepT6State(state, input, dtSec, p, rng) {
  if (!Number.isFinite(dtSec) || dtSec < 0) throw new RangeError('dtSec は0以上の有限値である必要があります');
  const nextElapsed = state.elapsedSec + dtSec;
  const normalizedInput = normalizeInput(input);
  const moved = movePosition(state, normalizedInput, dtSec, p);
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
