import { createCalculatorState, pressCalculatorKey, calculatorDisplay, calculatorContext } from './logic/calculator.js';

const KEYS = ['C', '←', '±', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '='];
const KEYBOARD = { '*': '×', '/': '÷', '-': '−', Enter: '=', Backspace: '←', Escape: 'C' };

export function mountCalculator(root) {
  let state = createCalculatorState();
  root.innerHTML = `
    <section class="calculator" aria-label="電卓">
      <div class="calculator-display" aria-live="polite">
        <div class="calculator-context" data-calc-ref="context"></div>
        <output data-calc-ref="display">0</output>
      </div>
      <div class="calculator-keys" data-calc-ref="keys"></div>
    </section>`;
  const display = root.querySelector('[data-calc-ref="display"]');
  const context = root.querySelector('[data-calc-ref="context"]');
  const keys = root.querySelector('[data-calc-ref="keys"]');
  for (const key of KEYS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.calcKey = key;
    button.textContent = key;
    if (key === '=') button.classList.add('calculator-equals');
    keys.append(button);
  }

  function press(key) {
    state = pressCalculatorKey(state, key);
    display.textContent = calculatorDisplay(state);
    context.textContent = calculatorContext(state);
  }

  function onClick(event) {
    const button = event.target.closest('[data-calc-key]');
    if (button && keys.contains(button)) press(button.dataset.calcKey);
  }

  function onKeyDown(event) {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const key = KEYBOARD[event.key] ?? event.key;
    if (!KEYS.includes(key)) return;
    // 回答ボタンへの Enter やページ操作に伝播させない。
    event.preventDefault();
    event.stopPropagation();
    press(key);
  }

  keys.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeyDown, true);
  return () => {
    keys.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKeyDown, true);
  };
}

export function mount(root) {
  root.innerHTML = '<section class="screen calculator-screen"><h1>電卓</h1><div data-ref="calculator"></div><div class="actions"><a class="btn" href="#/">メニュー</a></div></section>';
  return mountCalculator(root.querySelector('[data-ref="calculator"]'));
}
