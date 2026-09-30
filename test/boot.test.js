// 更新直後に古いファイルと新しいファイルが混ざらないようにする仕組み(2026-09-30 レビュー後の直し)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');

function jsFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return jsFiles(path);
    return name.endsWith('.js') ? [relative(ROOT, path).replaceAll('\\', '/')] : [];
  });
}

function importMap() {
  const m = HTML.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(m, 'index.html に import map がある');
  return JSON.parse(m[1]);
}

test('js/ の下のすべての .js ファイルが import map に「同じパス + ?v=版番号」で載っている', () => {
  const imports = importMap().imports;
  const files = jsFiles(join(ROOT, 'js')).sort();
  assert.ok(files.length >= 29, `${files.length}`);
  for (const file of files) {
    const key = `./${file}`;
    assert.ok(key in imports, `import map に ${key} がない(新しいファイルを足したら index.html にも書く)`);
    assert.match(imports[key], new RegExp(`^\\./${file.replaceAll('.', '\\.')}\\?v=[\\w.-]+$`), key);
  }
  for (const key of Object.keys(imports)) assert.ok(files.includes(key.slice(2)), `import map に無いファイル ${key}`);
});

test('版番号はすべて同じで、css/style.css にも同じ版番号が付いている', () => {
  const versions = new Set(Object.values(importMap().imports).map(v => v.split('?v=')[1]));
  assert.equal(versions.size, 1, [...versions].join(', '));
  const [version] = versions;
  assert.match(HTML, new RegExp(`<link rel="stylesheet" href="\\./css/style\\.css\\?v=${version}">`));
  const all = [...HTML.matchAll(/\?v=([\w.-]+)/g)].map(m => m[1]);
  assert.ok(all.every(v => v === version), `index.html の中の版番号: ${[...new Set(all)]}`);
});

test('アプリは import map を通して読み込み(./js/app.js を import)、見張りの処理がモジュールより先にある', () => {
  assert.doesNotMatch(HTML, /<script[^>]*src="\.\/js\//, 'src で直接読むと import map を通らない');
  const mapAt = HTML.indexOf('<script type="importmap">');
  const guardAt = HTML.indexOf('<script>');
  const moduleAt = HTML.indexOf('<script type="module">');
  assert.ok(mapAt >= 0 && guardAt >= 0 && moduleAt >= 0);
  assert.ok(guardAt < moduleAt && mapAt < moduleAt, '見張りと import map はモジュールより先');
  assert.match(HTML.slice(moduleAt), /import\('\.\/js\/app\.js'\)/);
});

// 見張りの処理を、小さな偽の document と window で動かす
function runGuard() {
  const code = HTML.match(/<script>([\s\S]*?)<\/script>/)[1];
  const listeners = {};
  const made = [];
  const el = tag => {
    const node = { tag, children: [], attrs: {}, textContent: '', listeners: {}, className: '', type: '',
      append(...c) { this.children.push(...c); }, setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(t, f) { this.listeners[t] = f; } };
    made.push(node);
    return node;
  };
  const body = { children: [], replaceChildren(...c) { this.children = c; }, append(...c) { this.children.push(...c); } };
  let reloaded = 0;
  const window = { addEventListener(t, f) { listeners[t] = f; } };
  const document = { createElement: el, body, readyState: 'complete', addEventListener() {} };
  const location = { reload() { reloaded++; } };
  new Function('window', 'document', 'location', code)(window, document, location);
  return { window, listeners, body, made, reloaded: () => reloaded };
}

test('起動に失敗したら「アプリが更新されました。再読み込みしてください」と再読み込みのボタンを出す', () => {
  const g = runGuard();
  assert.equal(typeof g.window.aptBootFailed, 'function');
  g.window.aptBootFailed(new SyntaxError("does not provide an export named 'createT5Level'"));
  const texts = g.made.map(n => n.textContent);
  assert.ok(texts.includes('アプリが更新されました。再読み込みしてください'), texts.join(' / '));
  const button = g.made.find(n => n.tag === 'button');
  assert.ok(button, '再読み込みのボタン');
  assert.equal(button.textContent, '再読み込み');
  button.listeners.click();
  assert.equal(g.reloaded(), 1);
  // 2回目の失敗では重ねて出さない
  const count = g.made.length;
  g.window.aptBootFailed(new Error('x'));
  assert.equal(g.made.length, count);
});

test('起動前の読み込みエラー(error イベント)でも出し、起動した後のエラーでは出さない', () => {
  const before = runGuard();
  assert.equal(typeof before.listeners.error, 'function');
  before.listeners.error({ message: 'SyntaxError' });
  assert.ok(before.made.some(n => n.textContent === 'アプリが更新されました。再読み込みしてください'));
  const after = runGuard();
  after.window.aptBooted = true;
  after.listeners.error({ message: 'TypeError' });
  after.listeners.unhandledrejection?.({ reason: new Error('x') });
  assert.equal(after.made.length, 0);
});
