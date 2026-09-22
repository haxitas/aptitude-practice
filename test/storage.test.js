import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as storage from '../js/core/storage.js';
import { readResults, appendRecord, readSettingsRaw, RESULTS_KEY, SETTINGS_KEY } from '../js/core/storage.js';
import { DEFAULTS, resolveSettings, loadSettings } from '../js/core/settings.js';

class MemoryStore {
  constructor(init = {}) { this.data = new Map(Object.entries(init)); }
  getItem(k) { return this.data.has(k) ? this.data.get(k) : null; }
  setItem(k, v) { this.data.set(k, String(v)); }
}

function rec(i) {
  const date = new Date(Date.UTC(2026, 8, 23, 0, 0, i)).toISOString();
  return { id: `${date}-t2`, test: 't2', date, score: i, detail: { hits: i }, settings: { durationSec: 180 } };
}

test('apt_results がないときは空の一覧を返す', () => {
  assert.deepEqual(readResults(new MemoryStore()), { ok: true, records: [] });
});

test('50回追加しても既存の記録は順番・内容とも変わらない', () => {
  const store = new MemoryStore();
  const added = [];
  for (let i = 0; i < 50; i++) {
    const before = readResults(store).records;
    const res = appendRecord(store, rec(i));
    assert.equal(res.ok, true, JSON.stringify(res));
    added.push(rec(i));
    const after = readResults(store).records;
    assert.equal(after.length, before.length + 1);
    assert.deepEqual(after.slice(0, before.length), before);
    assert.deepEqual(after, added);
  }
});

test('壊れた値(JSON でない)があれば書き込まず、元の文字列が残る', () => {
  const raw = '{"records":[{"id":"x"'; // 途中で切れている
  const store = new MemoryStore({ [RESULTS_KEY]: raw });
  assert.equal(readResults(store).ok, false);
  const res = appendRecord(store, rec(1));
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'corrupt');
  assert.equal(store.getItem(RESULTS_KEY), raw);
});

test('JSON だが形が違う値(records が配列でない)も書き込まない', () => {
  for (const raw of ['[]', '{"foo":1}', '{"records":{}}', 'null', '42']) {
    const store = new MemoryStore({ [RESULTS_KEY]: raw });
    const res = appendRecord(store, rec(1));
    assert.equal(res.ok, false, raw);
    assert.equal(res.reason, 'corrupt', raw);
    assert.equal(store.getItem(RESULTS_KEY), raw);
  }
});

test('同じ id の記録は追加しない', () => {
  const store = new MemoryStore();
  assert.equal(appendRecord(store, rec(1)).ok, true);
  const before = store.getItem(RESULTS_KEY);
  const res = appendRecord(store, { ...rec(1), score: 999 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'duplicate');
  assert.equal(store.getItem(RESULTS_KEY), before);
});

test('書き込みに失敗したら(容量超過など)失敗を返し、元の値が残る', () => {
  const store = new MemoryStore();
  appendRecord(store, rec(1));
  const before = store.getItem(RESULTS_KEY);
  store.setItem = () => { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; };
  const res = appendRecord(store, rec(2));
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'write-failed');
  assert.match(res.message, /QuotaExceededError/);
  assert.equal(store.getItem(RESULTS_KEY), before);
});

test('読み込み自体が例外を投げる保存先でも落ちずに失敗を返す', () => {
  const store = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(readResults(store).ok, false);
  assert.equal(appendRecord(store, rec(1)).ok, false);
});

test('storage には削除・書き換え用の関数がない', () => {
  const bad = Object.keys(storage).filter(k => /^(delete|remove|clear|update|replace|overwrite|write|put)/i.test(k));
  assert.deepEqual(bad, []);
});

// ---- apt_settings(読み込みのみ)と既定値の合成 ----

test('apt_settings がなければ既定値そのもの', () => {
  const { settings, warnings } = loadSettings(new MemoryStore());
  assert.deepEqual(settings, DEFAULTS);
  assert.deepEqual(warnings, []);
});

test('T2 の既定値は SPEC §6 と承認済みの値', () => {
  assert.deepEqual(DEFAULTS.t2, {
    durationSec: 180, intervalMs: 1000, matchRate: 0.25, maxConsecutiveMatches: 2, falseAlarmPenalty: 2,
  });
  for (const id of ['t1', 't2', 't3', 't4', 't5', 't6']) assert.ok(DEFAULTS[id], id);
});

test('保存値は既定値と合成され、型が合わないキーだけ既定値に戻る', () => {
  const saved = { t2: { durationSec: 60, intervalMs: '800', matchRate: null, unknownKey: 5 } };
  const { settings, warnings } = resolveSettings(saved);
  assert.equal(settings.t2.durationSec, 60);
  assert.equal(settings.t2.intervalMs, 1000);
  assert.equal(settings.t2.matchRate, 0.25);
  assert.equal('unknownKey' in settings.t2, false);
  assert.deepEqual(settings.t1, DEFAULTS.t1);
  assert.deepEqual(warnings.sort(), ['t2.intervalMs', 't2.matchRate']);
});

test('NaN・Infinity は数値として扱わない', () => {
  const { settings } = resolveSettings({ t2: { durationSec: Infinity } });
  assert.equal(settings.t2.durationSec, 180);
});

test('apt_settings が JSON として読めないときは既定値で動き、値は書き換えない', () => {
  const store = new MemoryStore({ [SETTINGS_KEY]: '{oops' });
  assert.equal(readSettingsRaw(store).ok, false);
  const { settings, error } = loadSettings(store);
  assert.deepEqual(settings, DEFAULTS);
  assert.ok(error);
  assert.equal(store.getItem(SETTINGS_KEY), '{oops');
});

test('loadSettings の結果を書き換えても DEFAULTS は変わらない', () => {
  const { settings } = loadSettings(new MemoryStore());
  settings.t2.durationSec = 1;
  assert.equal(DEFAULTS.t2.durationSec, 180);
});
