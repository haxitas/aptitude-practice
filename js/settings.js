import { TESTS } from './core/catalog.js';
import {
  readResults, readSettingsRaw, saveSettings, appendImportedRecords, clearResults,
} from './core/storage.js';
import { DEFAULTS } from './core/settings.js';
import { SETTING_FIELDS, validateTestSettings, resetTestOverrides } from './logic/settings-form.js';
import { makeExportData, parseImportJson, mergeImportedRecords } from './logic/records-transfer.js';

function setNotice(element, text, kind = 'info') {
  element.className = `notice notice-${kind}`;
  element.textContent = text;
  element.hidden = !text;
}

function valueText(value) {
  return Array.isArray(value) ? value.join(', ') : String(value);
}

function downloadName(date) {
  const p = value => String(value).padStart(2, '0');
  return `aptitude-practice-results-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.json`;
}

export function mount(root, ctx) {
  root.innerHTML = `
    <section class="screen settings-screen">
      <h1>設定</h1>
      <p>変更は、次に開始するテストから反映されます。</p>
      <p data-ref="notice" hidden></p>
      <div data-ref="forms"></div>
      <section class="data-tools">
        <h2>成績の書き出し・読み込み</h2>
        <div class="actions">
          <button class="btn" type="button" data-ref="export">JSONを保存</button>
          <button class="btn" type="button" data-ref="showJson">JSONを画面に表示</button>
          <label class="btn file-button">JSONを読み込む<input type="file" accept=".json,application/json" data-ref="import"></label>
        </div>
        <div class="json-copy" data-ref="jsonCopy" hidden>
          <textarea readonly data-ref="jsonText" aria-label="書き出す成績JSON"></textarea>
          <button class="btn" type="button" data-ref="copy">JSONをコピー</button>
        </div>
      </section>
      <section class="danger-zone">
        <h2>成績の全消去</h2>
        <p>設定は残し、この端末の成績だけを消します。</p>
        <button class="btn btn-danger" type="button" data-ref="armClear">成績を全消去</button>
        <div class="clear-confirm" data-ref="clearConfirm" hidden>
          <p class="notice notice-error">元に戻せません。本当にすべての成績を消しますか？</p>
          <div class="actions">
            <button class="btn" type="button" data-ref="cancelClear">キャンセル</button>
            <button class="btn btn-danger" type="button" data-ref="confirmClear">本当にすべて消去する</button>
          </div>
        </div>
      </section>
      <div class="actions"><a class="btn" href="#/">メニュー</a></div>
    </section>`;
  const $ = name => root.querySelector(`[data-ref="${name}"]`);
  const notice = $('notice');
  const rawInfo = readSettingsRaw(ctx.store);
  let saved = rawInfo.ok ? structuredClone(rawInfo.value ?? {}) : {};
  if (!rawInfo.ok) setNotice(notice, `${rawInfo.message}。保存すると正しい設定で置き換えます`, 'warn');

  function fieldElement(testId, field, current) {
    const wrap = document.createElement('div');
    wrap.className = 'setting-field';
    const id = `setting-${testId}-${field.key}`;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = field.label;
    const input = document.createElement('input');
    input.id = id;
    input.name = field.key;
    input.type = field.type === 'list' ? 'text' : 'number';
    input.value = valueText(current[field.key]);
    if (field.type === 'number') {
      input.min = String(field.min);
      input.max = String(field.max);
      input.step = String(field.integer ? 1 : (field.step ?? 'any'));
      input.inputMode = field.integer ? 'numeric' : 'decimal';
    }
    input.setAttribute('aria-describedby', `${id}-help ${id}-error`);
    const help = document.createElement('span');
    help.id = `${id}-help`;
    help.className = 'setting-help';
    help.textContent = `${field.min}〜${field.max}${field.unit ? ` ${field.unit}` : ''}${field.hint ? ` / ${field.hint}` : ''}`;
    const error = document.createElement('span');
    error.id = `${id}-error`;
    error.className = 'setting-error';
    error.dataset.errorFor = field.key;
    error.setAttribute('aria-live', 'polite');
    wrap.append(label, input, help, error);
    return wrap;
  }

  for (const test of TESTS) {
    const details = document.createElement('details');
    details.className = 'settings-test';
    const summary = document.createElement('summary');
    summary.textContent = test.name;
    details.append(summary);
    const form = document.createElement('form');
    form.dataset.testId = test.id;
    form.noValidate = true;
    const grid = document.createElement('div');
    grid.className = 'settings-grid';
    for (const field of SETTING_FIELDS[test.id]) grid.append(fieldElement(test.id, field, ctx.settings[test.id]));
    const actions = document.createElement('div');
    actions.className = 'actions';
    const save = document.createElement('button');
    save.className = 'btn btn-primary';
    save.type = 'submit';
    save.textContent = 'このテストの設定を保存';
    const reset = document.createElement('button');
    reset.className = 'btn';
    reset.type = 'button';
    reset.textContent = '既定値に戻す';
    actions.append(save, reset);
    form.append(grid, actions);
    details.append(form);
    $('forms').append(details);

    function showErrors(errors) {
      for (const item of form.querySelectorAll('[data-error-for]')) item.textContent = errors[item.dataset.errorFor] ?? '';
      const first = Object.keys(errors)[0];
      if (first) form.elements.namedItem(first)?.focus();
    }

    form.addEventListener('submit', event => {
      event.preventDefault();
      const raw = Object.fromEntries(SETTING_FIELDS[test.id].map(field => [field.key, form.elements.namedItem(field.key).value]));
      const result = validateTestSettings(test.id, raw, DEFAULTS[test.id]);
      showErrors(result.errors);
      if (!result.ok) {
        setNotice(notice, `${test.name}を保存できません。赤字の項目を直してください`, 'error');
        return;
      }
      const next = { ...saved, [test.id]: { ...(saved[test.id] ?? {}), ...result.value } };
      const write = saveSettings(ctx.store, next);
      if (!write.ok) {
        setNotice(notice, write.message, 'error');
        return;
      }
      saved = next;
      setNotice(notice, `${test.name}の設定を保存しました。次に始める回から使います`, 'ok');
    });

    reset.addEventListener('click', () => {
      const next = resetTestOverrides(saved, test.id);
      const write = saveSettings(ctx.store, next);
      if (!write.ok) {
        setNotice(notice, write.message, 'error');
        return;
      }
      saved = next;
      showErrors({});
      for (const field of SETTING_FIELDS[test.id]) form.elements.namedItem(field.key).value = valueText(DEFAULTS[test.id][field.key]);
      setNotice(notice, `${test.name}を既定値に戻しました。次に始める回から使います`, 'ok');
    });
  }

  function exportJson() {
    const results = readResults(ctx.store);
    if (!results.ok) {
      setNotice(notice, results.message, 'error');
      return null;
    }
    return JSON.stringify(makeExportData(results.records, new Date().toISOString()), null, 2);
  }

  $('export').addEventListener('click', () => {
    const json = exportJson();
    if (json === null) return;
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName(new Date());
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice(notice, '成績JSONの保存を開始しました。保存できない場合は「JSONを画面に表示」を使ってください', 'ok');
  });

  $('showJson').addEventListener('click', () => {
    const json = exportJson();
    if (json === null) return;
    $('jsonText').value = json;
    $('jsonCopy').hidden = false;
    $('jsonText').focus();
    $('jsonText').select();
  });

  $('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('jsonText').value);
      setNotice(notice, 'JSONをコピーしました', 'ok');
    } catch {
      $('jsonText').focus();
      $('jsonText').select();
      setNotice(notice, '自動コピーできませんでした。選択中のJSONを手動でコピーしてください', 'warn');
    }
  });

  $('import').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    let text;
    try {
      text = await file.text();
    } catch (error) {
      setNotice(notice, `ファイルを読めませんでした(${error?.message ?? error})`, 'error');
      return;
    } finally {
      event.target.value = '';
    }
    const parsed = parseImportJson(text);
    if (!parsed.ok) {
      setNotice(notice, `1件も取り込みませんでした: ${parsed.message}`, 'error');
      return;
    }
    const current = readResults(ctx.store);
    if (!current.ok) {
      setNotice(notice, `1件も取り込みませんでした: ${current.message}`, 'error');
      return;
    }
    const merged = mergeImportedRecords(current.records, parsed.records);
    const additions = merged.records.slice(current.records.length);
    const write = appendImportedRecords(ctx.store, additions);
    if (!write.ok) {
      setNotice(notice, write.message, 'error');
      return;
    }
    setNotice(notice, `追加 ${merged.added}件、重複のため無視 ${merged.ignored}件`, 'ok');
  });

  $('armClear').addEventListener('click', () => {
    $('armClear').hidden = true;
    $('clearConfirm').hidden = false;
    $('confirmClear').focus();
  });
  $('cancelClear').addEventListener('click', () => {
    $('clearConfirm').hidden = true;
    $('armClear').hidden = false;
    $('armClear').focus();
  });
  $('confirmClear').addEventListener('click', () => {
    const result = clearResults(ctx.store);
    if (!result.ok) {
      setNotice(notice, result.message, 'error');
      return;
    }
    $('clearConfirm').hidden = true;
    $('armClear').hidden = false;
    setNotice(notice, 'この端末の成績をすべて消去しました。設定は残っています', 'ok');
  });
}
