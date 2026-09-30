// テスト5 計器の読み取り(内部 id t4): 問題生成、方位計算、選択状態、採点。DOMには触れない。
// 2026-09-30 本番に合わせて変更: 左の計器は GYRO(文字盤が回る方向指示器)、右は RBI。電波局は NDB と呼ぶ。
// 問題の作り方・正解の計算・採点は変えていない。
import { correctFeedback } from '../core/feedback.js';

export const DIRECTIONS = Object.freeze([
  Object.freeze({ key: 'N', label: '↑', row: 0, col: 1 }),
  Object.freeze({ key: 'NE', label: '↗', row: 0, col: 2 }),
  Object.freeze({ key: 'E', label: '→', row: 1, col: 2 }),
  Object.freeze({ key: 'SE', label: '↘', row: 2, col: 2 }),
  Object.freeze({ key: 'S', label: '↓', row: 2, col: 1 }),
  Object.freeze({ key: 'SW', label: '↙', row: 2, col: 0 }),
  Object.freeze({ key: 'W', label: '←', row: 1, col: 0 }),
  Object.freeze({ key: 'NW', label: '↖', row: 0, col: 0 }),
]);

const PROBLEMS = Object.freeze(
  Array.from({ length: 8 }, (_, headingIndex) => (
    Array.from({ length: 8 }, (__, relativeIndex) => Object.freeze({ headingIndex, relativeIndex }))
  )).flat(),
);

function direction(key) {
  return DIRECTIONS.find(d => d.key === key) ?? null;
}

export function solutionFor(headingIndex, relativeIndex) {
  if (!Number.isInteger(headingIndex) || headingIndex < 0 || headingIndex >= 8
      || !Number.isInteger(relativeIndex) || relativeIndex < 0 || relativeIndex >= 8) {
    throw new RangeError('方位は0以上8未満の整数で指定してください');
  }
  const towerDirection = (headingIndex + relativeIndex) % 8;
  return {
    towerDirection,
    position: DIRECTIONS[(towerDirection + 4) % 8].key,
    heading: DIRECTIONS[headingIndex].key,
  };
}

export function generateT4Problem(rng, previous = null) {
  const candidates = previous
    ? PROBLEMS.filter(p => p.headingIndex !== previous.headingIndex || p.relativeIndex !== previous.relativeIndex)
    : PROBLEMS;
  return { ...candidates[Math.floor(rng() * candidates.length)] };
}

function checkIndex(index, name) {
  if (!Number.isInteger(index) || index < 0 || index >= DIRECTIONS.length) {
    throw new RangeError(`${name}は0以上8未満の整数で指定してください`);
  }
}

// GYRO: 文字盤を −(機首の方位)だけ回す。上の固定の▲の位置に来た方位が機首
export function gyroCardRotationDeg(headingIndex) {
  checkIndex(headingIndex, '機首の方位');
  return 0 - headingIndex * 45; // 機首 N で -0 にしない
}

// 文字盤を rotationDeg 回したとき、上の▲の位置に来る方位
export function gyroDirectionAtTop(rotationDeg) {
  const deg = ((-rotationDeg % 360) + 360) % 360;
  return DIRECTIONS[Math.round(deg / 45) % 8].key;
}

// RBI: 0 を上に固定した文字盤で、針が NDB の相対方位を指す
export function rbiNeedleDeg(relativeIndex) {
  checkIndex(relativeIndex, '相対方位');
  return relativeIndex * 45;
}

// RBI の読み(文字盤の数字は ×10°。例: 90° → 9)
export function rbiReading(relativeIndex) {
  return String(rbiNeedleDeg(relativeIndex) / 10);
}

export function planeRotationDeg(heading) {
  const index = DIRECTIONS.findIndex(d => d.key === heading);
  if (index < 0) throw new RangeError('不明な機首の向きです');
  return index * 45;
}

export function createT4Example() {
  const problem = { headingIndex: 1, relativeIndex: 2 };
  const { position, heading } = solutionFor(problem.headingIndex, problem.relativeIndex);
  return { problem, selection: { position, heading } };
}

const RBI_WHERE = Object.freeze(['機首の方向', '機首の右前', '機首の右', '機首の右後ろ', '機首の真後ろ', '機首の左後ろ', '機首の左', '機首の左前']);
const RBI_TURN = Object.freeze(['正面', '右45°', '右90°', '右135°', '真後ろ', '左135°', '左90°', '左45°']);

