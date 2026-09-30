import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { DEFAULTS } from '../js/core/settings.js';
import {
  DIRECTIONS, solutionFor, generateT4Problem,
  createT4Example,
  createT4Selection, selectT4Position, selectT4Heading, canSubmitT4,
  judgeT4, createT4Tally, recordT4Answer, summarizeT4, buildT4Record,
  gyroNorthNeedleDeg, headingFromGyroNeedle, rbiNeedleDeg, rbiReading, planeRotationDeg,
  createT4Practice, answerT4Practice, advanceT4Practice, explainT4Solution,
} from '../js/logic/t4.js';
import { findTest, formatDetail } from '../js/core/catalog.js';
import { gyroSvg, rbiSvg, planeSvg, mount } from '../js/tests/t4.js';
import { t4Feedback } from '../js/logic/t4.js';

const P = DEFAULTS.t4;

// ---- GYRO と RBI(2026-09-30 本番に合わせて変更) ----

test('例題は機首NE・RBI 9(右90°)・自機NWのマス・向きNE', () => {
  const example = createT4Example();
  assert.deepEqual(example.problem, { headingIndex: 1, relativeIndex: 2 });
  assert.deepEqual(example.selection, { position: 'NW', heading: 'NE' });
  assert.equal(judgeT4(example.problem, example.selection).correct, true);
});

// 2026-10-01 ユーザーの本番の記憶で確定: GYRO は文字盤が固定で上が機首。赤い針が北を指す
test('GYRO: 赤い針は北を指す。機首 N なら上、E なら左、S なら下、W なら右(機首から見て反時計回りに機首の方位だけ)', () => {
  assert.equal(gyroNorthNeedleDeg(0), 0, 'N: 上');
  assert.equal(gyroNorthNeedleDeg(2), 270, 'E: 左');
  assert.equal(gyroNorthNeedleDeg(4), 180, 'S: 下');
  assert.equal(gyroNorthNeedleDeg(6), 90, 'W: 右');
  assert.equal(gyroNorthNeedleDeg(1), 315, 'NE: 左上');
  for (let i = 0; i < 8; i++) assert.equal(gyroNorthNeedleDeg(i), (360 - i * 45) % 360);
  assert.throws(() => gyroNorthNeedleDeg(8));
});

test('GYRO: 赤い針の向きから機首の向きを逆算でき、正解の向きと一致する(正解の計算は変わらない)', () => {
  for (let h = 0; h < 8; h++) {
    assert.equal(headingFromGyroNeedle(gyroNorthNeedleDeg(h)), DIRECTIONS[h].key);
    for (let r = 0; r < 8; r++) assert.equal(headingFromGyroNeedle(gyroNorthNeedleDeg(h)), solutionFor(h, r).heading);
  }
  assert.equal(headingFromGyroNeedle(270), 'E', '針が左なら機首は E');
  assert.equal(headingFromGyroNeedle(90), 'W', '針が右なら機首は W');
});

test('GYRO の絵: 文字盤(45°ごとの目盛り8本)は固定で回さない。上に機首の印、中央に上向きの飛行機。赤い針が北を指す', () => {
  const fixed = svg => svg.replace(/<g class="t4-gyro-needle"[\s\S]*?<\/g>/, '');
  for (let i = 0; i < 8; i++) {
    const svg = gyroSvg(i);
    assert.doesNotMatch(svg, /t4-gyro-card/, '回る文字盤はない');
    const needle = svg.match(/<g class="t4-gyro-needle" transform="rotate\(([-\d.]+) 100 100\)">([\s\S]*?)<\/g>/);
    assert.ok(needle, svg);
    assert.equal(Number(needle[1]), gyroNorthNeedleDeg(i));
    // 回す前の赤い半分は上(北)向き、白い半分は下
    const red = needle[2].match(/class="t4-gyro-north" points="([^"]+)"/);
    const pale = needle[2].match(/class="t4-gyro-south" points="([^"]+)"/);
    assert.ok(red && pale, needle[2]);
    const ys = pts => pts.split(' ').map(p => Number(p.split(',')[1]));
    assert.ok(Math.min(...ys(red[1])) < 60 && Math.max(...ys(red[1])) <= 100, '赤は上半分');
    assert.ok(Math.min(...ys(pale[1])) >= 100, '白は下半分');
    // 目盛り・機首の印・飛行機は回る針の外で、機首の向きによらず同じ
    assert.equal(fixed(svg), fixed(gyroSvg(0)));
    assert.equal((svg.match(/class="t4-gyro-tick"/g) ?? []).length, 8);
    assert.match(fixed(svg), /class="t4-lubber"/);
    assert.match(fixed(svg), /class="t4-gyro-plane"/);
    assert.doesNotMatch(svg, />[NESW]<\/text>/, '固定の文字盤に N・E・S・W は書かない(上が北に見えないように)');
    assert.match(svg, /aria-label="GYRO"/);
  }
});

