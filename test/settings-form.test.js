import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SETTING_FIELDS, validateTestSettings, resetTestOverrides, canPlaceT5Fallback } from '../js/logic/settings-form.js';
import { DEFAULTS, resolveSettings, T6_COLOR_OPTIONS, T6_COLOR_PRESETS } from '../js/core/settings.js';
import { inputStep } from '../js/logic/settings-form.js';

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

test('T1 の電卓は既定で表示し、設定で非表示にできる', () => {
  assert.equal(DEFAULTS.t1.calculatorDuringTest, true);
  assert.ok(SETTING_FIELDS.t1.some(field => field.key === 'calculatorDuringTest'));
  const hidden = validateTestSettings('t1', raw('t1', { calculatorDuringTest: false }), DEFAULTS.t1);
  assert.equal(hidden.ok, true, JSON.stringify(hidden));
  assert.equal(hidden.value.calculatorDuringTest, false);
});

test('同一図形(t2)は系列を順に作るので、一致確率と連続上限の組み合わせを制限しない。一致の待ち時間を設定できる', () => {
  const high = validateTestSettings('t2', raw('t2', { durationSec: 120, intervalMs: 1000, matchRate: 0.9, maxConsecutiveMatches: 1 }), DEFAULTS.t2);
  assert.equal(high.ok, true, JSON.stringify(high));
  assert.ok(SETTING_FIELDS.t2.some(f => f.key === 'matchWaitMs'));
  assert.equal(SETTING_FIELDS.t2.some(f => f.key === 'falseAlarmPenalty'), false);
  const bad = validateTestSettings('t2', raw('t2', { matchWaitMs: 0 }), DEFAULTS.t2);
  assert.equal(bad.ok, false);
});

test('マルチタスク(t3)は2桁の個数を項数以下にし、右辺の設定と図形の制限時間を持つ', () => {
  const tooMany = validateTestSettings('t3', raw('t3', { calcMaxTwoDigitTerms: 6 }), DEFAULTS.t3);
  assert.equal(tooMany.ok, false);
  assert.match(tooMany.errors.calcMaxTwoDigitTerms, /5/);
  const keys = SETTING_FIELDS.t3.map(f => f.key);
  assert.equal(keys.includes('calcDistractorOffsets'), false);
  for (const key of ['calcShowCorrectRate', 'calcWrongOffsetMax', 'shapeLimitMs']) assert.ok(keys.includes(key), key);
  assert.equal(validateTestSettings('t3', raw('t3', { calcWrongOffsetMax: 0 }), DEFAULTS.t3).ok, false);
});

test('T5 は個数の順序と点の大きさ・最小間隔の組み合わせを検証する', () => {
  assert.equal(DEFAULTS.t5.questionLimitSec, 0);
  assert.equal(validateTestSettings('t5', raw('t5', { questionLimitSec: 0 }), DEFAULTS.t5).ok, true);
  const order = validateTestSettings('t5', raw('t5', { minDots: 10, maxDots: 5 }), DEFAULTS.t5);
  assert.equal(order.ok, false);
  assert.match(order.errors.maxDots, /最小/);
  // 2026-09-30 本番に合わせて変更: 点どうしは少し重なってよい(最小間隔は点の直径より小さくてよい)。半径より小さいのは不可
  assert.equal(validateTestSettings('t5', raw('t5', {}), DEFAULTS.t5).ok, true);
  const slightOverlap = validateTestSettings('t5', raw('t5', { dotRadiusRatio: 0.045, dotMinDistanceRatio: 0.07 }), DEFAULTS.t5);
  assert.equal(slightOverlap.ok, true);
  const overlap = validateTestSettings('t5', raw('t5', { dotRadiusRatio: 0.08, dotMinDistanceRatio: 0.05 }), DEFAULTS.t5);
  assert.equal(overlap.ok, false);
  assert.match(overlap.errors.dotMinDistanceRatio, /半径/);
  assert.equal(canPlaceT5Fallback(14, { ...DEFAULTS.t5 }), true);
  assert.equal(canPlaceT5Fallback(14, { ...DEFAULTS.t5, dotMinDistanceRatio: 0.6 }), false);
  const keys = SETTING_FIELDS.t5.map(f => f.key);
  assert.ok(keys.includes('fieldScale'));
  assert.equal(validateTestSettings('t5', raw('t5', { fieldScale: 1.5 }), DEFAULTS.t5).ok, false);
});

