// 電卓の状態遷移。DOM や保存領域には触れない。
const OPERATORS = new Set(['+', '−', '×', '÷']);

export function createCalculatorState() {
  return { tokens: [], input: '0', entering: true, evaluated: false, error: false, repeat: null };
}

function calculate(left, operator, right) {
  switch (operator) {
    case '+': return left + right;
    case '−': return left - right;
    case '×': return left * right;
    case '÷': return right === 0 ? NaN : left / right;
    default: return NaN;
  }
}

function evaluate(tokens) {
  const reduced = [tokens[0]];
  for (let i = 1; i < tokens.length; i += 2) {
    const operator = tokens[i];
    const right = tokens[i + 1];
    if (operator === '×' || operator === '÷') reduced[reduced.length - 1] = calculate(reduced.at(-1), operator, right);
    else reduced.push(operator, right);
  }
  let value = reduced[0];
  for (let i = 1; i < reduced.length; i += 2) value = calculate(value, reduced[i], reduced[i + 1]);
  return value;
}

function digits(input) {
  return input.replace(/\D/g, '').length;
}

export function pressCalculatorKey(state, key) {
  if (key === 'C') return createCalculatorState();
  const next = { ...state, tokens: [...state.tokens], repeat: state.repeat && { ...state.repeat } };
  if (/^[0-9]$/.test(key)) {
    if (next.error || next.evaluated) return { ...createCalculatorState(), input: key };
    if (!next.entering) {
      next.input = key;
      next.entering = true;
    } else if (next.input === '0') next.input = key;
    else if (next.input === '-0') next.input = `-${key}`;
    else if (digits(next.input) < 12) next.input += key;
    return next;
  }
  if (next.error) return next;
  if (key === '.') {
    if (next.evaluated) return { ...createCalculatorState(), input: '0.' };
    if (!next.entering) { next.input = '0.'; next.entering = true; }
    else if (!next.input.includes('.')) next.input += '.';
    return next;
  }
  if (key === '±') {
    if (!next.entering) { next.input = '0'; next.entering = true; }
    next.input = next.input.startsWith('-') ? next.input.slice(1) : `-${next.input}`;
    return next;
  }
  if (key === '←') {
    if (!next.entering && next.tokens.length) {
      next.tokens.pop();
      next.input = String(next.tokens.pop());
      next.entering = true;
    } else {
      const visible = next.evaluated ? calculatorDisplay(next) : next.input;
      next.input = visible.slice(0, -1);
      if (!next.input || next.input === '-') next.input = '0';
    }
    next.evaluated = false;
    next.repeat = null;
    return next;
  }
  if (OPERATORS.has(key)) {
    if (next.evaluated) {
      next.tokens = [Number(next.input), key];
      next.evaluated = false;
      next.entering = false;
      next.repeat = null;
    } else if (!next.entering && next.tokens.length) next.tokens[next.tokens.length - 1] = key;
    else {
      next.tokens.push(Number(next.input), key);
      next.entering = false;
    }
    return next;
  }
  if (key !== '=') return next;
  if (next.evaluated && next.repeat) {
    const value = calculate(Number(next.input), next.repeat.operator, next.repeat.right);
    if (!Number.isFinite(value)) return { ...createCalculatorState(), error: true };
    next.input = String(value);
    return next;
  }
  if (!next.tokens.length || !next.entering) {
    next.evaluated = true;
    return next;
  }
  const expression = [...next.tokens, Number(next.input)];
  const value = evaluate(expression);
  if (!Number.isFinite(value)) return { ...createCalculatorState(), error: true };
  next.repeat = { operator: next.tokens.at(-1), right: Number(next.input) };
  next.tokens = [];
  next.input = String(value);
  next.evaluated = true;
  return next;
}

export function calculatorDisplay(state) {
  if (state.error) return 'エラー';
  if (state.input.endsWith('.')) return state.input;
  const value = Number(state.input);
  if (!Number.isFinite(value)) return 'エラー';
  if (Math.trunc(Math.abs(value)).toString().replace(/\D/g, '').length > 12) {
    return value.toExponential(3).replace(/\.0+e/, 'e').replace(/(\.\d*?)0+e/, '$1e');
  }
  const rounded = Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 1000) / 1000;
  return String(rounded);
}

export function calculatorContext(state) {
  if (state.error) return '';
  if (state.tokens.length) return state.tokens.map(token => String(token)).join(' ');
  if (state.evaluated && state.repeat) return `= ${state.repeat.operator} ${state.repeat.right}`;
  return '';
}
