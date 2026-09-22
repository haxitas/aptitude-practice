import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { DEFAULTS } from '../js/core/settings.js';
import {
  PROBLEM_KINDS, lapMinutes, makeT1Choices, generateT1Problem, judgeT1,
  createT1Tally, recordT1Answer, summarizeT1, buildT1Record,
} from '../js/logic/t1.js';

const P = DEFAULTS.t1;

test('T1 の既定値は承認済みの数値', () => {
  assert.deepEqual(P, {
    durationSec: 180,
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
  });
});

test('問題は均等に選ぶ9種類', () => {
  assert.deepEqual(PROBLEM_KINDS, ['unit', 'speed', 'meeting', 'catchup', 'percentage', 'inversePercentage', 'price', 'average', 'elapsed']);
  const seen = PROBLEM_KINDS.map((_, i) => generateT1Problem(() => (i + 0.5) / 9, P).kind);
  assert.deepEqual(seen, PROBLEM_KINDS);
});

test('2000シード: 小数は第1位まで・20%以下・9種類の正解が式に一致', () => {
  let decimals = 0;
  const seen = new Set();
  const factors = { 'ha-to-m2': 10000, 'm2-to-ha': 1/10000, 'a-to-m2': 100, 'm2-to-a': 1/100, 'km2-to-ha': 100, 'ha-to-km2': 1/100, 'km-to-m': 1000, 'm-to-km': 1/1000, 'hours-to-minutes': 60, 'minutes-to-hours': 1/60 };
  for (let seed = 1; seed <= 2000; seed++) {
    const q = generateT1Problem(createRng(seed), P);
    seen.add(q.kind);
    assert.ok(!/\d+\.\d{2,}/.test(q.prompt), `seed=${seed} ${q.prompt}`);
    if (/\d+\.\d+/.test(q.prompt)) decimals++;
    const n = q.prompt.match(/\d+(?:\.\d+)?/g).map(Number);
    let expected;
    if (q.kind === 'unit') expected = n[0] * factors[q.variant];
    if (q.kind === 'speed') expected = q.variant === 'distance' ? n[0]*n[1] : n[0]/n[1];
    if (q.kind === 'meeting') expected = n[0]*60/(n[1]+n[2]);
    if (q.kind === 'catchup') expected = n[0]*60/(n[1]-n[2]);
    if (q.kind === 'percentage') expected = n[0]*n[1]/100;
    if (q.kind === 'inversePercentage') expected = n[1]*100/n[0];
    if (q.kind === 'price') expected = q.variant === 'total' ? n[0]*n[1] : n[1]/n[0];
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

test('単位換算はha・a・km²・km・時間の往復がすべて出る', () => {
  const variants = new Set();
  for (let seed = 1; seed <= 5000; seed++) {
    const q = generateT1Problem(createRng(seed), P, null, 'unit');
    variants.add(q.variant);
  }
  assert.deepEqual([...variants].sort(), [
    'a-to-m2', 'ha-to-km2', 'ha-to-m2', 'hours-to-minutes', 'km-to-m',
    'km2-to-ha', 'm-to-km', 'm2-to-a', 'm2-to-ha', 'minutes-to-hours',
  ]);
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
