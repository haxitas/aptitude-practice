import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { DEFAULTS } from '../js/core/settings.js';
import {
  NATO_WORDS, SHAPE_KINDS, NOVELTY_VOICE_NAMES, pickVoice,
  generateShapeProblem, judgeShape,
  generateCalcProblem, evaluateCalc, judgeCalc,
  generateAudioSet,
  createAudioState, startAudioSet, stepAudio, audioEnded, answerAudio,
  createT3Tally, recordAnswer, recordUnanswered, summarizeT3, buildT3Record,
} from '../js/logic/t3.js';

const P = DEFAULTS.t3;

// ---- 既定値 ----

test('T3 の既定値: SPEC §6 の数値と承認済みの追加分', () => {
  assert.equal(P.durationSec, 240);
  assert.equal(P.triangleTiltMaxDeg, 10);
  assert.equal(P.calcTermCount, 4);
  assert.equal(P.calcTermMin, 1);
  assert.equal(P.calcTermMax, 20);
  assert.deepEqual(P.calcDistractorOffsets, [1, 2, 10]);
  assert.equal(P.speechWordCount, 5);
  assert.equal(P.speechIntervalMs, 1000);
  assert.equal(P.speechRate, 0.9);
  assert.equal(P.speechLang, 'en-US');
  assert.equal(P.duplicateRate, 0.5);
  assert.equal(P.speechAnswerLimitMs, 5000);
  assert.equal(P.speechNextDelayMs, 1000);
  assert.equal(P.answerFeedbackMs, 300);
});

test('NATO の26語(SPEC の綴り)', () => {
  assert.equal(NATO_WORDS.length, 26);
  assert.equal(new Set(NATO_WORDS).size, 26);
  for (const w of ['Alfa', 'Juliett', 'X-ray', 'Whiskey', 'Zulu']) assert.ok(NATO_WORDS.includes(w), w);
});

// ---- 声の選び方 ----

const v = (name, lang, extra = {}) => ({ name, lang, default: false, localService: false, ...extra });

test('声: en-US で default のものを最優先', () => {
  const voices = [v('Samantha', 'en-US', { localService: true }), v('Alex', 'en-US', { default: true }), v('Kyoko', 'ja-JP')];
  assert.equal(pickVoice(voices, 'en-US').voice.name, 'Alex');
});

test('声: おもしろ系の声が先頭に並んでいても選ばない', () => {
  const voices = [
    v('Albert', 'en-US', { localService: true }), v('Bad News', 'en-US', { localService: true }),
    v('Zarvox', 'en-US', { localService: true }), v('Whisper', 'en_US', { localService: true }),
    v('Samantha', 'en-US', { localService: true }),
  ];
  assert.equal(pickVoice(voices, 'en-US').voice.name, 'Samantha');
  for (const n of ['Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Good News', 'Jester', 'Organ', 'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox']) {
    assert.ok(NOVELTY_VOICE_NAMES.includes(n), n);
  }
});

test('声: en-US の中では localService の声を優先する', () => {
  const voices = [v('Google US English', 'en-US'), v('Microsoft David', 'en-US', { localService: true })];
  assert.equal(pickVoice(voices, 'en-US').voice.name, 'Microsoft David');
});

test('声: en-US がなければ、ほかの en-* の声', () => {
  const voices = [v('Kyoko', 'ja-JP', { default: true }), v('Daniel', 'en-GB')];
  const r = pickVoice(voices, 'en-US');
  assert.equal(r.voice.name, 'Daniel');
  assert.equal(r.rank, 3);
});

test('声: 英語の声がない・一覧が空なら声を指定しない(lang だけ)', () => {
  assert.deepEqual(pickVoice([v('Kyoko', 'ja-JP')], 'en-US'), { voice: null, rank: 4 });
  assert.deepEqual(pickVoice([], 'en-US'), { voice: null, rank: 4 });
});

// ---- 図形問題 ----

