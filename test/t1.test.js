import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { DEFAULTS } from '../js/core/settings.js';
import {
  PROBLEM_KINDS, lapMinutes, makeT1Choices, generateT1Problem, judgeT1,
  createT1Tally, recordT1Answer, summarizeT1, buildT1Record,
} from '../js/logic/t1.js';
import { t1MistakeEntry, t1ReviewSummary, t1Formula, formatT1Answer, UNIT_VARIANT_IDS, POWER_UNIT_VARIANT_IDS, PRICE_VARIANTS, GEOMETRY_VARIANTS } from '../js/logic/t1.js';
import { T1_CATEGORIES, generateT1Round, T1_CONVERSIONS, DISCOUNT_VARIANTS, isRoundNumber, significantDigits } from '../js/logic/t1.js';

const P = DEFAULTS.t1;

// 単位換算の倍率(換算後 = 換算前 × 倍率)。実装とは別にテストの側で持つ
const UNIT_RATIOS = Object.freeze({
  'ha-to-m2': 10000, 'm2-to-ha': 1 / 10000, 'a-to-m2': 100, 'm2-to-a': 1 / 100,
  'km2-to-ha': 100, 'ha-to-km2': 1 / 100, 'km-to-m': 1000, 'm-to-km': 1 / 1000,
  'hours-to-minutes': 60, 'minutes-to-hours': 1 / 60,
  'm-to-cm': 100, 'cm-to-m': 1 / 100, 'cm-to-mm': 10, 'mm-to-cm': 1 / 10,
  'kg-to-g': 1000, 'g-to-kg': 1 / 1000, 't-to-kg': 1000, 'kg-to-t': 1 / 1000,
  'L-to-mL': 1000, 'mL-to-L': 1 / 1000, 'L-to-dL': 10, 'dL-to-L': 1 / 10, 'm3-to-L': 1000, 'L-to-m3': 1 / 1000,
  'minutes-to-seconds': 60, 'seconds-to-minutes': 1 / 60, 'days-to-hours': 24, 'hours-to-days': 1 / 24,
  'ha-to-a': 100, 'a-to-ha': 1 / 100,
  'kmh-to-mpm': 1000 / 60, 'mpm-to-kmh': 60 / 1000, 'mps-to-kmh': 3.6, 'kmh-to-mps': 1 / 3.6,
  'm2-to-cm2': 10000, 'cm2-to-m2': 1 / 10000, 'cm2-to-mm2': 100, 'mm2-to-cm2': 1 / 100,
  'cm3-to-mm3': 1000, 'mm3-to-cm3': 1 / 1000, 'L-to-cm3': 1000, 'cm3-to-L': 1 / 1000,
});
// 2乗・3乗の換算で「乗し忘れ」たときの倍率(長さの倍率のまま)
const FORGOT_POWER_RATIOS = Object.freeze({
  'm2-to-cm2': 100, 'cm2-to-m2': 1 / 100, 'cm2-to-mm2': 10, 'mm2-to-cm2': 1 / 10,
  'cm3-to-mm3': 10, 'mm3-to-cm3': 1 / 10, 'L-to-cm3': 10, 'cm3-to-L': 1 / 10,
});
// 単価: 問題文の数値の並びから正解を計算する
function priceExpected(variant, n) {
  if (variant === 'total') return n[0] * n[1]; // 単価a円の商品をb個
  if (variant === 'unit-price') return n[1] / n[0]; // a個でb円
  if (variant === 'per-100g') return n[1] / n[0] * n[2]; // agでb円 → c gあたり
  if (variant === 'per-gram-total') return n[1] * n[2]; // 1gあたりa円 → b g(n=[1,a,b])
  throw new Error(variant);
}
// 図形: 問題文の数値の並びから正解を計算する(円周率は3.14)
const PI_NOTE = '(円周率は3.14)';
function geometryExpected(variant, n) {
  if (variant === 'circle-circumference-diameter') return n[0] * 3.14;
  if (variant === 'circle-circumference-radius') return n[0] * 2 * 3.14;
  if (variant === 'circle-diameter') return n[0] / 3.14;
  if (variant === 'circle-area') return n[0] * n[0] * 3.14;
  if (variant === 'triangle-area') return n[0] * n[1] / 2;
  if (variant === 'trapezoid-area') return (n[0] + n[1]) * n[2] / 2;
  if (variant === 'parallelogram-area') return n[0] * n[1];
  throw new Error(variant);
}
const close = (a, b) => Math.abs(a - b) < 1e-8 * Math.max(1, Math.abs(b));

// 新しい4種類(2026-09-30 本番に合わせて追加): 問題文の数値の並びから正解を計算する
// 仕事算 [人数1, 時間, 人数2] / 速さと時間 [速さ1, 時間, 速さ2](答えは分) / 時給 [時間, 給料] / 円筒 [直径cm, 高さm, 上からcm](約◯L)
function newKindExpected(kind, n) {
  if (kind === 'work') return n[0] * n[1] / n[2];
  if (kind === 'speedTime') return n[0] * n[1] * 60 / n[2];
  if (kind === 'wage') return n[1] / n[0];
  if (kind === 'cylinder') return Math.round(3.14 * (n[0] / 2) ** 2 * (n[1] * 100 - n[2]) / 1000 * 10) / 10;
  throw new Error(kind);
}
function decimalsOf(v) {
  const text = String(v);
  return text.includes('.') ? text.split('.')[1].length : 0;
}
// 答えの小数の桁数の上限(2026-09-30 本番の記憶で、どの種類も第3位まで。人数・分・円などの整数で答える種類は0)
function answerDecimals(q) {
  if (q.kind === 'wage') return q.variant === 'dollar' ? 2 : 0;
  if (q.kind === 'cylinder') return 1;
  if (['speedTime', 'wholeFromPart', 'yearOverYear', 'meeting', 'catchup', 'elapsed', 'inversePercentage'].includes(q.kind)) return 0;
  return 3;
}
// 選択肢(誤答も)の小数の桁数の上限: 人数・分などを整数で答える一部の種類は整数、時給(ドル)は第2位、円筒は第1位、ほかは第3位まで
function choiceDecimals(q) {
  if (['speedTime', 'wholeFromPart', 'yearOverYear'].includes(q.kind) || (q.kind === 'wage' && q.variant === 'yen')) return 0;
  if (q.kind === 'wage') return 2;
  if (q.kind === 'cylinder') return 1;
  return 3;
}
// 割合の新しい4種類(2026-09-30 本番の記憶で追加): 問題文の数値の並びから正解を計算する
// 利益率 [原価, 率] / 割引 売値 [定価, 率]・定価 [率, 売値] / 全体の逆算 [部分, 率] / 前年比 [率, 今年]
function ratioExpected(kind, variant, n) {
  if (kind === 'markup') return n[0] * (1 + n[1] / 100);
  if (kind === 'discount') return variant === 'sale-price' ? n[0] * (1 - n[1] / 100) : n[1] / (1 - n[0] / 100);
  if (kind === 'wholeFromPart') return n[0] / (n[1] / 100);
  if (kind === 'yearOverYear') return n[1] / (1 + n[0] / 100);
  throw new Error(kind);
}
// 問題文に出る数値(順番どおり)。値は problem.values から取る
function promptValues(q) {
  const v = q.values;
  switch (q.kind) {
    case 'unit': return [v.shown];
    case 'speed': return q.variant === 'distance' ? [v.speed, v.hours] : q.variant === 'time' ? [v.distance, v.speed] : [v.distance, v.hours];
    case 'meeting': case 'catchup': return [v.length, v.a, v.b];
    case 'percentage': return [v.base, v.percent];
    case 'inversePercentage': return [v.base, v.part];
    case 'price':
      if (q.variant === 'total') return [v.price, v.count];
      if (q.variant === 'unit-price') return [v.count, v.total];
      if (q.variant === 'per-100g') return [v.grams, v.total, v.per];
      return [1, v.perGram, v.grams];
    case 'average': return [v.a, v.b, v.c];
    case 'elapsed': return [v.h1, v.m1, v.h2, v.m2];
    case 'geometry':
      if (q.variant === 'circle-circumference-diameter') return [v.diameter];
      if (q.variant === 'circle-circumference-radius' || q.variant === 'circle-area') return [v.radius];
      if (q.variant === 'circle-diameter') return [v.circumference];
      if (q.variant === 'trapezoid-area') return [v.top, v.bottom, v.height];
      return [v.base, v.height];
    case 'work': return [v.workers1, v.hours1, v.workers2];
    case 'speedTime': return [v.speed1, v.hours1, v.speed2];
    case 'wage': return [v.hours, v.total];
    case 'cylinder': return [v.diameter, v.heightM, v.gap];
    case 'markup': return [v.cost, v.rate];
    case 'discount': return q.variant === 'sale-price' ? [v.list, v.rate] : [v.rate, v.sale];
    case 'wholeFromPart': return [v.part, v.rate];
    case 'yearOverYear': return [v.rate, v.now];
    default: throw new Error(q.kind);
  }
}
const evaluateExpr = expression => Function(`"use strict"; return (${expression});`)();

