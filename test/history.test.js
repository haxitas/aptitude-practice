import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeScoreTicks,
  makeChartLayout,
  recordUsesCustomSettings,
  makeHistoryModel,
} from '../js/logic/history.js';

const BOX = Object.freeze({ left: 48, right: 16, top: 16, bottom: 36, preferredTickCount: 5 });

function rec(i, score, settings = { durationSec: 120 }, testId = 't2') {
  const date = new Date(Date.UTC(2026, 8, 23, 0, i)).toISOString();
  return { id: `${date}-${testId}`, test: testId, date, score, detail: {}, settings };
}

test('点数の目盛り: 空・0点・同点でも有限で0から上へ広がる', () => {
  for (const scores of [[], [0], [0, 0, 0], [7], [7, 7, 7]]) {
    const ticks = makeScoreTicks(scores, BOX.preferredTickCount);
    assert.equal(ticks.min, 0);
    assert.ok(Number.isFinite(ticks.max));
    assert.ok(Number.isFinite(ticks.step));
    assert.ok(ticks.max > ticks.min);
    assert.ok(ticks.step > 0);
    assert.equal(ticks.values[0], 0);
    assert.ok(ticks.values.every(Number.isFinite));
  }
});

test('座標: 0件は空、1件は横中央、0点は描画領域の下端', () => {
  const empty = makeChartLayout([], 640, 260, BOX);
  assert.deepEqual(empty.points, []);
  assert.ok(Number.isFinite(empty.yMax));

  const one = makeChartLayout([rec(0, 0)], 640, 260, BOX);
  assert.equal(one.points.length, 1);
  assert.equal(one.points[0].x, (BOX.left + (640 - BOX.right)) / 2);
  assert.equal(one.points[0].y, 260 - BOX.bottom);
  assert.ok(Number.isFinite(one.points[0].x));
  assert.ok(Number.isFinite(one.points[0].y));
});

test('座標: 同じ点数ばかりでも有限で、日時の古い順に左から並ぶ', () => {
  const input = [rec(2, 5), rec(0, 5), rec(1, 5)];
  const layout = makeChartLayout(input, 640, 260, BOX);
  assert.deepEqual(layout.points.map(p => p.record.id), [rec(0, 5).id, rec(1, 5).id, rec(2, 5).id]);
  assert.ok(layout.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.ok(layout.points[0].x < layout.points[1].x);
  assert.ok(layout.points[1].x < layout.points[2].x);
});

test('設定差分: 同値は印なし、値・配列・キー不足は印あり、余分なキーは無視', () => {
  const defaults = { durationSec: 120, offsets: [1, 2, 10] };
  assert.equal(recordUsesCustomSettings({ durationSec: 120, offsets: [1, 2, 10] }, defaults), false);
  assert.equal(recordUsesCustomSettings({ durationSec: 180, offsets: [1, 2, 10] }, defaults), true);
  assert.equal(recordUsesCustomSettings({ durationSec: 120, offsets: [1, 2] }, defaults), true);
  assert.equal(recordUsesCustomSettings({ durationSec: 120 }, defaults), true);
  assert.equal(recordUsesCustomSettings({ durationSec: 120, offsets: [1, 2, 10], oldKey: 9 }, defaults), false);
});

test('現在120秒の既定値に対し、古い180秒のテスト2記録には印が付く', () => {
  assert.equal(recordUsesCustomSettings({ durationSec: 180 }, { durationSec: 120 }), true);
});

test('履歴モデルは対象テストの直近20件を選び、グラフだけ古い順にする', () => {
  const records = Array.from({ length: 25 }, (_, i) => rec(i, i));
  records.push(rec(30, 99, {}, 't1'));
  const model = makeHistoryModel(records, 't2', { durationSec: 120 }, 20);
  assert.equal(model.tableRecords.length, 20);
  assert.equal(model.tableRecords[0].score, 24);
  assert.equal(model.tableRecords.at(-1).score, 5);
  assert.equal(model.chartRecords[0].score, 5);
  assert.equal(model.chartRecords.at(-1).score, 24);
});