test('図形(シード200種類): 4つ並び、三角形はちょうど1つ、傾きは ±10° 以内、正解は三角形の向き', () => {
  const seenDir = new Set();
  const seenPos = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const q = generateShapeProblem(createRng(seed), P, null);
    assert.equal(q.items.length, 4);
    assert.deepEqual(q.items.map(it => it.kind).sort(), [...SHAPE_KINDS].sort());
    const tris = q.items.filter(it => it.kind === 'triangle');
    assert.equal(tris.length, 1);
    const tri = tris[0];
    assert.ok(tri.dir === 'left' || tri.dir === 'right');
    assert.ok(Math.abs(tri.tiltDeg) <= 10, `seed=${seed} tilt=${tri.tiltDeg}`);
    assert.equal(q.answer, tri.dir);
    seenDir.add(tri.dir);
    seenPos.add(q.items.indexOf(tri));
  }
  assert.deepEqual([...seenDir].sort(), ['left', 'right']);
  assert.deepEqual([...seenPos].sort(), [0, 1, 2, 3]);
});

test('図形: 直前と同じ並び・同じ向きの問題は出さない', () => {
  const rng = createRng(5);
  let prev = null;
  for (let i = 0; i < 2000; i++) {
    const q = generateShapeProblem(rng, P, prev);
    if (prev) {
      const same = q.answer === prev.answer && q.items.every((it, k) => it.kind === prev.items[k].kind);
      assert.ok(!same, `i=${i}`);
    }
    prev = q;
  }
});

test('図形: シードが同じなら同じ問題、判定は向きで決まる', () => {
  const a = generateShapeProblem(createRng(9), P, null);
  assert.deepEqual(a, generateShapeProblem(createRng(9), P, null));
  assert.equal(judgeShape(a, a.answer), true);
  assert.equal(judgeShape(a, a.answer === 'left' ? 'right' : 'left'), false);
});

// ---- 計算問題 ----

test('計算(シード1000種類): 各数は1〜20、途中の値が負にならない、4択はすべて異なり正解を1つ含む', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    const q = generateCalcProblem(createRng(seed), P);
    assert.equal(q.terms.length, 4);
    let r = 0;
    q.terms.forEach((t, i) => {
      assert.ok(Number.isInteger(t.n) && t.n >= 1 && t.n <= 20, `seed=${seed}`);
      if (i === 0) assert.equal(t.op, '+');
      r = t.op === '+' ? r + t.n : r - t.n;
      assert.ok(r >= 0, `seed=${seed}: 途中の値が負 ${r}`);
    });
    assert.equal(q.answer, r);
    assert.equal(evaluateCalc(q), r);
    assert.equal(q.choices.length, 4);
    assert.equal(new Set(q.choices).size, 4, `seed=${seed}`);
    assert.equal(q.choices.filter(c => c === q.answer).length, 1);
    assert.equal(q.choices[q.correctIndex], q.answer);
    for (const c of q.choices) {
      assert.ok(Number.isInteger(c) && c >= 0, `seed=${seed}`);
      if (c !== q.answer) assert.ok([1, 2, 10].includes(Math.abs(c - q.answer)), `seed=${seed} c=${c}`);
    }
  }
});

test('計算: 最終の答えが0以上でも、各項の途中の値が負でないことを確認する', () => {
  const q = generateCalcProblem(createRng(1), P);
  assert.ok(q.answer >= 0, `最終の答えが負 ${q.answer}`);
  let r = 0;
  q.terms.forEach((t, i) => {
    r = t.op === '+' ? r + t.n : r - t.n;
    assert.ok(r >= 0, `項${i + 1}: 途中の値が負 ${r} (最終の答え ${q.answer})`);
  });
});

test('計算: 引き算も足し算も出る、答えが0の問題でも4択を作れる', () => {
  let sawMinus = false, sawPlus = false, sawZero = false;
  for (let seed = 1; seed <= 3000; seed++) {
    const q = generateCalcProblem(createRng(seed), P);
    if (q.terms.slice(1).some(t => t.op === '-')) sawMinus = true;
    if (q.terms.slice(1).some(t => t.op === '+')) sawPlus = true;
    if (q.answer === 0) {
      sawZero = true;
      assert.deepEqual([...q.choices].sort((a, b) => a - b), [0, 1, 2, 10]);
    }
  }
  assert.ok(sawMinus && sawPlus && sawZero);
});

