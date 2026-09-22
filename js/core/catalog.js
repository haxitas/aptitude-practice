// テスト一覧。メニューと履歴画面が共用する。
// details: 結果画面と履歴の表に出す内訳(record.detail のキーと表示名)

export const TESTS = Object.freeze([
  { id: 't1', name: 'テスト1 計算', implemented: false, details: [] },
  {
    id: 't2',
    name: 'テスト2 同一図形の検出',
    implemented: true,
    details: [
      { key: 'hits', label: '的中' },
      { key: 'misses', label: '見逃し' },
      { key: 'falseAlarms', label: '誤押し' },
      { key: 'meanRtMs', label: '平均反応時間', unit: 'ms' },
    ],
  },
  { id: 't3', name: 'テスト3 マルチタスク', implemented: false, details: [] },
  { id: 't4', name: 'テスト4 計器の読み取り', implemented: false, details: [] },
  { id: 't5', name: 'テスト5 点の数', implemented: false, details: [] },
  { id: 't6', name: 'テスト6 トンネル飛行', implemented: false, details: [] },
]);

export function findTest(id) {
  return TESTS.find(t => t.id === id) ?? null;
}

// 値がない(null)ときは「—」
export function formatDetail(item, value) {
  if (value === null || value === undefined) return '—';
  return `${value}${item.unit ?? ''}`;
}