// 解説(例題・練習・判定): GYRO と RBI の読み方で書く
export function explainT4Solution(problem) {
  const { towerDirection, position, heading } = solutionFor(problem.headingIndex, problem.relativeIndex);
  const r = problem.relativeIndex;
  return [
    `1. GYRO の▲の位置が機首 → 機首は ${heading}`,
    `2. RBI の針は ${rbiReading(r)}(${RBI_WHERE[r]})→ NDB は ${heading} の${RBI_TURN[r]} = ${DIRECTIONS[towerDirection].key}`,
    `3. 自機は NDB の反対の ${position} のマス。向きは機首のまま ${heading}`,
  ];
}

export function createT4Practice(rng, previous = null) {
  return { phase: 'question', index: 0, answers: [], problem: generateT4Problem(rng, previous), feedback: null };
}

export function answerT4Practice(state, selection) {
  if (state.phase !== 'question') throw new Error('練習の回答を受け付けていません');
  const result = judgeT4(state.problem, selection);
  const feedback = { selection: { ...selection }, solution: solutionFor(state.problem.headingIndex, state.problem.relativeIndex), correct: result.correct };
  return { ...state, phase: 'explanation', answers: [...state.answers, feedback], feedback };
}

export function advanceT4Practice(state, rng) {
  if (state.phase !== 'explanation') throw new Error('解説を見てから進んでください');
  if (state.index === 2) return { ...state, phase: 'complete', problem: null, lastProblem: state.problem, feedback: null };
  return { ...state, phase: 'question', index: state.index + 1,
    problem: generateT4Problem(rng, state.problem), feedback: null };
}

export function createT4Selection() {
  return { position: null, heading: null };
}

export function selectT4Position(selection, position) {
  if (!direction(position)) throw new RangeError(`不明な位置です: ${position}`);
  return { ...selection, position };
}

export function selectT4Heading(selection, heading) {
  if (!direction(heading)) throw new RangeError(`不明な向きです: ${heading}`);
  return { ...selection, heading };
}

export function canSubmitT4(selection) {
  return direction(selection.position) !== null && direction(selection.heading) !== null;
}

export function judgeT4(problem, selection) {
  if (!canSubmitT4(selection)) throw new Error('位置と向きの両方を選んでください');
  const solution = solutionFor(problem.headingIndex, problem.relativeIndex);
  const positionCorrect = selection.position === solution.position;
  const headingCorrect = selection.heading === solution.heading;
  return { positionCorrect, headingCorrect, correct: positionCorrect && headingCorrect };
}

// 即時判定: 正解は1行、不正解は位置と向きの○×と、イラストに描く正しいマス・向き
export function t4Feedback(problem, selection) {
  const result = judgeT4(problem, selection);
  if (result.correct) return { ...correctFeedback(), text: '○ 位置・向きとも正解' };
  const mark = ok => (ok ? '○' : '×');
  const { position, heading } = solutionFor(problem.headingIndex, problem.relativeIndex);
  return {
    kind: 'wrong',
    text: `位置 ${mark(result.positionCorrect)} ・ 向き ${mark(result.headingCorrect)}`,
    solution: { position, heading },
  };
}

export function createT4Tally() {
  return { correct: 0, answered: 0, positionOnlyCorrect: 0, headingOnlyCorrect: 0 };
}

export function recordT4Answer(tally, result) {
  const next = { ...tally, answered: tally.answered + 1 };
  if (result.correct) next.correct++;
  else if (result.positionCorrect) next.positionOnlyCorrect++;
  else if (result.headingCorrect) next.headingOnlyCorrect++;
  return next;
}

export function summarizeT4(tally) {
  return {
    score: tally.correct,
    detail: {
      answered: tally.answered,
      correct: tally.correct,
      positionOnlyCorrect: tally.positionOnlyCorrect,
      headingOnlyCorrect: tally.headingOnlyCorrect,
    },
  };
}

export function buildT4Record({ date, tally, settings }) {
  const { score, detail } = summarizeT4(tally);
  return { id: `${date}-t4`, test: 't4', date, score, detail, settings: { ...settings } };
}
