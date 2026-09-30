// 計算(テスト1、内部 t1)の画面: 15問答えたら終わる(2026-09-30 本番の記憶で追加)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../js/core/settings.js';

test('15問答えたら、5分たつ前でも結果画面になり、記録は15問分', async t => {
  const make = () => ({ textContent: '', innerHTML: '', hidden: false, disabled: false, dataset: {}, handlers: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(type, fn) { this.handlers[type] = fn; }, removeEventListener() {}, focus() {}, setAttribute() {},
    append() {}, after() {}, insertAdjacentHTML() {} });
  let nodes = new Map();
  let choiceButtons = [];
  const root = {
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; nodes = new Map(); choiceButtons = [0, 1, 2, 3].map(i => Object.assign(make(), { dataset: { index: String(i) } })); },
    querySelector(sel) { if (!nodes.has(sel)) nodes.set(sel, make()); return nodes.get(sel); },
    querySelectorAll(sel) { return sel === '[data-index]' ? choiceButtons : []; },
  };
  const previous = new Map();
  let frames = 0;
  for (const [key, value] of Object.entries({
    document: { addEventListener() {}, removeEventListener() {}, activeElement: null, visibilityState: 'visible', createElement: () => make() },
    requestAnimationFrame: () => ++frames, cancelAnimationFrame() {},
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.after(() => { for (const [key, d] of previous) { if (d) Object.defineProperty(globalThis, key, d); else delete globalThis[key]; } });
  const values = new Map();
  const store = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const { mount } = await import('../js/tests/t1.js');
  const cleanup = mount(root, { settings: { ...DEFAULTS, t1: { ...DEFAULTS.t1, calculatorDuringTest: false } }, store, navigate() {} });
  root.querySelector('[data-ref="start"]').handlers.click();
  const progress = [];
  for (let i = 0; i < 15; i++) {
    assert.doesNotMatch(root.innerHTML, /class="screen result"/, `${i + 1}問目の前に終わった`);
    progress.push(root.querySelector('[data-ref="progress"]').textContent);
    choiceButtons[0].handlers.click({ currentTarget: choiceButtons[0], timeStamp: i });
  }
  assert.match(root.innerHTML, /class="screen result"/, '15問答えたら結果画面');
  assert.equal(progress[0], '単位変換 1/15');
  assert.equal(progress[5], '割合 6/15');
  assert.equal(progress[14], '計算 15/15');
  const saved = JSON.parse(values.get('apt_results'));
  const record = (saved.records ?? saved).at(-1);
  assert.equal(record.test, 't1');
  assert.equal(record.detail.answered, 15);
  cleanup();
});
