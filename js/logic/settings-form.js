import { generateDotPositions } from './t5.js';
import { lapCandidates } from './t1.js';

const number = (key, label, min, max, options = {}) => ({ key, label, min, max, type: 'number', ...options });
const list = (key, label, min, max, options = {}) => ({ key, label, min, max, type: 'list', ...options });

const duration = () => number('durationSec', '制限時間', 10, 3600, { integer: true, unit: '秒' });

export const SETTING_FIELDS = Object.freeze({
  t1: Object.freeze([
    duration(),
    number('unitValueMin', '単位換算の最小値', 1, 100, { integer: true }),
    number('unitValueMax', '単位換算の最大値', 1, 100, { integer: true }),
    number('speedMin', '速さの最小値', 1, 100, { integer: true, unit: 'km/h' }),
    number('speedMax', '速さの最大値', 1, 100, { integer: true, unit: 'km/h' }),
    number('speedHoursMin', '時間の最小値', 1, 24, { integer: true, unit: '時間' }),
    number('speedHoursMax', '時間の最大値', 1, 24, { integer: true, unit: '時間' }),
    number('lapSpeedMin', '周回問題の速さ最小', 1, 100, { integer: true, unit: 'km/h' }),
    number('lapSpeedMax', '周回問題の速さ最大', 1, 100, { integer: true, unit: 'km/h' }),
    number('lapMultiplierMin', '周回距離の倍率最小', 1, 100, { integer: true }),
    number('lapMultiplierMax', '周回距離の倍率最大', 1, 100, { integer: true }),
    list('percentagePercents', '割合の候補', 1, 99, { integer: true, unit: '%', hint: 'カンマ区切り' }),
    number('percentageUnitMin', '割合問題の単位最小', 1, 1000, { integer: true }),
    number('percentageUnitMax', '割合問題の単位最大', 1, 1000, { integer: true }),
    number('priceMin', '単価の最小値', 2, 1000, { integer: true, unit: '円' }),
    number('priceMax', '単価の最大値', 2, 1000, { integer: true, unit: '円' }),
    number('priceCountMin', '商品の最小個数', 2, 100, { integer: true }),
    number('priceCountMax', '商品の最大個数', 2, 100, { integer: true }),
    number('averageMin', '平均問題の最小値', 2, 1000, { integer: true }),
    number('averageMax', '平均問題の最大値', 2, 1000, { integer: true }),
    number('clockStartHourMin', '経過時間の開始時(最小)', 0, 20, { integer: true }),
    number('clockStartHourMax', '経過時間の開始時(最大)', 0, 20, { integer: true }),
    number('elapsedMinutesMin', '経過時間の最小値', 1, 180, { integer: true, unit: '分' }),
    number('elapsedMinutesMax', '経過時間の最大値', 1, 180, { integer: true, unit: '分' }),
  ]),
  t2: Object.freeze([
    duration(),
    number('intervalMs', '切り替え間隔', 50, 10000, { integer: true, unit: 'ms' }),
    number('matchRate', '同じ組の確率', 0, 1, { step: 0.01 }),
    number('maxConsecutiveMatches', '一致の連続上限', 0, 1000, { integer: true, unit: '回' }),
    number('falseAlarmPenalty', '誤押し1回の減点', 0, 100, { integer: true, unit: '点' }),
  ]),
  t3: Object.freeze([
    duration(),
    number('triangleTiltMaxDeg', '三角形の傾き', 0, 45, { unit: '°' }),
    number('calcTermMin', '計算の最小値', 1, 99, { integer: true }),
    number('calcTermMax', '計算の最大値', 1, 99, { integer: true }),
    number('calcMaxTwoDigitTerms', '2桁の最大個数', 0, 4, { integer: true, unit: '個' }),
    number('calcSingleDigitMax', '1桁の最大値', 1, 9, { integer: true }),
    number('calcSubtractRate', '引き算の確率', 0, 1, { step: 0.01 }),
    list('calcDistractorOffsets', '計算の誤答差', 1, 100, { integer: true, hint: 'カンマ区切り' }),
    number('speechWordCount', '音声の語数', 2, 26, { integer: true, unit: '語' }),
    number('speechGapMs', '読み終わりから次の語まで', 0, 10000, { integer: true, unit: 'ms' }),
    number('speechRate', '読み上げ速度', 0.1, 10, { step: 0.1 }),
    number('duplicateRate', '重複ありの確率', 0, 1, { step: 0.01 }),
    number('speechAnswerLimitMs', '回答時間', 0, 600000, { integer: true, unit: 'ms', hint: '0は時間制限なし' }),
    number('speechNextDelayMs', '次の組までの時間', 0, 10000, { integer: true, unit: 'ms' }),
  ]),
  t4: Object.freeze([duration()]),
  t5: Object.freeze([
    duration(),
    number('minDots', '点の最小個数', 1, 13, { integer: true, unit: '個' }),
    number('maxDots', '点の最大個数', 1, 13, { integer: true, unit: '個' }),
    number('shuffleIntervalMs', '位置の切り替え間隔', 50, 10000, { integer: true, unit: 'ms' }),
    number('dotMoveMs', '点のスライド時間', 0, 10000, { integer: true, unit: 'ms' }),
    number('questionLimitSec', '1問の制限時間', 1, 300, { integer: true, unit: '秒' }),
    number('dotRadiusRatio', '点の半径', 0.005, 0.1, { step: 0.005 }),
    number('dotMinDistanceRatio', '点の最小間隔', 0.01, 0.5, { step: 0.01 }),
  ]),
  t6: Object.freeze([
    duration(),
    number('moveSpeed', '機体の移動速度', 0.1, 10, { step: 0.1, unit: 'u/s' }),
    number('collisionSpeedFactor', '衝突時の速度倍率', 0.01, 1, { step: 0.01 }),
    number('initialSpeed', '初速', 0.1, 10, { step: 0.1, unit: 'u/s' }),
    number('acceleration', '通常加速度', 0, 10, { step: 0.01 }),
    number('recoveryAcceleration', '回復加速度', 0.01, 10, { step: 0.01 }),
    number('maxSpeed', '最高速度', 0.1, 10, { step: 0.1, unit: 'u/s' }),
    number('obstacleSpacing', '障害物の間隔', 0.2, 20, { step: 0.1, unit: 'u' }),
    number('firstObstacleDistance', '最初の障害物まで', 0.2, 30, { step: 0.1, unit: 'u' }),
    number('bladeOpeningDeg', '羽根の開口角', 1, 119, { step: 1, unit: '°' }),
    number('bladeHubRadius', '羽根の中心円半径', 0.01, 0.9, { step: 0.01 }),
    number('bladeInitialAngularSpeedDegSec', '羽根の初期回転速度', 0, 720, { step: 1, unit: '°/s' }),
    number('bladeAngularAccelerationDegSec2', '羽根の回転加速度', 0, 100, { step: 0.01, unit: '°/s²' }),
    number('collisionPushMs', '押し戻し時間', 0, 5000, { integer: true, unit: 'ms' }),
    number('collisionPushDistance', '押し戻し距離', 0, 1, { step: 0.01, unit: 'u' }),
    number('aircraftMaxRadius', '機体の移動可能半径', 0.1, 0.99, { step: 0.01 }),
    number('sectorOpeningDeg', '扇形の開口角', 1, 359, { step: 1, unit: '°' }),
    number('holeSlotCount', '小穴の候補数', 3, 24, { integer: true, unit: 'か所' }),
    number('holeOpenCount', '開く小穴の数', 1, 24, { integer: true, unit: 'か所' }),
    number('holeRingRadius', '小穴中心の配置半径', 0.05, 0.95, { step: 0.01 }),
    number('holeRadius', '小穴の半径', 0.01, 0.45, { step: 0.01 }),
  ]),
});

