import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { DEFAULTS } from '../js/core/settings.js';
import {
  DIRECTIONS, solutionFor, generateT4Problem,
  createT4Selection, selectT4Position, selectT4Heading, canSubmitT4,
  judgeT4, createT4Tally, recordT4Answer, summarizeT4, buildT4Record,
} from '../js/logic/t4.js';

const P = DEFAULTS.t4;

test('T4 の既定値は承認済みの数値', () => {
  assert.deepEqual(P, { durationSec: 180, answerFeedbackMs: 300 });
});

test('方位は N から時計回りの8方向', () => {
  assert.deepEqual(DIRECTIONS.map(d => d.key), ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
  assert.equal(new Set(DIRECTIONS.map(d => `${d.row},${d.col}`)).size, 8);
});

test('検証例1: 機首N・針が右なら自機は西のマス・向きN', () => {
  assert.deepEqual(solutionFor(0, 2), { towerDirection: 2, position: 'W', heading: 'N' });
});

test('検証例2: 機首W・針が真上なら自機は東のマス・向きW', () => {
  assert.deepEqual(solutionFor(6, 0), { towerDirection: 6, position: 'E', heading: 'W' });
});

test('8方位×8相対方向の64通りを式と照合する', () => {
  for (let heading = 0; heading < 8; heading++) {
    for (let relative = 0; relative < 8; relative++) {
      const got = solutionFor(heading, relative);
      const towerDirection = (heading + relative) % 8;
      assert.equal(got.towerDirection, towerDirection);
      assert.equal(got.position, DIRECTIONS[(towerDirection + 4) % 8].key);
      assert.equal(got.heading, DIRECTIONS[heading].key);
    }
  }
});

test('問題生成は64通りを使い、直前と同じ問題を出さない', () => {
  const rng = createRng(44);
  let prev = null;
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    const q = generateT4Problem(rng, prev);
    assert.ok(q.headingIndex >= 0 && q.headingIndex < 8);
    assert.ok(q.relativeIndex >= 0 && q.relativeIndex < 8);
    if (prev) assert.notDeepEqual([q.headingIndex, q.relativeIndex], [prev.headingIndex, prev.relativeIndex]);
    seen.add(`${q.headingIndex},${q.relativeIndex}`);
    prev = q;
  }
  assert.equal(seen.size, 64);
});

test('マス・向きは選び直せ、両方がそろうまで決定できない', () => {
  const empty = createT4Selection();
  assert.equal(canSubmitT4(empty), false);
  const position = selectT4Position(empty, 'W');
  assert.equal(canSubmitT4(position), false);
  const changed = selectT4Position(position, 'E');
  assert.equal(changed.position, 'E');
  const complete = selectT4Heading(changed, 'N');
  assert.equal(canSubmitT4(complete), true);
  assert.equal(selectT4Heading(complete, 'SW').heading, 'SW');
});

test('中央の塔や不明な方位は選択できない', () => {
  assert.throws(() => selectT4Position(createT4Selection(), 'CENTER'));
  assert.throws(() => selectT4Heading(createT4Selection(), 'north'));
});

test('位置と向きを別々に判定する', () => {
  const q = { headingIndex: 0, relativeIndex: 2 };
  assert.deepEqual(judgeT4(q, { position: 'W', heading: 'N' }), { positionCorrect: true, headingCorrect: true, correct: true });
  assert.deepEqual(judgeT4(q, { position: 'W', heading: 'S' }), { positionCorrect: true, headingCorrect: false, correct: false });
  assert.deepEqual(judgeT4(q, { position: 'E', heading: 'N' }), { positionCorrect: false, headingCorrect: true, correct: false });
});

test('採点は両方正解だけ、内訳は位置だけ・向きだけ', () => {
  let tally = createT4Tally();
  tally = recordT4Answer(tally, { positionCorrect: true, headingCorrect: true, correct: true });
  tally = recordT4Answer(tally, { positionCorrect: true, headingCorrect: false, correct: false });
  tally = recordT4Answer(tally, { positionCorrect: false, headingCorrect: true, correct: false });
  tally = recordT4Answer(tally, { positionCorrect: false, headingCorrect: false, correct: false });
  assert.deepEqual(summarizeT4(tally), {
    score: 1,
    detail: { answered: 4, positionOnlyCorrect: 1, headingOnlyCorrect: 1 },
  });
});

test('記録はSPEC §4の形で、その回の設定を複製する', () => {
  const date = '2026-09-23T10:15:00.000Z';
  const tally = { correct: 2, answered: 4, positionOnlyCorrect: 1, headingOnlyCorrect: 1 };
  const record = buildT4Record({ date, tally, settings: P });
  assert.deepEqual(record, {
    id: `${date}-t4`, test: 't4', date, score: 2,
    detail: { answered: 4, positionOnlyCorrect: 1, headingOnlyCorrect: 1 },
    settings: { durationSec: 180, answerFeedbackMs: 300 },
  });
  assert.notEqual(record.settings, P);
});
