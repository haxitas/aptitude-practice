// テスト1 計算: 5種類の問題生成、典型誤答の4択、判定、採点。DOMには触れない。
import { randInt, shuffle } from '../core/rng.js';

export const PROBLEM_KINDS = Object.freeze(['unit', 'speed', 'meeting', 'catchup', 'percentage']);

const UNIT_VARIANTS = Object.freeze([
  { id: 'ha-to-m2', from: 'ha', to: 'm²', factor: 10000, reverse: false },
  { id: 'm2-to-ha', from: 'm²', to: 'ha', factor: 10000, reverse: true },
  { id: 'a-to-m2', from: 'a', to: 'm²', factor: 100, reverse: false },
  { id: 'm2-to-a', from: 'm²', to: 'a', factor: 100, reverse: true },
  { id: 'km2-to-ha', from: 'km²', to: 'ha', factor: 100, reverse: false },
  { id: 'ha-to-km2', from: 'ha', to: 'km²', factor: 100, reverse: true },
  { id: 'km-to-m', from: 'km', to: 'm', factor: 1000, reverse: false },
  { id: 'm-to-km', from: 'm', to: 'km', factor: 1000, reverse: true },
  { id: 'hours-to-minutes', from: '時間', to: '分', factor: 60, reverse: false },
  { id: 'minutes-to-hours', from: '分', to: '時間', factor: 60, reverse: true },
]);

function roundNumber(value) {
  return Math.round(value * 1e6) / 1e6;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(roundNumber(value));
}

export function lapMinutes(lengthKm, speedA, speedB, kind) {
  const divisor = kind === 'meeting' ? speedA + speedB : Math.abs(speedA - speedB);
  if (!(lengthKm > 0) || !(divisor > 0) || !['meeting', 'catchup'].includes(kind)) {
    throw new RangeError('距離と速度の組が不正です');
  }
  return roundNumber(lengthKm * 60 / divisor);
}

export function makeT1Choices(answer, mistakes, rng) {
  if (!(Number.isFinite(answer) && answer > 0)) throw new RangeError('正解は正数である必要があります');
  const candidates = [];
  const seen = new Set([answer]);
  for (const raw of mistakes) {
    const value = roundNumber(raw);
    if (!(Number.isFinite(value) && value > 0) || seen.has(value)) continue;
    seen.add(value);
    candidates.push(value);
  }
  for (let offset = 1; candidates.length < 3; offset++) {
    for (const raw of [answer + offset, answer - offset]) {
      const value = roundNumber(raw);
      if (value <= 0 || seen.has(value)) continue;
      seen.add(value);
      candidates.push(value);
      if (candidates.length === 3) break;
    }
  }
  const choices = shuffle(rng, [answer, ...shuffle(rng, candidates).slice(0, 3)]);
  return { choices, correctIndex: choices.indexOf(answer) };
}

function finish(kind, variant, prompt, answer, unit, mistakes, rng) {
  const roundedAnswer = roundNumber(answer);
  if (!Number.isInteger(roundedAnswer) || roundedAnswer <= 0) throw new Error(`整数の正解を作れませんでした: ${kind}/${variant}`);
  const choice = makeT1Choices(roundedAnswer, mistakes, rng);
  return {
    kind, variant, prompt, answer: roundedAnswer, unit,
    ...choice,
    signature: `${kind}|${variant}|${prompt}|${roundedAnswer}`,
  };
}

function unitProblem(rng, p) {
  const v = UNIT_VARIANTS[randInt(rng, 0, UNIT_VARIANTS.length - 1)];
  const base = randInt(rng, p.unitValueMin, p.unitValueMax);
  const shown = v.reverse ? base * v.factor : base;
  const answer = v.reverse ? base : base * v.factor;
  return finish(
    'unit', v.id,
    `${formatNumber(shown)}${v.from}は何${v.to}ですか?`,
    answer, v.to,
    [shown, answer * 10, answer / 10, answer * 100], rng,
  );
}

