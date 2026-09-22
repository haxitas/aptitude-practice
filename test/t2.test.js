import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { DEFAULTS } from '../js/core/settings.js';
import {
  SHAPES, displayCount, matchCount, maxFeasibleMatches, generateSequence,
  createDisplayState, registerPress, createTally, settleDisplay, score, summarizeTally, buildRecord,
} from '../js/logic/t2.js';

const P = DEFAULTS.t2;

function longestMatchRun(seq) {
  let best = 0, run = 0;
  for (const d of seq) { run = d.match ? run + 1 : 0; best = Math.max(best, run); }
  return best;
}

// ---- 採点 ----

test('採点: SPEC の例 36/9/4 → 72', () => {
  assert.equal(score({ hits: 36, misses: 9, falseAlarms: 4 }, P.falseAlarmPenalty), 72);
});

test('採点: 誤押しが多いと 0 で止まる', () => {
  assert.equal(score({ hits: 1, misses: 0, falseAlarms: 60 }, P.falseAlarmPenalty), 0);
});

test('採点: 一致が0回(的中+見逃し=0)なら 0', () => {
  assert.equal(score({ hits: 0, misses: 0, falseAlarms: 0 }, P.falseAlarmPenalty), 0);
});

test('採点: 四捨五入の境目 33.3→33、66.7→67', () => {
  assert.equal(score({ hits: 1, misses: 2, falseAlarms: 0 }, P.falseAlarmPenalty), 33);
  assert.equal(score({ hits: 2, misses: 1, falseAlarms: 0 }, P.falseAlarmPenalty), 67);
});

// ---- 判定 ----

function play(isMatch, pressRts) {
  let ds = createDisplayState();
  for (const rt of pressRts) ds = registerPress(ds, rt).state;
  return settleDisplay(createTally(), isMatch, ds);
}

test('判定: 一致で押す → 的中(反応時間を記録)', () => {
  const t = play(true, [432]);
  assert.deepEqual(t, { hits: 1, misses: 0, falseAlarms: 0, rts: [432] });
});

test('判定: 一致で押さない → 見逃し', () => {
  assert.deepEqual(play(true, []), { hits: 0, misses: 1, falseAlarms: 0, rts: [] });
});

test('判定: 不一致で押す → 誤押し', () => {
  assert.deepEqual(play(false, [300]), { hits: 0, misses: 0, falseAlarms: 1, rts: [] });
});

test('判定: 不一致で押さない → 数えない', () => {
  assert.deepEqual(play(false, []), { hits: 0, misses: 0, falseAlarms: 0, rts: [] });
});

test('判定: 同じ表示の中で2回目に押しても数えない(反応時間は1回目)', () => {
  let ds = createDisplayState();
  const first = registerPress(ds, 400);
  assert.equal(first.accepted, true);
  const second = registerPress(first.state, 700);
  assert.equal(second.accepted, false);
  assert.deepEqual(settleDisplay(createTally(), true, second.state), { hits: 1, misses: 0, falseAlarms: 0, rts: [400] });
  assert.deepEqual(settleDisplay(createTally(), false, second.state), { hits: 0, misses: 0, falseAlarms: 1, rts: [] });
});

test('判定: settleDisplay は元の集計を書き換えない', () => {
  const t0 = createTally();
  settleDisplay(t0, true, registerPress(createDisplayState(), 1).state);
  assert.deepEqual(t0, createTally());
});

test('集計: 平均反応時間は整数ミリ秒、的中0回なら null', () => {
  const a = summarizeTally({ hits: 3, misses: 1, falseAlarms: 0, rts: [400, 401, 403] }, P.falseAlarmPenalty);
  assert.deepEqual(a, { score: 75, detail: { hits: 3, misses: 1, falseAlarms: 0, meanRtMs: 401 } });
  const b = summarizeTally({ hits: 0, misses: 4, falseAlarms: 1, rts: [] }, P.falseAlarmPenalty);
  assert.equal(b.detail.meanRtMs, null);
});

test('記録: SPEC §4 の形で、その回の T2 設定をすべて入れる', () => {
  const date = '2026-09-23T10:15:00.000Z';
  const r = buildRecord({ date, tally: { hits: 36, misses: 9, falseAlarms: 4, rts: [512] }, settings: P });
  assert.deepEqual(r, {
    id: '2026-09-23T10:15:00.000Z-t2', test: 't2', date, score: 72,
    detail: { hits: 36, misses: 9, falseAlarms: 4, meanRtMs: 512 },
    settings: { durationSec: 180, intervalMs: 1000, matchRate: 0.25, maxConsecutiveMatches: 2, falseAlarmPenalty: 2 },
  });
  assert.notEqual(r.settings, P);
});

