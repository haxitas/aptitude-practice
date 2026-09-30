// 同一図形(テスト3、内部 t2)の画面: 始まってすぐの押下と、スペースキーの案内(2026-09-30 ユーザーの実機の感想で追加)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../js/core/settings.js';

function setup(t) {
  const elements = new Map();
  const make = () => ({ textContent: '', hidden: true, disabled: false, innerHTML: '', handlers: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(type, fn) { this.handlers[type] = fn; }, removeEventListener() {}, focus() {}, setAttribute() {},
    replaceChildren(...c) { this.children = c; this.textContent = c.map(x => x.textContent).join(''); } });
  const root = {
    innerHTML: '',
    querySelector(sel) { if (!elements.has(sel)) elements.set(sel, make()); return elements.get(sel); },
    querySelectorAll() { return []; },
  };
  const frames = [];
  const previous = new Map();
  for (const [key, value] of Object.entries({
    document: { addEventListener() {}, removeEventListener() {}, activeElement: null, visibilityState: 'visible',
      createElement: () => make() },
    window: { addEventListener() {}, removeEventListener() {} },
    requestAnimationFrame: cb => { frames.push(cb); return frames.length; }, cancelAnimationFrame() {},
    performance: { now: () => 5000 },
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.after(() => { for (const [key, d] of previous) { if (d) Object.defineProperty(globalThis, key, d); else delete globalThis[key]; } });
  return { root, elements, frames };
}

test('開始のタップの直後(最初のフレームより前)に押しても、押下を受け付ける', async t => {
  const { root, frames } = setup(t);
  const { mount } = await import('../js/tests/t2.js');
  const cleanup = mount(root, { settings: DEFAULTS, store: null, navigate() {} });
  root.querySelector('[data-ref="start"]').handlers.click();
  assert.equal(frames.length, 1, 'まだ最初のフレームは来ていない');
  const same = root.querySelector('[data-ref="same"]');
  same.handlers.pointerdown({ preventDefault() {}, timeStamp: 5010 });
  const feedback = root.querySelector('[data-ref="feedback"]');
  assert.equal(feedback.textContent, '× 一致していません', '最初の表示は一致しないので誤押しとして受け付ける');
  cleanup();
});

test('「同じ」ボタンのすぐ下に「スペースキーでも押せます(本番では使えません)」と出す', async t => {
  const { root } = setup(t);
  const { mount } = await import('../js/tests/t2.js');
  const cleanup = mount(root, { settings: DEFAULTS, store: null, navigate() {} });
  root.querySelector('[data-ref="start"]').handlers.click();
  const html = root.innerHTML;
  const button = html.indexOf('data-ref="same"');
  const hint = html.indexOf('スペースキーでも押せます(本番では使えません)');
  assert.ok(button >= 0 && hint > button, '案内はボタンの後ろ(中かすぐ下)');
  assert.match(html.slice(button, hint + 40), /class="t2-space-hint"/);
  cleanup();
});
