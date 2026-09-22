const FORMAT = 'aptitude-practice-results';
const VERSION = 1;

export function makeExportData(records, exportedAt) {
  return { format: FORMAT, version: VERSION, exportedAt, records: [...records] };
}

function validObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

export function validateImportedRecord(record, index) {
  if (!validObject(record)) return `記録${index + 1}がオブジェクトではありません`;
  if (typeof record.id !== 'string' || !record.id.trim()) return `記録${index + 1}のidが不正です`;
  if (!/^t[1-6]$/.test(record.test)) return `記録${index + 1}のtestが不正です`;
  if (typeof record.date !== 'string' || Number.isNaN(new Date(record.date).getTime())) return `記録${index + 1}のdateが不正です`;
  if (!(Number.isFinite(record.score) && record.score >= 0)) return `記録${index + 1}のscoreが不正です`;
  if (!validObject(record.detail)) return `記録${index + 1}のdetailが不正です`;
  if (!validObject(record.settings)) return `記録${index + 1}のsettingsが不正です`;
  return null;
}

export function parseImportJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: 'JSONとして読み込めません' };
  }
  if (!validObject(data) || !Array.isArray(data.records)) return { ok: false, message: 'ファイルの形が想定と違います(recordsが必要です)' };
  if (data.format !== undefined && data.format !== FORMAT) return { ok: false, message: 'このサイトの成績ファイルではありません' };
  if (data.version !== undefined && data.version !== VERSION) return { ok: false, message: `形式の版${data.version}には対応していません` };
  for (let index = 0; index < data.records.length; index++) {
    const message = validateImportedRecord(data.records[index], index);
    if (message) return { ok: false, message };
  }
  return { ok: true, records: data.records };
}

export function mergeImportedRecords(existing, imported) {
  const records = [...existing];
  const ids = new Set(existing.map(record => record?.id));
  let added = 0;
  let ignored = 0;
  for (const record of imported) {
    if (ids.has(record.id)) {
      ignored++;
      continue;
    }
    ids.add(record.id);
    records.push(record);
    added++;
  }
  return { records, added, ignored };
}
