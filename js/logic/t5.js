// テスト5 点の数: 問題と点配置、時間境界、採点。DOMとCanvasには触れない。
import { randInt, shuffle } from '../core/rng.js';

const TAU = Math.PI * 2;

function candidateDots(phase) {
  const dots = [{ x: 0, y: 0 }];
  for (let i = 0; i < 6; i++) {
    const angle = phase + i * TAU / 6;
    dots.push({ x: Math.cos(angle) * 0.3, y: Math.sin(angle) * 0.3 });
  }
  for (let i = 0; i < 12; i++) {
    const angle = phase + Math.PI / 12 + i * TAU / 12;
    dots.push({ x: Math.cos(angle) * 0.68, y: Math.sin(angle) * 0.68 });
  }
  return dots;
}

function validateCount(count, p) {
  if (!Number.isInteger(count) || count < p.minDots || count > p.maxDots || count > 19) {
    throw new RangeError(`点の数は${p.minDots}〜${Math.min(p.maxDots, 19)}の整数で指定してください`);
  }
}

function makeLayout(count, rng, p, previousPhase = null) {
  validateCount(count, p);
  let phase = rng() * TAU;
  if (phase === previousPhase) phase = (phase + Math.PI / 24) % TAU;
  const dots = shuffle(rng, candidateDots(phase)).slice(0, count);
  return { dots, phase };
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
  return { count: problem.count, ...makeLayout(problem.count, rng, p, problem.phase) };
}

export function shuffleIndexAt(elapsedMs, p) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new RangeError('経過時間は0以上の有限値で指定してください');
  return Math.floor(elapsedMs / p.shuffleIntervalMs);
}

// 全体終了と同時なら全体終了を優先し、表示中の問題を未回答に数えない。
export function shouldTimeoutT5(nowMs, questionDeadlineMs, overallDeadlineMs) {
  return nowMs >= questionDeadlineMs && questionDeadlineMs < overallDeadlineMs;
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
