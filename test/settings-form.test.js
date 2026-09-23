import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTestSettings, resetTestOverrides, canPlaceT5Fallback } from '../js/logic/settings-form.js';
import { DEFAULTS } from '../js/core/settings.js';

function raw(testId, changes = {}) {
  return Object.fromEntries(Object.entries({ ...DEFAULTS[testId], ...changes }).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.join(',') : String(value),
  ]));
}

test('正しい入力は数値・数値配列へ変換される', () => {
  const result = validateTestSettings('t2', raw('t2', { durationSec: 60, matchRate: 0.4 }), DEFAULTS.t2);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.value.durationSec, 60);
  assert.equal(result.value.matchRate, 0.4);
});

test('空欄・範囲外・整数欄の小数を理由つきで弾く', () => {
  assert.match(validateTestSettings('t4', raw('t4', { durationSec: '' }), DEFAULTS.t4).errors.durationSec, /入力/);
  assert.match(validateTestSettings('t4', raw('t4', { durationSec: 9 }), DEFAULTS.t4).errors.durationSec, /10/);
  assert.match(validateTestSettings('t4', raw('t4', { durationSec: 10.5 }), DEFAULTS.t4).errors.durationSec, /整数/);
});

test('T1 は最小値が最大値を超える組み合わせを保存しない', () => {
  const result = validateTestSettings('t1', raw('t1', { speedMin: 20, speedMax: 10 }), DEFAULTS.t1);
  assert.equal(result.ok, false);
  assert.match(result.errors.speedMax, /最小/);
});

test('T2 は一致を連続上限内で置けない組み合わせを保存しない', () => {
  const bad = validateTestSettings('t2', raw('t2', { durationSec: 120, intervalMs: 1000, matchRate: 0.9, maxConsecutiveMatches: 1 }), DEFAULTS.t2);
  assert.equal(bad.ok, false);
  assert.match(bad.errors.matchRate, /配置/);
  const edge = validateTestSettings('t2', raw('t2', { durationSec: 120, intervalMs: 1000, matchRate: 0.5, maxConsecutiveMatches: 1 }), DEFAULTS.t2);
  assert.equal(edge.ok, true, JSON.stringify(edge));
});

test('T3 は2桁の個数と誤答差の整数・重複を検証する', () => {
  const tooMany = validateTestSettings('t3', raw('t3', { calcMaxTwoDigitTerms: 5 }), DEFAULTS.t3);
  assert.equal(tooMany.ok, false);
  assert.match(tooMany.errors.calcMaxTwoDigitTerms, /4/);
  const duplicate = validateTestSettings('t3', raw('t3', { calcDistractorOffsets: '1,2,2' }), DEFAULTS.t3);
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.errors.calcDistractorOffsets, /重複/);
});

test('T5 は個数の順序と点の大きさ・最小間隔の組み合わせを検証する', () => {
  const order = validateTestSettings('t5', raw('t5', { minDots: 10, maxDots: 5 }), DEFAULTS.t5);
  assert.equal(order.ok, false);
  assert.match(order.errors.maxDots, /最小/);
  const overlap = validateTestSettings('t5', raw('t5', { dotRadiusRatio: 0.08, dotMinDistanceRatio: 0.1 }), DEFAULTS.t5);
  assert.equal(overlap.ok, false);
  assert.match(overlap.errors.dotMinDistanceRatio, /直径/);
  assert.equal(canPlaceT5Fallback(13, { ...DEFAULTS.t5, dotMinDistanceRatio: 0.12 }), true);
  assert.equal(canPlaceT5Fallback(13, { ...DEFAULTS.t5, dotMinDistanceRatio: 0.6 }), false);
});

test('T6 は速度と小穴の個数・重なり・範囲を検証する', () => {
  const speed = validateTestSettings('t6', raw('t6', { initialSpeed: 2, maxSpeed: 1 }), DEFAULTS.t6);
  assert.match(speed.errors.maxSpeed, /初速/);
  const count = validateTestSettings('t6', raw('t6', { holeSlotCount: 8, holeOpenCount: 9 }), DEFAULTS.t6);
  assert.match(count.errors.holeOpenCount, /候補数/);
  const overlap = validateTestSettings('t6', raw('t6', { holeRingRadius: 0.3, holeRadius: 0.2, holeSlotCount: 8 }), DEFAULTS.t6);
  assert.match(overlap.errors.holeRadius, /重な/);
  const outside = validateTestSettings('t6', raw('t6', { holeRingRadius: 0.9, holeRadius: 0.2 }), DEFAULTS.t6);
  assert.match(outside.errors.holeRadius, /トンネル/);
});

test('テストごとの既定値戻しは対象の上書きだけを除き、元を変えない', () => {
  const saved = { t1: { durationSec: 60 }, t2: { durationSec: 30 } };
  const result = resetTestOverrides(saved, 't1');
  assert.deepEqual(result, { t2: { durationSec: 30 } });
  assert.deepEqual(saved, { t1: { durationSec: 60 }, t2: { durationSec: 30 } });
});

test('T6の操縦円の左右を検証し、それ以外の値は保存しない', () => {
  for (const side of ['left','right']) {
    const result=validateTestSettings('t6',raw('t6',{stickSide:side}),DEFAULTS.t6);
    assert.equal(result.ok,true);
    assert.equal(result.value.stickSide,side);
  }
  assert.equal(validateTestSettings('t6',raw('t6',{stickSide:'center'}),DEFAULTS.t6).ok,false);
});

test('T4の前問表示はtrue/falseを保存し、不正値を拒否する', () => {
  for (const [input, expected] of [['true', true], ['false', false]]) {
    const result = validateTestSettings('t4', raw('t4', { showPreviousAnswer: input }), DEFAULTS.t4);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.value.showPreviousAnswer, expected);
  }
  const bad = validateTestSettings('t4', raw('t4', { showPreviousAnswer: 'maybe' }), DEFAULTS.t4);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.showPreviousAnswer);
});

test('T4の計器の流儀はnorthUp/noseUpだけを保存する', () => {
  for (const mode of ['northUp', 'noseUp']) {
    const result = validateTestSettings('t4', raw('t4', { compassMode: mode }), DEFAULTS.t4);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.value.compassMode, mode);
  }
  const bad = validateTestSettings('t4', raw('t4', { compassMode: 'southUp' }), DEFAULTS.t4);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.compassMode);
});

test('T4の飛行機文字の基準角を設定で変更でき、範囲外を拒否する', () => {
  const good = validateTestSettings('t4', raw('t4', { planeGlyphBaseDeg: 90 }), DEFAULTS.t4);
  assert.equal(good.ok, true, JSON.stringify(good));
  assert.equal(good.value.planeGlyphBaseDeg, 90);
  const bad = validateTestSettings('t4', raw('t4', { planeGlyphBaseDeg: 360 }), DEFAULTS.t4);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.planeGlyphBaseDeg);
});
