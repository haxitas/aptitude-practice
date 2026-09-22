import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../js/core/settings.js';

test('開始画面の余白タップの処理中に最初のspeakを呼ぶ(縦横ガードなし)', async t => {
  const elements = new Map(), listeners = new Map(), calls = [];
  let insideTap = false;
  const element = () => ({ textContent: '', hidden: true, disabled: false,
    addEventListener() {}, removeEventListener() {}, focus() {}, classList: { add() {}, remove() {} } });
  const root = {
    innerHTML: '',
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, element());
      return elements.get(selector);
    },
    querySelectorAll(selector) { return Array.from({ length: selector === '[data-idx]' ? 4 : 2 }, element); },
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const previous = new Map();
  for (const [key, value] of Object.entries({
    speechSynthesis: { cancel() {}, getVoices: () => [], addEventListener() {}, removeEventListener() {},
      speak(u) { calls.push({ insideTap, word: u.text }); } },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    document: { addEventListener() {}, removeEventListener() {}, activeElement: null },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.after(() => { for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  } });
  const { mount } = await import('../js/tests/t3.js');
  const cleanup = mount(root, { settings: DEFAULTS });
  assert.equal(calls.length, 0);
  insideTap = true;
  listeners.get('click')({ target: { closest: () => null } });
  insideTap = false;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].insideTap, true);
  assert.ok(calls[0].word.length > 0);
  assert.equal(listeners.has('click'), false, '本番では開始リスナーを解除');
  cleanup();
});
