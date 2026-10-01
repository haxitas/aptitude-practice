// 保存した設定の扱い(2026-10-01 7回目で追加)
// (a) 版を切り替えたとき一度だけ、既定値を変えた項目の保存値を消して既定値に戻す
// (b) 設定画面で保存するときは、既定値と違う項目だけを保存する
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, resolveSettings, SETTINGS_MIGRATIONS, migrateSettings, migrateStoredSettings, loadSettings } from '../js/core/settings.js';
import { withoutDefaults } from '../js/logic/settings-form.js';

function memoryStore(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    values, writes,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { writes.push(key); values.set(key, value); },
    removeItem: key => values.delete(key),
  };
}

const OLD = { t6: { maxSpeed: 10, barWidth: 0.35, obstacleColor: 'plum', obstacleEdgeColor: 'yellow', stickSide: 'left', durationSec: 120, acceleration: 0.02 },
  t3: { shapeLimitMs: 5000, durationSec: 240 }, common: { feedbackMs: 900 } };

test('移行: 古い保存値(t6 maxSpeed 10・barWidth 0.35・配色)は、maxSpeed と barWidth が既定値に戻り、配色・操縦円の側・制限時間は残る', () => {
  const migrated = migrateSettings(OLD);
  const { settings } = resolveSettings(migrated.value);
  assert.equal(settings.t6.maxSpeed, DEFAULTS.t6.maxSpeed);
  assert.equal(settings.t6.barWidth, DEFAULTS.t6.barWidth);
  assert.equal(settings.t6.acceleration, DEFAULTS.t6.acceleration);
  assert.equal(settings.t6.obstacleColor, 'plum');
  assert.equal(settings.t6.obstacleEdgeColor, 'yellow');
  assert.equal(settings.t6.stickSide, 'left');
  assert.equal(settings.t6.durationSec, 120);
  assert.equal(settings.t3.shapeLimitMs, DEFAULTS.t3.shapeLimitMs, 'マルチタスクの図形の制限時間も既定値へ');
  assert.equal(settings.t3.durationSec, 240);
  assert.equal(settings.common.feedbackMs, 900, '既定を変えていない項目は残る');
  assert.ok(migrated.removed.includes('t6.maxSpeed') && migrated.removed.includes('t6.barWidth') && migrated.removed.includes('t3.shapeLimitMs'), migrated.removed.join(','));
  assert.equal(migrated.value.defaultsVersion, SETTINGS_MIGRATIONS.at(-1).version);
  assert.deepEqual(OLD.t6.maxSpeed, 10, '元の値は書き換えない');
});

test('移行の一覧: 既定値にある項目だけで、配色・操縦円の側・制限時間(durationSec)は含まない(計算の durationSec だけは消す)', () => {
  for (const migration of SETTINGS_MIGRATIONS) {
    for (const [testId, keys] of Object.entries(migration.keys)) {
      for (const key of keys) {
        assert.ok(key in DEFAULTS[testId], `${testId}.${key}`);
        assert.ok(!['obstacleColor', 'obstacleEdgeColor', 'stickSide'].includes(key), `${testId}.${key}`);
        if (key === 'durationSec') assert.equal(testId, 't1', `${testId}.durationSec は残す`);
      }
    }
  }
  const first = SETTINGS_MIGRATIONS[0].keys;
  for (const key of ['maxSpeed', 'acceleration', 'obstacleSpacing', 'collisionPullbackDistance', 'holeRadius', 'barWidth', 'hitRadius', 'perspectiveFocal', 'centerOpenRadius', 'bladeOpen3Rate']) {
    assert.ok(first.t6.includes(key), `t6.${key}`);
  }
  assert.ok(first.t3.includes('shapeLimitMs'));
});

