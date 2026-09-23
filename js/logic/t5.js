// テスト5 点の数: 問題と点配置、時間境界、採点。DOMとCanvasには触れない。
import { randInt, shuffle } from '../core/rng.js';

const TAU = Math.PI * 2;

export function distanceSquared(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

export function isPointInsideCircle(point, fieldRadius, dotRadius) {
  const centerLimit = fieldRadius - dotRadius;
  return centerLimit >= 0 && point.x ** 2 + point.y ** 2 <= centerLimit ** 2 + Number.EPSILON;
}

export function hasMinimumDistance(points, minDistance) {
  const minSquared = minDistance ** 2;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (distanceSquared(points[i], points[j]) < minSquared - Number.EPSILON) return false;
    }
  }
  return true;
}

function randomPoint(rng, centerLimit) {
  const radius = Math.sqrt(rng()) * centerLimit;
  const angle = rng() * TAU;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function tryRandomLayout(rng, count, p) {
  const centerLimit = 1 - p.dotRadiusRatio;
  for (let restart = 0; restart < p.layoutRestartLimit; restart++) {
    const dots = [];
    for (let index = 0; index < count; index++) {
      let placed = false;
      for (let attempt = 0; attempt < p.placementAttemptLimit; attempt++) {
        const candidate = randomPoint(rng, centerLimit);
        if (dots.every(dot => distanceSquared(dot, candidate) >= p.dotMinDistanceRatio ** 2 - Number.EPSILON)) {
          dots.push(candidate);
          placed = true;
          break;
        }
      }
      if (!placed) break;
    }
    if (dots.length === count) return dots;
  }
  return null;
}

function fallbackGrid(rng, count, p) {
  const limit = 1 - p.dotRadiusRatio;
  const gap = p.dotMinDistanceRatio;
  const rowGap = gap * Math.sqrt(3) / 2;
  const rowLimit = Math.floor(limit / rowGap);
  const columnLimit = Math.floor(limit / gap) + 1;
  const candidates = [];
  for (let row = -rowLimit; row <= rowLimit; row++) {
    const y = row * rowGap;
    const offset = Math.abs(row) % 2 ? gap / 2 : 0;
    for (let column = -columnLimit; column <= columnLimit; column++) {
      const point = { x: column * gap + offset, y };
      if (isPointInsideCircle(point, 1, p.dotRadiusRatio)) candidates.push(point);
    }
  }
  const angle = rng() * TAU;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rotated = candidates.map(({ x, y }) => ({ x: x * cos - y * sin, y: x * sin + y * cos }));
  const dots = shuffle(rng, rotated).slice(0, count);
  if (dots.length !== count || !hasMinimumDistance(dots, gap)) {
    throw new RangeError('代用の格子配置でも必要な点数を置けません');
  }
  return dots;
}

export function generateDotPositions(rng, count, p) {
  const randomDots = tryRandomLayout(rng, count, p);
  if (randomDots) return { dots: randomDots, layoutMode: 'random' };
  return { dots: fallbackGrid(rng, count, p), layoutMode: 'fallback' };
}

function validateCount(count, p) {
  if (!Number.isInteger(count) || count < p.minDots || count > p.maxDots) {
    throw new RangeError(`点の数は${p.minDots}〜${p.maxDots}の整数で指定してください`);
  }
}

function makeLayout(count, rng, p) {
  validateCount(count, p);
  return generateDotPositions(rng, count, p);
}

export function generateT5Problem(rng, p, previous = null) {
  const counts = [];
  for (let n = p.minDots; n <= p.maxDots; n++) {
    if (!previous || n !== previous.count || p.minDots === p.maxDots) counts.push(n);
  }
  if (!counts.length) throw new RangeError('直前と異なる点の数を選べません');
  const count = counts[randInt(rng, 0, counts.length - 1)];
  return { count, ...makeLayout(count, rng, p) };
}

export function reshuffleT5Dots(problem, rng, p) {
  return { count: problem.count, ...makeLayout(problem.count, rng, p) };
}

// 旧点を順に、まだ使っていない最も近い新点へ対応させる。同距離は添字の小さい方。
export function pairDotPositions(old, next) {
  if (old.length !== next.length) throw new RangeError('移動前後の点数が違います');
  const used = new Set();
  return old.map((from, fromIndex) => {
    let toIndex = -1, nearest = Infinity;
    next.forEach((point, index) => {
      const distance = distanceSquared(from, point);
      if (!used.has(index) && distance < nearest) { nearest = distance; toIndex = index; }
    });
    used.add(toIndex);
    return { fromIndex, toIndex, from: { ...from }, to: { ...next[toIndex] } };
  });
}

export function interpolateDotPositions(pairs, elapsedMs, durationMs) {
  const k = durationMs <= 0 ? 1 : Math.max(0, Math.min(1, elapsedMs / durationMs));
  return pairs.map(({ from, to }) => k === 1 ? { ...to } : ({
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
  }));
}

export function shuffleIndexAt(elapsedMs, p) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new RangeError('経過時間は0以上の有限値で指定してください');
  return Math.floor(elapsedMs / p.shuffleIntervalMs);
}

// 全体終了と同時なら全体終了を優先し、表示中の問題を未回答に数えない。
export function shouldTimeoutT5(nowMs, questionDeadlineMs, overallDeadlineMs) {
  return nowMs >= questionDeadlineMs && questionDeadlineMs < overallDeadlineMs;
}

export function formatT5PreviousAnswer(correctAnswer, answer) {
  const shownAnswer = answer === null ? 'なし' : `${answer}個`;
  return `前の問題の正解: ${correctAnswer}個 / あなたの答え: ${shownAnswer} ${answer === correctAnswer ? '○' : '×'}`;
}

export function createT5Tally() {
  return { correct: 0, answered: 0, unanswered: 0, errors: [] };
}

export function recordT5Answer(tally, answer, correctAnswer) {
  if (!Number.isInteger(answer)) throw new RangeError('回答は整数で指定してください');
  const next = { ...tally, answered: tally.answered + 1, errors: [...tally.errors, Math.abs(answer - correctAnswer)] };
  if (answer === correctAnswer) next.correct++;
  return next;
}

export function recordT5Unanswered(tally) {
  return { ...tally, errors: tally.errors.slice(), unanswered: tally.unanswered + 1 };
}

export function summarizeT5(tally) {
  const meanError = tally.errors.length
    ? Math.round((tally.errors.reduce((sum, value) => sum + value, 0) / tally.errors.length) * 10) / 10
    : null;
  return {
    score: tally.correct,
    detail: { answered: tally.answered, unanswered: tally.unanswered, meanError },
  };
}

export function buildT5Record({ date, tally, settings }) {
  const { score, detail } = summarizeT5(tally);
  return { id: `${date}-t5`, test: 't5', date, score, detail, settings: { ...settings } };
}
