import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { DEFAULTS } from '../js/core/settings.js';
import {
  PROBLEM_KINDS, lapMinutes, makeT1Choices, generateT1Problem, judgeT1,
  createT1Tally, recordT1Answer, summarizeT1, buildT1Record,
} from '../js/logic/t1.js';
import { t1Feedback, t1Formula, formatT1Answer, UNIT_VARIANT_IDS, POWER_UNIT_VARIANT_IDS, PRICE_VARIANTS } from '../js/logic/t1.js';

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
const close = (a, b) => Math.abs(a - b) < 1e-8;
const evaluateExpr = expression => Function(`"use strict"; return (${expression});`)();

test('T1 の既定値は承認済みの数値', () => {
  assert.deepEqual(P, {
    durationSec: 180,
    calculatorDuringTest: true,
    answerFeedbackMs: 300,
    stallAbortMs: 1000,
    unitValueMin: 1,
    unitValueMax: 20,
    speedMin: 2,
    speedMax: 20,
    speedHoursMin: 1,
    speedHoursMax: 8,
    lapSpeedMin: 2,
    lapSpeedMax: 10,
    lapMultiplierMin: 3,
    lapMultiplierMax: 10,
    lapIntegerRate: 0.8,
    percentagePercents: [10, 20, 25, 40, 50, 75],
    percentageUnitMin: 2,
    percentageUnitMax: 20,
    priceMin: 10, priceMax: 200, priceCountMin: 2, priceCountMax: 12,
    averageMin: 2, averageMax: 50,
    clockStartHourMin: 6, clockStartHourMax: 18,
    elapsedMinutesMin: 15, elapsedMinutesMax: 180,
    unitKindWeight: 7,
  });
});

test('問題は9種類。単位換算は他の3倍の約1/3、他の8種類はそれぞれ約1/12(2026-09-28 ユーザーの判断で変更)', () => {
  assert.deepEqual(PROBLEM_KINDS, ['unit', 'speed', 'meeting', 'catchup', 'percentage', 'inversePercentage', 'price', 'average', 'elapsed']);
  // 本番と同じく、直前の問題を渡しながら続けて作る
  const rng = createRng(2026);
  const counts = Object.fromEntries(PROBLEM_KINDS.map(k => [k, 0]));
  const total = 45000;
  let previous = null;
  for (let i = 0; i < total; i++) {
    const q = generateT1Problem(rng, P, previous);
    if (previous) assert.notEqual(q.kind, previous.kind, '同じ種類は続けて出さない');
    counts[q.kind]++;
    previous = q;
  }
  const unitShare = counts.unit / total;
  assert.ok(unitShare > 0.32 && unitShare < 0.347, `単位換算 ${unitShare}`);
  for (const kind of PROBLEM_KINDS.filter(k => k !== 'unit')) {
    const share = counts[kind] / total;
    assert.ok(share > 0.075 && share < 0.092, `${kind} ${share}`);
  }
});

test('2000シード: 小数は第1位まで・20%以下・9種類の正解が式に一致', () => {
  let decimals = 0;
  const seen = new Set();
  for (let seed = 1; seed <= 2000; seed++) {
    const q = generateT1Problem(createRng(seed), P);
    seen.add(q.kind);
    assert.ok(!/\d+\.\d{2,}/.test(q.prompt), `seed=${seed} ${q.prompt}`);
    if (/\d+\.\d+/.test(q.prompt)) decimals++;
    const n = q.prompt.match(/\d+(?:\.\d+)?/g).map(Number);
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
    assert.ok(Math.abs(q.answer-expected) < 1e-8, `seed=${seed} ${q.prompt}: ${q.answer} != ${expected}`);
  }
  assert.ok(decimals <= 400, `小数問題=${decimals}/2000`);
  assert.equal(seen.size, 9);
});

