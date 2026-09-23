// テスト4 計器の読み取り: 問題生成、方位計算、選択状態、採点。DOMには触れない。

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

export function compassNeedleAngle(headingIndex, compassMode) {
  if (!Number.isInteger(headingIndex) || headingIndex < 0 || headingIndex >= DIRECTIONS.length) {
    throw new RangeError('機首の方位は0以上8未満の整数で指定してください');
  }
  if (compassMode === 'northUp') return headingIndex * 45;
  if (compassMode === 'noseUp') return (360 - headingIndex * 45) % 360;
  throw new RangeError(`不明な計器の流儀です: ${compassMode}`);
}

export function createT4Example(compassMode = 'noseUp') {
  compassNeedleAngle(0, compassMode);
  const problem = compassMode === 'noseUp'
    ? { headingIndex: 6, relativeIndex: 0 }
    : { headingIndex: 1, relativeIndex: 2 };
  const { position, heading } = solutionFor(problem.headingIndex, problem.relativeIndex);
  return { problem, selection: { position, heading } };
}

export function explainT4Solution(problem, compassMode) {
  const { towerDirection, position, heading } = solutionFor(problem.headingIndex, problem.relativeIndex);
  const northAngle = compassNeedleAngle(problem.headingIndex, compassMode);
  const relativeAngle = problem.relativeIndex * 45;
  const northPosition = ['真上(0°)', '右斜め前45°', '右90°', '右斜め後ろ135°',
    '後ろ180°', '左斜め後ろ225°', '左270°', '左斜め前315°'][northAngle / 45];
  const compassStep = compassMode === 'noseUp'
    ? `1. 針は北。北は機首の${northPosition}にある → 機首は${heading}。`
    : `1. 北が上。飛行機形の針は${heading}を指す → 機首は${heading}。`;
  const adfStep = relativeAngle === 0 ? 'ADFの針は真上(相対0°)' : `ADFの針は相対${relativeAngle}°`;
  return [
    compassStep,
    `2. ${adfStep}。機首${heading} + 相対${relativeAngle}° = 塔の方位${DIRECTIONS[towerDirection].key}。`,
    `3. 塔から見た自機は反対の${position}のマス。向きは機首のまま${heading}。`,
  ];
}

export function previousT4Feedback(problem, selection) {
  const { position, heading } = solutionFor(problem.headingIndex, problem.relativeIndex);
  return { position, heading, correct: judgeT4(problem, selection).correct };
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
