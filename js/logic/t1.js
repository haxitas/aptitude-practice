// テスト1 計算: 9種類の問題生成、典型誤答の4択、判定、採点。DOMには触れない。
import { randInt, shuffle } from '../core/rng.js';

export const PROBLEM_KINDS = Object.freeze(['unit', 'speed', 'meeting', 'catchup', 'percentage', 'inversePercentage', 'price', 'average', 'elapsed']);

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
  if (!(Number.isInteger(answer) && answer > 0)) throw new RangeError('正解は正の整数である必要があります');
  const typical = [];
  const digitShifts = [];
  const seen = new Set([answer]);
  for (const raw of mistakes) {
    const value = roundNumber(raw);
    if (!(Number.isInteger(value) && value > 0) || seen.has(value)) continue;
    seen.add(value);
    if (value === answer * 10 || value === answer / 10) digitShifts.push(value);
    else typical.push(value);
  }
  if (typical.length < 2 || typical.length + Math.min(1, digitShifts.length) < 3) {
    throw new RangeError('正の整数の典型誤答を3つ作れません');
  }
  const distractors = shuffle(rng, typical).slice(0, digitShifts.length ? 2 : 3);
  if (digitShifts.length) distractors.push(shuffle(rng, digitShifts)[0]);
  const choices = shuffle(rng, [answer, ...distractors]);
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
    [shown, answer * v.factor, answer * 100, answer * 1000, answer * 10, answer / 10], rng,
  );
}

function speedProblem(rng, p) {
  const speed = randInt(rng, p.speedMin, p.speedMax);
  const hours = randInt(rng, p.speedHoursMin, p.speedHoursMax);
  const distance = speed * hours;
  const variant = ['distance', 'time', 'speed'][randInt(rng, 0, 2)];
  if (variant === 'distance') {
    return finish('speed', variant, `時速${speed}kmで${hours}時間進むと何kmですか?`, distance, 'km',
      [speed + hours, speed * 60, distance + speed, Math.abs(distance - speed), distance * 10, distance / 10], rng);
  }
  if (variant === 'time') {
    return finish('speed', variant, `${distance}kmを時速${speed}kmで進むと何時間ですか?`, hours, '時間',
      [distance - speed, hours * 60, distance + speed, speed + hours, distance, hours * 10, hours / 10], rng);
  }
  return finish('speed', variant, `${distance}kmを${hours}時間で進む速さは時速何kmですか?`, speed, 'km/h',
    [distance - hours, speed * 60, distance + hours, speed + hours, distance, speed * 10, speed / 10], rng);
}

const lapCache = new WeakMap();
export function lapCandidates(p) {
  if (lapCache.has(p)) return lapCache.get(p);
  const pools = { integer: [], decimal: [] };
  for (let a = p.lapSpeedMin + 1; a <= p.lapSpeedMax; a++) {
    for (let b = p.lapSpeedMin; b < a; b++) {
      for (let multiplier = p.lapMultiplierMin; multiplier <= p.lapMultiplierMax; multiplier++) {
        const product = (a + b) * (a - b) * multiplier;
        // 距離=product/60。整数演算で小数第1位までの候補だけを構成する。
        if (product % 6 !== 0) continue;
        pools[product % 60 === 0 ? 'integer' : 'decimal'].push({ a, b, multiplier, length: product / 60 });
      }
    }
  }
  lapCache.set(p, pools);
  return pools;
}

function pickLap(rng, p) {
  const pools = lapCandidates(p);
  const pool = rng() < p.lapIntegerRate || !pools.decimal.length ? pools.integer : pools.decimal;
  if (!pool.length) throw new RangeError('整数の周回距離を作れる速度・倍率の組がありません');
  return pool[randInt(rng, 0, pool.length - 1)];
}

function meetingProblem(rng, p) {
  const { a, b, multiplier, length } = pickLap(rng, p);
  const difference = a - b;
  const minutes = difference * multiplier;
  const wrongOperation = (a + b) * multiplier;
  return finish('meeting', 'opposite',
    `周囲${formatNumber(length)}kmの池を時速${a}kmと時速${b}kmで反対方向に進むと、何分後に出会いますか?`,
    minutes, '分', [wrongOperation, minutes / 60, minutes * 60, minutes * 10, minutes / 10], rng);
}

