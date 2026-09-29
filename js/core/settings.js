// 各テストの数値の既定値(SPEC §6)と、保存値(apt_settings)との合成。
// 設定画面は Phase4。ここでは読み込みと合成だけを行い、apt_settings は書き換えない。
import { readSettingsRaw } from './storage.js';

export const T6_COLOR_OPTIONS = Object.freeze({
  obstacle: Object.freeze([
    Object.freeze({ name: 'slate', label: '濃い灰', value: '#596579' }),
    Object.freeze({ name: 'blue', label: '青', value: '#3267b8' }),
    Object.freeze({ name: 'plum', label: '赤紫', value: '#a54270' }),
    Object.freeze({ name: 'forest', label: '深緑', value: '#27765b' }),
  ]),
  edge: Object.freeze([
    Object.freeze({ name: 'white', label: '白', value: '#f5f8ff' }),
    Object.freeze({ name: 'yellow', label: '黄', value: '#ffe171' }),
    Object.freeze({ name: 'cyan', label: '水色', value: '#89e8ff' }),
    Object.freeze({ name: 'orange', label: '橙', value: '#ffbc78' }),
  ]),
});

export const T6_COLOR_PRESETS = Object.freeze([
  Object.freeze({ name: '標準', obstacleColor: 'blue', obstacleEdgeColor: 'cyan' }),
  Object.freeze({ name: '高コントラスト', obstacleColor: 'slate', obstacleEdgeColor: 'white' }),
  Object.freeze({ name: '暖色', obstacleColor: 'plum', obstacleEdgeColor: 'yellow' }),
]);

