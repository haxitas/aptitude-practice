import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTimer } from '../js/core/timer.js';

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
