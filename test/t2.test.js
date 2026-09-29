// テスト3 同一図形(内部 t2)。2026-09-30 本番に合わせて変更:
// 一致の表示は押すまで止まり(最大 matchWaitMs)、押せなければやり直し。点数 = 的中 − 誤押し。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { DEFAULTS } from '../js/core/settings.js';
import {
  SHAPES, createSequenceState, nextT2Display, validateT2Params,
  createT2Run, pressT2, tickT2, scoreT2, summarizeT2, buildRecord, t2PressFeedback,
} from '../js/logic/t2.js';

const P = DEFAULTS.t2;

// ---- 既定値と図形 ----

test('既定値: 2分・不一致は1000msで切り替え・一致25%・連続3回まで・一致は5秒待つ', () => {
  assert.deepEqual(P, {
    durationSec: 120, intervalMs: 1000, matchRate: 0.25, maxConsecutiveMatches: 3,
    matchWaitMs: 5000, pressFeedbackMs: 300, stallAbortMs: 1000,
  });
});

test('図形は △ ★ ○ □ ◇ 太い十字 の6種類で、中が抜けた星は出さない', () => {
  assert.deepEqual([...SHAPES], ['triangle', 'starFilled', 'circle', 'square', 'diamond', 'thickCross']);
  assert.equal(SHAPES.includes('starOutline'), false);
});

// ---- 系列(必要な分だけ順に作る) ----

function makeSequence(seed, count, p = P) {
  const rng = createRng(seed);
  let state = createSequenceState();
  const out = [];
  for (let i = 0; i < count; i++) {
    const r = nextT2Display(state, rng, p);
    state = r.state;
    out.push(r.display);
  }
  return out;
}

function longestMatchRun(seq) {
  let best = 0, run = 0;
  for (const d of seq) { run = d.match ? run + 1 : 0; best = Math.max(best, run); }
  return best;
}

test('系列(シード200種類): 一致は左右が同じ、不一致は違う、直前とまったく同じ表示は出ない、連続は3回まで', () => {
  let sawThree = false;
  for (let seed = 1; seed <= 200; seed++) {
    const seq = makeSequence(seed, 300);
    for (let i = 0; i < seq.length; i++) {
      const d = seq[i];
      assert.ok(SHAPES.includes(d.left) && SHAPES.includes(d.right));
      assert.equal(d.left === d.right, d.match, `seed=${seed} i=${i}`);
      if (i > 0) assert.ok(!(d.left === seq[i - 1].left && d.right === seq[i - 1].right), `seed=${seed} i=${i}`);
    }
    const run = longestMatchRun(seq);
    assert.ok(run <= 3, `seed=${seed}: ${run}回続いた`);
    if (run === 3) sawThree = true;
  }
  assert.ok(sawThree, '一致が3回続くこともある');
});

test('系列: 一致の割合は約25%(連続上限の分だけわずかに下がる)', () => {
  const seq = makeSequence(7, 40000);
  const rate = seq.filter(d => d.match).length / seq.length;
  assert.ok(rate > 0.23 && rate < 0.26, `rate=${rate}`);
});

test('系列: 太い十字も出る。シードが同じなら同じ系列', () => {
  const seq = makeSequence(3, 2000);
  assert.ok(seq.some(d => d.left === 'thickCross' || d.right === 'thickCross'));
  assert.deepEqual(makeSequence(11, 50), makeSequence(11, 50));
});

test('設定の検証: 間隔・待ち時間・確率・連続上限が不正ならエラー', () => {
  assert.doesNotThrow(() => validateT2Params(P));
  assert.throws(() => validateT2Params({ ...P, intervalMs: 0 }));
  assert.throws(() => validateT2Params({ ...P, matchWaitMs: 0 }));
  assert.throws(() => validateT2Params({ ...P, matchRate: 1.2 }));
  assert.throws(() => validateT2Params({ ...P, maxConsecutiveMatches: 1.5 }));
});

// ---- 進行: 一致は押すまで待ち、5秒でやり直し ----

// 最初の表示を一致・不一致に固定して始める(rng を小さな値・大きな値に固定)
const low = () => 0.01; // 一致を選ぶ
const high = () => 0.99; // 不一致を選ぶ

