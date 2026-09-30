import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { DEFAULTS } from '../js/core/settings.js';
import {
  generateT5Problem, reshuffleT5Dots, shuffleIndexAt, shouldTimeoutT5,
  createT5Tally, recordT5Answer, recordT5Unanswered, summarizeT5, buildT5Record,
  createT5Level, nextT5Level, t5CountRange, pickT5Count, makeT5Choices,
} from '../js/logic/t5.js';
import { t5Feedback } from '../js/logic/t5.js';

const P = DEFAULTS.t5;

test('T5 の既定値は承認済みの数値(2026-09-30 本番に合わせて変更)', () => {
  assert.deepEqual(P, {
    durationSec: 180,
    minDots: 3,
    maxDots: 14,
    levelSpreadDown: 2,
    levelSpreadUp: 3,
    levelDownWrongStreak: 2,
    choiceCount: 5,
    shuffleIntervalMs: 850,
    dotMoveMs: 600,
    questionLimitSec: 0,
    fieldScale: 0.85,
    dotRadiusRatio: 0.045,
    dotMinDistanceRatio: 0.07,
    placementAttemptLimit: 200,
    layoutRestartLimit: 20,
    answerFeedbackMs: 300,
    stallAbortMs: 1000,
  });
  // 点どうしは少し重なってよい(最小間隔 < 直径)
  assert.ok(P.dotMinDistanceRatio < P.dotRadiusRatio * 2);
});

// ---- 段階と点の数(2026-09-30 本番に合わせて変更) ----

test('段階: 最初は3。正解で+1、2回連続の不正解で−1、3〜14に収まる', () => {
  let s = createT5Level(P);
  assert.deepEqual(s, { level: 3, wrongStreak: 0, maxLevel: 3 });
  s = nextT5Level(s, true, P);
  assert.equal(s.level, 4);
  s = nextT5Level(s, false, P);
  assert.equal(s.level, 4, '1回の不正解では下がらない');
  s = nextT5Level(s, true, P);
  assert.equal(s.level, 5, '正解で連続の不正解は数え直し');
  s = nextT5Level(s, false, P);
  s = nextT5Level(s, false, P);
  assert.equal(s.level, 4, '2回連続の不正解で−1');
  s = nextT5Level(s, false, P);
  assert.equal(s.level, 4, '下がった後はまた2回続くまで下がらない');
  s = nextT5Level(s, false, P);
  assert.equal(s.level, 3);
  for (let i = 0; i < 10; i++) s = nextT5Level(s, false, P);
  assert.equal(s.level, 3, '3より下がらない');
  for (let i = 0; i < 20; i++) s = nextT5Level(s, true, P);
  assert.equal(s.level, 14, '14より上がらない');
  assert.equal(s.maxLevel, 14);
  s = nextT5Level(nextT5Level(s, false, P), false, P);
  assert.equal(s.level, 13);
  assert.equal(s.maxLevel, 14, '到達した最大は下がっても残る');
});

test('段階を書き換えない', () => {
  const s = createT5Level(P);
  nextT5Level(s, true, P);
  assert.deepEqual(s, createT5Level(P));
});

test('出す数の範囲は段階の −2〜+3 で、3〜14に収める(2026-09-30 ユーザーの実機の感想で −3〜+3 から変更)', () => {
  assert.deepEqual(t5CountRange(8, P), { min: 6, max: 11 });
  assert.deepEqual(t5CountRange(14, P), { min: 12, max: 14 });
  assert.deepEqual(t5CountRange(3, P), { min: 3, max: 6 });
  assert.deepEqual(t5CountRange(4, P), { min: 3, max: 7 });
  assert.deepEqual(t5CountRange(12, P), { min: 10, max: 14 });
  // 下側・上側は設定で変えられる
  assert.deepEqual(t5CountRange(8, { ...P, levelSpreadDown: 3, levelSpreadUp: 3 }), { min: 5, max: 11 });
});

test('出す数の平均は段階より少し大きい(範囲の端まで出る)', () => {
  for (const level of [5, 8, 11]) {
    const rng = createRng(level * 7);
    let sum = 0;
    const seen = new Set();
    const trials = 6000;
    for (let i = 0; i < trials; i++) {
      const n = pickT5Count(rng, level, P, null);
      sum += n;
      seen.add(n);
    }
    const mean = sum / trials;
    assert.ok(mean > level + 0.3 && mean < level + 0.7, `段階${level}: 平均 ${mean.toFixed(2)}(段階 + 0.5 くらいのはず)`);
    assert.ok(seen.has(level - 2) && seen.has(level + 3), `段階${level}: ${[...seen].sort((a, b) => a - b)}`);
    assert.equal(seen.has(level - 3), false);
  }
});

