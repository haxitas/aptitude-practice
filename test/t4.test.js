import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { DEFAULTS } from '../js/core/settings.js';
import {
  DIRECTIONS, solutionFor, generateT4Problem,
  createT4Example,
  createT4Selection, selectT4Position, selectT4Heading, canSubmitT4,
  judgeT4, createT4Tally, recordT4Answer, summarizeT4, buildT4Record,
  previousT4Feedback,
} from '../js/logic/t4.js';
import { findTest, formatDetail } from '../js/core/catalog.js';
import { instrumentSvg } from '../js/tests/t4.js';

const P = DEFAULTS.t4;

test('例題は機首NE・相対90度、塔SE・自機NW・向きNE', () => {
  const example = createT4Example();
  assert.deepEqual(example.problem, { headingIndex: 1, relativeIndex: 2 });
  assert.deepEqual(example.selection, { position: 'NW', heading: 'NE' });
  assert.equal(solutionFor(1, 2).towerDirection, 3);
  assert.equal(judgeT4(example.problem, example.selection).correct, true);
});

test('計器の針はindex×45度で描き、ADFに右・後ろ・左の目盛りがある', () => {
  assert.match(instrumentSvg(1), /rotate\(45 100 100\)/);
  const adf = instrumentSvg(2, true);
  assert.match(adf, /rotate\(90 100 100\)/);
  for (const mark of ['右90°', '後ろ180°', '左270°']) assert.ok(adf.includes(mark));
});

test('T4 の既定値は承認済みの数値', () => {
  assert.deepEqual(P, { durationSec: 180, answerFeedbackMs: 300, showPreviousAnswer: true });
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

test('前問の表示は正解のマス・向きと、自分の正誤を返す', () => {
  const q = { headingIndex: 1, relativeIndex: 2 };
  assert.deepEqual(previousT4Feedback(q, { position: 'NW', heading: 'NE' }),
    { position: 'NW', heading: 'NE', correct: true });
  assert.deepEqual(previousT4Feedback(q, { position: 'SE', heading: 'NE' }),
    { position: 'NW', heading: 'NE', correct: false });
});

test('採点は両方正解だけ、内訳は位置だけ・向きだけ', () => {
  let tally = createT4Tally();
  tally = recordT4Answer(tally, { positionCorrect: true, headingCorrect: true, correct: true });
  tally = recordT4Answer(tally, { positionCorrect: true, headingCorrect: false, correct: false });
  tally = recordT4Answer(tally, { positionCorrect: false, headingCorrect: true, correct: false });
  tally = recordT4Answer(tally, { positionCorrect: false, headingCorrect: false, correct: false });
  assert.deepEqual(summarizeT4(tally), {
    score: 1,
    detail: { answered: 4, correct: 1, positionOnlyCorrect: 1, headingOnlyCorrect: 1 },
  });
});

test('記録はSPEC §4の形で、その回の設定を複製する', () => {
  const date = '2026-09-23T10:15:00.000Z';
  const tally = { correct: 2, answered: 4, positionOnlyCorrect: 1, headingOnlyCorrect: 1 };
  const record = buildT4Record({ date, tally, settings: P });
  assert.deepEqual(record, {
    id: `${date}-t4`, test: 't4', date, score: 2,
    detail: { answered: 4, correct: 2, positionOnlyCorrect: 1, headingOnlyCorrect: 1 },
    settings: { durationSec: 180, answerFeedbackMs: 300, showPreviousAnswer: true },
  });
  assert.notEqual(record.settings, P);
});

test('結果と履歴のT4内訳は4列で、古い記録の正答数は—', () => {
  const fields = findTest('t4').details;
  assert.deepEqual(fields.map(field => field.label), ['回答数', '正答数', '位置だけ正解', '向きだけ正解']);
  assert.equal(formatDetail(fields[1], undefined), '—');
});
