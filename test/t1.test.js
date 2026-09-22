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
    percentagePercents: [10, 20, 25, 40, 50, 75],
    percentageUnitMin: 2,
    percentageUnitMax: 20,
  });
});

test('5種類は単位換算・速さ・出会い・追いつき・割合', () => {
  assert.deepEqual(PROBLEM_KINDS, ['unit', 'speed', 'meeting', 'catchup', 'percentage']);
});

test('SPECの例: L=4.2, a=4, b=3 の逆方向は36分', () => {
  assert.equal(lapMinutes(4.2, 4, 3, 'meeting'), 36);
});

test('追いつきは速度差、出会いは速度和を使う', () => {
  assert.equal(lapMinutes(6, 8, 4, 'catchup'), 90);
  assert.equal(lapMinutes(6, 8, 4, 'meeting'), 30);
  assert.throws(() => lapMinutes(6, 4, 4, 'catchup'));
});

test('4択は重ならず、正解を1つだけ含み、誤答は正数', () => {
  const made = makeT1Choices(36, [252, 0.6, 360, 3.6, 36, -1], createRng(1));
  assert.equal(made.choices.length, 4);
  assert.equal(new Set(made.choices).size, 4);
  assert.equal(made.choices.filter(v => v === 36).length, 1);
  assert.ok(made.choices.every(v => v > 0));
  assert.equal(made.choices[made.correctIndex], 36);
});

test('シード2000種類で全5種類が出て、正解は正の整数、4択は重複しない', () => {
  const kinds = new Set();
  for (let seed = 1; seed <= 2000; seed++) {
    const q = generateT1Problem(createRng(seed), P);
    kinds.add(q.kind);
    assert.ok(Number.isInteger(q.answer) && q.answer > 0, `seed=${seed} answer=${q.answer}`);
    assert.equal(q.choices.length, 4, `seed=${seed}`);
    assert.equal(new Set(q.choices).size, 4, `seed=${seed}`);
    assert.equal(q.choices.filter(v => v === q.answer).length, 1, `seed=${seed}`);
    assert.ok(q.choices.filter(v => v !== q.answer).every(v => Number.isFinite(v) && v > 0), `seed=${seed}`);
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
