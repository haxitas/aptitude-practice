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
  // 2026-09-30 ユーザーの実機の感想で変更: 残り時間の棒は ◀ ▶ の下、スキップは「重複あり」「重複なし」の下の段
  const html = root.innerHTML;
  const at = text => html.indexOf(text);
  assert.ok(at('class="t3-dir-buttons"') >= 0 && at('class="t3-shape-timer"') > at('class="t3-dir-buttons"'), '残り時間の棒は ◀ ▶ の下');
  assert.match(html, /class="t3-shape-timer"[^>]*role="progressbar"/);
  // 2026-10-01 ユーザーの実機の感想で変更: 棒は経過時間(下から上へ増え、いっぱいで時間切れ)
  assert.match(html, /class="t3-shape-timer"[^>]*aria-label="図形の経過時間"/);
  assert.match(html, /<div class="t3-shape-timer-fill" data-ref="shapeTimerFill"><\/div>/);
  const dup = at('data-dup="no"');
  const skip = at('data-ref="skip"');
  assert.ok(dup >= 0 && skip > dup, 'スキップは重複ボタンの後');
  const between = html.slice(dup, skip);
  assert.match(between, /<\/div>\s*<div class="t3-skip-row">/, 'スキップは重複ボタンとは別の段(下)');
  cleanup();
});
