import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, randInt, pick, shuffle } from '../js/core/rng.js';

test('シードが同じなら同じ列になる', () => {
  const a = createRng(12345);
  const b = createRng(12345);
  for (let i = 0; i < 1000; i++) assert.equal(a(), b());
});

test('シードが違えば列が変わる', () => {
  const a = createRng(1);
  const b = createRng(2);
  const sa = Array.from({ length: 10 }, () => a());
  const sb = Array.from({ length: 10 }, () => b());
  assert.notDeepEqual(sa, sb);
});

test('値が [0,1) に収まる', () => {
  for (const seed of [0, 1, 42, 0xffffffff, 2 ** 31]) {
    const r = createRng(seed);
    for (let i = 0; i < 10000; i++) {
      const v = r();
      assert.ok(v >= 0 && v < 1, `seed=${seed} v=${v}`);
    }
  }
});

test('randInt は両端を含む範囲に収まり、両端とも出る', () => {
  const r = createRng(7);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const v = randInt(r, 3, 6);
    assert.ok(Number.isInteger(v) && v >= 3 && v <= 6, `v=${v}`);
    seen.add(v);
  }
  assert.deepEqual([...seen].sort(), [3, 4, 5, 6]);
});

test('pick は配列の要素を返す', () => {
  const r = createRng(9);
  const arr = ['a', 'b', 'c'];
  for (let i = 0; i < 100; i++) assert.ok(arr.includes(pick(r, arr)));
});

test('shuffle は元の配列を変えず、並べ替えた新しい配列を返す', () => {
  const r = createRng(11);
  const arr = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(r, arr);
  assert.deepEqual(arr, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.notEqual(out, arr);
  assert.deepEqual([...out].sort((x, y) => x - y), arr);
});
