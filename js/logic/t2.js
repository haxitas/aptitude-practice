// テスト2 同一図形の検出: 系列の生成・1回ごとの判定・採点。DOM に触れない。

// SPEC の △ ★ ○ □ ◇ ☆ に対応する。描画は js/tests/t2.js(SVG)
export const SHAPES = Object.freeze(['triangle', 'starFilled', 'circle', 'square', 'diamond', 'starOutline']);

const NONMATCH_PAIRS = SHAPES.flatMap(a => SHAPES.filter(b => b !== a).map(b => [a, b]));

// 表示回数 N = floor(制限時間 ÷ 切り替え間隔)
export function displayCount({ durationSec, intervalMs }) {
  return Math.floor((durationSec * 1000) / intervalMs);
}

// 一致の回数 m = Math.round(N × 一致確率)
export function matchCount(params) {
  return Math.round(displayCount(params) * params.matchRate);
}

// 一致が最大 k 回までしか続かない条件で置ける一致の最大数。
// 不一致が N−m 回あると、一致を入れられる隙間は N−m+1 か所で、各 k 回まで → m ≤ k(N−m+1)
export function maxFeasibleMatches(N, k) {
  return Math.min(N, Math.floor((k * (N + 1)) / (k + 1)));
}

function validate(p) {
  const bad = [];
  if (!(Number.isFinite(p.durationSec) && p.durationSec > 0)) bad.push(`制限時間 durationSec=${p.durationSec}`);
  if (!(Number.isFinite(p.intervalMs) && p.intervalMs > 0)) bad.push(`切り替え間隔 intervalMs=${p.intervalMs}`);
  if (!(Number.isFinite(p.matchRate) && p.matchRate >= 0 && p.matchRate <= 1)) bad.push(`一致確率 matchRate=${p.matchRate}`);
  if (!(Number.isInteger(p.maxConsecutiveMatches) && p.maxConsecutiveMatches >= 0)) {
    bad.push(`連続の上限 maxConsecutiveMatches=${p.maxConsecutiveMatches}`);
  }
  if (bad.length) throw new Error(`テスト2の設定が不正です: ${bad.join('、')}`);
  if (displayCount(p) < 1) throw new Error('テスト2の設定が不正です: 制限時間が切り替え間隔より短いため、1回も表示できません');
}

// 一致・不一致の並びを作る。棄却サンプリングは使わず、構成的に置く:
// 不一致 N−m 個の間と両端(N−m+1 か所)に、各か所 k 個までの容量で一致を1個ずつランダムに配る。
function matchFlags(N, m, k, rng) {
  const n = N - m;
  const counts = new Array(n + 1).fill(0);
  const open = counts.map((_, i) => i); // まだ容量が残っている隙間
  for (let t = 0; t < m; t++) {
    const j = Math.floor(rng() * open.length);
    const slot = open[j];
    counts[slot]++;
    if (counts[slot] === k) {
      open[j] = open[open.length - 1];
      open.pop();
    }
  }
  const flags = [];
  for (let s = 0; s <= n; s++) {
    for (let c = 0; c < counts[s]; c++) flags.push(true);
    if (s < n) flags.push(false);
  }
  return flags;
}

// [{ left, right, match }, ...](長さ N)。実現できない設定なら Error を投げる
export function generateSequence(params, rng) {
  validate(params);
  const N = displayCount(params);
  const m = matchCount(params);
  const k = params.maxConsecutiveMatches;
  const maxM = maxFeasibleMatches(N, k);
  if (m > maxM) {
    throw new Error(
      `一致確率 ${params.matchRate} では一致が ${m} 回になり、一致の連続を ${k} 回までにして並べられません。` +
      `この設定で使える一致確率の上限は ${(maxM / N).toFixed(3)}(${N}回中${maxM}回)です`,
    );
  }
  const seq = [];
  let prev = null;
  for (const match of matchFlags(N, m, k, rng)) {
    // 直前とまったく同じ表示は候補から外す
    let d;
    if (match) {
      const cands = SHAPES.filter(s => !(prev && prev.left === s && prev.right === s));
      const s = cands[Math.floor(rng() * cands.length)];
      d = { left: s, right: s, match: true };
    } else {
      const cands = NONMATCH_PAIRS.filter(([a, b]) => !(prev && prev.left === a && prev.right === b));
      const [a, b] = cands[Math.floor(rng() * cands.length)];
      d = { left: a, right: b, match: false };
    }
    seq.push(d);
    prev = d;
  }
  return seq;
}

// ---- 1回の表示ごとの判定 ----

export function createDisplayState() {
  return { pressed: false, rtMs: null };
}

// 1回の表示中に受け付けるのは最初の1回だけ
export function registerPress(state, rtMs) {
  if (state.pressed) return { accepted: false, state };
  return { accepted: true, state: { pressed: true, rtMs } };
}

export function createTally() {
  return { hits: 0, misses: 0, falseAlarms: 0, rts: [] };
}

// 表示が切り替わるときに、その表示の判定を確定する(元の集計は変えない)
export function settleDisplay(tally, isMatch, state) {
  const t = { ...tally, rts: tally.rts.slice() };
  if (isMatch) {
    if (state.pressed) {
      t.hits++;
      t.rts.push(state.rtMs);
    } else {
      t.misses++;
    }
  } else if (state.pressed) {
    t.falseAlarms++;
  }
  return t;
}

// ---- 採点 ----

// 点数 = max(0, 的中率% − 誤押し数 × 減点) を四捨五入。一致が0回なら 0
export function score({ hits, misses, falseAlarms }, penalty) {
  const denom = hits + misses;
  if (denom === 0) return 0;
  return Math.round(Math.max(0, (hits * 100) / denom - falseAlarms * penalty));
}

export function summarizeTally(tally, penalty) {
  const meanRtMs = tally.rts.length
    ? Math.round(tally.rts.reduce((s, v) => s + v, 0) / tally.rts.length)
    : null;
  return {
    score: score(tally, penalty),
    detail: { hits: tally.hits, misses: tally.misses, falseAlarms: tally.falseAlarms, meanRtMs },
  };
}

// SPEC §4 の形の記録。settings にはその回に使った T2 の設定値をすべて入れる
export function buildRecord({ date, tally, settings }) {
  const { score: sc, detail } = summarizeTally(tally, settings.falseAlarmPenalty);
  return { id: `${date}-t2`, test: 't2', date, score: sc, detail, settings: { ...settings } };
}