test('出す数は段階の −2〜+3 の範囲から一様に選び、多数の試行で範囲の端まで出る', () => {
  for (const level of [3, 8, 14]) {
    const { min, max } = t5CountRange(level, P);
    const counts = new Map();
    const rng = createRng(level);
    const trials = 7000;
    for (let i = 0; i < trials; i++) {
      const n = pickT5Count(rng, level, P, null);
      assert.ok(n >= min && n <= max, `段階${level}: ${n}`);
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    const values = [...counts.keys()].sort((a, b) => a - b);
    assert.deepEqual(values, Array.from({ length: max - min + 1 }, (_, i) => min + i), `段階${level}: ${values}`);
    const expected = trials / values.length;
    for (const [n, c] of counts) assert.ok(Math.abs(c - expected) < expected * 0.15, `段階${level}: ${n} が ${c}回(約${Math.round(expected)}回のはず)`);
  }
});

test('出す数は直前と同じ数を避ける(候補が1つしかないときを除く)', () => {
  const rng = createRng(9);
  for (let i = 0; i < 2000; i++) {
    const previous = 5 + (i % 7);
    assert.notEqual(pickT5Count(rng, 8, P, previous), previous);
  }
  const single = { ...P, minDots: 3, maxDots: 3 };
  assert.equal(pickT5Count(createRng(1), 3, single, 3), 3);
});

test('最初の1問はちょうど3個、2問目からは段階の −2〜+3 の範囲', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const rng = createRng(seed);
    const first = generateT5Problem(rng, P);
    assert.equal(first.count, 3, `seed=${seed}`);
    const second = generateT5Problem(rng, P, first, 8);
    assert.ok(second.count >= 6 && second.count <= 11, `seed=${seed}: ${second.count}`);
  }
});

// ---- 回答の選択肢(2026-09-30 本番に合わせて変更) ----

test('選択肢は連続した5つの数で正解を1つだけ含み、一番小さい選択肢は1以上', () => {
  const rng = createRng(4);
  for (let answer = 1; answer <= 14; answer++) {
    for (let i = 0; i < 200; i++) {
      const choices = makeT5Choices(rng, answer, P);
      assert.equal(choices.length, 5);
      choices.forEach((c, k) => { if (k > 0) assert.equal(c, choices[k - 1] + 1, `${choices}`); });
      assert.equal(choices.filter(c => c === answer).length, 1);
      assert.ok(choices[0] >= 1, `${choices}`);
    }
  }
});

test('選択肢の中の正解の位置はランダムで、5か所すべてに現れる(真ん中とは限らない)', () => {
  const rng = createRng(12);
  const positions = [0, 0, 0, 0, 0];
  const trials = 5000;
  for (let i = 0; i < trials; i++) {
    const answer = 5 + (i % 10); // 5〜14 はどの位置にも入れる
    positions[makeT5Choices(rng, answer, P).indexOf(answer)]++;
  }
  for (const c of positions) assert.ok(Math.abs(c - trials / 5) < trials / 5 * 0.15, `位置の回数 ${positions}`);
});

test('問題は選択肢を持ち、正解を含む', () => {
  const rng = createRng(3);
  let q = generateT5Problem(rng, P);
  for (let i = 0; i < 500; i++) {
    assert.equal(q.choices.length, 5);
    assert.ok(q.choices.includes(q.count));
    q = generateT5Problem(rng, P, q, 3 + (i % 12));
  }
});

function assertValidLayout(q) {
  assert.equal(q.dots.length, q.count);
  for (const dot of q.dots) {
    assert.ok(Math.hypot(dot.x, dot.y) + P.dotRadiusRatio <= 1 + 1e-12);
  }
  for (let i = 0; i < q.dots.length; i++) {
    for (let j = i + 1; j < q.dots.length; j++) {
      assert.ok(Math.hypot(q.dots[i].x - q.dots[j].x, q.dots[i].y - q.dots[j].y) >= P.dotMinDistanceRatio - 1e-12);
    }
  }
}

test('1000シードで点はすべて円内、最小間隔を守る', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    assertValidLayout(generateT5Problem(createRng(seed), P, null, 3 + (seed % 12)));
  }
});

test('14個でも1000シードすべて配置できる', () => {
  const p = { ...P, minDots: 14, maxDots: 14 };
  for (let seed = 1; seed <= 1000; seed++) {
    const q = generateT5Problem(createRng(seed), p, null, 14);
    assert.equal(q.count, 14);
    assertValidLayout(q);
  }
});