test('T6 は速度と小穴の個数・重なり・範囲を検証する', () => {
  const speed = validateTestSettings('t6', raw('t6', { initialSpeed: 2, maxSpeed: 1 }), DEFAULTS.t6);
  assert.match(speed.errors.maxSpeed, /初速/);
  const count = validateTestSettings('t6', raw('t6', { holeOpenCounts: '1,2,4' }), DEFAULTS.t6);
  assert.match(count.errors.holeOpenCounts, /1〜3|範囲/);
  const overlap = validateTestSettings('t6', raw('t6', { holeRingRadius: 0.3, holeRadius: 0.25 }), DEFAULTS.t6);
  assert.match(overlap.errors.holeRadius, /重な/);
  const outside = validateTestSettings('t6', raw('t6', { holeRingRadius: 0.8, holeRadius: 0.25 }), DEFAULTS.t6);
  assert.match(outside.errors.holeRadius, /トンネル/);
  assert.match(validateTestSettings('t6', raw('t6', { holeThreeRadius: 0.44 }), DEFAULTS.t6).errors.holeThreeRadius, /トンネル/);
  assert.equal(validateTestSettings('t6', raw('t6', {}), DEFAULTS.t6).ok, true, '既定値(小穴の半径0.38・巻き戻し2)は保存できる');
});

test('T6: 中心の安全円と回転する長方形の幅を設定でき、使わなくなった設定は無い(2026-09-30 本番に合わせて変更)', () => {
  const fields = SETTING_FIELDS.t6.map(field => field.key);
  for (const key of ['centerOpenRadius', 'barWidth']) assert.ok(fields.includes(key), key);
  for (const key of ['bladeHubRadius', 'tunnelRingSpacing']) {
    assert.equal(fields.includes(key), false, key);
    assert.equal(key in DEFAULTS.t6, false, key);
  }
  assert.equal(validateTestSettings('t6', raw('t6', { barWidth: 2.5 }), DEFAULTS.t6).ok, false);
  assert.equal(validateTestSettings('t6', raw('t6', { centerOpenRadius: 1.5 }), DEFAULTS.t6).ok, false);
});

test('T6の小穴は4方位固定で、開口数候補と回転確率を検証する', () => {
  const fields = SETTING_FIELDS.t6.map(field => field.key);
  assert.ok(fields.includes('holeOpenCounts'));
  assert.ok(fields.includes('holeRotationRate'));
  const valid = validateTestSettings('t6', raw('t6', { holeOpenCounts: '1,3', holeRotationRate: 0.25 }), DEFAULTS.t6);
  assert.equal(valid.ok, true, JSON.stringify(valid));
  assert.deepEqual(valid.value.holeOpenCounts, [1, 3]);
  for (const bad of ['1,1', '0,2', '2,4', '1.5,2']) {
    assert.equal(validateTestSettings('t6', raw('t6', { holeOpenCounts: bad }), DEFAULTS.t6).ok, false);
  }
  assert.equal(validateTestSettings('t6', raw('t6', { holeRotationRate: 1.1 }), DEFAULTS.t6).ok, false);
  assert.equal(validateTestSettings('t6', raw('t6', { holeSlotCount: 8 }), DEFAULTS.t6).ok, false);
  const legacy = resolveSettings({ t6: { holeSlotCount: 8, holeOpenCount: 3 } });
  assert.equal(legacy.settings.t6.holeSlotCount, 4);
  // 3つ空きだけ使う120°ずつの配置も固定(保存値で変えられない。2026-10-01 追加)
  const three = resolveSettings({ t6: { holeThreeSlotCount: 4 } });
  assert.equal(three.settings.t6.holeThreeSlotCount, 3);
  assert.ok(three.warnings.includes('t6.holeThreeSlotCount'));
  assert.deepEqual(legacy.settings.t6.holeOpenCounts, [1, 2, 3]);
  assert.deepEqual(resolveSettings({}).warnings, []);
});

test('T6の羽根の開口数は1つ・2つ・3つの確率で持ち、合計が0なら保存しない(2026-09-30 ユーザーの実機の感想で変更)', () => {
  const keys = SETTING_FIELDS.t6.map(item => item.key);
  for (const key of ['bladeOpen1Rate', 'bladeOpen2Rate', 'bladeOpen3Rate']) assert.ok(keys.includes(key), key);
  assert.equal(keys.includes('bladeOpeningCounts'), false);
  assert.equal(validateTestSettings('t6', raw('t6', { bladeOpen1Rate: 0.5, bladeOpen2Rate: 0.5, bladeOpen3Rate: 0 }), DEFAULTS.t6).ok, true);
  const zero = validateTestSettings('t6', raw('t6', { bladeOpen1Rate: 0, bladeOpen2Rate: 0, bladeOpen3Rate: 0 }), DEFAULTS.t6);
  assert.equal(zero.ok, false);
  assert.ok(zero.errors.bladeOpen3Rate);
});