export const DEFAULTS = Object.freeze({
  // 全テスト共通(2026-09-27 ユーザーの判断で追加)
  // 即時判定はテスト2〜5で常にオン、テスト1(計算)は結果画面で振り返る(2026-09-30 本番に合わせて変更)
  common: Object.freeze({
    feedbackMs: 1200, // 判定を出しておく時間(テスト4は次の決定まで出し続ける)
  }),
  t1: Object.freeze({
    durationSec: 180,
    calculatorDuringTest: true,
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
    // 単位換算が全体に占める割合(残りの種類は均等)。2026-09-28 ユーザーの判断で追加(重み unitKindWeight)。
    // 2026-09-30 本番に合わせて変更: 重みをやめて割合で持つ(1問目だけを数えても約1/3になるように)
    unitKindShare: 0.33,
    // 図形(2026-09-28 ユーザーの判断で追加)
    geometryLengthMin: 2, // 三角形・台形・平行四辺形の辺と高さ(cm)
    geometryLengthMax: 20,
    circlePi: 3.14,
    circleDiameterUnit: 50, // 円周の問題の直径は50の倍数(円周が整数になる)
    circleAreaRadiusUnit: 10, // 円の面積の問題の半径は10の倍数(面積が整数になる)
    circleMultiplierMax: 6,
    circleAreaMultiplierMax: 3,
    // 本番に出た形(2026-09-30 本番に合わせて追加)
    workWorkersMin: 2, // 仕事算の人数
    workWorkersMax: 9,
    workHoursMin: 2, // 仕事算の時間
    workHoursMax: 15,
    flightSpeedMin: 600, // 速さと時間の時速(km)
    flightSpeedMax: 900,
    flightSpeedDiffMax: 60, // 2つの時速の差の上限
    flightHoursMin: 2,
    flightHoursMax: 12,
    wageHoursMin: 4, // 時給の問題の時間
    wageHoursMax: 40,
    wageDollarCentsMin: 1000, // 時給(ドル)をセントで。10.00〜50.00ドル
    wageDollarCentsMax: 5000,
    wageYenMin: 900, // 時給(円)。10円刻み
    wageYenMax: 2500,
    cylinderDiameterMin: 8, // 円筒の直径(cm)
    cylinderDiameterMax: 40,
    cylinderHeightTenthsMin: 5, // 円筒の高さ(0.1m 単位。5 → 0.5m)
    cylinderHeightTenthsMax: 20,
    cylinderGapMin: 5, // 上から下げる長さ(cm)
    cylinderGapMax: 20,
  }),
  t2: Object.freeze({
    durationSec: 120, // 2026-09-22 ユーザーの判断で 180 → 120
    intervalMs: 1000, // 不一致の表示の切り替え間隔
    matchRate: 0.25,
    maxConsecutiveMatches: 3, // 一致が続いてよい最大回数(2026-09-30 本番に合わせて 1 → 3)
    matchWaitMs: 5000, // 一致の表示は押すまで止まる。この時間で押せなければやり直し(2026-09-30 本番に合わせて追加)
    pressFeedbackMs: 300, // 押したあとボタンを薄くしておく最低の時間
    stallAbortMs: 1000, // フレームの間隔がこれを超えたら描画が止まったとみなして中断する
  }),
  t3: Object.freeze({
    durationSec: 240,
    triangleTiltMaxDeg: 10, // 三角形の傾きの最大(±)
    calcTermCount: 5, // 計算の数の個数(2026-09-30 本番に合わせて 4 → 5)
    calcTermMin: 1,
    calcTermMax: 20,
    calcMaxTwoDigitTerms: 2, // 1問に入る2桁の数の最大個数
    calcSingleDigitMax: 9,
    calcSubtractRate: 0.5, // 引き算を選べるときに選ぶ確率
    calcShowCorrectRate: 0.5, // 右辺に正しい値を出す確率(2026-09-30 本番に合わせて4択から変更)
    calcWrongOffsetMax: 3, // 右辺が誤りのときは正しい値に ±1〜この値を足す
    shapeLimitMs: 5000, // 図形の1問ごとの制限時間。過ぎたら未回答(2026-09-30 本番に合わせて追加)
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
    compassMode: 'noseUp',
  }),
  t5: Object.freeze({
    durationSec: 180,
    // 2026-09-30 本番に合わせて変更: 点の数は段階(最初は minDots、正解で+1、続けて不正解で−1)の上下 levelSpread から選ぶ
    minDots: 3,
    maxDots: 14,
    levelSpread: 3,
    levelDownWrongStreak: 2, // この回数続けて不正解なら段階を1つ下げる
    choiceCount: 5, // 回答の選択肢(連続した数)の個数
    shuffleIntervalMs: 850,
    dotMoveMs: 600,
    questionLimitSec: 0, // 0 は1問の制限時間なし
    fieldScale: 0.85, // 全体の円の大きさ(以前の大きさに対する倍率)
    dotRadiusRatio: 0.045,
    dotMinDistanceRatio: 0.07, // 点の直径より少し小さい。点どうしは少し重なってよい
    placementAttemptLimit: 200,
    layoutRestartLimit: 20,
    answerFeedbackMs: 300,
    stallAbortMs: 1000,
  }),
  t6: Object.freeze({
    durationSec: 180,
    obstacleColor: 'blue',
    obstacleEdgeColor: 'cyan',
    moveSpeed: 1, // トンネル断面の内部単位/秒
    collisionSpeedFactor: 0.5,
    initialSpeed: 0.8, // トンネル半径を1とする内部単位/秒
    acceleration: 0.02,
    recoveryAcceleration: 0.16, // 最高速で衝突しても約5秒で基準速度へ戻る
    maxSpeed: 1.6,
    obstacleSpacing: 2.4,
    firstObstacleDistance: 5,
    bladeOpeningDeg: 60,
    bladeOpeningCounts: Object.freeze([1, 2, 3]),
    bladeHubRadius: 0.18,
    bladeInitialAngularSpeedDegSec: 30,
    bladeAngularAccelerationDegSec2: 0.15,
    collisionPushMs: 350, // 衝突したときの巻き戻しにかける時間
    collisionPullbackDistance: 0.5, // 衝突したときに進行を巻き戻す距離(障害物の間隔は2.4。2026-09-27 ユーザーの判断で横の押し戻しから変更)
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
    holeSlotCount: 4,
    holeOpenCounts: Object.freeze([1, 2, 3]),
    holeRotationRate: 0.5,
    holeRingRadius: 0.6,
    holeRadius: 0.3,
  }),
});

// 画面の表示件数など(利用者が変える値ではない)
export const DISPLAY = Object.freeze({
  historyRows: 20, // 履歴の表に出す直近の回数(SPEC §7)
  historySparkRows: 10,
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
        if (testId === 't6' && key === 'holeSlotCount' && src[key] !== 4) {
          out[key] = def;
          warnings.push(`${testId}.${key}`);
        } else if (testId === 't6' && (key === 'obstacleColor' || key === 'obstacleEdgeColor')
          && !T6_COLOR_OPTIONS[key === 'obstacleColor' ? 'obstacle' : 'edge'].some(color => color.name === src[key])) {
          out[key] = def;
          warnings.push(`${testId}.${key}`);
        } else if (sameType(def, src[key])) {
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