test('T1 の既定値は承認済みの数値(2026-09-30 本番の記憶で15問・5分に変更)', () => {
  assert.deepEqual(P, {
    durationSec: 300,
    questionsPerCategory: 5,
    calculatorDuringTest: true,
    answerFeedbackMs: 300,
    stallAbortMs: 1000,
    unitValueMin: 1,
    unitValueMax: 20,
    speedMin: 2, speedMax: 20, speedHoursMin: 1.05, speedHoursMax: 8.95,
    lapSpeedMin: 2, lapSpeedMax: 12, lapMinutesMin: 12, lapMinutesMax: 180,
    percentBaseMin: 101, percentBaseMax: 4999, percentMin: 11, percentMax: 89,
    markupRateMin: 11, markupRateMax: 59, discountRateMin: 11, discountRateMax: 45,
    wholeMin: 101, wholeMax: 480,
    growthRateMin: 3, growthRateMax: 29, yearValueMin: 1000000, yearValueMax: 9999999,
    priceMin: 101, priceMax: 999, priceCountMin: 12, priceCountMax: 48,
    averageMin: 2, averageMax: 50,
    clockStartHourMin: 6, clockStartHourMax: 18,
    elapsedMinutesMin: 15, elapsedMinutesMax: 180,
    geometryLengthMin: 2.1, geometryLengthMax: 19.9,
    circlePi: 3.14, circleDiameterMin: 101, circleDiameterMax: 299, circleAreaRadiusMin: 10, circleAreaRadiusMax: 29,
    workWorkersMin: 3, workWorkersMax: 24, workHoursMin: 2.05, workHoursMax: 15.95,
    flightSpeedMin: 600, flightSpeedMax: 900, flightSpeedDiffMax: 60, flightHoursMin: 2, flightHoursMax: 12,
    wageHoursMin: 4, wageHoursMax: 40, wageDollarCentsMin: 1000, wageDollarCentsMax: 5000, wageYenMin: 900, wageYenMax: 2500,
    cylinderDiameterMin: 8.1, cylinderDiameterMax: 39.9, cylinderHeightMin: 0.51, cylinderHeightMax: 1.99,
    cylinderGapMin: 5, cylinderGapMax: 20,
  });
  assert.equal('unitKindShare' in P, false, '「単位換算を約1/3」の設定は、15問の形式では不要');
});

const NEW_KINDS = ['work', 'speedTime', 'wage', 'cylinder'];
const RATIO_KINDS = ['percentage', 'inversePercentage', 'markup', 'discount', 'wholeFromPart', 'yearOverYear'];
const CALC_KINDS = ['speed', 'meeting', 'catchup', 'elapsed', 'average', 'geometry', 'price', 'work', 'speedTime', 'wage', 'cylinder'];

// ---- 形式(2026-09-30 本番の記憶で変更): 15問、単位変換5 → 割合5 → 計算5、5分 ----

test('分野は3つ: 単位変換・割合(割合・逆算・利益率・割引・全体の逆算・前年比)・計算', () => {
  assert.deepEqual(T1_CATEGORIES.map(c => [c.id, c.label]), [['unit', '単位変換'], ['ratio', '割合'], ['calc', '計算']]);
  assert.deepEqual(T1_CATEGORIES[0].kinds, ['unit']);
  assert.deepEqual([...T1_CATEGORIES[1].kinds].sort(), [...RATIO_KINDS].sort());
  assert.deepEqual([...T1_CATEGORIES[2].kinds].sort(), [...CALC_KINDS].sort());
  assert.deepEqual([...PROBLEM_KINDS].sort(), ['unit', ...RATIO_KINDS, ...CALC_KINDS].sort());
});

test('1回は15問で、単位変換5 → 割合5 → 計算5 の順。分野の中は違う種類(違う換算)で、順番はランダム', () => {
  const firstRatio = new Set();
  const firstCalc = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    const round = generateT1Round(createRng(seed), P);
    assert.equal(round.length, 15);
    assert.deepEqual(round.map(q => q.category), [...Array(5).fill('unit'), ...Array(5).fill('ratio'), ...Array(5).fill('calc')]);
    assert.ok(round.slice(0, 5).every(q => q.kind === 'unit'));
    assert.equal(new Set(round.slice(0, 5).map(q => q.variant)).size, 5, '違う換算');
    assert.ok(round.slice(5, 10).every(q => RATIO_KINDS.includes(q.kind)));
    assert.equal(new Set(round.slice(5, 10).map(q => q.kind)).size, 5);
    assert.ok(round.slice(10).every(q => CALC_KINDS.includes(q.kind)));
    assert.equal(new Set(round.slice(10).map(q => q.kind)).size, 5);
    firstRatio.add(round[5].kind);
    firstCalc.add(round[10].kind);
  }
  assert.equal(firstRatio.size, RATIO_KINDS.length, '割合の1問目はどの種類にもなる');
  assert.ok(firstCalc.size >= 8, [...firstCalc].join(','));
});

test('制限時間は5分(300秒)', () => {
  assert.equal(P.durationSec, 300);
  assert.equal(P.questionsPerCategory * T1_CATEGORIES.length, 15);
});

test('開始前の画面に出す換算の一覧: 出題に使う換算の組ごとに1行', () => {
  assert.equal(T1_CONVERSIONS.length, UNIT_VARIANT_IDS.length / 2);
  for (const line of ['1ha = 10,000m²', '1t(メートルトン)= 1,000kg', '1時間 = 60分', '1km = 1,000m', '1m³ = 1,000L']) {
    assert.ok(T1_CONVERSIONS.includes(line), `${line} が無い: ${T1_CONVERSIONS.join(' / ')}`);
  }
  assert.ok(T1_CONVERSIONS.some(line => line.includes('秒速 1/3.6m')));
});

test('2000シード: 問題文の小数は第3位まで・全種類の正解が問題文の数値の計算と一致(2026-09-30 本番の記憶で第1位 → 第3位)', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 2000; seed++) {
    const q = generateT1Problem(createRng(seed), P);
    seen.add(q.kind);
    const body = q.prompt.replace(PI_NOTE, ''); // 円周率の注記は定数なので除いて調べる
    assert.ok(!/\d+\.\d{4,}/.test(body), `seed=${seed} ${q.prompt}`);
    const n = body.match(/\d+(?:\.\d+)?/g).map(Number);
    let expected;
    if (q.kind === 'unit') expected = n[0] * UNIT_RATIOS[q.variant];
    if (q.kind === 'speed') expected = q.variant === 'distance' ? n[0]*n[1] : n[0]/n[1];
    if (q.kind === 'meeting') expected = n[0]*60/(n[1]+n[2]);
    if (q.kind === 'catchup') expected = n[0]*60/(n[1]-n[2]);
    if (q.kind === 'percentage') expected = n[0]*n[1]/100;
    if (q.kind === 'inversePercentage') expected = n[1]*100/n[0];
    if (q.kind === 'price') expected = priceExpected(q.variant, n);
    if (q.kind === 'average') expected = (n[0]+n[1]+n[2])/3;
    if (q.kind === 'elapsed') expected = (n[2]-n[0])*60+n[3]-n[1];
    if (q.kind === 'geometry') expected = geometryExpected(q.variant, n);
    if (NEW_KINDS.includes(q.kind)) expected = newKindExpected(q.kind, n);
    if (['markup', 'discount', 'wholeFromPart', 'yearOverYear'].includes(q.kind)) expected = ratioExpected(q.kind, q.variant, n);
    assert.ok(Math.abs(q.answer-expected) < 1e-8, `seed=${seed} ${q.prompt}: ${q.answer} != ${expected}`);
  }
  assert.equal(seen.size, PROBLEM_KINDS.length);
});

