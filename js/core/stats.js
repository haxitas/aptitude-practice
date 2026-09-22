// 成績の集計(DOM に触れない)。メニューと履歴画面で共用する。
import { DISPLAY } from './settings.js';

// 指定テストの記録を古い順に並べる(配列の順ではなく日時で決める)
function byTestOldestFirst(records, testId) {
  return records
    .filter(r => r && r.test === testId)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.date < b.r.date ? -1 : a.r.date > b.r.date ? 1 : a.i - b.i))
    .map(x => x.r);
}

// { count, best, last, recentAvg }。記録がなければ best/last/recentAvg は null
export function summarize(records, testId, recentN = DISPLAY.recentAvgCount) {
  const list = byTestOldestFirst(records, testId);
  if (list.length === 0) return { count: 0, best: null, last: null, recentAvg: null };
  const scores = list.map(r => r.score);
  const recent = scores.slice(-recentN);
  const avg = recent.reduce((s, v) => s + v, 0) / recent.length;
  return {
    count: list.length,
    best: Math.max(...scores),
    last: scores[scores.length - 1],
    recentAvg: Math.round(avg * 10) / 10,
  };
}

// 新しい順に最大 n 件
export function recentRecords(records, testId, n = DISPLAY.historyRows) {
  return byTestOldestFirst(records, testId).slice(-n).reverse();
}