function speedProblem(rng, p) {
  const speed = randInt(rng, p.speedMin, p.speedMax);
  const hours = randInt(rng, p.speedHoursMin, p.speedHoursMax);
  const distance = speed * hours;
  const variant = ['distance', 'time', 'speed'][randInt(rng, 0, 2)];
  if (variant === 'distance') {
    return finish('speed', variant, `時速${speed}kmで${hours}時間進むと何kmですか?`, distance, 'km',
      [speed + hours, distance * 10, distance / 10, speed * 60], rng);
  }
  if (variant === 'time') {
    return finish('speed', variant, `${distance}kmを時速${speed}kmで進むと何時間ですか?`, hours, '時間',
      [distance - speed, hours * 60, hours / 60, distance + speed], rng);
  }
  return finish('speed', variant, `${distance}kmを${hours}時間で進む速さは時速何kmですか?`, speed, 'km/h',
    [distance - hours, speed * 60, speed / 60, distance + hours], rng);
}

function distinctSpeeds(rng, p) {
  const a = randInt(rng, p.lapSpeedMin + 1, p.lapSpeedMax);
  const b = randInt(rng, p.lapSpeedMin, a - 1);
  return { a, b };
}

function meetingProblem(rng, p) {
  const { a, b } = distinctSpeeds(rng, p);
  const difference = a - b;
  const multiplier = randInt(rng, p.lapMultiplierMin, p.lapMultiplierMax);
  const minutes = difference * multiplier;
  const length = roundNumber((a + b) * minutes / 60);
  const wrongOperation = (a + b) * multiplier;
  return finish('meeting', 'opposite',
    `周囲${formatNumber(length)}kmの池を時速${a}kmと時速${b}kmで反対方向に進むと、何分後に出会いますか?`,
    minutes, '分', [wrongOperation, minutes / 60, minutes * 10, minutes / 10], rng);
}

function catchupProblem(rng, p) {
  const { a, b } = distinctSpeeds(rng, p);
  const sum = a + b;
  const difference = a - b;
  const multiplier = randInt(rng, p.lapMultiplierMin, p.lapMultiplierMax);
  const minutes = sum * multiplier;
  const length = roundNumber(difference * minutes / 60);
  const wrongOperation = difference * multiplier;
  return finish('catchup', 'same-direction',
    `周囲${formatNumber(length)}kmの池を時速${a}kmと時速${b}kmで同じ方向に進むと、速い人は何分後に追いつきますか?`,
    minutes, '分', [wrongOperation, minutes / 60, minutes * 10, minutes / 10], rng);
}

function percentageProblem(rng, p) {
  const percent = p.percentagePercents[randInt(rng, 0, p.percentagePercents.length - 1)];
  const unit = randInt(rng, p.percentageUnitMin, p.percentageUnitMax);
  const base = unit * 100;
  const answer = unit * percent;
  return finish('percentage', 'basic', `${base}の${percent}%はいくつですか?`, answer, '',
    [base + percent, Math.abs(base - percent), answer * 10, answer / 10], rng);
}

const GENERATORS = { unit: unitProblem, speed: speedProblem, meeting: meetingProblem, catchup: catchupProblem, percentage: percentageProblem };

export function generateT1Problem(rng, p, previous = null, forcedKind = null) {
  const kinds = forcedKind
    ? [forcedKind]
    : PROBLEM_KINDS.filter(kind => !previous || kind !== previous.kind || PROBLEM_KINDS.length === 1);
  const kind = kinds[randInt(rng, 0, kinds.length - 1)];
  if (!GENERATORS[kind]) throw new RangeError(`不明な問題種類です: ${kind}`);
  return GENERATORS[kind](rng, p);
}

export function judgeT1(problem, choiceIndex) {
  return problem.choices[choiceIndex] === problem.answer;
}

export function createT1Tally() {
  return { correct: 0, answered: 0 };
}

export function recordT1Answer(tally, correct) {
  return { correct: tally.correct + (correct ? 1 : 0), answered: tally.answered + 1 };
}

export function summarizeT1(tally) {
  return {
    score: tally.correct,
    detail: {
      answered: tally.answered,
      accuracy: tally.answered ? Math.round(tally.correct * 100 / tally.answered) : null,
    },
  };
}

export function buildT1Record({ date, tally, settings }) {
  const { score, detail } = summarizeT1(tally);
  return { id: `${date}-t1`, test: 't1', date, score, detail, settings: { ...settings } };
}