test('SPECの例: L=4.2, a=4, b=3 の逆方向は36分', () => {
  assert.equal(lapMinutes(4.2, 4, 3, 'meeting'), 36);
});

test('追いつきは速度差、出会いは速度和を使う', () => {
  assert.equal(lapMinutes(6, 8, 4, 'catchup'), 90);
  assert.equal(lapMinutes(6, 8, 4, 'meeting'), 30);
  assert.throws(() => lapMinutes(6, 4, 4, 'catchup'));
});

test('4択は重ならず、正解を1つだけ含み、誤答は正の整数で桁ずらしは1つまで', () => {
  const made = makeT1Choices(36, [252, 42, 2160, 0.6, 360, 3.6, 36, -1], createRng(1), [], 0); // 整数で答える形(人数など)
  assert.equal(made.choices.length, 4);
  assert.equal(new Set(made.choices).size, 4);
  assert.equal(made.choices.filter(v => v === 36).length, 1);
  assert.ok(made.choices.every(v => Number.isInteger(v) && v > 0));
  assert.ok(made.choices.filter(v => v === 360 || v === 3.6).length <= 1);
  assert.equal(made.choices[made.correctIndex], 36);
});

test('シード2000種類で全種類が出て、4択は正の数(小数第3位まで)・重複なし・桁ずらし1つまで', () => {
  const kinds = new Set();
  for (let seed = 1; seed <= 2000; seed++) {
    const q = generateT1Problem(createRng(seed), P);
    kinds.add(q.kind);
    assert.ok(q.answer > 0, `seed=${seed} answer=${q.answer}`);
    assert.equal(q.choices.length, 4, `seed=${seed}`);
    assert.equal(new Set(q.choices).size, 4, `seed=${seed}`);
    assert.equal(new Set(q.choices.map(v => formatT1Answer(q, v))).size, 4, `seed=${seed} 表示が重なる ${q.choices}`);
    assert.equal(q.choices.filter(v => v === q.answer).length, 1, `seed=${seed}`);
    assert.ok(decimalsOf(q.answer) <= answerDecimals(q), `seed=${seed} ${q.kind} answer=${q.answer}`);
    assert.ok(q.choices.every(v => v > 0 && decimalsOf(v) <= choiceDecimals(q)), `seed=${seed} ${q.kind} choices=${q.choices}`);
    const digitShiftCount = q.choices.filter(v => v === q.answer * 10 || v === q.answer / 10).length;
    assert.ok(digitShiftCount <= 1, `seed=${seed} answer=${q.answer} choices=${q.choices}`);
    assert.equal(q.choices[q.correctIndex], q.answer, `seed=${seed}`);
    assert.ok(q.prompt.length > 0);
    assert.equal(typeof q.unit, 'string');
  }
  assert.deepEqual([...kinds].sort(), [...PROBLEM_KINDS].sort());
});

test('速さは距離・時間・速さを求める3形式が出る', () => {
  const variants = new Set();
  for (let seed = 1; seed <= 1000; seed++) {
    variants.add(generateT1Problem(createRng(seed), P, null, 'speed').variant);
  }
  assert.deepEqual([...variants].sort(), ['distance', 'speed', 'time']);
});

test('直前とまったく同じ問題を出さない', () => {
  const rng = createRng(77);
  let previous = null;
  for (let i = 0; i < 1000; i++) {
    const q = generateT1Problem(rng, P, previous);
    if (previous) assert.notEqual(q.signature, previous.signature);
    previous = q;
  }
});

test('選択肢の値で正誤判定する', () => {
  const q = generateT1Problem(createRng(3), P);
  assert.equal(judgeT1(q, q.correctIndex), true);
  assert.equal(judgeT1(q, (q.correctIndex + 1) % 4), false);
});

test('採点は正答数、内訳は回答数と整数の正答率', () => {
  let tally = createT1Tally();
  tally = recordT1Answer(tally, true);
  tally = recordT1Answer(tally, false);
  tally = recordT1Answer(tally, true);
  assert.deepEqual(summarizeT1(tally), { score: 2, detail: { answered: 3, accuracy: 67 } });
  assert.deepEqual(summarizeT1(createT1Tally()), { score: 0, detail: { answered: 0, accuracy: null } });
});

test('集計関数は元の値を書き換えない', () => {
  const tally = createT1Tally();
  recordT1Answer(tally, true);
  assert.deepEqual(tally, createT1Tally());
});

test('記録はSPEC §4の形で、その回の設定を複製する', () => {
  const date = '2026-09-23T10:15:00.000Z';
  const record = buildT1Record({ date, tally: { correct: 2, answered: 3 }, settings: P });
  assert.equal(record.id, `${date}-t1`);
  assert.equal(record.test, 't1');
  assert.equal(record.score, 2);
  assert.deepEqual(record.detail, { answered: 3, accuracy: 67 });
  assert.deepEqual(record.settings, P);
  assert.notEqual(record.settings, P);
});

test('式: 全種類で式を作り、式を計算すると正解と一致する(2000シード)', () => {
  const kinds = new Set();
  const speedVariants = new Set();
  for (let seed = 1; seed <= 2000; seed++) {
    const kind = PROBLEM_KINDS[seed % PROBLEM_KINDS.length];
    const problem = generateT1Problem(createRng(seed), P, null, kind);
    const formula = t1Formula(problem);
    assert.ok(formula.text.endsWith(` = ${formatT1Answer(problem, problem.answer)}`), `${kind}: ${formula.text}`);
    const value = evaluateExpr(formula.expression);
    const expected = kind === 'cylinder' ? Math.round(value * 10) / 10 : value;
    assert.ok(Math.abs(expected - problem.answer) < 1e-9 * Math.max(1, problem.answer), `${kind}: ${formula.expression} != ${problem.answer}`);
    kinds.add(problem.kind);
    if (problem.kind === 'speed') speedVariants.add(problem.variant);
  }
  assert.deepEqual([...kinds].sort(), [...PROBLEM_KINDS].sort());
  assert.deepEqual([...speedVariants].sort(), ['distance', 'speed', 'time']);
});

test('式: SPEC の例 4.2km・時速4km・時速3km → 36分', () => {
  const problem = { kind: 'meeting', variant: 'opposite', answer: 36, unit: '分', values: { length: 4.2, a: 4, b: 3 } };
  assert.deepEqual(t1Formula(problem), {
    text: '4.2km ÷ (時速4km + 時速3km) × 60 = 36分',
    expression: '4.2 / (4 + 3) * 60',
  });
});

