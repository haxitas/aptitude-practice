// 各テストの数値の既定値(SPEC §6)と、保存値(apt_settings)との合成。
// 設定画面は Phase4。ここでは読み込みと合成だけを行い、apt_settings は書き換えない。
import { readSettingsRaw } from './storage.js';

export const DEFAULTS = Object.freeze({
  t1: Object.freeze({
    durationSec: 180,
  }),
  t2: Object.freeze({
    durationSec: 180,
    intervalMs: 1000,
    matchRate: 0.25,
    maxConsecutiveMatches: 2, // 一致が続いてよい最大回数(「3回以上続かない」)
    falseAlarmPenalty: 2, // 誤押し1回あたりの減点
  }),
  t3: Object.freeze({
    durationSec: 240,
    triangleTiltMaxDeg: 10,
    calcTermMin: 1,
    calcTermMax: 20,
    speechWordCount: 5,
    speechIntervalMs: 1000,
    speechRate: 0.9,
    duplicateRate: 0.5,
    speechAnswerLimitMs: 5000,
    speechNextDelayMs: 1000,
  }),
  t4: Object.freeze({
    durationSec: 180,
  }),
  t5: Object.freeze({
    durationSec: 180,
    minDots: 3,
    maxDots: 13,
    shuffleIntervalMs: 1000,
    questionLimitSec: 10,
  }),
  // 初速・加速度・速度の上限・障害物の間隔は SPEC に数値がないため Phase2 で決める
  t6: Object.freeze({
    durationSec: 180,
    followRate: 0.2,
    collisionSpeedFactor: 0.5,
    bladeOpeningDeg: 60,
  }),
});

// 画面の表示件数など(利用者が変える値ではない)
export const DISPLAY = Object.freeze({
  historyRows: 20, // 履歴の表に出す直近の回数(SPEC §7)
  recentAvgCount: 5, // 直近平均に使う回数(SPEC §7)
});

function sameType(def, val) {
  if (typeof def === 'number') return typeof val === 'number' && Number.isFinite(val);
  return typeof def === typeof val && val !== null;
}

// 保存値を既定値に重ねる。既定値にないキーは捨て、型が合わないキーは既定値に戻す。
// { settings, warnings: ['t2.intervalMs', ...] }
export function resolveSettings(saved) {
  const settings = {};
  const warnings = [];
  for (const [testId, defs] of Object.entries(DEFAULTS)) {
    const src = saved && typeof saved[testId] === 'object' && saved[testId] !== null ? saved[testId] : {};
    const out = {};
    for (const [key, def] of Object.entries(defs)) {
      if (key in src) {
        if (sameType(def, src[key])) {
          out[key] = src[key];
        } else {
          out[key] = def;
          warnings.push(`${testId}.${key}`);
        }
      } else {
        out[key] = def;
      }
    }
    settings[testId] = out;
  }
  return { settings, warnings };
}

// { settings, warnings, error }(error は apt_settings 自体が読めないときの説明)
export function loadSettings(store) {
  const raw = readSettingsRaw(store);
  if (!raw.ok) {
    return { ...resolveSettings(null), error: raw.message };
  }
  return { ...resolveSettings(raw.value), error: null };
}
