import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, resolveSettings } from '../js/core/settings.js';
import {
  correctFeedback, wrongFeedback, missFeedback, feedbackExpired, recordSettingsWithFeedback,
} from '../js/core/feedback.js';

test('共通設定の既定値: 即時判定はオフ、表示時間は1200ms', () => {
  assert.deepEqual(DEFAULTS.common, { instantFeedback: false, feedbackMs: 1200 });
});

test('共通設定は保存値と合成され、型が合わなければ既定値に戻る', () => {
  assert.equal(resolveSettings({ common: { instantFeedback: true } }).settings.common.instantFeedback, true);
  const bad = resolveSettings({ common: { instantFeedback: 'true', feedbackMs: 800 } });
  assert.equal(bad.settings.common.instantFeedback, false);
  assert.equal(bad.settings.common.feedbackMs, 800);
  assert.deepEqual(bad.warnings, ['common.instantFeedback']);
});

test('判定の文言: 正解・不正解・見逃しは記号つき', () => {
  assert.deepEqual(correctFeedback(), { kind: 'correct', text: '○ 正解' });
  assert.deepEqual(wrongFeedback('36分'), { kind: 'wrong', text: '× 正解は 36分' });
  assert.deepEqual(missFeedback(), { kind: 'miss', text: '△ 見逃し' });
});

test('判定の表示時間: feedbackMs で消え、固定表示は消えない', () => {
  assert.equal(feedbackExpired(1000, 2199, 1200), false);
  assert.equal(feedbackExpired(1000, 2200, 1200), true);
  assert.equal(feedbackExpired(1000, 99999, 1200, true), false);
  assert.equal(feedbackExpired(null, 99999, 1200), false);
});

test('記録の settings に instantFeedback を入れ、元の設定は書き換えない', () => {
  const params = { durationSec: 180 };
  assert.deepEqual(recordSettingsWithFeedback(params, { instantFeedback: true }), { durationSec: 180, instantFeedback: true });
  assert.deepEqual(recordSettingsWithFeedback(params, { instantFeedback: false }), { durationSec: 180, instantFeedback: false });
  assert.deepEqual(recordSettingsWithFeedback(params, undefined), { durationSec: 180, instantFeedback: false });
  assert.deepEqual(params, { durationSec: 180 });
});