test('RBI: 針の角度は相対方位、読みは相対方位÷10(例題は 9)', () => {
  for (let i = 0; i < 8; i++) assert.equal(rbiNeedleDeg(i), i * 45);
  assert.equal(rbiReading(2), '9');
  assert.equal(rbiReading(0), '0');
  assert.equal(rbiReading(1), '4.5');
  assert.equal(rbiReading(6), '27');
});

test('RBI の絵: 0 が上に固定の文字盤、数字は 0・3・…・33、目盛りは10°ごと(30°ごとに長く)、青い針が相対方位', () => {
  const svg = rbiSvg(2);
  const numbers = [...svg.matchAll(/<text[^>]*class="t4-rbi-number"[^>]*>(\d+)<\/text>/g)].map(m => m[1]);
  assert.deepEqual(numbers, ['0', '3', '6', '9', '12', '15', '18', '21', '24', '27', '30', '33']);
  assert.equal((svg.match(/class="t4-rbi-tick"/g) ?? []).length, 36 - 12);
  assert.equal((svg.match(/class="t4-rbi-tick is-long"/g) ?? []).length, 12);
  assert.match(svg, /<g class="t4-rbi-needle" transform="rotate\(90 100 100\)">/);
  assert.match(svg, /aria-label="RBI"/);
  // 文字盤は回らない(針の角度が変わっても数字の位置は同じ)
  const positions = s => [...s.matchAll(/<text x="([^"]+)" y="([^"]+)"[^>]*class="t4-rbi-number"/g)].map(m => `${m[1]},${m[2]}`);
  assert.deepEqual(positions(rbiSvg(5)), positions(svg));
});

test('飛行機SVGの機首は上が0度で、8方位に45度刻みで回る', () => {
  assert.equal(planeRotationDeg('N'), 0);
  for (let i = 0; i < 8; i++) {
    const heading = DIRECTIONS[i].key;
    assert.equal(planeRotationDeg(heading), i * 45);
    const svg = planeSvg(heading);
    assert.match(svg, new RegExp(`rotate\\(${i * 45}deg\\)`));
    assert.match(svg, /<svg[^>]*class="t4-plane"/);
    assert.match(svg, /<path\b/);
    assert.doesNotMatch(svg, /✈/);
  }
  assert.throws(() => planeRotationDeg('BAD'));
});

test('練習は回答→解説→次問を3回繰り返して終了し、やり直しで最初に戻る', () => {
  const rng = createRng(81);
  let state = createT4Practice(rng);
  let lastProblem;
  for (let i = 0; i < 3; i++) {
    assert.equal(state.phase, 'question');
    assert.equal(state.index, i);
    const previous = state.problem;
    lastProblem = previous;
    state = answerT4Practice(state, { position: 'N', heading: 'N' });
    assert.equal(state.phase, 'explanation');
    assert.equal(state.answers.length, i + 1);
    assert.deepEqual(state.problem, previous);
    state = advanceT4Practice(state, rng);
    if (i < 2) assert.notDeepEqual(state.problem, previous);
  }
  assert.equal(state.phase, 'complete');
  assert.equal(state.answers.length, 3);
  assert.deepEqual(state.lastProblem, lastProblem);
  const again = createT4Practice(createRng(82), state.lastProblem);
  assert.equal(again.index, 0);
  assert.equal(again.answers.length, 0);
  assert.equal(again.phase, 'question');
  assert.notDeepEqual(again.problem, state.lastProblem);
  const afterExample = createT4Practice(() => 0, createT4Example().problem);
  assert.notDeepEqual(afterExample.problem, createT4Example().problem);
});

test('解説は GYRO と RBI の読み方で書く(例題の文)', () => {
  assert.deepEqual(explainT4Solution({ headingIndex: 1, relativeIndex: 2 }), [
    '1. GYRO の赤い針が北 → 北は機首から見て左45° → 機首は NE',
    '2. RBI の針は 9(機首の右)→ NDB は NE の右90° = SE',
    '3. 自機は NDB の反対の NW のマス。向きは機首のまま NE',
  ]);
});

