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
    // 2026-09-30 本番の記憶で変更: 1回15問(単位変換5 → 割合5 → 計算5)を5分。
    // 2026-10-01 ユーザーの実機の感想で変更: 問題文の数値は整数だけ(きりの悪い2〜4桁)。答えと選択肢は整数か小数第1位まで
    durationSec: 300,
    questionsPerCategory: 5,
    calculatorDuringTest: true,
    answerFeedbackMs: 300,
    stallAbortMs: 1000,
    promptNumberMin: 10, // 問題文の数値は2〜4桁の整数(2026-10-01 追加)
    promptNumberMax: 9999,
    unitAnswerMax: 1000000, // 単位変換の答えの上限
    speedMin: 11, // 速さ(時速km、整数)
    speedMax: 79,
    speedMinutesMin: 21, // 速さの問題の時間(分、整数)
    speedMinutesMax: 299,
    speedHoursMin: 1.1, // 時間を求める問題の答え(時間、小数第1位まで)
    speedHoursMax: 9.9,
    lapSpeedMin: 51, // 出会い・追いつきの分速(m、整数。2026-10-01 時速 km から変更)
    lapSpeedMax: 249,
    lapMinutesMin: 5, // 出会い・追いつきの答えの分(小数第1位まで)
    lapMinutesMax: 60,
    percentBaseMin: 101, // 割合・利益率・割引のもとの数(3〜4桁の整数)
    percentBaseMax: 4999,
    percentMin: 11, // 割合の率(5の倍数でない整数%)
    percentMax: 89,
    markupRateMin: 11, // 利益率
    markupRateMax: 59,
    discountRateMin: 11, // 割引率
    discountRateMax: 45,
    wholeMin: 101, // 全体の逆算の全体(人・便)
    wholeMax: 480,
    growthRateMin: 3, // 前年比の伸び(%)
    growthRateMax: 29,
    yearValueMin: 1001, // 前年比の去年の値(今年の値も4桁まで。2026-10-01 7桁から変更)
    yearValueMax: 8999,
    priceMin: 101, // 単価(円)
    priceMax: 999,
    priceCountMin: 12,
    priceCountMax: 48,
    per100gGramsMin: 120, // 100gあたりの問題のグラムと合計(ドル。2026-10-01 追加)
    per100gGramsMax: 980,
    per100gTotalMin: 11,
    per100gTotalMax: 99,
    averageMin: 11, // 平均(2桁の整数。2026-10-01 小数第1位までから変更)
    averageMax: 99,
    clockStartHourMin: 6,
    clockStartHourMax: 18,
    elapsedMinutesMin: 15,
    elapsedMinutesMax: 180,
    // 図形(2026-09-28 ユーザーの判断で追加)
    geometryLengthMin: 11, // 三角形・台形・平行四辺形の辺と高さ(cm、2桁の整数。2026-10-01 小数第1位までから変更)
    geometryLengthMax: 99,
    circlePi: 3.14,
    circleDiameterMin: 21, // 円周の問題の直径(cm。5の倍数、周から求める問題は50の倍数)
    circleDiameterMax: 295,
    circleAreaRadiusMin: 15, // 円の面積の問題の半径(cm。5の倍数で、きりのいい数を除く: 15・25・…・95)
    circleAreaRadiusMax: 95,
    // 本番に出た形(2026-09-30 本番に合わせて追加)
    workWorkersMin: 3, // 仕事算の人数
    workWorkersMax: 24,
    workHoursMin: 11, // 仕事算の時間(2桁の整数。2026-10-01 小数第2位までから変更)
    workHoursMax: 99,
    flightSpeedMin: 600, // 速さと時間の時速(km)
    flightSpeedMax: 900,
    flightSpeedDiffMax: 60, // 2つの時速の差の上限
    flightHoursMin: 2,
    flightHoursMax: 12,
    wageHoursMin: 4, // 時給の問題の時間
    wageHoursMax: 40,
    wageDollarMin: 10, // 時給(ドル、小数第1位まで。2026-10-01 第2位までから変更)
    wageDollarMax: 50,
    wageYenMin: 900, // 時給(円)。10円刻み
    wageYenMax: 2500,
    cylinderDiameterMin: 11, // 円筒の直径(cm、2桁の整数。2026-10-01 小数第1位までから変更)
    cylinderDiameterMax: 39,
    cylinderHeightMin: 51, // 円筒の高さ(cm、整数。2026-10-01 m の小数第2位までから変更)
    cylinderHeightMax: 199,
    cylinderGapMin: 5, // 上から下げる長さ(cm)
    cylinderGapMax: 20,
  }),
  t2: Object.freeze({
    durationSec: 120, // 2026-09-22 ユーザーの判断で 180 → 120
    intervalMs: 1000, // 不一致の表示の切り替え間隔
    matchRate: 0.25,
    maxConsecutiveMatches: 3, // 一致が続いてよい最大回数(2026-09-30 本番に合わせて 1 → 3)
    matchWaitMs: 5000, // 一致の表示は押すまで止まる。この時間で押せなければやり直し(2026-09-30 本番に合わせて追加)
    initialNonMatchCount: 3, // 始まってから最初のこの数の表示では一致を出さない(2026-09-30 ユーザーの実機の感想で追加)
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
    shapeLimitMs: 7000, // 図形の1問ごとの制限時間。過ぎたら未回答(2026-09-30 本番に合わせて追加。ユーザーの実機の感想で 5000 → 7000)
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
    // compassMode(北が上/機首が上の切り替え)は廃止。左の計器は GYRO だけ(2026-09-30 本番に合わせて変更)
    headingDirections: 4, // 機首の向きの数。本番は N・E・S・W の4つ(2026-09-30 本番の記憶で追加)。8 にもできる
  }),
  t5: Object.freeze({
    durationSec: 180,
    // 2026-09-30 本番に合わせて変更: 点の数は段階(最初は minDots、正解で+1、続けて不正解で−1)の −levelSpreadDown〜+levelSpreadUp から選ぶ
    minDots: 3,
    maxDots: 14,
    levelSpreadDown: 2, // 出す数の範囲は 段階 − levelSpreadDown 〜 段階 + levelSpreadUp(2026-09-30 ユーザーの実機の感想で −3〜+3 → −2〜+3)
    levelSpreadUp: 3,
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
    // 速さと間隔(2026-09-30 本番に合わせて変更)
    acceleration: 3,
    recoveryAcceleration: 3,
    maxSpeed: 15, // 2026-09-30 ユーザーの実機の感想で 10 → 15(設定では20まで)
    recoveryCapSpeed: 2, // 衝突のあと、ぶつかった障害物を通過するまでの速度の上限(2026-09-30 ユーザーの実機の感想で追加)
    obstacleSpacing: 8,
    firstObstacleDistance: 12,
    bladeOpeningDeg: 60,
    bladeOpen1Rate: 0.4, // 羽根の開口の数の確率(1つ・2つ・3つ。2026-09-30 ユーザーの実機の感想で変更)
    bladeOpen2Rate: 0.4,
    bladeOpen3Rate: 0.2,
    centerOpenRadius: 0.2, // 羽根と扇形は、中心からこの半径の円の中を通れる(2026-09-30 本番に合わせて追加)
    barWidth: 0.7, // 回転する長方形の帯の幅(2026-09-30 本番に合わせて追加。2026-10-01 ユーザーの実機の感想で 0.35 → 0.7)
    bladeInitialAngularSpeedDegSec: 30,
    bladeAngularAccelerationDegSec2: 0.15,
    collisionPushMs: 350, // 衝突したときの巻き戻しにかける時間
    collisionPullbackDistance: 2, // 衝突したときに進行を巻き戻す距離(2026-09-27 ユーザーの判断で横の押し戻しから変更。2026-09-30 速さが上がるので 0.5 → 2)
    aircraftMaxRadius: 0.86,
    hitRadius: 0.08, // 当たり判定の円の半径(2026-09-30 ユーザーの実機の感想で追加。2026-10-01 同じく 0.06 → 0.08)
    canvasMarginPx: 8,
    stickRadiusRatio: 0.14,
    stickMinRadiusPx: 60,
    stickMaxRadiusPx: 90,
    tunnelMinRadiusRatio: 0.3,
    stickSide: 'right',
    stallAbortMs: 1000,
    perspectiveFocal: 2.6, // 焦点距離。大きいほど視野が狭く、トンネルの中に入っている感じになる(2026-09-30 画面で見て 1 → 2、2026-10-01 2 → 2.6)
    wallRingCount: 28, // トンネルの壁を奥へ向かって暗く塗る段の数(最後の段は奥の穴。2026-10-01 ユーザーの実機の感想で追加)
    collisionZ: 1,
    farZ: 32, // 奥まで見えるよう 12 → 32(2026-09-30 本番に合わせて変更)
    sectorOpeningDeg: 90,
    holeSlotCount: 4,
    holeThreeSlotCount: 3, // 3つ空きのときだけ、穴を120°ずつに置く(2026-10-01 ユーザーの実機の感想で追加。固定)
    holeOpenCounts: Object.freeze([1, 2, 3]),
    holeRotationRate: 0.5,
    holeRingRadius: 0.6,
    holeRadius: 0.38, // 隣の穴と重ならず、トンネルの内側に収まる大きさ(2026-09-30 本番に合わせて 0.3 → 0.38)
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
        if (testId === 't6' && ((key === 'holeSlotCount' && src[key] !== 4) || (key === 'holeThreeSlotCount' && src[key] !== 3))) {
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
