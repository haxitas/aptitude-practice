import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { DEFAULTS } from '../js/core/settings.js';
import {
  DIRECTIONS, solutionFor, generateT4Problem,
  createT4Example,
  createT4Selection, selectT4Position, selectT4Heading, canSubmitT4,
  judgeT4, createT4Tally, recordT4Answer, summarizeT4, buildT4Record,
  previousT4Feedback, compassNeedleAngle, explainT4Solution,
} from '../js/logic/t4.js';
import { findTest, formatDetail } from '../js/core/catalog.js';
import { instrumentSvg } from '../js/tests/t4.js';

const P = DEFAULTS.t4;

test('例題は流儀にかかわらず機首NE・ADF右90度・自機NW/NE', () => {
  const nose = createT4Example('noseUp');
  const north = createT4Example('northUp');
  assert.deepEqual(north.problem, { headingIndex: 1, relativeIndex: 2 });
  assert.deepEqual(north.selection, { position: 'NW', heading: 'NE' });
  assert.deepEqual(nose, north);
  assert.deepEqual(createT4Example(), north);
  for (const example of [nose, north]) assert.equal(judgeT4(example.problem, example.selection).correct, true);
});

test('流儀ごとの針角度は8方位で逆向きになり、不正入力を拒否する', () => {
  for (let i = 0; i < 8; i++) {
    const north = compassNeedleAngle(i, 'northUp');
    const nose = compassNeedleAngle(i, 'noseUp');
    assert.equal(north, i * 45);
    assert.equal(nose, (360 - i * 45) % 360);
    assert.ok(north + nose === 0 || north + nose === 360);
  }
  for (const [index, north, nose] of [[0, 0, 0], [1, 45, 315], [2, 90, 270], [5, 225, 135]]) {
    assert.equal(compassNeedleAngle(index, 'northUp'), north);
    assert.equal(compassNeedleAngle(index, 'noseUp'), nose);
  }
  assert.throws(() => compassNeedleAngle(-1, 'northUp'));
  assert.throws(() => compassNeedleAngle(1, 'other'));
});

test('左の計器は流儀ごとに文字・機首印・針先を変え、ADFは変えない', () => {
  const north = instrumentSvg(1, false, 'northUp');
  assert.match(north, /rotate\(45 100 100\)/);
  assert.match(north, />NE<\/text>/);
  assert.match(north, /class="t4-aircraft"/);
  assert.doesNotMatch(north, /class="t4-nose"/);
  const nose = instrumentSvg(1, false, 'noseUp');
  assert.match(nose, /rotate\(315 100 100\)/);
  assert.match(nose, /class="t4-nose"/);
  assert.match(nose, /class="t4-north-label"/);
  assert.doesNotMatch(nose, />NE<\/text>/);
  const adf = instrumentSvg(2, true);
  assert.match(adf, /rotate\(90 100 100\)/);
  for (const mark of ['右90°', '後ろ180°', '左270°']) assert.ok(adf.includes(mark));
});

test('導き方は流儀ごとに機首の読み方を変え、塔と自機の正解は共通', () => {
  const nose = explainT4Solution({ headingIndex: 1, relativeIndex: 2 }, 'noseUp');
  assert.equal(nose.length, 3);
  assert.match(nose[0], /機首が上.*針は北.*左上.*左45°.*機首はNE/);
  assert.match(nose[1], /ADFの針が右\(相対90°\).*塔は NE\+90° = SE/);
  assert.match(nose[2], /NWのマス.*NE/);
  const north = explainT4Solution({ headingIndex: 1, relativeIndex: 2 }, 'northUp');
  assert.match(north[0], /コンパスの針の先が機首.*NE/);
  assert.match(north[1], /ADFの針が右\(相対90°\).*塔は NE\+90° = SE/);
  assert.match(north[2], /NWのマス.*NE/);
});

test('T4 の既定値は承認済みの数値', () => {
  assert.deepEqual(P, { durationSec: 180, answerFeedbackMs: 300, showPreviousAnswer: true, compassMode: 'noseUp' });
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
    settings: { durationSec: 180, answerFeedbackMs: 300, showPreviousAnswer: true, compassMode: 'noseUp' },
  });
  assert.notEqual(record.settings, P);
});

test('結果と履歴のT4内訳は4列で、古い記録の正答数は—', () => {
  const fields = findTest('t4').details;
  assert.deepEqual(fields.map(field => field.label), ['回答数', '正答数', '位置だけ正解', '向きだけ正解']);
  assert.equal(formatDetail(fields[1], undefined), '—');
});
