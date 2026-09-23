// 各テストの数値の既定値(SPEC §6)と、保存値(apt_settings)との合成。
// 設定画面は Phase4。ここでは読み込みと合成だけを行い、apt_settings は書き換えない。
import { readSettingsRaw } from './storage.js';

export const DEFAULTS = Object.freeze({
  t1: Object.freeze({
    durationSec: 180,
    answerFeedbackMs: 300,
    stallAbortMs: 1000,
    unitValueMin: 1,
    unitValueMax: 20,
    speedMin: 2,
    speedMax: 20,
    speedHoursMin: 1,
    speedHoursMax: 8,
    lapSpeedMin: 2,
    lapSpeedMax: 10,
    lapMultiplierMin: 3,
    lapMultiplierMax: 10,
    lapIntegerRate: 0.8,
    percentagePercents: Object.freeze([10, 20, 25, 40, 50, 75]),
    percentageUnitMin: 2,
    percentageUnitMax: 20,
    priceMin: 10,
    priceMax: 200,
    priceCountMin: 2,
    priceCountMax: 12,
    averageMin: 2,
    averageMax: 50,
    clockStartHourMin: 6,
    clockStartHourMax: 18,
    elapsedMinutesMin: 15,
    elapsedMinutesMax: 180,
  }),
  t2: Object.freeze({
    durationSec: 120, // 2026-09-22 ユーザーの判断で 180 → 120
    intervalMs: 1000,
    matchRate: 0.25,
    maxConsecutiveMatches: 1, // 一致が続いてよい最大回数(2026-09-22 ユーザーの判断で「2回続けて出さない」)
    falseAlarmPenalty: 2, // 誤押し1回あたりの減点
    pressFeedbackMs: 300, // 押したあとボタンを薄くしておく最低の時間
  }),
  t3: Object.freeze({
    durationSec: 240,
    triangleTiltMaxDeg: 10, // 三角形の傾きの最大(±)
    calcTermCount: 4, // 計算の数の個数
    calcTermMin: 1,
    calcTermMax: 20,
    calcMaxTwoDigitTerms: 2, // 1問に入る2桁の数の最大個数
    calcSingleDigitMax: 9,
    calcSubtractRate: 0.5, // 引き算を選べるときに選ぶ確率
    calcDistractorOffsets: Object.freeze([1, 2, 10]), // 誤答は正解 ± これらの値から作る
    speechWordCount: 5,
    speechGapMs: 500, // 前の語を読み終えてから次の語まで
    speechRate: 0.9,
    speechLang: 'en-US',
    duplicateRate: 0.5,
    speechAnswerLimitMs: 0, // 0 は時間制限なし。正数なら読み終えてから答えられる時間
    speechNextDelayMs: 1000, // 回答(または未回答)から次の組までの時間
    speechEndFallbackMs: 2500, // onend が来ないとき、読み始めからこの時間で読み終わりとみなす
    speechIdleGraceMs: 250, // 読み上げが止まって見えても、読み始めからこの時間は待つ
    stallAbortMs: 1000, // フレームの間隔がこれを超えたら描画が止まったとみなして中断する
    answerFeedbackMs: 300, // 押したボタンを薄くしておく最低の時間
  }),
  t4: Object.freeze({
    durationSec: 180,
    answerFeedbackMs: 300,
    showPreviousAnswer: true,
  }),
  t5: Object.freeze({
    durationSec: 180,
    minDots: 3,
    maxDots: 13,
    shuffleIntervalMs: 1000,
    dotMoveMs: 400,
    questionLimitSec: 10,
    dotRadiusRatio: 0.025,
    dotMinDistanceRatio: 0.12,
    placementAttemptLimit: 200,
    layoutRestartLimit: 20,
    answerFeedbackMs: 300,
    stallAbortMs: 1000,
  }),
  t6: Object.freeze({
    durationSec: 180,
    moveSpeed: 1, // トンネル断面の内部単位/秒
    collisionSpeedFactor: 0.5,
    initialSpeed: 0.8, // トンネル半径を1とする内部単位/秒
    acceleration: 0.02,
    recoveryAcceleration: 0.16, // 最高速で衝突しても約5秒で基準速度へ戻る
    maxSpeed: 1.6,
    obstacleSpacing: 2.4,
    firstObstacleDistance: 5,
    bladeOpeningDeg: 60,
    bladeHubRadius: 0.18,
    bladeInitialAngularSpeedDegSec: 30,
    bladeAngularAccelerationDegSec2: 0.15,
    collisionPushMs: 350,
    collisionPushDistance: 0.28,
    aircraftMaxRadius: 0.86,
    canvasMarginPx: 8,
    stickRadiusRatio: 0.14,
    stickMinRadiusPx: 60,
    stickMaxRadiusPx: 90,
    tunnelMinRadiusRatio: 0.3,
    stickSide: 'right',
    stallAbortMs: 1000,
    perspectiveFocal: 1,
    collisionZ: 1,
    farZ: 12,
    tunnelRingSpacing: 0.75,
    sectorOpeningDeg: 90,
    holeSlotCount: 8,
    holeOpenCount: 3,
    holeRingRadius: 0.6,
    holeRadius: 0.2,
  }),
});

// 画面の表示件数など(利用者が変える値ではない)
export const DISPLAY = Object.freeze({
  historyRows: 20, // 履歴の表に出す直近の回数(SPEC §7)
  recentAvgCount: 5, // 直近平均に使う回数(SPEC §7)
  historyChartHeight: 260,
  historyChartLeft: 48,
  historyChartRight: 16,
  historyChartTop: 16,
  historyChartBottom: 40,
  historyChartPreferredTickCount: 5,
  historyChartMaxDateLabels: 5,
  historyChartPointRadius: 4,
  historyChartCustomPointRadius: 7,
  historyChartHitRadius: 18,
});

function sameType(def, val) {
  if (typeof def === 'number') return typeof val === 'number' && Number.isFinite(val);
  if (Array.isArray(def)) return Array.isArray(val) && val.every(x => typeof x === 'number' && Number.isFinite(x));
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