// ---- 生成 ----

test('既定値: 表示回数 180、一致 45 回', () => {
  assert.equal(displayCount(P), 180);
  assert.equal(matchCount(P), 45);
});

test('表示回数は floor(制限時間 ÷ 間隔)、一致回数は Math.round(N×確率)', () => {
  assert.equal(displayCount({ durationSec: 10, intervalMs: 3000 }), 3);
  assert.equal(matchCount({ durationSec: 10, intervalMs: 1000, matchRate: 0.25 }), 3); // 2.5 → 3
  assert.equal(matchCount({ durationSec: 10, intervalMs: 1000, matchRate: 0.33 }), 3);
});

test('生成(シード200種類): SPEC の条件をすべて満たす', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const seq = generateSequence(P, createRng(seed));
    assert.equal(seq.length, 180, `seed=${seed}`);
    assert.equal(seq.filter(d => d.match).length, 45, `seed=${seed}`);
    assert.ok(longestMatchRun(seq) < 3, `seed=${seed}: 一致が3回以上続いた`);
    for (let i = 0; i < seq.length; i++) {
      const d = seq[i];
      assert.ok(SHAPES.includes(d.left) && SHAPES.includes(d.right), `seed=${seed} i=${i}`);
      assert.equal(d.left === d.right, d.match, `seed=${seed} i=${i}`);
      if (i > 0) {
        const p = seq[i - 1];
        assert.ok(!(p.left === d.left && p.right === d.right), `seed=${seed} i=${i}: 直前と同じ表示`);
      }
    }
  }
});

test('生成: 図形は6種類で、SPEC の △ ★ ○ □ ◇ ☆ に対応する', () => {
  assert.equal(SHAPES.length, 6);
  assert.equal(new Set(SHAPES).size, 6);
});

test('生成: シードが同じなら同じ系列', () => {
  assert.deepEqual(generateSequence(P, createRng(77)), generateSequence(P, createRng(77)));
  assert.notDeepEqual(generateSequence(P, createRng(77)), generateSequence(P, createRng(78)));
});

test('生成: 実現できない設定(確率0.9)はエラーにし、使える確率の上限を示す', () => {
  assert.throws(() => generateSequence({ ...P, matchRate: 0.9 }, createRng(1)), /上限.*0\.667/);
});

test('生成の境界: N=180, k=2 で m=120 は成功、m=121 はエラー', () => {
  const base = { durationSec: 180, intervalMs: 1000, maxConsecutiveMatches: 2 };
  assert.equal(maxFeasibleMatches(180, 2), 120);
  for (let seed = 1; seed <= 20; seed++) {
    const seq = generateSequence({ ...base, matchRate: 120 / 180 }, createRng(seed));
    assert.equal(seq.filter(d => d.match).length, 120);
    assert.ok(longestMatchRun(seq) <= 2);
  }
  assert.throws(() => generateSequence({ ...base, matchRate: 121 / 180 }, createRng(1)), /上限/);
});

test('生成: 連続上限は設定値 k に従う(k=3 なら 3連続まで可、4連続はない)', () => {
  let sawThree = false;
  for (let seed = 1; seed <= 50; seed++) {
    const seq = generateSequence({ ...P, matchRate: 0.6, maxConsecutiveMatches: 3 }, createRng(seed));
    const run = longestMatchRun(seq);
    assert.ok(run <= 3);
    if (run === 3) sawThree = true;
  }
  assert.ok(sawThree);
});

test('生成: 不正な設定(間隔0・負の確率など)はエラー', () => {
  assert.throws(() => generateSequence({ ...P, intervalMs: 0 }, createRng(1)));
  assert.throws(() => generateSequence({ ...P, durationSec: 0 }, createRng(1)));
  assert.throws(() => generateSequence({ ...P, matchRate: -0.1 }, createRng(1)));
  assert.throws(() => generateSequence({ ...P, maxConsecutiveMatches: 1.5 }, createRng(1)));
});

test('生成: 一致0回・一致確率1(k が十分大きい)でも作れる', () => {
  const none = generateSequence({ ...P, matchRate: 0 }, createRng(3));
  assert.equal(none.filter(d => d.match).length, 0);
  // 一致が続く場合も「直前と同じ表示」は出ない
  const all = generateSequence({ durationSec: 10, intervalMs: 1000, matchRate: 1, maxConsecutiveMatches: 10 }, createRng(3));
  assert.equal(all.every(d => d.match), true);
  for (let i = 1; i < all.length; i++) assert.notEqual(all[i].left, all[i - 1].left);
});
