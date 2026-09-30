// テスト5 計器の読み取り(内部 id t4): 問題生成、方位計算、選択状態、採点。DOMには触れない。
// 2026-09-30 本番に合わせて変更: 左の計器は GYRO、右は RBI。電波局は NDB と呼ぶ。
// 2026-10-01 ユーザーの本番の記憶で確定: GYRO は文字盤が固定で上が機首、赤い針が北を指す(回る文字盤と上の▲で読む形はやめた)。
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

// 機首の向きに使う方位。4 なら N・E・S・W だけ(本番の記憶。2026-09-30 追加)、8 なら8方向
export function headingIndexes(headingDirections = 8) {
  if (headingDirections === 4) return [0, 2, 4, 6];
  if (headingDirections === 8) return [0, 1, 2, 3, 4, 5, 6, 7];
  throw new RangeError(`機首の向きの数は4か8です: ${headingDirections}`);
}

// RBI の相対方位は、機首の向きの数にかかわらず8方向
export function generateT4Problem(rng, previous = null, headingDirections = 8) {
  const allowed = headingIndexes(headingDirections);
  const candidates = PROBLEMS.filter(p => allowed.includes(p.headingIndex)
    && (!previous || p.headingIndex !== previous.headingIndex || p.relativeIndex !== previous.relativeIndex));
  return { ...candidates[Math.floor(rng() * candidates.length)] };
}

function checkIndex(index, name) {
  if (!Number.isInteger(index) || index < 0 || index >= DIRECTIONS.length) {
    throw new RangeError(`${name}は0以上8未満の整数で指定してください`);
  }
}

// GYRO: 文字盤は固定で上が機首。赤い針は北を指すので、機首から見て反時計回りに機首の方位だけ回る
// (機首 N なら上、E なら左、S なら下、W なら右)
export function gyroNorthNeedleDeg(headingIndex) {
  checkIndex(headingIndex, '機首の方位');
  return (360 - headingIndex * 45) % 360;
}

// 赤い針の角度(上から時計回り)から機首の向きを逆算する。針が左(270°)なら機首は E
export function headingFromGyroNeedle(needleDeg) {
  const deg = ((-needleDeg % 360) + 360) % 360;
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

// 例題: 8方向なら機首 NE・RBI 9(自機 NW)。4方向では NE を選べないので、機首 E・RBI 9(自機 N)にする
export function createT4Example(headingDirections = 8) {
  const problem = { headingIndex: headingDirections === 4 ? 2 : 1, relativeIndex: 2 };
  const { position, heading } = solutionFor(problem.headingIndex, problem.relativeIndex);
  return { problem, selection: { position, heading } };
}

const RBI_WHERE = Object.freeze(['機首の方向', '機首の右前', '機首の右', '機首の右後ろ', '機首の真後ろ', '機首の左後ろ', '機首の左', '機首の左前']);
const RBI_TURN = Object.freeze(['正面', '右45°', '右90°', '右135°', '真後ろ', '左135°', '左90°', '左45°']);

// 解説(例題・練習・判定): GYRO(赤い針が北 → 機首の向きを逆算)と RBI の読み方で書く
export function explainT4Solution(problem) {
  const { towerDirection, position, heading } = solutionFor(problem.headingIndex, problem.relativeIndex);
  const r = problem.relativeIndex;
  return [
    `1. GYRO の赤い針が北 → 北は機首から見て${RBI_TURN[gyroNorthNeedleDeg(problem.headingIndex) / 45]} → 機首は ${heading}`,
    `2. RBI の針は ${rbiReading(r)}(${RBI_WHERE[r]})→ NDB は ${heading} の${RBI_TURN[r]} = ${DIRECTIONS[towerDirection].key}`,
    `3. 自機は NDB の反対の ${position} のマス。向きは機首のまま ${heading}`,
  ];
}

export function createT4Practice(rng, previous = null, headingDirections = 8) {
  return { phase: 'question', index: 0, answers: [], headingDirections,
    problem: generateT4Problem(rng, previous, headingDirections), feedback: null };
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
    problem: generateT4Problem(rng, state.problem, state.headingDirections ?? 8), feedback: null };
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