export function canPlaceT5Fallback(count, params) {
  try {
    generateDotPositions(() => 0.5, count, params);
    return true;
  } catch {
    return false;
  }
}

function parseField(field, input) {
  if (field.type === 'list') {
    const text = Array.isArray(input) ? input.join(',') : String(input ?? '').trim();
    if (!text) return { error: '値を入力してください' };
    const values = text.replaceAll('、', ',').split(',').map(value => Number(value.trim()));
    if (values.some(value => !Number.isFinite(value))) return { error: '数値をカンマ区切りで入力してください' };
    if (field.integer && values.some(value => !Number.isInteger(value))) return { error: '整数だけを入力してください' };
    if (values.some(value => value < field.min || value > field.max)) return { error: `${field.min}〜${field.max}の範囲で入力してください` };
    if (new Set(values).size !== values.length) return { error: '同じ値が重複しないようにしてください' };
    return { value: values };
  }
  const text = String(input ?? '').trim();
  if (!text) return { error: '値を入力してください' };
  const value = Number(text);
  if (!Number.isFinite(value)) return { error: '有限の数値を入力してください' };
  if (field.integer && !Number.isInteger(value)) return { error: '整数で入力してください' };
  if (value < field.min || value > field.max) return { error: `${field.min}〜${field.max}の範囲で入力してください` };
  return { value };
}

