import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, resolveSettings } from '../js/core/settings.js';
import * as feedback from '../js/core/feedback.js';
import {
  correctFeedback, wrongFeedback, missFeedback, feedbackExpired,
} from '../js/core/feedback.js';

test('共通設定は判定の表示時間だけ。即時判定のオン/オフは廃止(2026-09-30 本番に合わせて変更)', () => {
  assert.deepEqual(DEFAULTS.common, { feedbackMs: 1200 });
  // 以前の保存値に instantFeedback が残っていても使わない(既定値にないキーは捨てる)
  const r = resolveSettings({ common: { instantFeedback: true, feedbackMs: 800 } });
  assert.deepEqual(r.settings.common, { feedbackMs: 800 });
  assert.deepEqual(r.warnings, []);
});

test('即時判定のバッジと、記録へ instantFeedback を入れる関数は無くなった', () => {
  assert.equal('instantFeedbackBadge' in feedback, false);
  assert.equal('recordSettingsWithFeedback' in feedback, false);
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
