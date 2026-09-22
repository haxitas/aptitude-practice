// テスト3 マルチタスク: 図形・計算・音声の問題の生成、判定、音声タスクの進行、採点。DOM に触れない。
import { randInt, shuffle } from '../core/rng.js';

// SPEC §6 の26語(綴りは SPEC のとおり)
export const NATO_WORDS = Object.freeze([
  'Alfa', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett',
  'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango',
  'Uniform', 'Victor', 'Whiskey', 'X-ray', 'Yankee', 'Zulu',
]);

// ---- 声の選び方 ----

// 読み上げに向かない、おもしろ系の声(macOS / iOS の英語の声)
export const NOVELTY_VOICE_NAMES = Object.freeze([
  'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Deranged', 'Good News',
  'Hysterical', 'Jester', 'Organ', 'Pipe Organ', 'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox',
]);

function normLang(lang) {
  return String(lang ?? '').replace(/_/g, '-').toLowerCase();
}

function isNovelty(voice) {
  const name = String(voice.name ?? '').toLowerCase();
  return NOVELTY_VOICE_NAMES.some(n => {
    const x = n.toLowerCase();
    return name === x || name.startsWith(`${x} `) || name.startsWith(`${x}(`);
  });
}

// { voice, rank }。rank: 1=en-US の既定の声 2=en-US(おもしろ系を除く、localService 優先)
// 3=ほかの en-* の声 4=声を指定しない(lang だけ付ける)
export function pickVoice(voices, lang) {
  const want = normLang(lang);
  const list = Array.from(voices ?? []);
  const exact = list.filter(v => normLang(v.lang) === want);
  const def = exact.find(v => v.default);
  if (def) return { voice: def, rank: 1 };
  const normal = exact.filter(v => !isNovelty(v));
  const local = normal.find(v => v.localService);
  if (local) return { voice: local, rank: 2 };
  if (normal.length) return { voice: normal[0], rank: 2 };
  const base = want.split('-')[0];
  const other = list.filter(v => !isNovelty(v) && normLang(v.lang).split('-')[0] === base);
  if (other.length) return { voice: other.find(v => v.localService) ?? other[0], rank: 3 };
  return { voice: null, rank: 4 };
}

// ---- 図形問題 ----

export const SHAPE_KINDS = Object.freeze(['circle', 'cross', 'square', 'triangle']);

function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  return arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map(p => [x, ...p]));
}
const ORDERS = permutations(SHAPE_KINDS);
const LAYOUTS = ORDERS.flatMap(order => ['left', 'right'].map(dir => ({ order, dir })));

// { items: [{ kind, dir?, tiltDeg? } ×4], answer: 'left'|'right' }
// 直前の問題と同じ並び・同じ向きのものは候補から外す(答えたことが見て分かるように)
export function generateShapeProblem(rng, p, prev) {
  const cands = prev
    ? LAYOUTS.filter(l => !(l.dir === prev.answer && l.order.every((k, i) => k === prev.items[i].kind)))
    : LAYOUTS;
  const { order, dir } = cands[Math.floor(rng() * cands.length)];
  const tiltDeg = (rng() * 2 - 1) * p.triangleTiltMaxDeg;
  const items = order.map(kind => (kind === 'triangle' ? { kind, dir, tiltDeg } : { kind }));
  return { items, answer: dir };
}

export function judgeShape(problem, answer) {
  return answer === problem.answer;
}

// ---- 計算問題 ----

// { terms: [{ op: '+'|'-', n } ×4](先頭は '+'), answer, choices: [4], correctIndex }
export function generateCalcProblem(rng, p) {
  const terms = [{ op: '+', n: randInt(rng, p.calcTermMin, p.calcTermMax) }];
  let r = terms[0].n;
  for (let i = 1; i < p.calcTermCount; i++) {
    // 引き算は、途中の値が負にならないときだけ選べる
    const canSubtract = r >= p.calcTermMin;
    if (canSubtract && rng() < p.calcSubtractRate) {
      const n = randInt(rng, p.calcTermMin, Math.min(p.calcTermMax, r));
      terms.push({ op: '-', n });
      r -= n;
    } else {
      const n = randInt(rng, p.calcTermMin, p.calcTermMax);
      terms.push({ op: '+', n });
      r += n;
    }
  }
  const answer = r;
  const cands = [...new Set(p.calcDistractorOffsets.flatMap(o => [answer + o, answer - o]))]
    .filter(c => c >= 0 && c !== answer);
  if (cands.length < 3) throw new Error('テスト3の設定が不正です: 誤答の候補が3つ未満です(calcDistractorOffsets)');
  const choices = shuffle(rng, [answer, ...shuffle(rng, cands).slice(0, 3)]);
  return { terms, answer, choices, correctIndex: choices.indexOf(answer) };
}

export function evaluateCalc(problem) {
  return problem.terms.reduce((r, t) => (t.op === '+' ? r + t.n : r - t.n), 0);
}

export function judgeCalc(problem, choiceIndex) {
  return problem.choices[choiceIndex] === problem.answer;
}

// 表示用の式(例: 13 + 8 − 4 + 2)
export function formatCalc(problem) {
  return problem.terms.map((t, i) => (i === 0 ? `${t.n}` : `${t.op === '+' ? '+' : '−'} ${t.n}`)).join(' ');
}

// ---- 音声の5語 ----