function minMax(errors, value, minKey, maxKey) {
  if (value[minKey] > value[maxKey]) errors[maxKey] = '最大値は最小値以上にしてください';
}

export function validateTestSettings(testId, raw, defaults) {
  const fields = SETTING_FIELDS[testId];
  if (!fields) return { ok: false, value: {}, errors: { testId: '不明なテストです' } };
  const errors = {};
  const value = {};
  for (const field of fields) {
    const parsed = parseField(field, raw[field.key]);
    if ('error' in parsed) errors[field.key] = parsed.error;
    else value[field.key] = parsed.value;
  }
  if (Object.keys(errors).length) return { ok: false, value, errors };

  if (testId === 't1') {
    for (const pair of [['unitValueMin', 'unitValueMax'], ['speedMin', 'speedMax'], ['speedHoursMin', 'speedHoursMax'], ['lapSpeedMin', 'lapSpeedMax'], ['lapMultiplierMin', 'lapMultiplierMax'], ['percentageUnitMin', 'percentageUnitMax']]) minMax(errors, value, ...pair);
    for (const pair of [['priceMin', 'priceMax'], ['priceCountMin', 'priceCountMax'], ['averageMin', 'averageMax'], ['clockStartHourMin', 'clockStartHourMax'], ['elapsedMinutesMin', 'elapsedMinutesMax']]) minMax(errors, value, ...pair);
    if (value.averageMax - value.averageMin < 2) errors.averageMax = '整数の平均を作るため、最小値より2以上大きくしてください';
    if (!Object.keys(errors).length && !lapCandidates(value).integer.length) errors.lapMultiplierMax = '整数の周回距離を作れる速度と倍率の組がありません';
  } else if (testId === 't2') {
    const total = Math.floor((value.durationSec * 1000) / value.intervalMs);
    if (total < 1) errors.intervalMs = '制限時間内に1回以上表示できる間隔にしてください';
    const wanted = Math.round(total * value.matchRate);
    const possible = total - Math.floor(total / (value.maxConsecutiveMatches + 1));
    if (wanted > possible) errors.matchRate = `連続上限内に配置できません。一致は最大${possible}回です`;
  } else if (testId === 't3') {
    minMax(errors, value, 'calcTermMin', 'calcTermMax');
    if (value.calcMaxTwoDigitTerms > defaults.calcTermCount) errors.calcMaxTwoDigitTerms = `計算の項数${defaults.calcTermCount}以下にしてください`;
  } else if (testId === 't5') {
    minMax(errors, value, 'minDots', 'maxDots');
    if (value.dotMinDistanceRatio < value.dotRadiusRatio * 2) errors.dotMinDistanceRatio = '点の直径以上にしてください';
    if (!Object.keys(errors).length) {
      if (!canPlaceT5Fallback(value.maxDots, { ...defaults, ...value })) {
        errors.maxDots = 'この点の大きさと最小間隔では、最大個数を円内に配置できません';
      }
    }
  } else if (testId === 't6') {
    if (value.initialSpeed > value.maxSpeed) errors.maxSpeed = '最高速度は初速以上にしてください';
    if (value.holeOpenCount > value.holeSlotCount) errors.holeOpenCount = '開く数は候補数以下にしてください';
    const chord = 2 * value.holeRingRadius * Math.sin(Math.PI / value.holeSlotCount);
    if (value.holeRadius * 2 >= chord) errors.holeRadius = '隣の小穴と重ならない半径にしてください';
    if (value.holeRingRadius + value.holeRadius > 1) errors.holeRadius = '小穴全体がトンネル内に収まるようにしてください';
    if (value.holeRingRadius > value.aircraftMaxRadius) errors.holeRingRadius = '小穴の中心を機体が届く範囲にしてください';
  }
  return { ok: Object.keys(errors).length === 0, value, errors };
}

export function resetTestOverrides(saved, testId) {
  const next = { ...(saved ?? {}) };
  delete next[testId];
  return next;
}
