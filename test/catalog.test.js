import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TESTS, findTest } from '../js/core/catalog.js';

test('表示の番号と並び順は本番の順(2026-09-30 本番の順に合わせて変更)', () => {
  assert.deepEqual(TESTS.map(t => t.id), ['t1', 't3', 't2', 't5', 't4', 't6']);
  assert.deepEqual(TESTS.map(t => t.number), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(TESTS.map(t => t.name), [
    'テスト1 計算', 'テスト2 マルチタスク', 'テスト3 同一図形の検出',
    'テスト4 点の数', 'テスト5 計器の読み取り', 'テスト6 トンネル飛行',
  ]);
});

test('内部の id はそのまま使い、番号だけが変わる', () => {
  assert.equal(findTest('t2').name, 'テスト3 同一図形の検出');
  assert.equal(findTest('t3').name, 'テスト2 マルチタスク');
  assert.equal(findTest('t4').number, 5);
  assert.equal(findTest('t5').number, 4);
  assert.equal(findTest('t9'), null);
});