function catchupProblem(rng, p) {
  const { a, b, multiplier, length } = pickLap(rng, p);
  const sum = a + b;
  const difference = a - b;
  const minutes = sum * multiplier;
  const wrongOperation = difference * multiplier;
  return finish('catchup', 'same-direction',
    `周囲${formatNumber(length)}kmの池を時速${a}kmと時速${b}kmで同じ方向に進むと、速い人は何分後に追いつきますか?`,
    minutes, '分', [wrongOperation, minutes / 60, minutes * 60, minutes * 10, minutes / 10], rng);
}

function percentageProblem(rng, p) {
  const percent = p.percentagePercents[randInt(rng, 0, p.percentagePercents.length - 1)];
  const unit = randInt(rng, p.percentageUnitMin, p.percentageUnitMax);
  const base = unit * 100;
  const answer = unit * percent;
  return finish('percentage', 'basic', `${base}の${percent}%はいくつですか?`, answer, '',
    [base * percent, base - answer, base + percent, Math.abs(base - percent), answer * 10, answer / 10], rng);
}

function inversePercentageProblem(rng, p) {
  const percent = p.percentagePercents[randInt(rng, 0, p.percentagePercents.length - 1)];
  const base = randInt(rng, p.percentageUnitMin, p.percentageUnitMax) * 100;
  const part = base * percent / 100;
  return finish('inversePercentage', 'basic', `${base}の何%が${part}ですか?`, percent, '%',
    [100 - percent, percent * 100, percent / 100, base - part, base * part, percent * 10, percent / 10], rng);
}

function priceProblem(rng, p) {
  const price = randInt(rng, p.priceMin, p.priceMax);
  const count = randInt(rng, p.priceCountMin, p.priceCountMax);
  const total = price * count;
  if (rng() < 0.5) return finish('price', 'total', `単価${price}円の商品を${count}個買うと、合計は何円ですか?`, total, '円',
    [price / count, price + count, price, total + price, total - price, total * 10, total / 10], rng);
  return finish('price', 'unit-price', `${count}個で${total}円の商品は、単価が何円ですか?`, price, '円',
    [total * count, total - count, total, price + count, price * 10, price / 10], rng);
}

function averageProblem(rng, p) {
  const a = randInt(rng, p.averageMin, p.averageMax);
  const b = randInt(rng, p.averageMin, p.averageMax);
  const candidates = [];
  for (let c = p.averageMin; c <= p.averageMax; c++) if ((a+b+c)%3 === 0) candidates.push(c);
  const c = candidates[randInt(rng, 0, candidates.length - 1)];
  const sum = a+b+c, answer = sum/3;
  return finish('average', 'three', `${a}、${b}、${c}の平均はいくつですか?`, answer, '',
    [sum, sum / 2, sum * 3, sum - 3, answer * 10, answer / 10], rng);
}

function elapsedProblem(rng, p) {
  const start = randInt(rng, p.clockStartHourMin, p.clockStartHourMax) * 60 + randInt(rng, 0, 59);
  const minutes = randInt(rng, p.elapsedMinutesMin, p.elapsedMinutesMax);
  const end = start + minutes;
  const h1 = Math.floor(start/60), m1 = start%60, h2 = Math.floor(end/60), m2 = end%60;
  return finish('elapsed', 'same-day', `${h1}時${m1}分から${h2}時${m2}分までは何分ですか?`, minutes, '分',
    [(h2-h1)*100+m2-m1, minutes*60, minutes/60, minutes+60, Math.abs(minutes-60), minutes*10, minutes/10], rng);
}

const GENERATORS = { unit: unitProblem, speed: speedProblem, meeting: meetingProblem, catchup: catchupProblem, percentage: percentageProblem,
  inversePercentage: inversePercentageProblem, price: priceProblem, average: averageProblem, elapsed: elapsedProblem };

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