test('T6の最高速度は20まで、当たり判定の半径と回復の上限を設定できる', () => {
  assert.equal(validateTestSettings('t6', raw('t6', { maxSpeed: 20 }), DEFAULTS.t6).ok, true);
  assert.equal(validateTestSettings('t6', raw('t6', { maxSpeed: 20.5 }), DEFAULTS.t6).ok, false);
  const keys = SETTING_FIELDS.t6.map(item => item.key);
  for (const key of ['hitRadius', 'recoveryCapSpeed', 'perspectiveFocal']) assert.ok(keys.includes(key), key);
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

test('T6の障害物色と縁色は各4種類だけ保存し、おすすめ3組は有効', () => {
  assert.equal(T6_COLOR_OPTIONS.obstacle.length, 4);
  assert.equal(T6_COLOR_OPTIONS.edge.length, 4);
  assert.equal(T6_COLOR_PRESETS.length, 3);
  assert.ok(SETTING_FIELDS.t6.some(field => field.key === 'obstacleColor'));
  assert.ok(SETTING_FIELDS.t6.some(field => field.key === 'obstacleEdgeColor'));
  for (const preset of T6_COLOR_PRESETS) {
    const result = validateTestSettings('t6', raw('t6', preset), DEFAULTS.t6);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.value.obstacleColor, preset.obstacleColor);
    assert.equal(result.value.obstacleEdgeColor, preset.obstacleEdgeColor);
  }
  for (const change of [{ obstacleColor: 'unknown' }, { obstacleEdgeColor: 'unknown' }]) {
    const result = validateTestSettings('t6', raw('t6', change), DEFAULTS.t6);
    assert.equal(result.ok, false);
    assert.ok(result.errors[Object.keys(change)[0]]);
  }
  const legacy = resolveSettings({ t6: { obstacleColor: 'unknown', obstacleEdgeColor: 'unknown' } });
  assert.equal(legacy.settings.t6.obstacleColor, DEFAULTS.t6.obstacleColor);
  assert.equal(legacy.settings.t6.obstacleEdgeColor, DEFAULTS.t6.obstacleEdgeColor);
  assert.ok(legacy.warnings.includes('t6.obstacleColor'));
});

test('T4の計器の流儀(compassMode)・基準角・前問表示は設定項目にも保存値にも入らない(2026-09-30 compassMode 廃止)', () => {
  const fields = SETTING_FIELDS.t4.map(field => field.key);
  assert.deepEqual(fields, ['durationSec', 'headingDirections']);
  const result = validateTestSettings('t4', raw('t4', { compassMode: 'northUp', planeGlyphBaseDeg: 90, showPreviousAnswer: 'true' }), DEFAULTS.t4);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.value, { durationSec: DEFAULTS.t4.durationSec, headingDirections: 4 });
  // 以前に保存した compassMode は読み込みで無視する(警告も出さない)
  const legacy = resolveSettings({ t4: { compassMode: 'northUp', durationSec: 120 } });
  assert.deepEqual(legacy.settings.t4, { durationSec: 120, answerFeedbackMs: 300, headingDirections: 4 });
  assert.deepEqual(legacy.warnings, []);
});

test('T4の機首の向きの数は4か8だけ保存する(2026-09-30 本番の記憶で追加)', () => {
  assert.equal(validateTestSettings('t4', raw('t4', { headingDirections: '8' }), DEFAULTS.t4).value.headingDirections, 8);
  assert.equal(validateTestSettings('t4', raw('t4', { headingDirections: '4' }), DEFAULTS.t4).value.headingDirections, 4);
  assert.equal(validateTestSettings('t4', raw('t4', { headingDirections: '6' }), DEFAULTS.t4).ok, false);
});

// ---- 共通の設定と入力の刻み(2026-09-30 本番に合わせて変更) ----

test('共通の設定は判定の表示時間だけ(即時判定の項目は無い)', () => {
  assert.deepEqual(SETTING_FIELDS.common.map(f => f.key), ['feedbackMs']);
  const ok = validateTestSettings('common', { feedbackMs: '1200' }, {});
  assert.deepEqual(ok, { ok: true, value: { feedbackMs: 1200 }, errors: {} });
  assert.equal(validateTestSettings('common', { feedbackMs: '0' }, {}).ok, false);
});

test('ミリ秒の設定(〜Ms)は入力の刻みが50。50の倍数でない値も保存できる', () => {
  const msFields = Object.values(SETTING_FIELDS).flat().filter(f => f.type === 'number' && /Ms$/.test(f.key));
  assert.ok(msFields.length >= 5, msFields.map(f => f.key).join(','));
  for (const f of msFields) assert.equal(inputStep(f), '50', f.key);
  assert.equal(inputStep({ key: 'durationSec', type: 'number', integer: true }), '1');
  assert.equal(inputStep({ key: 'matchRate', type: 'number', step: 0.01 }), '0.01');
  assert.equal(inputStep({ key: 'x', type: 'number' }), 'any');
  const saved = validateTestSettings('common', { feedbackMs: '1234' }, {});
  assert.equal(saved.ok, true);
  assert.equal(saved.value.feedbackMs, 1234);
});
