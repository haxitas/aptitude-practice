// テスト一覧。メニューと履歴画面が共用する。
// details: 結果画面に出す内訳(record.detail のキーと表示名)。inHistory: false のものは履歴の表に出さない。
// emphasis: 結果画面と履歴で目立たせる

// 並び順と番号は本番の順(2026-09-30 本番の順に合わせて変更)。内部の id・記録・設定のキー・ハッシュは変えない
export const TESTS = Object.freeze([
  {
    id: 't1',
    number: 1,
    name: 'テスト1 計算',
    implemented: true,
    details: [
      { key: 'answered', label: '回答' },
      { key: 'accuracy', label: '正答率', unit: '%' },
    ],
  },
  {
    id: 't3',
    number: 2,
    name: 'テスト2 マルチタスク',
    implemented: true,
    details: [
      { key: 'shapeCorrect', label: '図形 正答' },
      { key: 'shapeAnswered', label: '図形 回答', inHistory: false },
      { key: 'shapeAccuracy', label: '図形 正答率', unit: '%', inHistory: false },
      { key: 'calcCorrect', label: '計算 正答' },
      { key: 'calcAnswered', label: '計算 回答', inHistory: false },
      { key: 'calcAccuracy', label: '計算 正答率', unit: '%', inHistory: false },
      { key: 'audioCorrect', label: '音声 正答' },
      { key: 'audioAnswered', label: '音声 回答', inHistory: false },
      { key: 'audioAccuracy', label: '音声 正答率', unit: '%', inHistory: false },
      { key: 'audioUnanswered', label: '音声 未回答' },
    ],
  },
  {
    id: 't2',
    number: 3,
    name: 'テスト3 同一図形の検出',
    implemented: true,
    details: [
      // 2026-09-30 本番に合わせて変更: 見逃しは起きない(やり直しになる)。平均反応時間を目立たせる
      { key: 'meanRtMs', label: '平均反応時間', unit: 'ms', emphasis: true },
      { key: 'hits', label: '的中' },
      { key: 'falseAlarms', label: '誤押し' },
      { key: 'minRtMs', label: '最速', unit: 'ms' },
      { key: 'maxRtMs', label: '最遅', unit: 'ms' },
    ],
  },
  {
    id: 't5',
    number: 4,
    name: 'テスト4 点の数',
    implemented: true,
    details: [
      { key: 'answered', label: '回答' },
      { key: 'unanswered', label: '未回答' },
      { key: 'meanError', label: '平均の誤差' },
    ],
  },
  {
    id: 't4',
    number: 5,
    name: 'テスト5 計器の読み取り',
    implemented: true,
    details: [
      { key: 'answered', label: '回答数' },
      { key: 'correct', label: '正答数' },
      { key: 'positionOnlyCorrect', label: '位置だけ正解' },
      { key: 'headingOnlyCorrect', label: '向きだけ正解' },
    ],
  },
  {
    id: 't6',
    number: 6,
    name: 'テスト6 トンネル飛行',
    implemented: true,
    details: [
      { key: 'collisions', label: '衝突' },
      { key: 'distance', label: '進んだ距離', unit: ' u' },
      { key: 'maxSpeed', label: '最高速度', unit: ' u/s' },
    ],
  },
]);

export function findTest(id) {
  return TESTS.find(t => t.id === id) ?? null;
}

// 値がない(null)ときは「—」
export function formatDetail(item, value) {
  if (value === null || value === undefined) return '—';
  return `${value}${item.unit ?? ''}`;
}