test('計算: 判定は選んだ選択肢の値で決まる', () => {
  const q = generateCalcProblem(createRng(3), P);
  assert.equal(judgeCalc(q, q.correctIndex), true);
  assert.equal(judgeCalc(q, (q.correctIndex + 1) % 4), false);
});

// ---- 音声の5語 ----

function counts(words) {
  const m = new Map();
  for (const w of words) m.set(w, (m.get(w) ?? 0) + 1);
  return [...m.values()].sort();
}

test('音声(シード2000種類): 5語、重複ありならちょうど1組で隣り合わない、なしなら全部違う、割合は約50%', () => {
  let dup = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const s = generateAudioSet(createRng(seed), P);
    assert.equal(s.words.length, 5);
    for (const w of s.words) assert.ok(NATO_WORDS.includes(w));
    if (s.hasDuplicate) {
      dup++;
      assert.deepEqual(counts(s.words), [1, 1, 1, 2], `seed=${seed}`);
      const w = s.words.find((x, i) => s.words.indexOf(x) !== i);
      const i1 = s.words.indexOf(w), i2 = s.words.lastIndexOf(w);
      assert.ok(i2 - i1 >= 2, `seed=${seed}: 重複が隣り合っている`);
    } else {
      assert.equal(new Set(s.words).size, 5, `seed=${seed}`);
    }
  }
  assert.ok(dup / 2000 > 0.45 && dup / 2000 < 0.55, `ratio=${dup / 2000}`);
});

test('音声: 重複の確率 0 なら出ない、1 なら必ず出る', () => {
  for (let seed = 1; seed <= 100; seed++) {
    assert.equal(generateAudioSet(createRng(seed), { ...P, duplicateRate: 0 }).hasDuplicate, false);
    assert.equal(generateAudioSet(createRng(seed), { ...P, duplicateRate: 1 }).hasDuplicate, true);
  }
});

// ---- 音声の進行 ----