test('解説: RBI の8方向の言い方と、NDB と自機のマスは正解の計算と一致する', () => {
  const where = ['機首の方向', '機首の右前', '機首の右', '機首の右後ろ', '機首の真後ろ', '機首の左後ろ', '機首の左', '機首の左前'];
  const turn = ['正面', '右45°', '右90°', '右135°', '真後ろ', '左135°', '左90°', '左45°'];
  for (let h = 0; h < 8; h++) for (let r = 0; r < 8; r++) {
    const lines = explainT4Solution({ headingIndex: h, relativeIndex: r });
    const { towerDirection, position, heading } = solutionFor(h, r);
    assert.equal(lines[0], `1. GYRO の赤い針が北 → 北は機首から見て${turn[gyroNorthNeedleDeg(h) / 45]} → 機首は ${heading}`);
    assert.equal(lines[1], `2. RBI の針は ${rbiReading(r)}(${where[r]})→ NDB は ${heading} の${turn[r]} = ${DIRECTIONS[towerDirection].key}`);
    assert.equal(lines[2], `3. 自機は NDB の反対の ${position} のマス。向きは機首のまま ${heading}`);
    for (const line of lines) assert.doesNotMatch(line, /塔|ADF|コンパス/);
  }
});

test('T4 の既定値は承認済みの数値(compassMode は廃止。機首の向きは4方向)', () => {
  assert.deepEqual(P, { durationSec: 180, answerFeedbackMs: 300, headingDirections: 4 });
});

// ---- 機首の向きの数(2026-09-30 本番の記憶で追加) ----

