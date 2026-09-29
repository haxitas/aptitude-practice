// テスト3 同一図形の検出(内部 id t2): 表示の系列・進行・判定・採点。DOM に触れない。
// 2026-09-30 本番に合わせて変更: 一致の表示は押すまで止まり(最大 matchWaitMs)、押せなければやり直し。
// 不一致の表示は intervalMs ごとに切り替わる。点数 = 的中 − 誤押し。
import { correctFeedback } from '../core/feedback.js';

// △ ★ ○ □ ◇ 太い十字。描画は js/tests/t2.js(SVG)
export const SHAPES = Object.freeze(['triangle', 'starFilled', 'circle', 'square', 'diamond', 'thickCross']);

const NONMATCH_PAIRS = SHAPES.flatMap(a => SHAPES.filter(b => b !== a).map(b => [a, b]));

export function validateT2Params(p) {
  const bad = [];
  if (!(Number.isFinite(p.durationSec) && p.durationSec > 0)) bad.push(`制限時間 durationSec=${p.durationSec}`);
  if (!(Number.isFinite(p.intervalMs) && p.intervalMs > 0)) bad.push(`切り替え間隔 intervalMs=${p.intervalMs}`);
  if (!(Number.isFinite(p.matchWaitMs) && p.matchWaitMs > 0)) bad.push(`一致の待ち時間 matchWaitMs=${p.matchWaitMs}`);
  if (!(Number.isFinite(p.matchRate) && p.matchRate >= 0 && p.matchRate <= 1)) bad.push(`一致確率 matchRate=${p.matchRate}`);
  if (!(Number.isInteger(p.maxConsecutiveMatches) && p.maxConsecutiveMatches >= 0)) {
    bad.push(`連続の上限 maxConsecutiveMatches=${p.maxConsecutiveMatches}`);
  }
  if (bad.length) throw new Error(`テスト3(同一図形)の設定が不正です: ${bad.join('、')}`);
}

// ---- 表示の系列(必要な分だけ順に作る) ----

export function createSequenceState() {
  return { prev: null, run: 0 };
}

// 一致は確率 matchRate。一致が maxConsecutiveMatches 回続いたら不一致にする。直前とまったく同じ表示は避ける
export function nextT2Display(state, rng, p) {
  const canMatch = state.run < p.maxConsecutiveMatches;
  const match = canMatch && rng() < p.matchRate;
  const prev = state.prev;
  let display;
  if (match) {
    const cands = SHAPES.filter(s => !(prev && prev.left === s && prev.right === s));
    const s = cands[Math.floor(rng() * cands.length)];
    display = { left: s, right: s, match: true };
  } else {
    const cands = NONMATCH_PAIRS.filter(([a, b]) => !(prev && prev.left === a && prev.right === b));
    const [a, b] = cands[Math.floor(rng() * cands.length)];
    display = { left: a, right: b, match: false };
  }
  return { display, state: { prev: display, run: match ? state.run + 1 : 0 } };
}

// ---- 進行 ----
// 状態: { seq, display, shownAt, pressed, tally }。時刻はすべて performance.now() の基準。

export function createT2Tally() {
  return { hits: 0, falseAlarms: 0, rts: [] };
}

function advance(state, shownAt, rng, p) {
  const next = nextT2Display(state.seq, rng, p);
  return { ...state, seq: next.state, display: next.display, shownAt, pressed: false };
}

export function createT2Run(p, rng, now) {
  validateT2Params(p);
  return advance({ seq: createSequenceState(), tally: createT2Tally() }, now, rng, p);
}

// 押したとき。一致なら的中(反応時間を記録)してすぐ次へ、不一致なら誤押し(1回の表示で1回まで)
// { state, result: 'hit' | 'falseAlarm' | 'ignored', rtMs? }
export function pressT2(state, now, p, rng) {
  if (state.display.match) {
    const rtMs = Math.max(0, now - state.shownAt);
    const tally = { ...state.tally, hits: state.tally.hits + 1, rts: [...state.tally.rts, rtMs] };
    return { state: advance({ ...state, tally }, now, rng, p), result: 'hit', rtMs };
  }
  if (state.pressed) return { state, result: 'ignored' };
  const tally = { ...state.tally, falseAlarms: state.tally.falseAlarms + 1, rts: state.tally.rts.slice() };
  return { state: { ...state, tally, pressed: true }, result: 'falseAlarm' };
}

// 毎フレーム。不一致は intervalMs で次へ(予定の時刻から数え、ずれをためない)。
// 一致は matchWaitMs たったら 'restart'(やり直し)。{ state, event: null | 'advanced' | 'restart' }
export function tickT2(state, now, p, rng) {
  if (state.display.match) {
    return { state, event: now - state.shownAt >= p.matchWaitMs ? 'restart' : null };
  }
  let s = state;
  let event = null;
  while (!s.display.match && now - s.shownAt >= p.intervalMs) {
    s = advance(s, s.shownAt + p.intervalMs, rng, p);
    event = 'advanced';
  }
  return { state: s, event };
}

// ---- 即時判定 ----

export function t2PressFeedback(isMatch, rtMs = null) {
  if (!isMatch) return { kind: 'wrong', text: '× 一致していません' };
  return rtMs === null ? correctFeedback() : { kind: 'correct', text: `○ 正解(${Math.round(rtMs)}ms)` };
}

// ---- 採点 ----

// 点数 = 的中 − 誤押し(0未満は0)
export function scoreT2({ hits, falseAlarms }) {
  return Math.max(0, hits - falseAlarms);
}

export function summarizeT2(tally) {
  const rts = tally.rts;
  const has = rts.length > 0;
  return {
    score: scoreT2(tally),
    detail: {
      hits: tally.hits,
      falseAlarms: tally.falseAlarms,
      meanRtMs: has ? Math.round(rts.reduce((s, v) => s + v, 0) / rts.length) : null,
      minRtMs: has ? Math.round(Math.min(...rts)) : null,
      maxRtMs: has ? Math.round(Math.max(...rts)) : null,
    },
  };
}

// 記録。settings にはその回に使った設定値をすべて入れる
export function buildRecord({ date, tally, settings }) {
  const { score, detail } = summarizeT2(tally);
  return { id: `${date}-t2`, test: 't2', date, score, detail, settings: { ...settings } };
}
