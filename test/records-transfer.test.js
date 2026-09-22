import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeExportData, parseImportJson, mergeImportedRecords } from '../js/logic/records-transfer.js';

function rec(id, score = 1) {
  return { id, test: 't2', date: '2026-09-23T00:00:00.000Z', score, detail: {}, settings: { durationSec: 120 } };
}

test('書き出しは版・日時・記録を持ち、記録を書き換えない', () => {
  const records = [rec('a')];
  const before = structuredClone(records);
  assert.deepEqual(makeExportData(records, '2026-09-23T01:02:03.000Z'), {
    format: 'aptitude-practice-results', version: 1, exportedAt: '2026-09-23T01:02:03.000Z', records,
  });
  assert.deepEqual(records, before);
});

test('正式形式と過去の records 形式を読み込める', () => {
  for (const data of [
    makeExportData([rec('a')], '2026-09-23T01:02:03.000Z'),
    { records: [rec('a')] },
  ]) {
    const result = parseImportJson(JSON.stringify(data));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result.records, [rec('a')]);
  }
});

test('壊れたJSON・形違い・途中の不正記録は全体を拒否する', () => {
  const cases = [
    '{oops',
    JSON.stringify([]),
    JSON.stringify({ records: {} }),
    JSON.stringify({ records: [rec('a'), { ...rec('b'), score: -1 }] }),
    JSON.stringify({ records: [rec('a'), { ...rec('b'), test: 't9' }] }),
    JSON.stringify({ format: 'aptitude-practice-results', version: 2, records: [rec('a')] }),
  ];
  for (const text of cases) {
    const result = parseImportJson(text);
    assert.equal(result.ok, false, text);
    assert.match(result.message, /ません|違います|不正|対応/);
  }
});

test('既存の内容と順番を保ち、重複を無視して新規分をファイル順に追加する', () => {
  const existing = [rec('a', 1), rec('b', 2)];
  const imported = [rec('b', 999), rec('c', 3), rec('c', 4), rec('d', 5)];
  const beforeExisting = structuredClone(existing);
  const beforeImported = structuredClone(imported);
  const result = mergeImportedRecords(existing, imported);
  assert.deepEqual(result.records, [rec('a', 1), rec('b', 2), rec('c', 3), rec('d', 5)]);
  assert.equal(result.added, 2);
  assert.equal(result.ignored, 2);
  assert.deepEqual(existing, beforeExisting);
  assert.deepEqual(imported, beforeImported);
});