test('機首の向きが4のとき: 問題の機首は N・E・S・W だけで、多数のシードで4つとも出る。RBI は8方向のまま', () => {
  const rng = createRng(404);
  const headings = new Set();
  const relatives = new Set();
  let previous = null;
  for (let i = 0; i < 2000; i++) {
    const q = generateT4Problem(rng, previous, 4);
    headings.add(DIRECTIONS[q.headingIndex].key);
    relatives.add(q.relativeIndex);
    if (previous) assert.notDeepEqual(q, previous);
    previous = q;
  }
  assert.deepEqual([...headings].sort(), ['E', 'N', 'S', 'W']);
  assert.deepEqual([...relatives].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('機首の向きが8のとき: 今までどおり8方向すべてが出る', () => {
  const rng = createRng(808);
  const headings = new Set();
  for (let i = 0; i < 2000; i++) headings.add(generateT4Problem(rng, null, 8).headingIndex);
  assert.equal(headings.size, 8);
  assert.equal(generateT4Problem.length >= 1, true);
});

test('機首の向きが4でも正解の計算は変わらない', () => {
  for (const h of [0, 2, 4, 6]) for (let r = 0; r < 8; r++) {
    const t = (h + r) % 8;
    assert.deepEqual(solutionFor(h, r), { towerDirection: t, position: DIRECTIONS[(t + 4) % 8].key, heading: DIRECTIONS[h].key });
  }
});

test('機首の向きが4のとき: 練習問題も N・E・S・W だけ。例題は機首 E・RBI 9・自機 N のマス・向き E', () => {
  const rng = createRng(12);
  let state = createT4Practice(rng, null, 4);
  for (let i = 0; i < 3; i++) {
    assert.ok([0, 2, 4, 6].includes(state.problem.headingIndex), JSON.stringify(state.problem));
    state = answerT4Practice(state, { position: 'N', heading: 'N' });
    state = advanceT4Practice(state, rng);
  }
  const example = createT4Example(4);
  assert.deepEqual(example.problem, { headingIndex: 2, relativeIndex: 2 });
  assert.deepEqual(example.selection, { position: 'N', heading: 'E' });
  assert.deepEqual(explainT4Solution(example.problem), [
    '1. GYRO の赤い針が北 → 北は機首から見て左90° → 機首は E',
    '2. RBI の針は 9(機首の右)→ NDB は E の右90° = S',
    '3. 自機は NDB の反対の N のマス。向きは機首のまま E',
  ]);
  assert.deepEqual(createT4Example(8).problem, { headingIndex: 1, relativeIndex: 2 }, '8 のときの例題は今のまま');
});

test('向きの回答ボタンは、4のとき N・E・S・W の4つ、8のとき8つ', () => {
  for (const [n, expected] of [[4, ['N', 'E', 'S', 'W']], [8, DIRECTIONS.map(d => d.key)]]) {
    const created = [];
    const make = () => ({ textContent: '', innerHTML: '', className: '', dataset: {}, classList: { add() {}, toggle() {}, remove() {} },
      append() {}, setAttribute() {}, addEventListener() {}, focus() {} });
    const nodes = new Map();
    const root = { innerHTML: '', querySelector(sel) { if (!nodes.has(sel)) nodes.set(sel, make()); return nodes.get(sel); }, querySelectorAll() { return []; } };
    const previous = globalThis.document;
    globalThis.document = { createElement: () => { const node = make(); created.push(node); return node; }, addEventListener() {}, removeEventListener() {} };
    try {
      const cleanup = mount(root, { settings: { t4: { ...P, headingDirections: n }, common: DEFAULTS.common }, store: null, navigate() {} });
      assert.deepEqual(created.filter(node => node.dataset.heading).map(node => node.dataset.heading), expected, `${n}方向`);
      cleanup();
    } finally {
      globalThis.document = previous;
    }
  }
});

test('compassMode がなくなっても正解の計算は変わらない(古い設定が残っていても同じ)', () => {
  const expected = [];
  for (let h = 0; h < 8; h++) for (let r = 0; r < 8; r++) {
    const t = (h + r) % 8;
    expected.push({ towerDirection: t, position: DIRECTIONS[(t + 4) % 8].key, heading: DIRECTIONS[h].key });
  }
  const got = [];
  for (let h = 0; h < 8; h++) for (let r = 0; r < 8; r++) got.push(solutionFor(h, r));
  assert.deepEqual(got, expected);
  assert.equal(solutionFor.length, 2);
  assert.equal(explainT4Solution({ headingIndex: 1, relativeIndex: 2 }, 'northUp')[0], explainT4Solution({ headingIndex: 1, relativeIndex: 2 })[0]);
});

test('画面の文言: 計器は GYRO と RBI、中央は NDB(「塔」は使わない)', () => {
  const nodes = new Map();
  const make = () => ({ textContent: '', innerHTML: '', className: '', dataset: {}, classList: { add() {}, toggle() {}, remove() {} },
    append() {}, setAttribute() {}, addEventListener() {}, focus() {} });
  const root = { innerHTML: '', querySelector(sel) { if (!nodes.has(sel)) nodes.set(sel, make()); return nodes.get(sel); }, querySelectorAll() { return []; } };
  const created = [];
  const previous = globalThis.document;
  globalThis.document = { createElement: () => { const n = make(); created.push(n); return n; }, addEventListener() {}, removeEventListener() {} };
  try {
    const cleanup = mount(root, { settings: { t4: P, common: DEFAULTS.common }, store: null, navigate() {} });
    const html = root.innerHTML + nodes.get('[data-ref="exampleSteps"]').textContent + created.map(n => n.textContent).join('');
    assert.match(html, /<figcaption>GYRO<\/figcaption>/);
    assert.match(html, /<figcaption>RBI<\/figcaption>/);
    assert.ok(html.includes('自機の位置(中央が NDB)'), '解答欄の見出し');
    assert.ok(created.some(n => n.textContent === 'NDB'), '解答欄の中央は NDB');
    assert.doesNotMatch(html, /塔|コンパス|ADF/);
    cleanup();
  } finally {
    globalThis.document = previous;
  }
});

test('方位は N から時計回りの8方向', () => {
  assert.deepEqual(DIRECTIONS.map(d => d.key), ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
  assert.equal(new Set(DIRECTIONS.map(d => `${d.row},${d.col}`)).size, 8);
});

test('検証例1: 機首N・針が右なら自機は西のマス・向きN', () => {
  assert.deepEqual(solutionFor(0, 2), { towerDirection: 2, position: 'W', heading: 'N' });
});

test('検証例2: 機首W・針が真上なら自機は東のマス・向きW', () => {
  assert.deepEqual(solutionFor(6, 0), { towerDirection: 6, position: 'E', heading: 'W' });
});

test('8方位×8相対方向の64通りを式と照合する', () => {
  for (let heading = 0; heading < 8; heading++) {
    for (let relative = 0; relative < 8; relative++) {
      const got = solutionFor(heading, relative);
      const towerDirection = (heading + relative) % 8;
      assert.equal(got.towerDirection, towerDirection);
      assert.equal(got.position, DIRECTIONS[(towerDirection + 4) % 8].key);
      assert.equal(got.heading, DIRECTIONS[heading].key);
    }
  }
});

test('問題生成は64通りを使い、直前と同じ問題を出さない', () => {
  const rng = createRng(44);
  let prev = null;
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    const q = generateT4Problem(rng, prev);
    assert.ok(q.headingIndex >= 0 && q.headingIndex < 8);
    assert.ok(q.relativeIndex >= 0 && q.relativeIndex < 8);
    if (prev) assert.notDeepEqual([q.headingIndex, q.relativeIndex], [prev.headingIndex, prev.relativeIndex]);
    seen.add(`${q.headingIndex},${q.relativeIndex}`);
    prev = q;
  }
  assert.equal(seen.size, 64);
});

test('マス・向きは選び直せ、両方がそろうまで決定できない', () => {
  const empty = createT4Selection();
  assert.equal(canSubmitT4(empty), false);
  const position = selectT4Position(empty, 'W');
  assert.equal(canSubmitT4(position), false);
  const changed = selectT4Position(position, 'E');
  assert.equal(changed.position, 'E');
  const complete = selectT4Heading(changed, 'N');
  assert.equal(canSubmitT4(complete), true);
  assert.equal(selectT4Heading(complete, 'SW').heading, 'SW');
});

test('中央の NDB や不明な方位は選択できない', () => {
  assert.throws(() => selectT4Position(createT4Selection(), 'CENTER'));
  assert.throws(() => selectT4Heading(createT4Selection(), 'north'));
});

test('位置と向きを別々に判定する', () => {
  const q = { headingIndex: 0, relativeIndex: 2 };
  assert.deepEqual(judgeT4(q, { position: 'W', heading: 'N' }), { positionCorrect: true, headingCorrect: true, correct: true });
  assert.deepEqual(judgeT4(q, { position: 'W', heading: 'S' }), { positionCorrect: true, headingCorrect: false, correct: false });
  assert.deepEqual(judgeT4(q, { position: 'E', heading: 'N' }), { positionCorrect: false, headingCorrect: true, correct: false });
});

test('採点は両方正解だけ、内訳は位置だけ・向きだけ', () => {
  let tally = createT4Tally();
  tally = recordT4Answer(tally, { positionCorrect: true, headingCorrect: true, correct: true });
  tally = recordT4Answer(tally, { positionCorrect: true, headingCorrect: false, correct: false });
  tally = recordT4Answer(tally, { positionCorrect: false, headingCorrect: true, correct: false });
  tally = recordT4Answer(tally, { positionCorrect: false, headingCorrect: false, correct: false });
  assert.deepEqual(summarizeT4(tally), {
    score: 1,
    detail: { answered: 4, correct: 1, positionOnlyCorrect: 1, headingOnlyCorrect: 1 },
  });
});

test('記録はSPEC §4の形で、その回の設定を複製する', () => {
  const date = '2026-09-23T10:15:00.000Z';
  const tally = { correct: 2, answered: 4, positionOnlyCorrect: 1, headingOnlyCorrect: 1 };
  const record = buildT4Record({ date, tally, settings: P });
  assert.deepEqual(record, {
    id: `${date}-t4`, test: 't4', date, score: 2,
    detail: { answered: 4, correct: 2, positionOnlyCorrect: 1, headingOnlyCorrect: 1 },
    settings: { durationSec: 180, answerFeedbackMs: 300, headingDirections: 4 },
  });
  assert.notEqual(record.settings, P);
});

test('結果と履歴のT4内訳は4列で、古い記録の正答数は—', () => {
  const fields = findTest('t4').details;
  assert.deepEqual(fields.map(field => field.label), ['回答数', '正答数', '位置だけ正解', '向きだけ正解']);
  assert.equal(formatDetail(fields[1], undefined), '—');
});

// ---- 即時判定 ----

test('即時判定: 位置・向きとも正解なら1行だけ', () => {
  // 機首N・針が右 → 自機は西のマス・向きN
  const problem = { headingIndex: 0, relativeIndex: 2 };
  assert.deepEqual(t4Feedback(problem, { position: 'W', heading: 'N' }), { kind: 'correct', text: '○ 位置・向きとも正解' });
});

test('即時判定: 不正解は位置と向きの○×と、正しいマス・向きを返す', () => {
  const problem = { headingIndex: 0, relativeIndex: 2 };
  assert.deepEqual(t4Feedback(problem, { position: 'W', heading: 'S' }),
    { kind: 'wrong', text: '位置 ○ ・ 向き ×', solution: { position: 'W', heading: 'N' } });
  assert.deepEqual(t4Feedback(problem, { position: 'E', heading: 'N' }),
    { kind: 'wrong', text: '位置 × ・ 向き ○', solution: { position: 'W', heading: 'N' } });
  assert.deepEqual(t4Feedback(problem, { position: 'E', heading: 'S' }),
    { kind: 'wrong', text: '位置 × ・ 向き ×', solution: { position: 'W', heading: 'N' } });
});