test('式: 種類ごとのひな形に、その問題の数値が入る', () => {
  const text = (kind, variant, answer, unit, values) => t1Formula({ kind, variant, answer, unit, values }).text;
  assert.equal(text('catchup', 'same-direction', 30, '分', { length: 1.5, a: 5, b: 2 }), '1.5km ÷ (時速5km − 時速2km) × 60 = 30分');
  assert.equal(text('percentage', 'basic', 520, '', { base: 1300, percent: 40 }), '1300 × 40 ÷ 100 = 520');
  assert.equal(text('inversePercentage', 'basic', 25, '%', { base: 300, part: 75 }), '75 ÷ 300 × 100 = 25%');
  assert.equal(text('price', 'total', 119, '円', { price: 17, count: 7, total: 119 }), '17円 × 7個 = 119円');
  assert.equal(text('price', 'unit-price', 17, '円', { price: 17, count: 7, total: 119 }), '119円 ÷ 7個 = 17円');
  assert.equal(text('average', 'three', 12, '', { a: 10, b: 12, c: 14 }), '(10 + 12 + 14) ÷ 3 = 12');
  assert.equal(text('elapsed', 'same-day', 105, '分', { h1: 9, m1: 40, h2: 11, m2: 25 }), '11時25分 − 9時40分 = 105分');
  assert.equal(text('unit', 'm2-to-ha', 3, 'ha', { shown: 30000, num: 1, den: 10000, from: 'm²', to: 'ha' }), '30000m² ÷ 10000 = 3ha');
  assert.equal(text('unit', 'ha-to-m2', 30000, 'm²', { shown: 3, num: 10000, den: 1, from: 'ha', to: 'm²' }), '3ha × 10000 = 30000m²');
  assert.equal(text('speed', 'distance', 8, 'km', { speed: 2, hours: 4, distance: 8 }), '時速2km × 4時間 = 8km');
  assert.equal(text('speed', 'time', 4, '時間', { speed: 2, hours: 4, distance: 8 }), '8km ÷ 時速2km = 4時間');
  assert.equal(t1Formula({ kind: 'speed', variant: 'speed', answer: 2, unit: 'km', answerPrefix: '時速', values: { speed: 2, hours: 4, distance: 8 } }).text, '8km ÷ 4時間 = 時速2km');
});

// ---- 単位換算の追加(2026-09-27 ユーザーの判断で追加) ----

test('単位換算: 換算表の全種類(往復)を持ち、2乗・3乗は8種類', () => {
  assert.deepEqual([...UNIT_VARIANT_IDS].sort(), Object.keys(UNIT_RATIOS).sort());
  assert.deepEqual([...POWER_UNIT_VARIANT_IDS].sort(), Object.keys(FORGOT_POWER_RATIOS).sort());
});

test('単位換算: 全種類が多数のシードで出て、各種類はほぼ同じ確率', () => {
  const counts = Object.fromEntries(UNIT_VARIANT_IDS.map(id => [id, 0]));
  const total = UNIT_VARIANT_IDS.length * 400;
  for (let seed = 1; seed <= total; seed++) counts[generateT1Problem(createRng(seed), P, null, 'unit').variant]++;
  for (const [id, count] of Object.entries(counts)) assert.ok(count >= 300 && count <= 500, `${id}: ${count}/${total}`);
});

test('単位換算: 各種類の正解は換算の式と一致し、式(t1Formula)を計算しても一致する。答えは100万以下', () => {
  for (const id of UNIT_VARIANT_IDS) {
    for (let seed = 1; seed <= 60; seed++) {
      const q = generateT1Problem(createRng(seed), P, null, 'unit', id);
      assert.equal(q.variant, id);
      assert.ok(close(q.answer, q.values.shown * UNIT_RATIOS[id]), `${id}: ${q.prompt} → ${q.answer}`);
      const shownInPrompt = Number(q.prompt.match(/\d+(?:\.\d+)?/)[0]);
      assert.equal(shownInPrompt, q.values.shown, q.prompt);
      assert.ok(close(evaluateExpr(t1Formula(q).expression), q.answer), `${id}: ${t1Formula(q).text}`);
      assert.ok(q.answer <= 1000000, `${id}: ${q.answer}`);
    }
  }
});

test('単位換算: 4択の決まり(正の数で小数第3位まで・重複なし・桁ずらし1つまで)を全種類で守る', () => {
  for (const id of UNIT_VARIANT_IDS) {
    for (let seed = 1; seed <= 60; seed++) {
      const q = generateT1Problem(createRng(seed), P, null, 'unit', id);
      assert.equal(new Set(q.choices).size, 4, `${id} ${q.choices}`);
      assert.ok(q.choices.every(v => v > 0 && decimalsOf(v) <= 3), `${id} ${q.choices}`);
      assert.equal(q.choices.filter(v => v === q.answer).length, 1);
      assert.ok(q.choices.filter(v => v === q.answer * 10 || v === q.answer / 10).length <= 1, `${id} ${q.choices}`);
      assert.ok(q.choices.every(v => v <= 10000000), `${id}: 極端に大きな誤答 ${q.choices}`);
    }
  }
});

test('単位換算: 2乗・3乗の換算は、誤答に必ず「乗し忘れ」の値が入る', () => {
  for (const id of POWER_UNIT_VARIANT_IDS) {
    for (let seed = 1; seed <= 200; seed++) {
      const q = generateT1Problem(createRng(seed), P, null, 'unit', id);
      const forgot = Math.round(q.values.shown * FORGOT_POWER_RATIOS[id] * 1e6) / 1e6;
      assert.ok(q.choices.includes(forgot), `${id}: ${q.prompt} 乗し忘れ ${forgot} が ${q.choices} にない`);
    }
  }
});

test('単位換算の式: 例のとおりに作る', () => {
  const text = (variant, shown, answer) => {
    const q = generateT1Problem(createRng(1), P, null, 'unit', variant);
    return t1Formula({ ...q, answer, values: { ...q.values, shown } }).text;
  };
  assert.equal(text('kg-to-g', 3, 3000), '3kg × 1000 = 3000g');
  assert.equal(text('mps-to-kmh', 5, 18), '秒速5m × 3600 ÷ 1000 = 時速18km');
  assert.equal(text('kmh-to-mpm', 6, 100), '時速6km × 1000 ÷ 60 = 分速100m');
  assert.equal(text('m2-to-cm2', 3, 30000), '3m² × 10000 = 30000cm²');
  assert.equal(text('mpm-to-kmh', 100, 6), '分速100m × 60 ÷ 1000 = 時速6km');
  assert.equal(text('m2-to-ha', 30000, 3), '30000m² ÷ 10000 = 3ha');
});

test('速さの答えは「時速◯km」の形で出す', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const q = generateT1Problem(createRng(seed), P, null, 'speed');
    if (q.variant !== 'speed') continue;
    assert.equal(formatT1Answer(q, q.answer), `時速${q.answer}km`);
    assert.ok(t1Formula(q).text.endsWith(`= 時速${q.answer}km`), t1Formula(q).text);
    assert.equal(t1MistakeEntry(q, (q.correctIndex + 1) % 4).correctAnswer, `時速${q.answer}km`);
  }
});

// ---- g あたりの値段(2026-09-27 ユーザーの判断で追加) ----

test('単価: 1個あたり・合計・100gあたり・gあたりの合計が同じ確率で出る', () => {
  assert.deepEqual([...PRICE_VARIANTS].sort(), ['per-100g', 'per-gram-total', 'total', 'unit-price']);
  const counts = Object.fromEntries(PRICE_VARIANTS.map(v => [v, 0]));
  for (let seed = 1; seed <= 4000; seed++) counts[generateT1Problem(createRng(seed), P, null, 'price').variant]++;
  for (const [v, count] of Object.entries(counts)) assert.ok(count >= 850 && count <= 1150, `${v}: ${count}/4000`);
});

test('単価: gあたりの問題も正解が式と一致し、式を計算しても一致し、4択の決まりを守る', () => {
  for (const variant of ['per-100g', 'per-gram-total']) {
    for (let seed = 1; seed <= 500; seed++) {
      const q = generateT1Problem(createRng(seed), P, null, 'price', variant);
      const n = q.prompt.match(/\d+(?:\.\d+)?/g).map(Number);
      assert.ok(close(q.answer, priceExpected(variant, n)), `${q.prompt} → ${q.answer}`);
      assert.ok(close(evaluateExpr(t1Formula(q).expression), q.answer), t1Formula(q).text);
      assert.equal(new Set(q.choices).size, 4);
      assert.ok(q.choices.every(v => v > 0 && decimalsOf(v) <= 3), `${q.prompt} ${q.choices}`);
      assert.ok(q.choices.filter(v => v === q.answer * 10 || v === q.answer / 10).length <= 1);
    }
  }
});

