import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { DEFAULTS } from '../js/core/settings.js';
import {
  generateT5Problem, reshuffleT5Dots, shuffleIndexAt, shouldTimeoutT5,
  createT5Tally, recordT5Answer, recordT5Unanswered, summarizeT5, buildT5Record,
} from '../js/logic/t5.js';

const P = DEFAULTS.t5;

test('T5 の既定値は承認済みの数値', () => {
  assert.deepEqual(P, {
    durationSec: 180,
    minDots: 3,
    maxDots: 13,
    shuffleIntervalMs: 1000,
    questionLimitSec: 10,
    dotMinGapRatio: 0.2,
    dotRadiusRatio: 0.025,
    answerFeedbackMs: 300,
    stallAbortMs: 1000,
  });
});

test('問題は3〜13個で、直前と同じ個数を出さない', () => {
  const rng = createRng(50);
  let previous = null;
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    const q = generateT5Problem(rng, P, previous);
    assert.ok(q.count >= P.minDots && q.count <= P.maxDots);
    if (previous) assert.notEqual(q.count, previous.count);
    seen.add(q.count);
    previous = q;
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
});

function assertValidLayout(q) {
  assert.equal(q.dots.length, q.count);
  for (const dot of q.dots) {
    assert.ok(Math.hypot(dot.x, dot.y) + P.dotRadiusRatio <= 1 + 1e-12);
  }
  for (let i = 0; i < q.dots.length; i++) {
    for (let j = i + 1; j < q.dots.length; j++) {
      assert.ok(Math.hypot(q.dots[i].x - q.dots[j].x, q.dots[i].y - q.dots[j].y) >= P.dotMinGapRatio - 1e-12);
    }
  }
}

test('1000シードで点はすべて円内、最小間隔を守る', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    assertValidLayout(generateT5Problem(createRng(seed), P));
  }
});

test('13個でも1000シードすべて構成的に配置できる', () => {
  const p = { ...P, minDots: 13, maxDots: 13 };
  for (let seed = 1; seed <= 1000; seed++) {
    const q = generateT5Problem(createRng(seed), p);
    assert.equal(q.count, 13);
    assertValidLayout(q);
  }
});

test('位置の入れ替えは個数を変えず、別の配置にする', () => {
  const q = generateT5Problem(createRng(1), P);
  const next = reshuffleT5Dots(q, createRng(2), P);
  assert.equal(next.count, q.count);
  assert.notDeepEqual(next.dots, q.dots);
  assertValidLayout(next);
});

test('位置は問題開始から1000msごとの番号で切り替える', () => {
  assert.equal(shuffleIndexAt(999, P), 0);
  assert.equal(shuffleIndexAt(1000, P), 1);
  assert.equal(shuffleIndexAt(9999, P), 9);
});

test('1問10秒で時間切れ。ただし全体終了と同時なら問題を未回答に数えない', () => {
  assert.equal(shouldTimeoutT5(9999, 10000, 180000), false);
  assert.equal(shouldTimeoutT5(10000, 10000, 180000), true);
  assert.equal(shouldTimeoutT5(180000, 180000, 180000), false);
  assert.equal(shouldTimeoutT5(180001, 180000, 180000), false);
});

test('採点は正答数、内訳は回答・未回答・回答した問題の平均誤差', () => {
  let tally = createT5Tally();
  tally = recordT5Answer(tally, 7, 7);
  tally = recordT5Answer(tally, 8, 10);
  tally = recordT5Unanswered(tally);
  assert.deepEqual(summarizeT5(tally), {
    score: 1,
    detail: { answered: 2, unanswered: 1, meanError: 1 },
  });
  assert.equal(summarizeT5(createT5Tally()).detail.meanError, null);
});

test('集計関数は元の値を書き換えない', () => {
  const tally = createT5Tally();
  recordT5Answer(tally, 3, 4);
  recordT5Unanswered(tally);
  assert.deepEqual(tally, createT5Tally());
});

test('記録はSPEC §4の形で、その回の設定を複製する', () => {
  const date = '2026-09-23T10:15:00.000Z';
  const record = buildT5Record({
    date,
    tally: { correct: 1, answered: 2, unanswered: 1, errors: [0, 2] },
    settings: P,
  });
  assert.equal(record.id, `${date}-t5`);
  assert.equal(record.test, 't5');
  assert.equal(record.score, 1);
  assert.deepEqual(record.detail, { answered: 2, unanswered: 1, meanError: 1 });
  assert.deepEqual(record.settings, P);
  assert.notEqual(record.settings, P);
});