const SET = { words: ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Alfa'], hasDuplicate: true };

// actions の種類だけを取り出す
const kinds = acts => acts.map(a => (a.type === 'speak' ? `speak:${a.index}` : a.type));

function begin(now = 0) {
  return startAudioSet(createAudioState(), SET, now);
}

test('進行: 開始の時刻に1語目、以後は開始から1000ms ごと(読み終わっていれば)', () => {
  const rng = createRng(1);
  let s = begin(0);
  let r = stepAudio(s, 0, P, rng);
  assert.deepEqual(kinds(r.actions), ['speak:0']);
  s = audioEnded(r.state, r.state.setSeq, 0);
  r = stepAudio(s, 999, P, rng);
  assert.deepEqual(kinds(r.actions), []);
  r = stepAudio(r.state, 1000, P, rng);
  assert.deepEqual(kinds(r.actions), ['speak:1']);
  assert.equal(r.actions[0].word, 'Bravo');
});

test('進行: 前の語を読み終えていなければ待ち、onend が来なくても打ち切り時間で次へ', () => {
  const rng = createRng(1);
  let r = stepAudio(begin(0), 0, P, rng); // 1語目(onend は来ない)
  r = stepAudio(r.state, 1000, P, rng);
  assert.deepEqual(kinds(r.actions), []);
  r = stepAudio(r.state, P.speechEndFallbackMs - 1, P, rng);
  assert.deepEqual(kinds(r.actions), []);
  r = stepAudio(r.state, P.speechEndFallbackMs, P, rng);
  assert.deepEqual(kinds(r.actions), ['speak:1']);
});

test('進行: 読み上げが止まっている(idle)なら、少し待ってから読み終わりとみなす', () => {
  const rng = createRng(1);
  let r = stepAudio(begin(0), 0, P, rng);
  r = stepAudio(r.state, 1000, P, rng, { idle: true });
  assert.deepEqual(kinds(r.actions), ['speak:1']);
  r = stepAudio(r.state, 1000 + P.speechIdleGraceMs - 1, P, rng, { idle: true });
  assert.deepEqual(kinds(r.actions), []);
});

function speakAll(now0 = 0) {
  const rng = createRng(1);
  let s = begin(now0);
  let t = now0;
  for (let k = 0; k < 5; k++) {
    t = now0 + k * 1000;
    const r = stepAudio(s, t, P, rng);
    assert.deepEqual(kinds(r.actions), [`speak:${k}`]);
    s = audioEnded(r.state, r.state.setSeq, k);
  }
  return { s, t, rng };
}

test('進行: 5語目を読み終えたら回答を受け付ける。読み上げ中の回答は無視', () => {
  const rng = createRng(1);
  let r = stepAudio(begin(0), 0, P, rng);
  const early = answerAudio(r.state, 100, true);
  assert.equal(early.accepted, false);
  const { s, t } = speakAll();
  r = stepAudio(s, t + 16, P, rng);
  assert.deepEqual(kinds(r.actions), ['enableAnswer']);
  const a = answerAudio(r.state, t + 500, true);
  assert.equal(a.accepted, true);
  assert.equal(a.correct, true);
  const again = answerAudio(a.state, t + 600, false);
  assert.equal(again.accepted, false);
});

test('進行: 回答の1000ms後に次の組を始める', () => {
  const { s, t, rng } = speakAll();
  let r = stepAudio(s, t + 16, P, rng);
  const a = answerAudio(r.state, t + 500, false);
  assert.equal(a.correct, false);
  r = stepAudio(a.state, t + 500 + 999, P, rng);
  assert.deepEqual(kinds(r.actions), []);
  r = stepAudio(r.state, t + 1500, P, rng);
  assert.deepEqual(kinds(r.actions), ['newSet', 'speak:0']);
  assert.equal(r.state.setSeq, s.setSeq + 1);
});

test('進行: 読み終えて5秒答えなければ未回答にし、1000ms後に次の組', () => {
  const { s, t, rng } = speakAll();
  let r = stepAudio(s, t + 16, P, rng);
  const end = t + 16;
  r = stepAudio(r.state, end + 4999, P, rng);
  assert.deepEqual(kinds(r.actions), []);
  r = stepAudio(r.state, end + 5000, P, rng);
  assert.deepEqual(kinds(r.actions), ['timeout']);
  assert.equal(answerAudio(r.state, end + 5100, true).accepted, false);
  r = stepAudio(r.state, end + 6000, P, rng);
  assert.deepEqual(kinds(r.actions), ['newSet', 'speak:0']);
});

test('進行: 前の組の onend は無視する', () => {
  const { s } = speakAll();
  const stale = audioEnded({ ...s, lastEnded: false }, s.setSeq - 1, 4);
  assert.equal(stale.lastEnded, false);
});

// ---- 採点 ----

test('採点: 点数は3タスクの正答数の合計、正答率は整数%(回答0なら null)', () => {
  let t = createT3Tally();
  t = recordAnswer(t, 'shape', true);
  t = recordAnswer(t, 'shape', true);
  t = recordAnswer(t, 'shape', false);
  t = recordAnswer(t, 'calc', true);
  t = recordUnanswered(t);
  const s = summarizeT3(t);
  assert.equal(s.score, 3);
  assert.deepEqual(s.detail, {
    shapeCorrect: 2, shapeAnswered: 3, shapeAccuracy: 67,
    calcCorrect: 1, calcAnswered: 1, calcAccuracy: 100,
    audioCorrect: 0, audioAnswered: 0, audioAccuracy: null, audioUnanswered: 1,
  });
});

test('採点: recordAnswer は元の集計を書き換えない', () => {
  const t0 = createT3Tally();
  recordAnswer(t0, 'audio', true);
  assert.deepEqual(t0, createT3Tally());
});

test('記録: SPEC §4 の形で、その回の T3 設定をすべて入れる', () => {
  const date = '2026-09-23T10:15:00.000Z';
  const r = buildT3Record({ date, tally: recordAnswer(createT3Tally(), 'calc', true), settings: P });
  assert.equal(r.id, `${date}-t3`);
  assert.equal(r.test, 't3');
  assert.equal(r.date, date);
  assert.equal(r.score, 1);
  assert.deepEqual(r.settings, { ...P });
  assert.notEqual(r.settings, P);
});
