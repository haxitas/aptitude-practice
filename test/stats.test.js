import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, recentRecords } from '../js/core/stats.js';

// 日時は分単位で並ぶように作る(i が大きいほど新しい)
function rec(i, score, test = 't2') {
  const date = new Date(Date.UTC(2026, 8, 23, 0, i)).toISOString();
  return { id: `${date}-${test}`, test, date, score, detail: {}, settings: {} };
}

test('0件: 回数0、最高・前回・平均は null', () => {
  assert.deepEqual(summarize([], 't2'), { count: 0, best: null, last: null, recentAvg: null });
});

test('他のテストの記録は数えない', () => {
  const s = summarize([rec(0, 50, 't1'), rec(1, 60, 't3')], 't2');
  assert.equal(s.count, 0);
  assert.equal(s.best, null);
});

test('1件: その値が最高・前回・平均になる', () => {
  assert.deepEqual(summarize([rec(0, 72)], 't2'), { count: 1, best: 72, last: 72, recentAvg: 72 });
});

test('5件未満: ある分だけで平均し、小数1桁に丸める', () => {
  // (10 + 20 + 22) / 3 = 17.333.. → 17.3
  const s = summarize([rec(0, 10), rec(1, 20), rec(2, 22)], 't2');
  assert.equal(s.count, 3);
  assert.equal(s.recentAvg, 17.3);
  assert.equal(s.last, 22);
});

test('6件以上: 平均は直近5回だけ、回数と最高点は全記録から', () => {
  const recs = [rec(0, 100), rec(1, 10), rec(2, 20), rec(3, 30), rec(4, 40), rec(5, 51)];
  const s = summarize(recs, 't2');
  assert.equal(s.count, 6);
  assert.equal(s.recentAvg, 30.2); // (10+20+30+40+51)/5
  assert.equal(s.best, 100); // 最高点は一番古い記録にある
  assert.equal(s.last, 51);
});

test('配列の順ではなく日時で新旧を決める', () => {
  const s = summarize([rec(5, 99), rec(1, 10)], 't2');
  assert.equal(s.last, 99);
});

test('recentRecords: 新しい順に最大 n 件', () => {
  const recs = Array.from({ length: 25 }, (_, i) => rec(i, i));
  recs.push(rec(30, 0, 't1'));
  const out = recentRecords(recs, 't2', 20);
  assert.equal(out.length, 20);
  assert.deepEqual(out.map(r => r.score), Array.from({ length: 20 }, (_, i) => 24 - i));
});