test('単価: gあたりの式の例', () => {
  assert.equal(t1Formula({ kind: 'price', variant: 'per-100g', answer: 150, unit: '円', values: { grams: 300, total: 450, per: 100 } }).text,
    '450円 ÷ 300g × 100 = 150円');
  assert.equal(t1Formula({ kind: 'price', variant: 'per-gram-total', answer: 750, unit: '円', values: { perGram: 3, grams: 250 } }).text,
    '3円 × 250g = 750円');
});

// ---- 図形(2026-09-28 ユーザーの判断で追加) ----

test('図形: 円周・直径・円の面積・三角形・台形・平行四辺形の7つの形が同じ確率で出る', () => {
  assert.deepEqual([...GEOMETRY_VARIANTS].sort(), [
    'circle-area', 'circle-circumference-diameter', 'circle-circumference-radius', 'circle-diameter',
    'parallelogram-area', 'trapezoid-area', 'triangle-area',
  ]);
  const counts = Object.fromEntries(GEOMETRY_VARIANTS.map(v => [v, 0]));
  const total = GEOMETRY_VARIANTS.length * 500;
  for (let seed = 1; seed <= total; seed++) counts[generateT1Problem(createRng(seed), P, null, 'geometry').variant]++;
  for (const [v, count] of Object.entries(counts)) assert.ok(count >= 400 && count <= 600, `${v}: ${count}/${total}`);
});

test('図形: 正解は公式と一致し、式を計算しても一致し、4択の決まり(正の数で小数第3位まで・重複なし・桁ずらし1つまで)を守る', () => {
  for (const variant of GEOMETRY_VARIANTS) {
    for (let seed = 1; seed <= 500; seed++) {
      const q = generateT1Problem(createRng(seed), P, null, 'geometry', variant);
      assert.equal(q.variant, variant);
      const n = q.prompt.replace(PI_NOTE, '').match(/\d+(?:\.\d+)?/g).map(Number);
      assert.ok(close(q.answer, geometryExpected(variant, n)), `${q.prompt} → ${q.answer}`);
      assert.ok(close(evaluateExpr(t1Formula(q).expression), q.answer), t1Formula(q).text);
      assert.ok(q.answer > 0 && decimalsOf(q.answer) <= 3, `${q.prompt} → ${q.answer}`);
      assert.equal(new Set(q.choices).size, 4, `${q.prompt} ${q.choices}`);
      assert.ok(q.choices.every(v => v > 0 && decimalsOf(v) <= 3), `${q.prompt} ${q.choices}`);
      assert.ok(q.choices.filter(v => v === q.answer * 10 || v === q.answer / 10).length <= 1, `${q.prompt} ${q.choices}`);
      if (variant.startsWith('circle')) assert.ok(q.prompt.endsWith(PI_NOTE), q.prompt);
      assert.ok(q.unit === 'cm' || q.unit === 'cm²');
    }
  }
});

test('図形: 円周の問題の誤答には「半径と直径の取り違え」、面積の問題には「÷2のし忘れ」が入る', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const d = generateT1Problem(createRng(seed), P, null, 'geometry', 'circle-circumference-diameter');
    assert.ok(d.choices.includes(Math.round(d.answer * 2 * 1e6) / 1e6), `${d.prompt} ${d.choices}`);
    const t = generateT1Problem(createRng(seed), P, null, 'geometry', 'triangle-area');
    assert.ok(t.choices.includes(Math.round(t.answer * 2 * 1e6) / 1e6), `${t.prompt} ${t.choices}`);
    const z = generateT1Problem(createRng(seed), P, null, 'geometry', 'trapezoid-area');
    assert.ok(z.choices.includes(Math.round(z.answer * 2 * 1e6) / 1e6), `${z.prompt} ${z.choices}`);
  }
});

test('図形の式: 例のとおりに作る', () => {
  const f = (variant, answer, unit, values) => t1Formula({ kind: 'geometry', variant, answer, unit, values }).text;
  assert.equal(f('circle-circumference-diameter', 157, 'cm', { diameter: 50, pi: 3.14 }), '50cm × 3.14 = 157cm');
  assert.equal(f('circle-circumference-radius', 157, 'cm', { radius: 25, pi: 3.14 }), '25cm × 2 × 3.14 = 157cm');
  assert.equal(f('circle-diameter', 50, 'cm', { circumference: 157, pi: 3.14 }), '157cm ÷ 3.14 = 50cm');
  assert.equal(f('circle-area', 314, 'cm²', { radius: 10, pi: 3.14 }), '10cm × 10cm × 3.14 = 314cm²');
  assert.equal(f('triangle-area', 20, 'cm²', { base: 8, height: 5 }), '8cm × 5cm ÷ 2 = 20cm²');
  assert.equal(f('trapezoid-area', 42, 'cm²', { top: 4, bottom: 10, height: 6 }), '(4cm + 10cm) × 6cm ÷ 2 = 42cm²');
  assert.equal(f('parallelogram-area', 63, 'cm²', { base: 7, height: 9 }), '7cm × 9cm = 63cm²');
});

// ---- 結果画面の「間違えた問題」(2026-09-30 本番に合わせて変更) ----

test('間違えた問題: 正解なら記録せず、不正解なら問題文・あなたの答え・正解・式を持つ', () => {
  const q = { kind: 'meeting', variant: 'opposite', prompt: '周囲4.2kmの池を…何分後に出会いますか?', answer: 36, unit: '分',
    values: { length: 4.2, a: 4, b: 3 }, choices: [252, 36, 360, 3.6], correctIndex: 1 };
  assert.equal(t1MistakeEntry(q, 1), null);
  assert.deepEqual(t1MistakeEntry(q, 0), {
    prompt: '周囲4.2kmの池を…何分後に出会いますか?',
    yourAnswer: '252分',
    correctAnswer: '36分',
    formula: '4.2km ÷ (時速4km + 時速3km) × 60 = 36分',
  });
});

test('間違えた問題: 速さの答えは「時速◯km」で出す', () => {
  const q = { kind: 'speed', variant: 'speed', prompt: '10kmを5時間で進む速さは時速何kmですか?', answer: 2, unit: 'km', answerPrefix: '時速',
    values: { speed: 2, hours: 5, distance: 10 }, choices: [2, 50, 15, 5], correctIndex: 0 };
  const entry = t1MistakeEntry(q, 3);
  assert.equal(entry.yourAnswer, '時速5km');
  assert.equal(entry.correctAnswer, '時速2km');
});

test('間違えた問題の見出し: 0問なら「全問正解」、回答なしなら「回答した問題はありません」', () => {
  assert.equal(t1ReviewSummary(12, []), '全問正解');
  assert.equal(t1ReviewSummary(0, []), '回答した問題はありません');
  assert.equal(t1ReviewSummary(12, [{}, {}, {}]), '間違えた問題(3問)');
});

test('生成した問題でも、不正解の記録の式を計算すると正解と一致する', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const q = generateT1Problem(createRng(seed), P);
    const wrong = (q.correctIndex + 1) % 4;
    const entry = t1MistakeEntry(q, wrong);
    assert.equal(entry.prompt, q.prompt);
    assert.equal(entry.correctAnswer, formatT1Answer(q, q.answer));
    const value = evaluateExpr(t1Formula(q).expression);
    assert.ok(close(q.kind === 'cylinder' ? Math.round(value * 10) / 10 : value, q.answer), `${q.kind}: ${t1Formula(q).text}`);
  }
});

// ---- 新しい4種類(2026-09-30 本番に合わせて追加) ----