// { words: [5], hasDuplicate }。重複ありなら、ちょうど1組を隣り合わない位置に置く
export function generateAudioSet(rng, p) {
  const count = p.speechWordCount;
  if (rng() < p.duplicateRate && count >= 3) {
    const distinct = shuffle(rng, NATO_WORDS).slice(0, count - 1);
    const [dupWord, ...rest] = distinct;
    const pairs = [];
    for (let i = 0; i < count; i++) for (let j = i + 2; j < count; j++) pairs.push([i, j]);
    const [i, j] = pairs[Math.floor(rng() * pairs.length)];
    const words = new Array(count);
    words[i] = dupWord;
    words[j] = dupWord;
    let k = 0;
    for (let x = 0; x < count; x++) if (words[x] === undefined) words[x] = rest[k++];
    return { words, hasDuplicate: true };
  }
  return { words: shuffle(rng, NATO_WORDS).slice(0, count), hasDuplicate: false };
}

// ---- 音声タスクの進行 ----
// 状態は毎フレーム stepAudio で進める。時刻はすべて performance.now() の基準。
// phase: 'speaking'(読み上げ中)→ 'answering'(回答待ち)→ 'waiting'(次の組までの待ち)

export function createAudioState() {
  return { phase: 'idle', setSeq: 0, set: null };
}

export function startAudioSet(state, set, now) {
  return {
    phase: 'speaking', setSeq: state.setSeq + 1, set, setStart: now,
    nextWord: 0, lastSpeakAt: null, lastEnded: true, answerDeadline: null, waitFrom: null,
  };
}

// その組の index 語目の onend(前の組のものは無視する)
export function audioEnded(state, setSeq, index) {
  if (setSeq !== state.setSeq || index !== state.nextWord - 1) return state;
  return { ...state, lastEnded: true };
}

function lastWordDone(s, now, p, idle) {
  if (s.lastSpeakAt === null || s.lastEnded) return true;
  if (now - s.lastSpeakAt >= p.speechEndFallbackMs) return true;
  return idle && now - s.lastSpeakAt >= p.speechIdleGraceMs;
}

// { state, actions }。actions: {type:'speak', index, word} / 'enableAnswer' / 'timeout' / {type:'newSet', set}
export function stepAudio(state, now, p, rng, { idle = false } = {}) {
  let s = state;
  const actions = [];
  if (s.phase === 'waiting' && now >= s.waitFrom + p.speechNextDelayMs) {
    const set = generateAudioSet(rng, p);
    s = startAudioSet(s, set, now);
    actions.push({ type: 'newSet', set });
  }
  if (s.phase === 'speaking') {
    const count = s.set.words.length;
    if (s.nextWord < count) {
      if (now >= s.setStart + s.nextWord * p.speechIntervalMs && lastWordDone(s, now, p, idle)) {
        actions.push({ type: 'speak', index: s.nextWord, word: s.set.words[s.nextWord] });
        s = { ...s, nextWord: s.nextWord + 1, lastSpeakAt: now, lastEnded: false };
      }
    } else if (lastWordDone(s, now, p, idle)) {
      s = { ...s, phase: 'answering', answerDeadline: now + p.speechAnswerLimitMs };
      actions.push({ type: 'enableAnswer' });
    }
  } else if (s.phase === 'answering' && now >= s.answerDeadline) {
    s = { ...s, phase: 'waiting', waitFrom: now };
    actions.push({ type: 'timeout' });
  }
  return { state: s, actions };
}

// 回答待ちのときだけ受け付ける。{ accepted, correct?, state }
// 次の組は、回答の speechNextDelayMs 後に stepAudio が始める
export function answerAudio(state, now, saysDuplicate) {
  if (state.phase !== 'answering') return { accepted: false, state };
  return {
    accepted: true,
    correct: saysDuplicate === state.set.hasDuplicate,
    state: { ...state, phase: 'waiting', waitFrom: now },
  };
}

// ---- 採点 ----

export function createT3Tally() {
  return {
    shape: { correct: 0, answered: 0 },
    calc: { correct: 0, answered: 0 },
    audio: { correct: 0, answered: 0, unanswered: 0 },
  };
}

export function recordAnswer(tally, task, correct) {
  const t = { ...tally, [task]: { ...tally[task] } };
  t[task].answered++;
  if (correct) t[task].correct++;
  return t;
}

export function recordUnanswered(tally) {
  return { ...tally, audio: { ...tally.audio, unanswered: tally.audio.unanswered + 1 } };
}

function accuracy({ correct, answered }) {
  return answered ? Math.round((correct * 100) / answered) : null;
}

// 点数 = 3タスクの正答数の合計
export function summarizeT3(tally) {
  const { shape, calc, audio } = tally;
  return {
    score: shape.correct + calc.correct + audio.correct,
    detail: {
      shapeCorrect: shape.correct, shapeAnswered: shape.answered, shapeAccuracy: accuracy(shape),
      calcCorrect: calc.correct, calcAnswered: calc.answered, calcAccuracy: accuracy(calc),
      audioCorrect: audio.correct, audioAnswered: audio.answered, audioAccuracy: accuracy(audio),
      audioUnanswered: audio.unanswered,
    },
  };
}

export function buildT3Record({ date, tally, settings }) {
  const { score, detail } = summarizeT3(tally);
  return { id: `${date}-t3`, test: 't3', date, score, detail, settings: { ...settings } };
}