test('周回問題は8割以上が整数の距離で、小数も第1位まで', () => {
  for (const kind of ['meeting', 'catchup']) {
    let integer = 0;
    for (let seed=1; seed<=2000; seed++) {
      const q = generateT1Problem(createRng(seed), P, null, kind);
      const length = Number(q.prompt.match(/周囲([\d.]+)/)[1]);
      if (Number.isInteger(length)) integer++;
      assert.ok(!/\d+\.\d{2,}/.test(q.prompt), q.prompt);
    }
    assert.ok(integer >= 1550, `${kind}: ${integer}/2000 (80%の確率、標本許容差)`);
  }
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
  const made = makeT1Choices(36, [252, 42, 2160, 0.6, 360, 3.6, 36, -1], createRng(1));
  assert.equal(made.choices.length, 4);
  assert.equal(new Set(made.choices).size, 4);
  assert.equal(made.choices.filter(v => v === 36).length, 1);
  assert.ok(made.choices.every(v => Number.isInteger(v) && v > 0));
  assert.ok(made.choices.filter(v => v === 360 || v === 3.6).length <= 1);
  assert.equal(made.choices[made.correctIndex], 36);
});

test('シード2000種類で全9種類が出て、4択は正の整数・重複なし・桁ずらし1つまで', () => {
  const kinds = new Set();
  for (let seed = 1; seed <= 2000; seed++) {
    const q = generateT1Problem(createRng(seed), P);
    kinds.add(q.kind);
    assert.ok(Number.isInteger(q.answer) && q.answer > 0, `seed=${seed} answer=${q.answer}`);
    assert.equal(q.choices.length, 4, `seed=${seed}`);
    assert.equal(new Set(q.choices).size, 4, `seed=${seed}`);
    assert.equal(q.choices.filter(v => v === q.answer).length, 1, `seed=${seed}`);
    assert.ok(q.choices.every(v => Number.isInteger(v) && v > 0), `seed=${seed} choices=${q.choices}`);
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

// ---- 即時判定 ----

test('即時判定: 正解は「○ 正解」、不正解は単位つきの正解を出す', () => {
  const problem = { answer: 36, unit: '分', choices: [36, 6, 360, 3.6], correctIndex: 0 };
  assert.deepEqual(t1Feedback(problem, true), { kind: 'correct', text: '○ 正解' });
  assert.deepEqual(t1Feedback(problem, false), { kind: 'wrong', text: '× 正解は 36分' });
  assert.deepEqual(t1Feedback({ ...problem, answer: 120, unit: '' }, false), { kind: 'wrong', text: '× 正解は 120' });
});

// ---- 不正解のときに出す式 ----

const evaluate = expression => Function(`"use strict"; return (${expression});`)();

test('式: 9種類すべてで式を作り、式を計算すると正解と一致する(2000シード)', () => {
  const kinds = new Set();
  const speedVariants = new Set();
  for (let seed = 1; seed <= 2000; seed++) {
    const kind = PROBLEM_KINDS[seed % PROBLEM_KINDS.length];
    const problem = generateT1Problem(createRng(seed), P, null, kind);
    const formula = t1Formula(problem);
    assert.ok(formula.text.endsWith(` = ${formatT1Answer(problem, problem.answer)}`), `${kind}: ${formula.text}`);
    assert.ok(Math.abs(evaluate(formula.expression) - problem.answer) < 1e-9, `${kind}: ${formula.expression} != ${problem.answer}`);
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

test('単位換算: 4択の決まり(正の整数・重複なし・桁ずらし1つまで)を全種類で守る', () => {
  for (const id of UNIT_VARIANT_IDS) {
    for (let seed = 1; seed <= 60; seed++) {
      const q = generateT1Problem(createRng(seed), P, null, 'unit', id);
      assert.equal(new Set(q.choices).size, 4, `${id} ${q.choices}`);
      assert.ok(q.choices.every(v => Number.isInteger(v) && v > 0), `${id} ${q.choices}`);
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

test('単位換算: 速さの換算は答えが整数になる数値だけを使う', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const kmh = generateT1Problem(createRng(seed), P, null, 'unit', 'kmh-to-mpm');
    assert.equal(kmh.values.shown % 3, 0, kmh.prompt);
    const mps = generateT1Problem(createRng(seed), P, null, 'unit', 'mps-to-kmh');
    assert.equal(mps.values.shown % 5, 0, mps.prompt);
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
    assert.deepEqual(t1Feedback(q, false), { kind: 'wrong', text: `× 正解は 時速${q.answer}km` });
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
      assert.ok(q.choices.every(v => Number.isInteger(v) && v > 0), `${q.prompt} ${q.choices}`);
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