test('新しい4種類: 多数のシードで出て、正解は問題文の数値の計算と一致し、答えの形を守る', () => {
  for (const kind of NEW_KINDS) {
    const variants = new Set();
    for (let seed = 1; seed <= 1500; seed++) {
      const q = generateT1Problem(createRng(seed), P, null, kind);
      assert.equal(q.kind, kind);
      variants.add(q.variant);
      const n = q.prompt.replace(PI_NOTE, '').match(/\d+(?:\.\d+)?/g).map(Number);
      assert.ok(close(q.answer, newKindExpected(kind, n)), `${q.prompt} → ${q.answer}`);
      assert.ok(q.answer > 0 && decimalsOf(q.answer) <= answerDecimals(q), `${kind}: ${q.answer}`);
      assert.ok(!/\d+\.\d{4,}/.test(q.prompt.replace(PI_NOTE, '')), `問題文の小数は第3位まで: ${q.prompt}`);
    }
    if (kind === 'wage') assert.deepEqual([...variants].sort(), ['dollar', 'yen']);
  }
});

test('新しい4種類も多数の問題の中に出る(本番と同じく続けて出す)', () => {
  const rng = createRng(7);
  const seen = new Set();
  let previous = null;
  for (let i = 0; i < 2000; i++) {
    previous = generateT1Problem(rng, P, previous);
    seen.add(previous.kind);
  }
  for (const kind of NEW_KINDS) assert.ok(seen.has(kind), kind);
});

test('仕事算: 人数と時間は反比例(5人で11時間 → 4人で13.75時間)。比例の誤答が入る', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const q = generateT1Problem(createRng(seed), P, null, 'work');
    const { workers1, hours1, workers2 } = q.values;
    assert.notEqual(workers1, workers2);
    assert.ok(close(q.answer, workers1 * hours1 / workers2), q.prompt);
    const proportional = Math.round(hours1 * workers2 / workers1 * 1e6) / 1e6;
    if (decimalsOf(proportional) <= 3) assert.ok(q.choices.includes(proportional), `${q.prompt} 比例の誤答 ${proportional} が ${q.choices} にない`);
  }
  assert.equal(t1Formula({ kind: 'work', variant: 'basic', answer: 13.75, unit: '時間', values: { workers1: 5, hours1: 11, workers2: 4 } }).text,
    '5人 × 11時間 ÷ 4人 = 13.75時間');
});

test('速さと時間: 答えは分が整数になる組だけで、「◯時間◯分」で表す', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const q = generateT1Problem(createRng(seed), P, null, 'speedTime');
    const { speed1, hours1, speed2 } = q.values;
    assert.equal((speed1 * hours1 * 60) % speed2, 0, q.prompt);
    assert.equal(q.answer, speed1 * hours1 * 60 / speed2);
    assert.match(formatT1Answer(q, q.answer), /^(\d+時間)?(\d+分)?$/);
    for (const c of q.choices) assert.ok(!/(^|\D)0分$/.test(formatT1Answer(q, c)) && !/^0時間/.test(formatT1Answer(q, c)), formatT1Answer(q, c));
    assert.ok(q.prompt.endsWith('何時間何分かかりますか?'), q.prompt);
  }
  assert.equal(formatT1Answer({ kind: 'speedTime', unit: '', answerFormat: 'hm' }, 624), '10時間24分');
  assert.equal(formatT1Answer({ kind: 'speedTime', unit: '', answerFormat: 'hm' }, 605), '10時間5分');
  // ちょうどの時間は「◯時間」、0時間なら「◯分」(2026-09-30 追加の直し)
  assert.equal(formatT1Answer({ kind: 'speedTime', unit: '', answerFormat: 'hm' }, 420), '7時間');
  assert.equal(formatT1Answer({ kind: 'speedTime', unit: '', answerFormat: 'hm' }, 45), '45分');
  assert.equal(t1Formula({ kind: 'speedTime', variant: 'basic', answer: 624, unit: '', answerFormat: 'hm', values: { speed1: 780, hours1: 10, speed2: 750 } }).text,
    '時速780km × 10時間 × 60 ÷ 時速750km = 10時間24分');
});

test('時給: ドルは小数第2位まで割り切れ、円は整数。両方の版が出る', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const q = generateT1Problem(createRng(seed), P, null, 'wage');
    const { hours, total } = q.values;
    assert.ok(close(q.answer, total / hours));
    assert.ok(Number.isInteger(Math.round(total * 100) / hours) || close(q.answer * hours, total), q.prompt);
    if (q.variant === 'dollar') { assert.equal(q.unit, 'ドル'); assert.ok(decimalsOf(q.answer) <= 2); }
    else { assert.equal(q.unit, '円'); assert.ok(Number.isInteger(q.answer)); }
    assert.ok(q.prompt.includes(`時給は何${q.unit}ですか?`), q.prompt);
  }
  assert.equal(t1Formula({ kind: 'wage', variant: 'dollar', answer: 250, unit: 'ドル', values: { hours: 13, total: 3250 } }).text, '3250ドル ÷ 13時間 = 250ドル');
  assert.equal(t1Formula({ kind: 'wage', variant: 'yen', answer: 1500, unit: '円', values: { hours: 8, total: 12000 } }).text, '12000円 ÷ 8時間 = 1500円');
});

test('円筒: 円周率3.14、上から下げた分を引き、小数第1位で四捨五入して「約◯L」。誤答は典型的な間違いから作る', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const q = generateT1Problem(createRng(seed), P, null, 'cylinder');
    const { diameter, heightM, gap } = q.values;
    const cm = Math.round(heightM * 100) - gap;
    assert.ok(cm > 0);
    const round1 = x => Math.round(x * 10) / 10;
    assert.equal(q.answer, round1(3.14 * (diameter / 2) ** 2 * cm / 1000), q.prompt);
    assert.equal(formatT1Answer(q, q.answer), `約${q.answer}L`);
    assert.ok(q.prompt.endsWith(PI_NOTE), q.prompt);
    const typical = new Set([
      round1(3.14 * diameter ** 2 * cm / 1000), // 直径を半径として計算する
      round1(3.14 * (diameter / 2) ** 2 * Math.round(heightM * 100) / 1000), // 上から下げた分を引き忘れる
      round1(3.14 * (diameter / 2) ** 2 * cm / 100), // cm³ と L の換算を誤る
      round1(3.14 * (diameter / 2) ** 2 * cm / 10000),
      round1((diameter / 2) ** 2 * cm / 1000), // 3.14 を掛け忘れる
      round1(3.14 * diameter * cm / 1000), // 半径を2乗し忘れる
    ]);
    for (const c of q.choices) if (c !== q.answer) assert.ok(typical.has(c), `${q.prompt}: 誤答 ${c} が典型的な間違いでない(${[...typical]})`);
  }
  assert.equal(t1Formula({ kind: 'cylinder', variant: 'fuel', answer: 14.2, unit: 'L', answerPrefix: '約', values: { diameter: 13, heightM: 1.2, gap: 13, pi: 3.14 } }).text,
    '3.14 × 6.5cm × 6.5cm × 107cm ÷ 1000 = 約14.2L');
});

test('新しい4種類の「間違えた問題」: 答えの形のまま出す', () => {
  const st = { kind: 'speedTime', variant: 'basic', prompt: '…', answer: 624, unit: '', answerFormat: 'hm',
    values: { speed1: 780, hours1: 10, speed2: 750 }, choices: [600, 624, 650, 684], correctIndex: 1 };
  assert.equal(t1MistakeEntry(st, 0).yourAnswer, '10時間');
  assert.equal(t1MistakeEntry(st, 0).correctAnswer, '10時間24分');
  const cy = { kind: 'cylinder', variant: 'fuel', prompt: '…', answer: 14.2, unit: 'L', answerPrefix: '約',
    values: { diameter: 13, heightM: 1.2, gap: 13, pi: 3.14 }, choices: [14.2, 15.9, 56.8, 4.5], correctIndex: 0 };
  assert.equal(t1MistakeEntry(cy, 1).yourAnswer, '約15.9L');
});

// ---- 問題文を短い文章題にする(2026-09-30 本番に合わせて変更) ----

