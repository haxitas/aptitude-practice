// ハッシュルーティングとメニュー。
// 画面を切り替えるときは、前の画面の後片付け(タイマー停止・キー入力の解除)を必ず呼ぶ。

import { TESTS, findTest } from './core/catalog.js';
import { defaultStore, readResults, readSettingsRaw, saveSettings } from './core/storage.js';
import { loadSettings } from './core/settings.js';
import { summarize } from './core/stats.js';
import { withInstantFeedback } from './logic/settings-form.js';
import * as t1 from './tests/t1.js';
import * as t2 from './tests/t2.js';
import * as t3 from './tests/t3.js';
import * as t4 from './tests/t4.js';
import * as t5 from './tests/t5.js';
import * as t6 from './tests/t6.js';
import * as history from './history.js';
import * as settingsScreen from './settings.js';
import * as calculatorScreen from './calculator.js';

const SCREENS = { t1, t2, t3, t4, t5, t6 };

const root = document.getElementById('app');
const store = defaultStore();
let cleanup = null;
let flash = null; // 次に出すメニューで1回だけ表示する知らせ

function navigate(hash, notice) {
  flash = notice ?? null;
  if (location.hash === hash) render();
  else location.hash = hash;
}

function addNotice(container, text, kind) {
  const p = document.createElement('p');
  p.className = `notice notice-${kind}`;
  p.textContent = text;
  container.append(p);
}

function renderMenu(settingsInfo) {
  root.innerHTML = `
    <section class="screen menu">
      <h1>適性検査 練習</h1>
      <div data-ref="notices"></div>
      <div class="instant-toggle-row">
        <label class="instant-toggle">
          <input type="checkbox" role="switch" data-ref="instant">
          <span class="instant-toggle-track" aria-hidden="true"></span>
          <span class="instant-toggle-label">即時判定</span>
        </label>
        <span class="muted small" data-ref="instantHint"></span>
      </div>
      <p class="notice notice-error" data-ref="instantError" hidden></p>
      <nav class="menu-grid" data-ref="grid"></nav>
      <div class="menu-sub">
        <a class="btn" href="#/history">履歴</a>
        <a class="btn" href="#/settings">設定</a>
      </div>
    </section>`;
  const $ = name => root.querySelector(`[data-ref="${name}"]`);
  const notices = $('notices');

  if (flash) addNotice(notices, flash, 'info');
  if (settingsInfo.error) {
    addNotice(notices, `設定を読めないため、既定値で動いています(${settingsInfo.error})`, 'warn');
  } else if (settingsInfo.warnings.length) {
    addNotice(notices, `設定の一部(${settingsInfo.warnings.join('、')})の値が正しくないため、既定値を使っています`, 'warn');
  }
  const results = readResults(store);
  if (!results.ok) {
    addNotice(notices, `成績データを読めません: ${results.message}。この状態では新しい記録を保存しません`, 'error');
  }
  const records = results.ok ? results.records : [];

  // 即時判定のオン/オフ。押すと apt_settings の common に保存し、次に開いたときも残す
  const instant = $('instant');
  const showInstant = on => {
    instant.checked = on;
    $('instantHint').textContent = on ? 'オン: テスト1〜5で、答えるたびに正誤を表示します' : 'オフ: テスト中は正誤を表示しません';
  };
  showInstant(settingsInfo.settings.common.instantFeedback);
  instant.addEventListener('change', () => {
    const raw = readSettingsRaw(store);
    // 読めない設定を上書きして消さないよう、保存しない
    const result = raw.ok ? saveSettings(store, withInstantFeedback(raw.value, instant.checked)) : raw;
    $('instantError').hidden = result.ok;
    $('instantError').textContent = result.ok ? '' : `即時判定を保存できませんでした(${result.message})`;
    showInstant(result.ok ? instant.checked : !instant.checked);
  });

  for (const t of TESTS) {
    const s = summarize(records, t.id);
    const a = document.createElement('a');
    a.className = 'menu-item';
    a.href = `#/${t.id}`;
    const name = document.createElement('span');
    name.className = 'menu-name';
    name.textContent = t.name;
    const meta = document.createElement('span');
    meta.className = 'menu-meta';
    meta.textContent = t.implemented
      ? `前回 ${s.last ?? '—'} / 最高 ${s.best ?? '—'} / ${s.count}回`
      : '準備中';
    if (!t.implemented) a.classList.add('is-pending');
    a.append(name, meta);
    $('grid').append(a);
  }
}

function renderPending(title) {
  root.innerHTML = `
    <section class="screen">
      <h1 data-ref="title"></h1>
      <p>準備中です。</p>
      <div class="actions"><a class="btn" href="#/">ホーム</a></div>
    </section>`;
  root.querySelector('[data-ref="title"]').textContent = title;
}

function render() {
  const prev = cleanup;
  cleanup = null;
  prev?.();
  window.scrollTo(0, 0);

  const settingsInfo = loadSettings(store);
  const ctx = { store, settings: settingsInfo.settings, navigate };
  const route = (location.hash.replace(/^#\/?/, '') || '').split('?')[0];

  if (route === '') {
    renderMenu(settingsInfo);
  } else if (route === 'history' || route.startsWith('history/')) {
    cleanup = history.mount(root, ctx, location.hash) ?? null;
  } else if (route === 'settings') {
    cleanup = settingsScreen.mount(root, ctx) ?? null;
  } else if (route === 'calc') {
    cleanup = calculatorScreen.mount(root, ctx) ?? null;
  } else if (findTest(route)) {
    const screen = SCREENS[route];
    if (screen) cleanup = screen.mount(root, ctx) ?? null;
    else renderPending(findTest(route).name);
  } else {
    navigate('#/');
    return;
  }
  flash = null;
}

window.addEventListener('hashchange', render);
render();
