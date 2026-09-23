import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalculatorState, pressCalculatorKey, calculatorDisplay } from '../js/logic/calculator.js';

function run(keys) {
  return [...keys].reduce((state, key) => pressCalculatorKey(state, key), createCalculatorState());
}

test('掛け算と割り算は足し算と引き算より先に計算する', () => {
  for (const [keys, expected] of [
    ['2+3×4=', '14'], ['2+3×4−2=', '12'], ['6÷3+1=', '3'], ['2×3+4×5=', '26'],
  ]) assert.equal(calculatorDisplay(run(keys)), expected, keys);
});

test('= を繰り返すと直前の演算を繰り返す', () => {
  let state = run('2+3=');
  assert.equal(calculatorDisplay(state), '5');
  state = pressCalculatorKey(state, '=');
  assert.equal(calculatorDisplay(state), '8');
  state = pressCalculatorKey(state, '=');
  assert.equal(calculatorDisplay(state), '11');
});

test('続けた演算子は最後だけが効く', () => {
  assert.equal(calculatorDisplay(run('2+−3=')), '-1');
});

test('± と ← は現在の数を変え、C は全消去する', () => {
  assert.equal(calculatorDisplay(run('5±')), '-5');
  assert.equal(calculatorDisplay(run('5±±')), '5');
  assert.equal(calculatorDisplay(run('123←')), '12');
  assert.equal(calculatorDisplay(run('123C')), '0');
});

test('小数は表示時だけ第3位まで四捨五入する', () => {
  assert.equal(calculatorDisplay(run('2÷3=')), '0.667');
  assert.equal(calculatorDisplay(run('3÷1=')), '3');
  assert.equal(calculatorDisplay(run('1.5+0=')), '1.5');
  assert.equal(calculatorDisplay(run('0.1+0.2=')), '0.3');
  assert.equal(calculatorDisplay(run('1.0005=')), '1.001');
  assert.equal(run('0.1+0.2=').input, String(0.1 + 0.2));
});

test('0 で割ったエラーは C または数字で復帰する', () => {
  const failed = run('2÷0=');
  assert.equal(calculatorDisplay(failed), 'エラー');
  assert.equal(calculatorDisplay(pressCalculatorKey(failed, 'C')), '0');
  assert.equal(calculatorDisplay(pressCalculatorKey(failed, '7')), '7');
});

test('小数点は二重に入らず、先頭なら 0. になる', () => {
  assert.equal(calculatorDisplay(run('.')), '0.');
  assert.equal(run('1..2').input, '1.2');
});

test('入力は12桁まで、長い結果は指数表記になる', () => {
  assert.equal(run('1234567890123').input, '123456789012');
  assert.match(calculatorDisplay(run('123456789012×12345=')), /^1\.524e\+15$/);
});

test('キー操作は元の状態と内部配列を書き換えない', () => {
  const before = run('2+');
  const snapshot = structuredClone(before);
  const after = pressCalculatorKey(before, '3');
  assert.deepEqual(before, snapshot);
  assert.notStrictEqual(after, before);
  assert.notStrictEqual(after.tokens, before.tokens);
});