test('文章題: どの種類も場面が3つ以上出る', () => {
  for (const kind of PROBLEM_KINDS) {
    const scenes = new Set();
    for (let seed = 1; seed <= 600; seed++) scenes.add(generateT1Problem(createRng(seed), P, null, kind).scene);
    scenes.delete(undefined);
    assert.ok(scenes.size >= 3, `${kind}: 場面 ${[...scenes]}`);
  }
});

test('文章題: 問題文の数値は、正解の計算に使う数値と同じ(順番も同じ)', () => {
  for (const kind of PROBLEM_KINDS) {
    for (let seed = 1; seed <= 400; seed++) {
      const q = generateT1Problem(createRng(seed), P, null, kind);
      const n = q.prompt.replace(PI_NOTE, '').match(/\d+(?:\.\d+)?/g).map(Number);
      assert.deepEqual(n, promptValues(q), `${kind}/${q.variant}: ${q.prompt}`);
    }
  }
});

test('文章題: 計算に直結した1文(「20haは何m²ですか?」の形)にせず、場面の文と問いの文にする', () => {
  for (const kind of PROBLEM_KINDS) {
    for (let seed = 1; seed <= 200; seed++) {
      const q = generateT1Problem(createRng(seed), P, null, kind);
      assert.ok(q.prompt.includes('。'), `場面の文と問いの文にする: ${q.prompt}`);
    }
  }
});

test('単位換算: t↔kg は「メートルトン」の言い方も使い、換算の倍率は変わらない', () => {
  const words = new Set();
  for (const id of ['t-to-kg', 'kg-to-t']) {
    for (let seed = 1; seed <= 200; seed++) {
      const q = generateT1Problem(createRng(seed), P, null, 'unit', id);
      words.add(q.prompt.includes('メートルトン') ? 'メートルトン' : 't');
      assert.ok(close(q.answer, q.values.shown * UNIT_RATIOS[id]), q.prompt);
    }
  }
  assert.deepEqual([...words].sort(), ['t', 'メートルトン']);
});

// ---- 2026-09-30 追加の直し ----

test('速さと時間: ちょうどの時間は選択肢・間違えた問題・式のすべてで「◯時間」と出す', () => {
  const q = { kind: 'speedTime', variant: 'basic', prompt: '…', answer: 480, unit: '', answerFormat: 'hm',
    values: { speed1: 800, hours1: 6, speed2: 600 }, choices: [480, 360, 420, 490], correctIndex: 0 };
  assert.equal(t1Formula(q).text, '時速800km × 6時間 × 60 ÷ 時速600km = 8時間');
  assert.equal(t1MistakeEntry(q, 1).yourAnswer, '6時間');
  assert.equal(t1MistakeEntry(q, 1).correctAnswer, '8時間');
  assert.deepEqual(q.choices.map(v => formatT1Answer(q, v)), ['8時間', '6時間', '7時間', '8時間10分']);
});

test('速さ: 時間を求める問題では距離と速さを同じ数にしない(答えが「1時間」になる組を出さない)', () => {
  let time = 0;
  for (let seed = 1; seed <= 3000; seed++) {
    const q = generateT1Problem(createRng(seed), P, null, 'speed');
    if (q.variant !== 'time') continue;
    time++;
    assert.notEqual(q.values.distance, q.values.speed, q.prompt);
    assert.notEqual(q.answer, 1, q.prompt);
    assert.ok(q.answer >= P.speedHoursMin && q.answer <= P.speedHoursMax);
  }
  assert.ok(time > 500, `時間を求める問題 ${time}`);
});

// ---- 場面と数値を釣り合わせる(2026-09-30 レビュー後の直し) ----
// 場面ごとに、現実的な数値の範囲をテストの側で持つ。問題の数値がその場面の範囲に入ることを確かめる。

// 単位換算: 量ごとの基準の単位への倍率(面積 m²・長さ m・重さ kg・体積 L・時間 分・速さ 時速km)
const BASE = {
  'ha': 10000, 'a': 100, 'km²': 1e6, 'm²': 1, 'cm²': 1e-4, 'mm²': 1e-6,
  'km': 1000, 'm': 1, 'cm': 0.01, 'mm': 0.001,
  'kg': 1, 'g': 0.001, 't': 1000, 'メートルトン': 1000,
  'L': 1, 'mL': 0.001, 'dL': 0.1, 'm³': 1000, 'cm³': 0.001, 'mm³': 1e-6,
  '時間': 60, '分': 1, '秒': 1 / 60, '日': 1440,
  '時速km': 1, '分速m': 0.06, '秒速m': 3.6,
};
const UNIT_SCENE_RANGES = {
  // 面積(m²)
  office: [100, 2000], hangar: [1000, 20000], warehouse: [5000, 200000], apron: [10000, 500000], airport: [500000, 2e7],
  label: [1e-4, 1e-2], window: [0.5, 5], panel: [1, 20], sheet: [1, 20],
  // 長さ(m)
  runway: [1000, 5000], road: [1000, 20000], taxiway: [1000, 10000], width: [0.1, 2], cable: [1, 20], part: [0.01, 0.3],
  // 重さ(kg)
  baggage: [1, 30], catering: [1, 100], cargo: [100, 20000], truckload: [500, 20000],
  // 体積(L)
  drinks: [1, 50], water: [1, 20], fuel: [500, 20000], partVolume: [0.001, 0.02], screw: [0.001, 0.005], partCase: [0.005, 0.02],
  // 時間(分)
  flight: [30, 1200], maintenance: [10, 28800], loading: [1, 180], voyage: [1440, 28800],
  // 速さ(時速km)
  taxiing: [5, 50], takeoff: [100, 360], truck: [10, 100], wind: [3, 100], bicycle: [5, 30],
};
const SPEED_SCENE_RANGES = { walker: [2, 6], runner: [6, 15], bicycle: [8, 25], truck: [10, 80], ship: [10, 40] };
// 周回: [遅い方の範囲, 速い方の範囲]
const LAP_SCENE_RANGES = { pondWalkers: [[2, 6], [2, 6]], joggers: [[4, 12], [4, 12]], walkerRunner: [[2, 6], [6, 12]] };
const within = (v, [min, max]) => v >= min - 1e-9 && v <= max + 1e-9;

function sceneName(q) {
  const parts = q.scene.split(':');
  return parts[parts.length - 1];
}

function assertSceneFits(q) {
  const name = sceneName(q);
  const v = q.values;
  const where = `${q.kind}/${q.variant} ${q.scene}: ${q.prompt}`;
  if (q.kind === 'unit') {
    const unit = v.fromPre ? `${v.fromPre}${v.from}` : v.from;
    const value = v.shown * BASE[unit];
    assert.ok(UNIT_SCENE_RANGES[name], `範囲の無い場面 ${where}`);
    assert.ok(within(value, UNIT_SCENE_RANGES[name]), `${where}(${value} は ${UNIT_SCENE_RANGES[name]} の外)`);
  } else if (q.kind === 'speed') {
    assert.ok(within(v.speed, SPEED_SCENE_RANGES[name]), where);
  } else if (q.kind === 'meeting' || q.kind === 'catchup') {
    const [slow, fast] = LAP_SCENE_RANGES[name];
    assert.ok(within(v.b, slow) && within(v.a, fast), where);
  } else if (q.kind === 'percentage' || q.kind === 'inversePercentage') {
    if (name === 'passengers' || name === 'seats') assert.ok(v.base <= 500, where);
  } else if (q.kind === 'price' && (q.variant === 'total' || q.variant === 'unit-price')) {
    const ranges = { souvenir: [100, 3000], snack: [10, 300], part: [10, 3000] };
    assert.ok(within(v.price, ranges[name]), where);
  } else if (q.kind === 'geometry' && q.variant.startsWith('circle')) {
    const diameter = v.diameter ?? (v.radius !== undefined ? v.radius * 2 : q.answer);
    const ranges = { tray: [20, 60], table: [40, 200], flowerbed: [50, 600], fountain: [100, 600] };
    assert.ok(within(diameter, ranges[name]), `${where}(直径 ${diameter})`);
  } else if (q.kind === 'cylinder') {
    if (name === 'can') assert.ok(v.diameter <= 30 && v.heightM <= 1, where);
    if (name === 'tank') assert.ok(v.diameter >= 20, where);
  }
}

