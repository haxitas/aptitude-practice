// テスト4 点の数(内部 id t5): 段階と出す数、選択肢、点配置、時間境界、採点。DOMとCanvasには触れない。
// 2026-09-30 本番に合わせて変更: 点の数は内部の「段階」で決め、答えは連続した5つの数から選ぶ。
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

// ---- 段階(2026-09-30 本番に合わせて追加) ----
// 最初は minDots。正解で +1、levelDownWrongStreak 回続けて不正解で −1。minDots〜maxDots に収める。

export function createT5Level(p) {
  return { level: p.minDots, wrongStreak: 0, maxLevel: p.minDots };
}

export function nextT5Level(state, correct, p) {
  if (correct) {
    const level = Math.min(p.maxDots, state.level + 1);
    return { level, wrongStreak: 0, maxLevel: Math.max(state.maxLevel, level) };
  }
  const wrongStreak = state.wrongStreak + 1;
  if (wrongStreak < p.levelDownWrongStreak) return { ...state, wrongStreak };
  return { level: Math.max(p.minDots, state.level - 1), wrongStreak: 0, maxLevel: state.maxLevel };
}

// 出す数の範囲: 段階 − levelSpreadDown 〜 段階 + levelSpreadUp(平均で少し多めに出る)。minDots〜maxDots に収める
export function t5CountRange(level, p) {
  return { min: Math.max(p.minDots, level - p.levelSpreadDown), max: Math.min(p.maxDots, level + p.levelSpreadUp) };
}

// 範囲から一様に選ぶ。直前と同じ数は避ける(候補が1つしかないときを除く)
export function pickT5Count(rng, level, p, previousCount = null) {
  const { min, max } = t5CountRange(level, p);
  const all = [];
  for (let n = min; n <= max; n++) all.push(n);
  const counts = all.length > 1 ? all.filter(n => n !== previousCount) : all;
  return counts[randInt(rng, 0, counts.length - 1)];
}

// 回答の選択肢: 正解を含む連続した choiceCount 個の数。正解の位置はランダム、一番小さい選択肢は1以上
export function makeT5Choices(rng, answer, p) {
  const lastPosition = Math.min(p.choiceCount - 1, answer - 1);
  const position = randInt(rng, 0, lastPosition);
  const first = answer - position;
  return Array.from({ length: p.choiceCount }, (_, i) => first + i);
}

// 最初の1問(previous が null)は段階そのままの数、2問目からは段階の上下の範囲から選ぶ
export function generateT5Problem(rng, p, previous = null, level = p.minDots) {
  const count = previous ? pickT5Count(rng, level, p, previous.count) : level;
  return { count, choices: makeT5Choices(rng, count, p), ...makeLayout(count, rng, p) };
}

export function reshuffleT5Dots(problem, rng, p) {
  return { ...problem, ...makeLayout(problem.count, rng, p) };
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
  return Math.floor(elapsedMs / p.shuffleIntervalMs) + 1;
}

// 全体終了と同時なら全体終了を優先し、表示中の問題を未回答に数えない。
export function shouldTimeoutT5(nowMs, questionStartMs, p, overallDeadlineMs) {
  if (p.questionLimitSec === 0) return false;
  const questionDeadlineMs = questionStartMs + p.questionLimitSec * 1000;
  return nowMs >= questionDeadlineMs && questionDeadlineMs < overallDeadlineMs;
}

// 即時判定: 正解は「○ 正解 8個」、不正解は正解とあなたの答え
export function t5Feedback(correctAnswer, answer) {
  return answer === correctAnswer
    ? { kind: 'correct', text: `○ 正解 ${correctAnswer}個` }
    : { kind: 'wrong', text: `× 正解は ${correctAnswer}個 / あなたの答え ${answer}個` };
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

// level: 段階(内訳の「到達した最大の数」に使う)
export function summarizeT5(tally, level) {
  const meanError = tally.errors.length
    ? Math.round((tally.errors.reduce((sum, value) => sum + value, 0) / tally.errors.length) * 10) / 10
    : null;
  return {
    score: tally.correct,
    detail: { answered: tally.answered, unanswered: tally.unanswered, meanError, maxLevel: level.maxLevel },
  };
}

export function buildT5Record({ date, tally, level, settings }) {
  const { score, detail } = summarizeT5(tally, level);
  return { id: `${date}-t5`, test: 't5', date, score, detail, settings: { ...settings } };
}