test('1000シードで半径が中心・中間・外側へ散らばり、固定の2重輪に乗らない点が多数ある', () => {
  const zones = { center: 0, middle: 0, outer: 0 };
  let total = 0;
  let offOldRings = 0;
  for (let seed = 1; seed <= 1000; seed++) {
    const q = generateT5Problem(createRng(seed), P, null, 3 + (seed % 12));
    for (const dot of q.dots) {
      const radius = Math.hypot(dot.x, dot.y);
      if (radius < 0.3) zones.center++;
      else if (radius < 0.6) zones.middle++;
      else zones.outer++;
      if (![0, 0.3, 0.68].some(ring => Math.abs(radius - ring) < 1e-9)) offOldRings++;
      total++;
    }
  }
  assert.ok(zones.center > 0, `中心付近がありません: ${JSON.stringify(zones)}`);
  assert.ok(zones.middle > 0, `中間がありません: ${JSON.stringify(zones)}`);
  assert.ok(zones.outer > 0, `外側がありません: ${JSON.stringify(zones)}`);
  assert.ok(offOldRings > total * 0.8, `2重輪以外が少なすぎます: ${offOldRings}/${total}`);
});

test('同じ値しか返さない乱数では上限後に格子配置で14個を返す', () => {
  const p = { ...P, minDots: 14, maxDots: 14 };
  const q = generateT5Problem(() => 0.5, p, null, 14);
  assert.equal(q.layoutMode, 'fallback');
  assert.equal(q.count, 14);
  assertValidLayout(q);
});

test('位置の入れ替えは個数を変えず、別の配置にする', () => {
  const q = generateT5Problem(createRng(1), P);
  const next = reshuffleT5Dots(q, createRng(2), P);
  assert.equal(next.count, q.count);
  assert.notDeepEqual(next.dots, q.dots);
  assertValidLayout(next);
});

test('問題開始0msですぐ1回目、850msで2回目、1700msで3回目を始める', () => {
  assert.equal(shuffleIndexAt(0, P), 1);
  assert.equal(shuffleIndexAt(849, P), 1);
  assert.equal(shuffleIndexAt(850, P), 2);
  assert.equal(shuffleIndexAt(1700, P), 3);
});

test('1問無制限なら60秒たっても未回答にせず、全体終了で待ち問題を数えない', () => {
  assert.equal(shouldTimeoutT5(60000, 0, P, 180000), false);
  assert.equal(shouldTimeoutT5(180000, 0, P, 180000), false);
});

test('設定を10秒にすれば時間切れ。ただし全体終了と同時なら数えない', () => {
  const limited = { ...P, questionLimitSec: 10 };
  assert.equal(shouldTimeoutT5(9999, 0, limited, 180000), false);
  assert.equal(shouldTimeoutT5(10000, 0, limited, 180000), true);
  assert.equal(shouldTimeoutT5(180000, 170000, limited, 180000), false);
  assert.equal(shouldTimeoutT5(180001, 170000, limited, 180000), false);
});

test('採点は正答数、内訳は回答・未回答・回答した問題の平均誤差・到達した最大の数', () => {
  let tally = createT5Tally();
  tally = recordT5Answer(tally, 7, 7);
  tally = recordT5Answer(tally, 8, 10);
  tally = recordT5Unanswered(tally);
  assert.deepEqual(summarizeT5(tally, { level: 4, wrongStreak: 0, maxLevel: 5 }), {
    score: 1,
    detail: { answered: 2, unanswered: 1, meanError: 1, maxLevel: 5 },
  });
  assert.equal(summarizeT5(createT5Tally(), createT5Level(P)).detail.meanError, null);
  assert.equal(summarizeT5(createT5Tally(), createT5Level(P)).detail.maxLevel, 3);
});

test('集計関数は元の値を書き換えない', () => {
  const tally = createT5Tally();
  recordT5Answer(tally, 3, 4);
  recordT5Unanswered(tally);
  assert.deepEqual(tally, createT5Tally());
});

test('記録はSPEC §4の形で、その回の設定を複製する', () => {
  const date = '2026-09-23T10:15:00.000Z';
  const record = buildT5Record({
    date,
    tally: { correct: 1, answered: 2, unanswered: 1, errors: [0, 2] },
    level: { level: 6, wrongStreak: 1, maxLevel: 7 },
    settings: P,
  });
  assert.equal(record.id, `${date}-t5`);
  assert.equal(record.test, 't5');
  assert.equal(record.score, 1);
  assert.deepEqual(record.detail, { answered: 2, unanswered: 1, meanError: 1, maxLevel: 7 });
  assert.deepEqual(record.settings, P);
  assert.notEqual(record.settings, P);
});

// ---- 即時判定 ----

test('即時判定: 正解は「○ 正解 8個」、不正解は正解とあなたの答えを出す', () => {
  assert.deepEqual(t5Feedback(8, 8), { kind: 'correct', text: '○ 正解 8個' });
  assert.deepEqual(t5Feedback(8, 7), { kind: 'wrong', text: '× 正解は 8個 / あなたの答え 7個' });
});