test('移行は1回だけ: 済んだことを保存し、2回目以降は何もしない(移行のあとで保存した値は消さない)', () => {
  const store = memoryStore({ apt_settings: JSON.stringify(OLD), apt_results: '{"records":[{"id":"x"}]}' });
  const first = migrateStoredSettings(store);
  assert.equal(first.migrated, true);
  const saved = JSON.parse(store.values.get('apt_settings'));
  assert.equal(saved.defaultsVersion, SETTINGS_MIGRATIONS.at(-1).version);
  assert.equal('maxSpeed' in saved.t6, false);
  // 移行のあとで利用者が最高速度を10にして保存した
  store.values.set('apt_settings', JSON.stringify({ ...saved, t6: { ...saved.t6, maxSpeed: 10 } }));
  const writes = store.writes.length;
  const second = migrateStoredSettings(store);
  assert.equal(second.migrated, false);
  assert.equal(store.writes.length, writes, '2回目は書き込まない');
  assert.equal(loadSettings(store).settings.t6.maxSpeed, 10);
  assert.equal(store.values.get('apt_results'), '{"records":[{"id":"x"}]}', '履歴には触れない');
});

test('移行: 保存値が無い・読めないときは何も書かない', () => {
  const empty = memoryStore();
  assert.equal(migrateStoredSettings(empty).migrated, false);
  assert.equal(empty.writes.length, 0);
  const broken = memoryStore({ apt_settings: '{broken' });
  assert.equal(migrateStoredSettings(broken).migrated, false);
  assert.equal(broken.values.get('apt_settings'), '{broken');
  assert.equal(migrateStoredSettings(null).migrated, false);
});

test('保存: 既定値と同じ項目は保存せず、違う項目だけを保存する(配色のボタンだけでほかの項目が固定されない)', () => {
  const form = { ...DEFAULTS.t6, obstacleColor: 'plum', obstacleEdgeColor: 'yellow' };
  assert.deepEqual(withoutDefaults(form, DEFAULTS.t6), { obstacleColor: 'plum', obstacleEdgeColor: 'yellow' });
  assert.deepEqual(withoutDefaults({ ...DEFAULTS.t6, maxSpeed: 10 }, DEFAULTS.t6), { maxSpeed: 10 });
  assert.deepEqual(withoutDefaults({ ...DEFAULTS.t6, holeOpenCounts: [1, 2, 3] }, DEFAULTS.t6), {}, '配列も中身で比べる');
  assert.deepEqual(withoutDefaults({ ...DEFAULTS.t6, holeOpenCounts: [1, 3] }, DEFAULTS.t6), { holeOpenCounts: [1, 3] });
  assert.deepEqual(withoutDefaults(DEFAULTS.t1, DEFAULTS.t1), {});
});

// ---- 計算の制限時間も消す(2026-10-01 9回目で追加。移行 version 2) ----

test('移行 version 2: 計算(t1)の durationSec 180 の保存値は消え(15問・5分の形式)、t2 の durationSec 120 は残る', () => {
  const { value, removed } = migrateSettings({ t1: { durationSec: 180, calculatorDuringTest: false }, t2: { durationSec: 120 } });
  const { settings } = resolveSettings(value);
  assert.equal(settings.t1.durationSec, DEFAULTS.t1.durationSec);
  assert.equal(settings.t1.durationSec, 300);
  assert.equal(settings.t1.calculatorDuringTest, false, '既定を変えていない項目は残る');
  assert.equal(settings.t2.durationSec, 120);
  assert.ok(removed.includes('t1.durationSec'));
  assert.equal(value.defaultsVersion, 2);
  assert.equal(SETTINGS_MIGRATIONS.at(-1).version, 2);
});

test('移行 version 2: version 1 まで済んだ端末でも t1.durationSec が消える。version 1 の項目(maxSpeed)は、済んだあとに保存した値なので消さない', () => {
  const store = memoryStore({ apt_settings: JSON.stringify({ defaultsVersion: 1, t1: { durationSec: 180 }, t2: { durationSec: 120 }, t6: { maxSpeed: 10 } }) });
  const result = migrateStoredSettings(store);
  assert.equal(result.migrated, true);
  assert.deepEqual(result.removed, ['t1.durationSec']);
  const { settings } = loadSettings(store);
  assert.equal(settings.t1.durationSec, 300);
  assert.equal(settings.t2.durationSec, 120);
  assert.equal(settings.t6.maxSpeed, 10);
  assert.equal(JSON.parse(store.values.get('apt_settings')).defaultsVersion, 2);
  const writes = store.writes.length;
  assert.equal(migrateStoredSettings(store).migrated, false, '2回目は何もしない');
  assert.equal(store.writes.length, writes);
});