test('場面と数値: 多数のシードで、どの種類も場面が数値の範囲に合っている(旅客機が時速15km、18km²の倉庫などは出さない)', () => {
  for (const kind of PROBLEM_KINDS) {
    for (let seed = 1; seed <= 1500; seed++) assertSceneFits(generateT1Problem(createRng(seed), P, null, kind));
  }
  const rng = createRng(99);
  let previous = null;
  for (let i = 0; i < 6000; i++) {
    previous = generateT1Problem(rng, P, previous);
    assertSceneFits(previous);
  }
});

test('場面と数値: 単位換算はどの種類・どの数値でも合う場面があり、場面は量ごとに3つ以上出る', () => {
  const byQuantity = new Map();
  for (const id of UNIT_VARIANT_IDS) {
    for (let seed = 1; seed <= 300; seed++) {
      const q = generateT1Problem(createRng(seed), P, null, 'unit', id);
      assertSceneFits(q);
      const quantity = q.scene.split(':')[1];
      if (!byQuantity.has(quantity)) byQuantity.set(quantity, new Set());
      byQuantity.get(quantity).add(sceneName(q));
    }
  }
  assert.deepEqual([...byQuantity.keys()].sort(), ['area', 'length', 'speed', 'time', 'volume', 'weight']);
  for (const [quantity, names] of byQuantity) assert.ok(names.size >= 3, `${quantity}: ${[...names]}`);
});

test('場面と数値: 速さの場面は時速2〜20kmのどの数値にも合うものがある(旅客機は使わない)', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 3000; seed++) {
    const q = generateT1Problem(createRng(seed), P, null, 'speed');
    assertSceneFits(q);
    assert.doesNotMatch(q.prompt, /旅客機|飛行機/, q.prompt);
    seen.add(sceneName(q));
  }
  assert.ok(seen.size >= 3, [...seen].join(','));
});

// ---- 割合の問題を足す(2026-09-30 本番の記憶で追加) ----

const RATIO_NEW = ['markup', 'discount', 'wholeFromPart', 'yearOverYear'];

test('割合の新しい4種類: 正解は問題文の数値の計算と一致し、式を計算しても一致し、答えの形を守る', () => {
  for (const kind of RATIO_NEW) {
    const variants = new Set();
    for (let seed = 1; seed <= 1000; seed++) {
      const q = generateT1Problem(createRng(seed), P, null, kind);
      variants.add(q.variant);
      const n = q.prompt.match(/\d+(?:\.\d+)?/g).map(Number);
      assert.ok(close(q.answer, ratioExpected(kind, q.variant, n)), `${q.prompt} → ${q.answer}(${ratioExpected(kind, q.variant, n)})`);
      assert.ok(close(evaluateExpr(t1Formula(q).expression), q.answer), `${kind}: ${t1Formula(q).text}`);
      assert.ok(q.answer > 0 && decimalsOf(q.answer) <= answerDecimals(q), `${kind}: ${q.answer}`);
      assert.equal(new Set(q.choices).size, 4);
      assert.ok(q.choices.every(v => v > 0 && decimalsOf(v) <= choiceDecimals(q)), `${q.prompt} ${q.choices}`);
    }
    if (kind === 'discount') assert.deepEqual([...variants].sort(), [...DISCOUNT_VARIANTS].sort());
  }
});

test('利益率: 例のとおり(製造コスト560ドルに33%の利益 → 744.8ドル)。誤答に「率だけを掛ける」「引く」が入る', () => {
  const q = { kind: 'markup', variant: 'basic', answer: 744.8, unit: 'ドル', values: { cost: 560, rate: 33 } };
  assert.equal(t1Formula(q).text, '560ドル × (1 + 0.33) = 744.8ドル');
  for (let seed = 1; seed <= 300; seed++) {
    const g = generateT1Problem(createRng(seed), P, null, 'markup');
    const { cost, rate } = g.values;
    const rateOnly = Math.round(cost * rate) / 100;
    const minus = Math.round(cost * (100 - rate)) / 100;
    assert.ok(g.choices.includes(rateOnly) || g.choices.includes(minus) || g.choices.includes(Math.round(cost / (1 + rate / 100) * 100) / 100) || g.choices.includes(cost + rate),
      `${g.prompt} ${g.choices}`);
  }
});

test('割引・全体の逆算・前年比の式の例', () => {
  assert.equal(t1Formula({ kind: 'discount', variant: 'sale-price', answer: 267.96, unit: 'ドル', values: { list: 348, rate: 23, sale: 267.96 } }).text,
    '348ドル × (1 − 0.23) = 267.96ドル');
  assert.equal(t1Formula({ kind: 'discount', variant: 'list-price', answer: 348, unit: 'ドル', values: { list: 348, rate: 23, sale: 267.96 } }).text,
    '267.96ドル ÷ (1 − 0.23) = 348ドル');
  assert.equal(t1Formula({ kind: 'wholeFromPart', variant: 'basic', answer: 175, unit: '人', values: { part: 56, rate: 32 } }).text,
    '56人 ÷ 0.32 = 175人');
  assert.equal(t1Formula({ kind: 'yearOverYear', variant: 'basic', answer: 2846688, unit: 'ドル', values: { now: 3245224, rate: 14 } }).text,
    '3245224ドル ÷ (1 + 0.14) = 2846688ドル');
});

test('全体の逆算と前年比は、答えが整数(割り切れる)になる組だけ', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const w = generateT1Problem(createRng(seed), P, null, 'wholeFromPart');
    assert.ok(Number.isInteger(w.answer) && Number.isInteger(w.values.part), w.prompt);
    assert.equal(w.values.part, w.answer * w.values.rate / 100);
    const y = generateT1Problem(createRng(seed), P, null, 'yearOverYear');
    assert.ok(Number.isInteger(y.answer), y.prompt);
    assert.equal(y.values.now, y.answer * (100 + y.values.rate) / 100);
  }
});

// ---- 暗算で一瞬の問題をなくす(2026-09-30 本番の記憶で追加) ----

test('きりのいい数と有効数字の判定', () => {
  // きりのいい数 = 有効数字1桁の整数(1桁の整数と 10・60・300・3000 など)。560 のように2桁以上あれば違う
  for (const v of [2, 7, 10, 60, 100, 1000, 3000]) assert.equal(isRoundNumber(v), true, String(v));
  for (const v of [13, 347, 560, 23570, 2.35, 0.5, 744.8]) assert.equal(isRoundNumber(v), false, String(v));
  assert.equal(significantDigits(3.47), 3);
  assert.equal(significantDigits(560), 2);
  assert.equal(significantDigits(0.0582), 3);
  assert.equal(significantDigits(3245224), 7);
});

test('暗算で一瞬の問題は出ない: 多数のシードで、問題文の数値がきりのいい数だけにならず、経過時間以外は有効数字3桁以上の数を含む', () => {
  for (const kind of PROBLEM_KINDS) {
    for (let seed = 1; seed <= 800; seed++) {
      const q = generateT1Problem(createRng(seed), P, null, kind);
      const n = q.prompt.replace(PI_NOTE, '').match(/\d+(?:\.\d+)?/g).map(Number);
      assert.ok(!n.every(isRoundNumber), `きりのいい数だけ: ${q.prompt}`);
      if (kind !== 'elapsed') assert.ok(n.some(v => significantDigits(v) >= 3), `有効数字3桁以上の数が無い: ${q.prompt}`);
    }
  }
  // 以前の「2時間は何分ですか」「7tは何kgですか」のような形は出ない
  for (let seed = 1; seed <= 3000; seed++) {
    const q = generateT1Problem(createRng(seed), P, null, 'unit');
    assert.ok(!isRoundNumber(q.values.shown), q.prompt);
  }
});
