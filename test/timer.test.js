import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTimer, formatDuration } from '../js/core/timer.js';

test('開始画面の制限時間は分・秒で表記する', () => {
  assert.equal(formatDuration(240), '4分');
  assert.equal(formatDuration(180), '3分');
  assert.equal(formatDuration(120), '2分');
  assert.equal(formatDuration(90), '1分30秒');
  assert.equal(formatDuration(45), '45秒');
  for (const value of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => formatDuration(value));
});

test('開始時刻を指定したタイマーは最初の描画でなくタップ時点から数える', t => {
  let frame, ends = 0;
  const elapsed = [];
  const oldRaf = globalThis.requestAnimationFrame, oldCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = callback => { frame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  t.after(() => { globalThis.requestAnimationFrame = oldRaf; globalThis.cancelAnimationFrame = oldCancel; });
  startTimer({ durationMs: 1000, startAt: 3000, onFrame: ms => elapsed.push(ms), onEnd: () => ends++ });
  frame(3250);
  assert.deepEqual(elapsed, [250]);
  frame(3999);
  assert.equal(ends, 0);
  frame(4000);
  assert.equal(ends, 1);
  frame(5000);
  assert.equal(ends, 1);
});