test('一致の表示: 押されるまで止まり、押したら反応時間を記録して次へ進む', () => {
  let run = createT2Run(P, low, 1000);
  assert.equal(run.display.match, true);
  const t = tickT2(run, 1000 + P.intervalMs * 3, P, high);
  assert.equal(t.event, null, '1000ms を過ぎても切り替わらない');
  assert.equal(t.state.display, run.display);
  const r = pressT2(t.state, 1000 + 3412, P, high);
  assert.equal(r.result, 'hit');
  assert.equal(r.rtMs, 3412);
  assert.deepEqual(r.state.tally, { hits: 1, falseAlarms: 0, rts: [3412] });
  assert.equal(r.state.display.match, false, '押したらすぐ次の表示');
  assert.equal(r.state.shownAt, 1000 + 3412);
});

test('一致の表示: matchWaitMs(5秒)たっても押されなければやり直し', () => {
  const run = createT2Run(P, low, 1000);
  assert.equal(tickT2(run, 1000 + P.matchWaitMs - 1, P, high).event, null);
  assert.equal(tickT2(run, 1000 + P.matchWaitMs, P, high).event, 'restart');
});

test('不一致の表示: intervalMs ごとに切り替わり、押したら誤押し(1回の表示で1回まで)', () => {
  let run = createT2Run(P, high, 0);
  assert.equal(run.display.match, false);
  const p1 = pressT2(run, 300, P, high);
  assert.equal(p1.result, 'falseAlarm');
  const p2 = pressT2(p1.state, 400, P, high);
  assert.equal(p2.result, 'ignored');
  assert.deepEqual(p2.state.tally, { hits: 0, falseAlarms: 1, rts: [] });
  assert.equal(tickT2(p2.state, 999, P, high).event, null);
  const t = tickT2(p2.state, 1000, P, high);
  assert.equal(t.event, 'advanced');
  assert.equal(t.state.shownAt, 1000, '予定の時刻から次を数える(ずれをためない)');
  assert.equal(t.state.pressed, false);
});

test('不一致の表示は押さなければ何も数えない。見逃しは起きない', () => {
  let run = createT2Run(P, high, 0);
  run = tickT2(run, 1000, P, high).state;
  assert.deepEqual(run.tally, { hits: 0, falseAlarms: 0, rts: [] });
});

test('進行は元の状態を書き換えない', () => {
  const run = createT2Run(P, low, 0);
  const before = structuredClone(run);
  pressT2(run, 500, P, high);
  tickT2(run, 9999, P, high);
  assert.deepEqual(run, before);
});

// ---- 採点と記録 ----

test('採点: 点数 = 的中 − 誤押し(0未満は0)', () => {
  assert.equal(scoreT2({ hits: 30, falseAlarms: 4 }), 26);
  assert.equal(scoreT2({ hits: 2, falseAlarms: 5 }), 0);
  assert.equal(scoreT2({ hits: 0, falseAlarms: 0 }), 0);
});

test('内訳: 的中・誤押し・平均反応時間・最速・最遅(的中0回なら null)', () => {
  assert.deepEqual(summarizeT2({ hits: 3, falseAlarms: 1, rts: [400, 401, 520] }), {
    score: 2, detail: { hits: 3, falseAlarms: 1, meanRtMs: 440, minRtMs: 400, maxRtMs: 520 },
  });
  assert.deepEqual(summarizeT2({ hits: 0, falseAlarms: 2, rts: [] }).detail,
    { hits: 0, falseAlarms: 2, meanRtMs: null, minRtMs: null, maxRtMs: null });
});

test('記録: その回の設定をすべて入れる', () => {
  const date = '2026-09-30T10:15:00.000Z';
  const r = buildRecord({ date, tally: { hits: 3, falseAlarms: 1, rts: [400, 401, 520] }, settings: P });
  assert.equal(r.id, `${date}-t2`);
  assert.equal(r.test, 't2');
  assert.equal(r.score, 2);
  assert.deepEqual(r.settings, { ...P });
  assert.notEqual(r.settings, P);
});

// ---- 即時判定 ----

test('即時判定: 一致で押せば「○ 正解(◯ms)」、不一致で押せば「× 一致していません」', () => {
  assert.deepEqual(t2PressFeedback(true, 412), { kind: 'correct', text: '○ 正解(412ms)' });
  assert.deepEqual(t2PressFeedback(false), { kind: 'wrong', text: '× 一致していません' });
});
