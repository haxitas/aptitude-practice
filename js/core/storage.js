// 成績(apt_results)は読み込みと追加だけ。削除・書き換えの関数は置かない。
// 設定(apt_settings)は読み込みだけ(書き込みは Phase4 の設定画面で扱う)。
// 保存先は引数で渡す(getItem/setItem を持つもの)。node のテストではメモリ上の偽物を渡す。

export const RESULTS_KEY = 'apt_results';
export const SETTINGS_KEY = 'apt_settings';

// ブラウザの localStorage。使えない環境(プライベートモードの制限など)では null
export function defaultStore() {
  try {
    const s = globalThis.localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

function errorText(e) {
  return e && e.name ? `${e.name}: ${e.message}` : String(e);
}

// { ok: true, records } / { ok: false, reason, message, raw }
export function readResults(store) {
  if (!store) return { ok: false, reason: 'unavailable', message: 'この端末では保存領域(localStorage)を使えません' };
  let raw;
  try {
    raw = store.getItem(RESULTS_KEY);
  } catch (e) {
    return { ok: false, reason: 'unavailable', message: `保存領域を読めません(${errorText(e)})` };
  }
  if (raw === null) return { ok: true, records: [] };
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { ok: false, reason: 'corrupt', message: '保存済みの成績データ(apt_results)が JSON として読めません', raw };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.records)) {
    return { ok: false, reason: 'corrupt', message: '保存済みの成績データ(apt_results)の形が想定と違います', raw };
  }
  return { ok: true, records: data.records, data };
}

// 末尾に1件だけ追加する。既存の要素には触れない。
// { ok: true } / { ok: false, reason, message }
export function appendRecord(store, record) {
  const cur = readResults(store);
  if (!cur.ok) {
    const message = cur.reason === 'corrupt'
      ? `${cur.message}。過去の記録を消さないため、書き込みませんでした`
      : cur.message;
    return { ok: false, reason: cur.reason, message };
  }
  if (cur.records.some(r => r && r.id === record.id)) {
    return { ok: false, reason: 'duplicate', message: `同じ id の記録が既にあります(${record.id})` };
  }
  const next = { ...(cur.data ?? {}), records: [...cur.records, record] };
  try {
    store.setItem(RESULTS_KEY, JSON.stringify(next));
  } catch (e) {
    return { ok: false, reason: 'write-failed', message: `保存領域に書き込めませんでした(${errorText(e)})` };
  }
  return { ok: true };
}

// { ok: true, value: object|null } / { ok: false, message }
export function readSettingsRaw(store) {
  if (!store) return { ok: true, value: null };
  let raw;
  try {
    raw = store.getItem(SETTINGS_KEY);
  } catch (e) {
    return { ok: false, message: `設定を読めません(${errorText(e)})` };
  }
  if (raw === null) return { ok: true, value: null };
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, message: '設定(apt_settings)の形が想定と違います' };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, message: '設定(apt_settings)が JSON として読めません' };
  }
}
