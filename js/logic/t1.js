// テスト1 計算: 14種類の問題生成、典型誤答の4択、判定、採点。DOMには触れない。
// 2026-09-30 本番に合わせて変更: 仕事算・速さと時間・時給・円筒を足し、問題文を短い場面の文章題にした。
import { randInt, shuffle } from '../core/rng.js';

export const PROBLEM_KINDS = Object.freeze([
  'unit', 'speed', 'meeting', 'catchup', 'percentage', 'inversePercentage', 'price', 'average', 'elapsed', 'geometry',
  'work', 'speedTime', 'wage', 'cylinder',
]);

// ---- 場面(2026-09-30 本番に合わせて追加) ----
// 問題文は「場面の文。問いの文」にする。場面は種類ごとに3つ以上あり、ランダムに使う。
// 場面の文には数字を入れない(問題文の数値は、正解の計算に使う数値だけにする)。
function pickScene(rng, list) {
  const index = randInt(rng, 0, list.length - 1);
  return { index, scene: list[index] };
}

// 単位換算の場面。q: 換算前の量(「時速6km」など)、ask: 問いの単位(「分速何m」など)
const UNIT_SCENES = Object.freeze({
  lengthLong: [
    (q, ask) => `滑走路の長さは${q}です。これは${ask}ですか?`,
    (q, ask) => `空港から倉庫までの道のりは${q}です。これは${ask}ですか?`,
    (q, ask) => `飛行機が誘導路を${q}走りました。これは${ask}ですか?`,
  ],
  lengthShort: [
    (q, ask) => `荷物の幅は${q}です。これは${ask}ですか?`,
    (q, ask) => `整備用のケーブルの長さは${q}です。これは${ask}ですか?`,
    (q, ask) => `部品の長さを測ると${q}でした。これは${ask}ですか?`,
  ],
  weight: [
    (q, ask) => `貨物の重さは${q}です。これは${ask}ですか?`,
    (q, ask) => `機内食の材料を${q}仕入れました。これは${ask}ですか?`,
    (q, ask) => `トラックに${q}の荷物を積みました。これは${ask}ですか?`,
  ],
  areaLarge: [
    (q, ask) => `空港の敷地の広さは${q}です。これは${ask}ですか?`,
    (q, ask) => `新しい駐機場の広さは${q}です。これは${ask}ですか?`,
    (q, ask) => `物流倉庫の敷地は${q}です。これは${ask}ですか?`,
  ],
  areaSmall: [
    (q, ask) => `機体のパネルの面積は${q}です。これは${ask}ですか?`,
    (q, ask) => `窓ガラスの面積は${q}です。これは${ask}ですか?`,
    (q, ask) => `荷札のラベルの面積は${q}です。これは${ask}ですか?`,
  ],
  volume: [
    (q, ask) => `タンクに燃料が${q}入っています。これは${ask}ですか?`,
    (q, ask) => `機内で飲み物を${q}用意しました。これは${ask}ですか?`,
    (q, ask) => `容器に水が${q}入っています。これは${ask}ですか?`,
  ],
  volumeSmall: [
    (q, ask) => `部品の体積は${q}です。これは${ask}ですか?`,
    (q, ask) => `小さな箱の容積は${q}です。これは${ask}ですか?`,
    (q, ask) => `ねじの体積は${q}です。これは${ask}ですか?`,
  ],
  time: [
    (q, ask) => `フライトの時間は${q}です。これは${ask}ですか?`,
    (q, ask) => `機体の整備に${q}かかりました。これは${ask}ですか?`,
    (q, ask) => `荷物の積み込みに${q}かかりました。これは${ask}ですか?`,
  ],
  speed: [
    (q, ask) => `旅客機が地上を${q}で移動しています。これは${ask}ですか?`,
    (q, ask) => `トラックが${q}で走っています。これは${ask}ですか?`,
    (q, ask) => `風の速さは${q}です。これは${ask}ですか?`,
  ],
});

// 図形の問題に使う物の名前(形ごとに3つ)
const GEOMETRY_NOUNS = Object.freeze({
  circle: ['円形の花壇', '丸いテーブル', '円形の噴水'],
  triangle: ['三角形の旗', '三角形の板', '三角形のラベル'],
  trapezoid: ['台形の板', '台形の窓', '台形の看板'],
  parallelogram: ['平行四辺形の板', '平行四辺形のタイル', '平行四辺形の看板'],
});

// 単位換算の組(大きい単位 → 小さい単位の向きを1行で書き、往復の2種類を作る)。
// 換算後 = 換算前 × num ÷ den。pre は「時速」などの前置き。
// confuse: 典型的に取り違える倍率(掛けると割るの逆、換算忘れは共通で加える)。
// forgotPower: 2乗・3乗の換算で「乗し忘れ」たときの倍率(長さの倍率のまま)。
const UNIT_PAIRS = Object.freeze([
  { ids: ['ha-to-m2', 'm2-to-ha'], scene: 'areaLarge', big: 'ha', small: 'm²', num: 10000, den: 1, confuse: [100, 1000, 1000000] },
  { ids: ['a-to-m2', 'm2-to-a'], scene: 'areaLarge', big: 'a', small: 'm²', num: 100, den: 1, confuse: [10, 1000, 10000] },
  { ids: ['km2-to-ha', 'ha-to-km2'], scene: 'areaLarge', big: 'km²', small: 'ha', num: 100, den: 1, confuse: [1000, 10000, 1000000] },
  { ids: ['km-to-m', 'm-to-km'], scene: 'lengthLong', big: 'km', small: 'm', num: 1000, den: 1, confuse: [100, 10000] },
  { ids: ['hours-to-minutes', 'minutes-to-hours'], scene: 'time', big: '時間', small: '分', num: 60, den: 1, confuse: [100, 3600, 24] },
  // 2026-09-27 ユーザーの判断で追加
  { ids: ['m-to-cm', 'cm-to-m'], scene: 'lengthShort', big: 'm', small: 'cm', num: 100, den: 1, confuse: [10, 1000, 10000] },
  { ids: ['cm-to-mm', 'mm-to-cm'], scene: 'lengthShort', big: 'cm', small: 'mm', num: 10, den: 1, confuse: [100, 1000, 10000] },
  { ids: ['kg-to-g', 'g-to-kg'], scene: 'weight', big: 'kg', small: 'g', num: 1000, den: 1, confuse: [100, 10000] },
  { ids: ['t-to-kg', 'kg-to-t'], scene: 'weight', big: 't', small: 'kg', num: 1000, den: 1, confuse: [100, 10000] },
  { ids: ['L-to-mL', 'mL-to-L'], scene: 'volume', big: 'L', small: 'mL', num: 1000, den: 1, confuse: [100, 10000] },
  { ids: ['L-to-dL', 'dL-to-L'], scene: 'volume', big: 'L', small: 'dL', num: 10, den: 1, confuse: [100, 1000, 10000] },
  { ids: ['m3-to-L', 'L-to-m3'], scene: 'volume', big: 'm³', small: 'L', num: 1000, den: 1, confuse: [100, 10000, 1000000] },
  { ids: ['minutes-to-seconds', 'seconds-to-minutes'], scene: 'time', big: '分', small: '秒', num: 60, den: 1, confuse: [100, 3600, 24] },
  { ids: ['days-to-hours', 'hours-to-days'], scene: 'time', big: '日', small: '時間', num: 24, den: 1, confuse: [60, 12, 100] },
  { ids: ['ha-to-a', 'a-to-ha'], scene: 'areaLarge', big: 'ha', small: 'a', num: 100, den: 1, confuse: [10, 1000, 10000] },
  // 速さ: 60 と 3600 の取り違え、km→m の換算忘れなど
  { ids: ['kmh-to-mpm', 'mpm-to-kmh'], scene: 'speed', big: 'km', bigPre: '時速', small: 'm', smallPre: '分速', num: 1000, den: 60,
    confuse: [1000 / 3600, 1000, 60, 1 / 60] },
  { ids: ['mps-to-kmh', 'kmh-to-mps'], scene: 'speed', big: 'm', bigPre: '秒速', small: 'km', smallPre: '時速', num: 3600, den: 1000,
    confuse: [60 / 1000, 3600, 60, 1000 / 3600] },
  // 2乗・3乗の換算(2026-09-27 ユーザーの判断で追加)
  { ids: ['m2-to-cm2', 'cm2-to-m2'], scene: 'areaSmall', big: 'm²', small: 'cm²', num: 10000, den: 1, forgotPower: 100, confuse: [1000, 1000000] },
  { ids: ['cm2-to-mm2', 'mm2-to-cm2'], scene: 'areaSmall', big: 'cm²', small: 'mm²', num: 100, den: 1, forgotPower: 10, confuse: [1000, 10000] },
  { ids: ['cm3-to-mm3', 'mm3-to-cm3'], scene: 'volumeSmall', big: 'cm³', small: 'mm³', num: 1000, den: 1, forgotPower: 10, confuse: [100, 1000000] },
  { ids: ['L-to-cm3', 'cm3-to-L'], scene: 'volume', big: 'L', small: 'cm³', num: 1000, den: 1, forgotPower: 10, confuse: [100, 10000] },
]);

// 単位換算の誤答の上限(正解は100万以下。誤答もその10倍まで)
const UNIT_DISTRACTOR_MAX = 10000000;

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

// 往復それぞれを1つの種類にする。step は、換算後が整数になる換算前の最小の数
const UNIT_VARIANTS = Object.freeze(UNIT_PAIRS.flatMap(pair => {
  const forward = {
    id: pair.ids[0], from: pair.big, fromPre: pair.bigPre ?? '', to: pair.small, toPre: pair.smallPre ?? '',
    num: pair.num, den: pair.den, confuse: pair.confuse, forgotPower: pair.forgotPower ?? null, scene: pair.scene,
  };
  const reverse = {
    id: pair.ids[1], from: pair.small, fromPre: pair.smallPre ?? '', to: pair.big, toPre: pair.bigPre ?? '',
    num: pair.den, den: pair.num, confuse: pair.confuse.map(c => 1 / c),
    forgotPower: pair.forgotPower ? 1 / pair.forgotPower : null, scene: pair.scene,
  };
  return [forward, reverse].map(v => Object.freeze({ ...v, step: v.den / gcd(v.num, v.den) }));
}));

export const UNIT_VARIANT_IDS = Object.freeze(UNIT_VARIANTS.map(v => v.id));
export const POWER_UNIT_VARIANT_IDS = Object.freeze(UNIT_VARIANTS.filter(v => v.forgotPower).map(v => v.id));
export const PRICE_VARIANTS = Object.freeze(['total', 'unit-price', 'per-100g', 'per-gram-total']);
export const GEOMETRY_VARIANTS = Object.freeze([
  'circle-circumference-diameter', 'circle-circumference-radius', 'circle-diameter', 'circle-area',
  'triangle-area', 'trapezoid-area', 'parallelogram-area',
]);

function roundNumber(value) {
  return Math.round(value * 1e6) / 1e6;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(roundNumber(value));
}

export function lapMinutes(lengthKm, speedA, speedB, kind) {
  const divisor = kind === 'meeting' ? speedA + speedB : Math.abs(speedA - speedB);
  if (!(lengthKm > 0) || !(divisor > 0) || !['meeting', 'catchup'].includes(kind)) {
    throw new RangeError('距離と速度の組が不正です');
  }
  return roundNumber(lengthKm * 60 / divisor);
}

// 小数第 decimals 位までで表せる正の数か(decimals=0 なら正の整数)
function hasDecimals(value, decimals) {
  const scaled = value * 10 ** decimals;
  return value > 0 && Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

// required: 必ず入れる誤答(2乗・3乗の「乗し忘れ」など)。桁ずらし(正解×10・÷10)は合わせて1つまで
// decimals: 答えと誤答の小数の桁数の上限。これまでの種類は0(正の整数)。新しい種類だけ1・2を使う(2026-09-30)
export function makeT1Choices(answer, mistakes, rng, required = [], decimals = 0) {
  if (!hasDecimals(answer, decimals)) throw new RangeError(`正解は小数第${decimals}位までの正の数である必要があります`);
  const isShift = value => value === roundNumber(answer * 10) || value === roundNumber(answer / 10);
  const valid = value => hasDecimals(value, decimals);
  const seen = new Set([answer]);
  const forced = [];
  for (const raw of required) {
    const value = roundNumber(raw);
    if (!valid(value) || seen.has(value)) throw new RangeError(`必ず入れる誤答が正しい形の数になりません: ${raw}`);
    seen.add(value);
    forced.push(value);
  }
  const typical = [];
  const digitShifts = [];
  for (const raw of mistakes) {
    const value = roundNumber(raw);
    if (!valid(value) || seen.has(value)) continue;
    seen.add(value);
    if (isShift(value)) digitShifts.push(value);
    else typical.push(value);
  }
  const forcedShift = forced.some(isShift);
  const shiftSlots = forcedShift || !digitShifts.length ? 0 : 1;
  const typicalNeeded = 3 - forced.length - shiftSlots;
  if (typical.length < typicalNeeded || typicalNeeded < 0 || typical.length < 2 - forced.length) {
    throw new RangeError('典型誤答を3つ作れません');
  }
  const distractors = [...forced, ...shuffle(rng, typical).slice(0, typicalNeeded)];
  if (shiftSlots) distractors.push(shuffle(rng, digitShifts)[0]);
  const choices = shuffle(rng, [answer, ...distractors]);
  return { choices, correctIndex: choices.indexOf(answer) };
}

// values: 不正解のときに出す式(t1Formula)に入れる数値。表示のために問題文を読み直さない
// answerPrefix: 答えの前置き(「時速」「約」など)。options.required: 必ず入れる誤答
// options.decimals: 答えの小数の桁数の上限(これまでの種類は0)。options.answerFormat: 'hm' なら答え(分)を「◯時間◯分」で表す
// options.scene: 使った場面(単体テストで場面の数を確かめるため)
function finish(kind, variant, prompt, answer, unit, mistakes, rng, values,
  { answerPrefix = '', required = [], decimals = 0, answerFormat = null, scene = null } = {}) {
  const roundedAnswer = roundNumber(answer);
  if (!hasDecimals(roundedAnswer, decimals)) throw new Error(`正しい形の正解を作れませんでした: ${kind}/${variant}`);
  const choice = makeT1Choices(roundedAnswer, mistakes, rng, required, decimals);
  return {
    kind, variant, prompt, answer: roundedAnswer, unit, answerPrefix, answerFormat, values, scene,
    ...choice,
    signature: `${kind}|${variant}|${prompt}|${roundedAnswer}`,
  };
}

function unitProblem(rng, p, forcedVariant = null) {
  const v = forcedVariant
    ? UNIT_VARIANTS.find(x => x.id === forcedVariant)
    : UNIT_VARIANTS[randInt(rng, 0, UNIT_VARIANTS.length - 1)];
  if (!v) throw new RangeError(`不明な単位換算です: ${forcedVariant}`);
  // 換算前は step の倍数にして、答えを整数にする(時速は3の倍数、秒速は5の倍数など)
  const shown = randInt(rng, p.unitValueMin, p.unitValueMax) * v.step;
  const answer = shown * v.num / v.den;
  // t は「メートルトン」とも言う(2026-09-30 本番に合わせて追加)
  const tonWord = rng() < 0.5 ? 'メートルトン' : 't';
  const label = unit => (unit === 't' ? tonWord : unit);
  const from = label(v.from);
  const to = label(v.to);
  const { index, scene } = pickScene(rng, UNIT_SCENES[v.scene]);
  const mistakes = [
    shown, // 換算し忘れ
    shown * v.den / v.num, // 掛けると割るを逆にする
    ...v.confuse.map(c => shown * c), // 倍率の取り違え
    ...v.confuse.map(c => shown / c), // 掛けると割るを逆にし、倍率も取り違える
    answer * 100, answer / 100, answer * 10, answer / 10,
  ].filter(value => value <= UNIT_DISTRACTOR_MAX); // すぐに誤りと分かる極端に大きな誤答は使わない
  return finish(
    'unit', v.id,
    scene(`${v.fromPre}${formatNumber(shown)}${from}`, `${v.toPre}何${to}`),
    answer, to, mistakes, rng,
    { shown, num: v.num, den: v.den, from, fromPre: v.fromPre, to, toPre: v.toPre },
    { answerPrefix: v.toPre, required: v.forgotPower ? [shown * v.forgotPower] : [], scene: `${v.scene}:${index}` },
  );
}

function speedProblem(rng, p) {
  const speed = randInt(rng, p.speedMin, p.speedMax);
  const hours = randInt(rng, p.speedHoursMin, p.speedHoursMax);
  const distance = speed * hours;
  const variant = ['distance', 'time', 'speed'][randInt(rng, 0, 2)];
  const index = randInt(rng, 0, 2);
  const scene = `speed:${index}`;
  const vehicle = ['旅客機', 'トラック', '船'][index];
  if (variant === 'distance') {
    const prompt = [
      `旅客機が時速${speed}kmで${hours}時間飛びました。何km進みましたか?`,
      `トラックが時速${speed}kmで${hours}時間走りました。何km進みましたか?`,
      `船が時速${speed}kmで${hours}時間進みました。何km進みましたか?`,
    ][index];
    return finish('speed', variant, prompt, distance, 'km',
      [speed + hours, speed * 60, distance + speed, Math.abs(distance - speed), distance * 10, distance / 10], rng, { speed, hours, distance }, { scene });
  }
  if (variant === 'time') {
    const prompt = [
      `次の空港まで${distance}kmあります。時速${speed}kmで飛ぶと何時間かかりますか?`,
      `倉庫まで${distance}kmの道のりを、トラックが時速${speed}kmで走ります。何時間かかりますか?`,
      `港まで${distance}kmの航路を、船が時速${speed}kmで進みます。何時間かかりますか?`,
    ][index];
    return finish('speed', variant, prompt, hours, '時間',
      [distance - speed, hours * 60, distance + speed, speed + hours, distance, hours * 10, hours / 10], rng, { speed, hours, distance }, { scene });
  }
  return finish('speed', variant, `${vehicle}が${distance}kmを${hours}時間で進みました。速さは時速何kmですか?`, speed, 'km',
    [distance - hours, speed * 60, distance + hours, speed + hours, distance, speed * 10, speed / 10], rng, { speed, hours, distance },
    { answerPrefix: '時速', scene });
}

const lapCache = new WeakMap();
export function lapCandidates(p) {
  if (lapCache.has(p)) return lapCache.get(p);
  const pools = { integer: [], decimal: [] };
  for (let a = p.lapSpeedMin + 1; a <= p.lapSpeedMax; a++) {
    for (let b = p.lapSpeedMin; b < a; b++) {
      for (let multiplier = p.lapMultiplierMin; multiplier <= p.lapMultiplierMax; multiplier++) {
        const product = (a + b) * (a - b) * multiplier;
        // 距離=product/60。整数演算で小数第1位までの候補だけを構成する。
        if (product % 6 !== 0) continue;
        pools[product % 60 === 0 ? 'integer' : 'decimal'].push({ a, b, multiplier, length: product / 60 });
      }
    }
  }
  lapCache.set(p, pools);
  return pools;
}

function pickLap(rng, p) {
  const pools = lapCandidates(p);
  const pool = rng() < p.lapIntegerRate || !pools.decimal.length ? pools.integer : pools.decimal;
  if (!pool.length) throw new RangeError('整数の周回距離を作れる速度・倍率の組がありません');
  return pool[randInt(rng, 0, pool.length - 1)];
}

// 周回の場面(出会い・追いつき)。「周囲◯km」の形は保つ
const LAP_SCENES = Object.freeze([
  { place: '空港の外周道路', who: '車両' },
  { place: '池のまわり', who: 'ふたり' },
  { place: '公園のジョギングコース', who: 'ランナー' },
]);

function meetingProblem(rng, p) {
  const { a, b, multiplier, length } = pickLap(rng, p);
  const difference = a - b;
  const minutes = difference * multiplier;
  const wrongOperation = (a + b) * multiplier;
  const { index, scene } = pickScene(rng, LAP_SCENES);
  return finish('meeting', 'opposite',
    `周囲${formatNumber(length)}kmの${scene.place}を、時速${a}kmと時速${b}kmの${scene.who}が同じ地点から反対方向に進み始めました。何分後に出会いますか?`,
    minutes, '分', [wrongOperation, minutes / 60, minutes * 60, minutes * 10, minutes / 10], rng, { length, a, b }, { scene: `meeting:${index}` });
}

function catchupProblem(rng, p) {
  const { a, b, multiplier, length } = pickLap(rng, p);
  const sum = a + b;
  const difference = a - b;
  const minutes = sum * multiplier;
  const wrongOperation = difference * multiplier;
  const { index, scene } = pickScene(rng, LAP_SCENES);
  return finish('catchup', 'same-direction',
    `周囲${formatNumber(length)}kmの${scene.place}を、時速${a}kmと時速${b}kmの${scene.who}が同じ地点から同じ方向に進み始めました。速い方は何分後に遅い方に追いつきますか?`,
    minutes, '分', [wrongOperation, minutes / 60, minutes * 60, minutes * 10, minutes / 10], rng, { length, a, b }, { scene: `catchup:${index}` });
}

function percentageProblem(rng, p) {
  const percent = p.percentagePercents[randInt(rng, 0, p.percentagePercents.length - 1)];
  const unit = randInt(rng, p.percentageUnitMin, p.percentageUnitMax);
  const base = unit * 100;
  const answer = unit * percent;
  const { index, scene } = pickScene(rng, [
    { unit: '人', text: `乗客${base}人のうち${percent}%がビジネスクラスです。ビジネスクラスの乗客は何人ですか?` },
    { unit: 'kg', text: `貨物${base}kgのうち${percent}%が郵便物です。郵便物は何kgですか?` },
    { unit: '円', text: `運賃${base}円のうち${percent}%が燃料費です。燃料費は何円ですか?` },
  ]);
  return finish('percentage', 'basic', scene.text, answer, scene.unit,
    [base * percent, base - answer, base + percent, Math.abs(base - percent), answer * 10, answer / 10], rng, { base, percent },
    { scene: `percentage:${index}` });
}

function inversePercentageProblem(rng, p) {
  const percent = p.percentagePercents[randInt(rng, 0, p.percentagePercents.length - 1)];
  const base = randInt(rng, p.percentageUnitMin, p.percentageUnitMax) * 100;
  const part = base * percent / 100;
  const { index, scene } = pickScene(rng, [
    `定員${base}人の便に${part}人が乗っています。搭乗率は何%ですか?`,
    `${base}個の荷物のうち${part}個を積み終えました。何%を積み終えましたか?`,
    `予算${base}円のうち${part}円を使いました。予算の何%を使いましたか?`,
  ]);
  return finish('inversePercentage', 'basic', scene, percent, '%',
    [100 - percent, percent * 100, percent / 100, base - part, base * part, percent * 10, percent / 10], rng, { base, part },
    { scene: `inversePercentage:${index}` });
}

function priceProblem(rng, p, forcedVariant = null) {
  const variant = forcedVariant ?? PRICE_VARIANTS[randInt(rng, 0, PRICE_VARIANTS.length - 1)];
  if (variant === 'total' || variant === 'unit-price') {
    const price = randInt(rng, p.priceMin, p.priceMax);
    const count = randInt(rng, p.priceCountMin, p.priceCountMax);
    const total = price * count;
    const index = randInt(rng, 0, 2);
    if (variant === 'total') {
      const prompt = [
        `機内販売で${price}円の品物を${count}個買いました。合計は何円ですか?`,
        `${price}円のお弁当を${count}個注文しました。合計は何円ですか?`,
        `単価${price}円の部品を${count}個発注しました。合計は何円ですか?`,
      ][index];
      return finish('price', 'total', prompt, total, '円',
        [price / count, price + count, price, total + price, total - price, total * 10, total / 10], rng, { price, count, total },
        { scene: `price:${index}` });
    }
    const prompt = [
      `機内販売で同じ品物を${count}個買うと${total}円でした。単価は何円ですか?`,
      `同じお弁当を${count}個注文すると${total}円でした。単価は何円ですか?`,
      `同じ部品を${count}個発注すると${total}円でした。単価は何円ですか?`,
    ][index];
    return finish('price', 'unit-price', prompt, price, '円',
      [total * count, total - count, total, price + count, price * 10, price / 10], rng, { price, count, total }, { scene: `price:${index}` });
  }
  if (variant === 'per-100g') {
    // 2026-09-27 ユーザーの判断で追加: 「300gで450円の品物は、100gあたり何円ですか?」
    const per = 100;
    const answer = randInt(rng, p.priceMin, p.priceMax);
    // 1000gだと「割り忘れ(合計の円)」が正解のちょうど10倍(桁ずらし)と重なるため除く
    const counts = [];
    for (let c = p.priceCountMin; c <= p.priceCountMax; c++) if (c * per !== 1000) counts.push(c);
    const grams = per * (counts.length ? counts[randInt(rng, 0, counts.length - 1)] : p.priceCountMin);
    const total = answer * grams / per;
    const { index, scene } = pickScene(rng, ['コーヒー豆', 'お茶の葉', 'ナッツ']);
    return finish('price', 'per-100g', `${scene}が${grams}gで${total}円です。${per}gあたり何円ですか?`, answer, '円',
      [total, total * grams / per, total / grams, grams * per / total, answer * 10, answer / 10], rng, { grams, total, per },
      { scene: `price:${index}` });
  }
  if (variant === 'per-gram-total') {
    // 2026-09-27 ユーザーの判断で追加: 「1gあたり3円の品物を250g買うと何円ですか?」
    const perGram = randInt(rng, Math.max(2, Math.ceil(p.priceMin / 10)), Math.max(2, Math.floor(p.priceMax / 10)));
    const grams = 50 * randInt(rng, 2 * p.priceCountMin, 2 * p.priceCountMax);
    const answer = perGram * grams;
    const { index, scene } = pickScene(rng, ['チョコレート', 'ナッツ', '香辛料']);
    return finish('price', 'per-gram-total', `1gあたり${perGram}円の${scene}があります。${grams}g買うと何円ですか?`, answer, '円',
      [grams, perGram + grams, answer / 100, grams / perGram, answer * 100, answer * 10, answer / 10], rng, { perGram, grams },
      { scene: `price:${index}` });
  }
  throw new RangeError(`不明な単価の問題です: ${variant}`);
}

function averageProblem(rng, p) {
  const a = randInt(rng, p.averageMin, p.averageMax);
  const b = randInt(rng, p.averageMin, p.averageMax);
  const candidates = [];
  for (let c = p.averageMin; c <= p.averageMax; c++) if ((a+b+c)%3 === 0) candidates.push(c);
  const c = candidates[randInt(rng, 0, candidates.length - 1)];
  const sum = a+b+c, answer = sum/3;
  const { index, scene } = pickScene(rng, [
    { unit: '分', text: `ある便の三日間の遅れは${a}分、${b}分、${c}分でした。平均は何分ですか?` },
    { unit: 'kg', text: `三つの荷物の重さは${a}kg、${b}kg、${c}kgです。平均は何kgですか?` },
    { unit: '個', text: `三つの便で売れたお弁当は${a}個、${b}個、${c}個でした。平均は何個ですか?` },
  ]);
  return finish('average', 'three', scene.text, answer, scene.unit,
    [sum, sum / 2, sum * 3, sum - 3, answer * 10, answer / 10], rng, { a, b, c }, { scene: `average:${index}` });
}

function elapsedProblem(rng, p) {
  const start = randInt(rng, p.clockStartHourMin, p.clockStartHourMax) * 60 + randInt(rng, 0, 59);
  const minutes = randInt(rng, p.elapsedMinutesMin, p.elapsedMinutesMax);
  const end = start + minutes;
  const h1 = Math.floor(start/60), m1 = start%60, h2 = Math.floor(end/60), m2 = end%60;
  const { index, scene } = pickScene(rng, [
    `${h1}時${m1}分に出発した便が${h2}時${m2}分に着きました。飛行時間は何分ですか?`,
    `機体の整備を${h1}時${m1}分に始め、${h2}時${m2}分に終えました。整備には何分かかりましたか?`,
    `荷物の積み込みを${h1}時${m1}分に始め、${h2}時${m2}分に終えました。何分かかりましたか?`,
  ]);
  return finish('elapsed', 'same-day', scene, minutes, '分',
    [(h2-h1)*100+m2-m1, minutes*60, minutes/60, minutes+60, Math.abs(minutes-60), minutes*10, minutes/10], rng, { h1, m1, h2, m2 },
    { scene: `elapsed:${index}` });
}

// ---- 図形(2026-09-28 ユーザーの判断で追加) ----
// 円は円周率3.14。直径は circleDiameterUnit(50)の倍数、面積の半径は circleAreaRadiusUnit(10)の倍数にして答えを整数にする。
// 誤答は典型的な間違い(半径と直径の取り違え、円周率を3にする、÷2のし忘れ、周と面積の混同など)から作る。
function productEven(rng, a, min, max) {
  let b = randInt(rng, min, max);
  if ((a * b) % 2 !== 0) b = b + 1 <= max ? b + 1 : b - 1;
  return b;
}

function geometryProblem(rng, p, forcedVariant = null) {
  const variant = forcedVariant ?? GEOMETRY_VARIANTS[randInt(rng, 0, GEOMETRY_VARIANTS.length - 1)];
  const pi = p.circlePi;
  const note = `(円周率は${formatNumber(pi)})`;
  const min = p.geometryLengthMin;
  const max = p.geometryLengthMax;
  // 場面は形ごとの物の名前(2026-09-30 本番に合わせて変更)
  const shape = variant.startsWith('circle') ? 'circle' : variant.replace('-area', '');
  const nounIndex = randInt(rng, 0, GEOMETRY_NOUNS[shape].length - 1);
  const noun = GEOMETRY_NOUNS[shape][nounIndex];
  const scene = `geometry:${nounIndex}`;
  if (variant === 'circle-circumference-diameter') {
    const diameter = p.circleDiameterUnit * randInt(rng, 1, p.circleMultiplierMax);
    const answer = diameter * pi;
    return finish('geometry', variant, `${noun}の直径は${diameter}cmです。周の長さは何cmですか?${note}`, answer, 'cm',
      [diameter * 3, answer / 2, (diameter / 2) ** 2 * pi, answer * 10, answer / 10], rng, { diameter, pi },
      { required: [answer * 2], scene }); // 直径を半径として計算する
  }
  if (variant === 'circle-circumference-radius') {
    const radius = p.circleDiameterUnit / 2 * randInt(rng, 1, p.circleMultiplierMax);
    const answer = radius * 2 * pi;
    return finish('geometry', variant, `${noun}の半径は${radius}cmです。周の長さは何cmですか?${note}`, answer, 'cm',
      [radius * pi, radius * 4 * pi, radius * 2 * 3, radius * radius * pi, answer * 10, answer / 10], rng, { radius, pi }, { scene });
  }
  if (variant === 'circle-diameter') {
    const diameter = p.circleDiameterUnit * randInt(rng, 1, p.circleMultiplierMax);
    const circumference = roundNumber(diameter * pi);
    return finish('geometry', variant, `${noun}の周の長さは${circumference}cmです。直径は何cmですか?${note}`, diameter, 'cm',
      [diameter / 2, diameter * 2, circumference / 3, diameter * 10, diameter / 10], rng, { circumference, pi }, { scene });
  }
  if (variant === 'circle-area') {
    const radius = p.circleAreaRadiusUnit * randInt(rng, 1, p.circleAreaMultiplierMax);
    const answer = radius * radius * pi;
    return finish('geometry', variant, `${noun}の半径は${radius}cmです。面積は何cm²ですか?${note}`, answer, 'cm²',
      [radius * radius * 3, (radius * 2) ** 2 * pi, radius * 2 * pi, radius * pi, answer * 10, answer / 10], rng, { radius, pi }, { scene });
  }
  if (variant === 'triangle-area') {
    const base = randInt(rng, min, max);
    const height = productEven(rng, base, min, max);
    const answer = base * height / 2;
    return finish('geometry', variant, `${noun}は底辺${base}cm、高さ${height}cmです。面積は何cm²ですか?`, answer, 'cm²',
      [base + height, (base + height) * 2, base * height * 2, answer * 10, answer / 10], rng, { base, height },
      { required: [base * height], scene }); // ÷2 のし忘れ
  }
  if (variant === 'trapezoid-area') {
    const top = randInt(rng, min, max - 1);
    const bottom = randInt(rng, top + 1, max);
    const height = productEven(rng, top + bottom, min, max);
    const answer = (top + bottom) * height / 2;
    return finish('geometry', variant, `${noun}は上底${top}cm、下底${bottom}cm、高さ${height}cmです。面積は何cm²ですか?`, answer, 'cm²',
      [bottom * height, top * height, (bottom - top) * height / 2, top * bottom * height / 2, top + bottom + height, answer * 10, answer / 10],
      rng, { top, bottom, height }, { required: [(top + bottom) * height], scene }); // ÷2 のし忘れ
  }
  if (variant === 'parallelogram-area') {
    const base = randInt(rng, min, max);
    const height = randInt(rng, min, max);
    const answer = base * height;
    return finish('geometry', variant, `${noun}は底辺${base}cm、高さ${height}cmです。面積は何cm²ですか?`, answer, 'cm²',
      [answer / 2, base + height, (base + height) * 2, answer * 2, answer * 10, answer / 10], rng, { base, height }, { scene });
  }
  throw new RangeError(`不明な図形の問題です: ${variant}`);
}

// ---- 本番に出た形(2026-09-30 本番に合わせて追加) ----

// 仕事算: 人数と時間は反比例。「5人で11時間かかる作業を、4人で行うと何時間?」→ 13.75時間。答えは小数第2位まで
const workCache = new WeakMap();
function workCandidates(p) {
  if (workCache.has(p)) return workCache.get(p);
  const list = [];
  for (let workers1 = p.workWorkersMin; workers1 <= p.workWorkersMax; workers1++) {
    for (let hours1 = p.workHoursMin; hours1 <= p.workHoursMax; hours1++) {
      for (let workers2 = p.workWorkersMin; workers2 <= p.workWorkersMax; workers2++) {
        if (workers1 !== workers2 && (workers1 * hours1 * 100) % workers2 === 0) list.push({ workers1, hours1, workers2 });
      }
    }
  }
  workCache.set(p, list);
  return list;
}

function workProblem(rng, p) {
  const list = workCandidates(p);
  if (!list.length) throw new RangeError('仕事算の数値の組を作れません');
  const { workers1, hours1, workers2 } = list[randInt(rng, 0, list.length - 1)];
  const answer = workers1 * hours1 / workers2;
  const proportional = roundNumber(hours1 * workers2 / workers1); // 比例で計算する(典型的な間違い)
  const { index, scene } = pickScene(rng, ['機体の清掃', '荷物の積み込み', '倉庫の整理']);
  return finish('work', 'basic',
    `${workers1}人で${hours1}時間かかる${scene}があります。${workers2}人で行うと何時間かかりますか?`,
    answer, '時間',
    [workers1 * hours1, hours1, hours1 + Math.abs(workers1 - workers2), answer + 1, answer - 1, answer * 10, answer / 10],
    rng, { workers1, hours1, workers2 },
    { decimals: 2, required: hasDecimals(proportional, 2) ? [proportional] : [], scene: `work:${index}` });
}

// 速さと時間: 距離が同じなら時間は速さに反比例。答えは分が整数になる組だけ。答え(分)は「◯時間◯分」で出す
const flightCache = new WeakMap();
function flightCandidates(p) {
  if (flightCache.has(p)) return flightCache.get(p);
  const list = [];
  for (let speed1 = p.flightSpeedMin; speed1 <= p.flightSpeedMax; speed1++) {
    for (let hours1 = p.flightHoursMin; hours1 <= p.flightHoursMax; hours1++) {
      const lo = Math.max(p.flightSpeedMin, speed1 - p.flightSpeedDiffMax);
      const hi = Math.min(p.flightSpeedMax, speed1 + p.flightSpeedDiffMax);
      for (let speed2 = lo; speed2 <= hi; speed2++) {
        if (speed2 !== speed1 && (speed1 * hours1 * 60) % speed2 === 0) list.push({ speed1, hours1, speed2 });
      }
    }
  }
  flightCache.set(p, list);
  return list;
}

function speedTimeProblem(rng, p) {
  const list = flightCandidates(p);
  if (!list.length) throw new RangeError('速さと時間の数値の組を作れません');
  const { speed1, hours1, speed2 } = list[randInt(rng, 0, list.length - 1)];
  const minutes = speed1 * hours1 * 60 / speed2;
  const hours = speed1 * hours1 / speed2;
  // 「10.4時間」を「10時間40分」と読む間違い(小数第2位までで、小数部分が60未満のときだけ)
  const fraction = Math.round((hours - Math.floor(hours)) * 100);
  const mistakes = [hours1 * 60, speed2 * hours1 * 60 / speed1, minutes + 60, minutes - 60, minutes + 10, minutes - 10];
  if (hasDecimals(hours, 2) && fraction < 60) mistakes.push(Math.floor(hours) * 60 + fraction);
  const { index, scene } = pickScene(rng, [
    `ある便は時速${speed1}kmで飛んで${hours1}時間かかりました。時速${speed2}kmなら何時間何分かかりますか?`,
    `貨物機が時速${speed1}kmで${hours1}時間かかる路線があります。時速${speed2}kmで飛ぶと何時間何分かかりますか?`,
    `旅客機が時速${speed1}kmで飛ぶと${hours1}時間かかる距離があります。時速${speed2}kmで飛ぶと何時間何分かかりますか?`,
  ]);
  return finish('speedTime', 'basic', scene, minutes, '', mistakes, rng, { speed1, hours1, speed2 },
    { answerFormat: 'hm', scene: `speedTime:${index}` });
}

// 時給: 給料 ÷ 時間。ドルは小数第2位まで、円は整数で割り切れる組だけ
function wageProblem(rng, p, forcedVariant = null) {
  const variant = forcedVariant ?? (rng() < 0.5 ? 'dollar' : 'yen');
  const hours = randInt(rng, p.wageHoursMin, p.wageHoursMax);
  let answer, total, unit, decimals, mistakes;
  if (variant === 'dollar') {
    // 時給(セント)を 100/gcd(時間,100) の倍数にして、給料をドルの整数にする
    const step = 100 / gcd(hours, 100);
    const cents = step * randInt(rng, Math.ceil(p.wageDollarCentsMin / step), Math.floor(p.wageDollarCentsMax / step));
    answer = cents / 100;
    total = hours * cents / 100;
    unit = 'ドル';
    decimals = 2;
    mistakes = [total / (hours + 1), total / (hours - 1), answer + 1, answer - 1, answer + 10, answer * 10, answer / 10];
  } else if (variant === 'yen') {
    answer = 10 * randInt(rng, Math.ceil(p.wageYenMin / 10), Math.floor(p.wageYenMax / 10));
    total = hours * answer;
    unit = '円';
    decimals = 0;
    mistakes = [total / (hours + 1), total / (hours - 1), answer + 100, answer - 100, answer + 10, answer * 10, answer / 10];
  } else {
    throw new RangeError(`不明な時給の問題です: ${variant}`);
  }
  const { index, scene } = pickScene(rng, variant === 'dollar' ? [
    `${hours}時間働いて${total}ドルの給料をもらいました。時給は何ドルですか?`,
    `整備士が${hours}時間の作業で${total}ドルを受け取りました。時給は何ドルですか?`,
    `通訳の仕事を${hours}時間して${total}ドルをもらいました。時給は何ドルですか?`,
  ] : [
    `${hours}時間働いて${total}円の給料をもらいました。時給は何円ですか?`,
    `空港の売店で${hours}時間働き、${total}円を受け取りました。時給は何円ですか?`,
    `荷物の仕分けを${hours}時間して${total}円をもらいました。時給は何円ですか?`,
  ]);
  return finish('wage', variant, scene, answer, unit, mistakes, rng, { hours, total }, { decimals, scene: `wage:${index}` });
}

// 円筒の容積: 3.14 × 半径 × 半径 × (高さ − 上から下げた分) ÷ 1000 = 約◯L(小数第1位で四捨五入)
const round1 = value => Math.round(value * 10) / 10;
function cylinderProblem(rng, p) {
  const pi = p.circlePi;
  const diameter = randInt(rng, p.cylinderDiameterMin, p.cylinderDiameterMax);
  const heightTenths = randInt(rng, p.cylinderHeightTenthsMin, p.cylinderHeightTenthsMax);
  const heightM = heightTenths / 10;
  const heightCm = heightTenths * 10;
  const gap = randInt(rng, p.cylinderGapMin, Math.min(p.cylinderGapMax, heightCm - 1));
  const radius = diameter / 2;
  const cm = heightCm - gap;
  const answer = round1(pi * radius * radius * cm / 1000);
  const mistakes = [
    pi * diameter * diameter * cm / 1000, // 直径を半径として計算する
    pi * radius * radius * cm / 100, // cm³ と L の換算を誤る
    pi * radius * radius * cm / 10000,
    radius * radius * cm / 1000, // 3.14 を掛け忘れる
    pi * diameter * cm / 1000, // 半径を2乗し忘れる
  ].map(round1);
  const { index, scene } = pickScene(rng, [
    { vessel: '円筒の缶', edge: '上', content: '燃料' },
    { vessel: '円柱形のタンク', edge: '上', content: '水' },
    { vessel: '円筒形の容器', edge: 'ふち', content: '油' },
  ]);
  return finish('cylinder', 'fuel',
    `直径${diameter}cm、高さ${formatNumber(heightM)}mの${scene.vessel}があります。${scene.edge}から${gap}cm下まで${scene.content}を入れると、約何L入りますか?(円周率は${formatNumber(pi)})`,
    answer, 'L', mistakes, rng, { diameter, heightM, gap, pi },
    { answerPrefix: '約', decimals: 1, required: [round1(pi * radius * radius * heightCm / 1000)], scene: `cylinder:${index}` }); // 上から下げた分を引き忘れる
}

const GENERATORS = { unit: unitProblem, speed: speedProblem, meeting: meetingProblem, catchup: catchupProblem, percentage: percentageProblem,
  inversePercentage: inversePercentageProblem, price: priceProblem, average: averageProblem, elapsed: elapsedProblem, geometry: geometryProblem,
  work: workProblem, speedTime: speedTimeProblem, wage: wageProblem, cylinder: cylinderProblem };

// 種類の選び方(2026-09-30 本番に合わせて変更)。単位換算は全体の unitKindShare(約1/3)、残りの種類は均等。
// 同じ種類は続けて出さない。そのため、直前が単位換算でないときは単位換算を share/(1−share) の確率で選ぶ。
// こうすると、続けて出しても(長い目で見て)、1問目だけを見ても、単位換算の割合は share になる。
// (以前の「重み」の方式は、続けて出すと約1/3だが、1問目だけを数えると約47%だった)
export function pickT1Kind(rng, p, previousKind = null) {
  const share = p.unitKindShare;
  const others = PROBLEM_KINDS.filter(kind => kind !== 'unit' && kind !== previousKind);
  if (previousKind === 'unit') return others[randInt(rng, 0, others.length - 1)];
  const unitRate = previousKind === null ? share : share / (1 - share);
  if (rng() < unitRate) return 'unit';
  return others[randInt(rng, 0, others.length - 1)];
}

// forcedVariant: 単位換算・単価の形を指定する(単体テストで全種類を確かめるため)
export function generateT1Problem(rng, p, previous = null, forcedKind = null, forcedVariant = null) {
  const kind = forcedKind ?? pickT1Kind(rng, p, previous?.kind ?? null);
  if (!GENERATORS[kind]) throw new RangeError(`不明な問題種類です: ${kind}`);
  return GENERATORS[kind](rng, p, forcedVariant);
}

export function judgeT1(problem, choiceIndex) {
  return problem.choices[choiceIndex] === problem.answer;
}

// 結果画面の「間違えた問題」(2026-09-30 本番に合わせて変更: テスト中は正誤を出さない)
// 正解なら null、不正解なら問題文・あなたの答え・正解・式
export function t1MistakeEntry(problem, choiceIndex) {
  if (judgeT1(problem, choiceIndex)) return null;
  return {
    prompt: problem.prompt,
    yourAnswer: formatT1Answer(problem, problem.choices[choiceIndex]),
    correctAnswer: formatT1Answer(problem, problem.answer),
    formula: t1Formula(problem).text,
  };
}

export function t1ReviewSummary(answered, mistakes) {
  if (answered === 0) return '回答した問題はありません';
  return mistakes.length === 0 ? '全問正解' : `間違えた問題(${mistakes.length}問)`;
}

// 答え・選択肢の書き方(速さは「時速◯km」、円筒は「約◯L」、速さと時間は「◯時間◯分」)
export function formatT1Answer(problem, value) {
  if (problem.answerFormat === 'hm') return `${Math.floor(value / 60)}時間${value % 60}分`;
  return `${problem.answerPrefix ?? ''}${formatNumber(value)}${problem.unit}`;
}

// ---- 不正解のときに出す式 ----
// 種類(と出題の向き)ごとにひな形を1つ持ち、問題の values を入れて作る。
// 式は記号の並び(トークン)で表し、同じ並びから表示の文と、計算できる式の両方を作る。
const num = (n, unit = '', pre = '') => ({ n, unit, pre });
const clock = (h, m) => ({ h, m });

const FORMULA_TEMPLATES = Object.freeze({
  // 例: 3kg × 1000 / 30000m² ÷ 10000 / 時速6km × 1000 ÷ 60 / 分速100m × 60 ÷ 1000
  unit: v => {
    const from = num(v.shown, v.from, v.fromPre ?? '');
    if (v.den === 1) return [from, '×', num(v.num)];
    if (v.num === 1) return [from, '÷', num(v.den)];
    return [from, '×', num(v.num), '÷', num(v.den)];
  },
  speed: (v, variant) => {
    if (variant === 'distance') return [num(v.speed, 'km', '時速'), '×', num(v.hours, '時間')];
    if (variant === 'time') return [num(v.distance, 'km'), '÷', num(v.speed, 'km', '時速')];
    return [num(v.distance, 'km'), '÷', num(v.hours, '時間')];
  },
  meeting: v => [num(v.length, 'km'), '÷', '(', num(v.a, 'km', '時速'), '+', num(v.b, 'km', '時速'), ')', '×', num(60)],
  catchup: v => [num(v.length, 'km'), '÷', '(', num(v.a, 'km', '時速'), '−', num(v.b, 'km', '時速'), ')', '×', num(60)],
  percentage: v => [num(v.base), '×', num(v.percent), '÷', num(100)],
  inversePercentage: v => [num(v.part), '÷', num(v.base), '×', num(100)],
  price: (v, variant) => {
    if (variant === 'total') return [num(v.price, '円'), '×', num(v.count, '個')];
    if (variant === 'unit-price') return [num(v.total, '円'), '÷', num(v.count, '個')];
    if (variant === 'per-100g') return [num(v.total, '円'), '÷', num(v.grams, 'g'), '×', num(v.per)];
    return [num(v.perGram, '円'), '×', num(v.grams, 'g')];
  },
  average: v => ['(', num(v.a), '+', num(v.b), '+', num(v.c), ')', '÷', num(3)],
  elapsed: v => [clock(v.h2, v.m2), '−', clock(v.h1, v.m1)],
  geometry: (v, variant) => {
    if (variant === 'circle-circumference-diameter') return [num(v.diameter, 'cm'), '×', num(v.pi)];
    if (variant === 'circle-circumference-radius') return [num(v.radius, 'cm'), '×', num(2), '×', num(v.pi)];
    if (variant === 'circle-diameter') return [num(v.circumference, 'cm'), '÷', num(v.pi)];
    if (variant === 'circle-area') return [num(v.radius, 'cm'), '×', num(v.radius, 'cm'), '×', num(v.pi)];
    if (variant === 'triangle-area') return [num(v.base, 'cm'), '×', num(v.height, 'cm'), '÷', num(2)];
    if (variant === 'trapezoid-area') return ['(', num(v.top, 'cm'), '+', num(v.bottom, 'cm'), ')', '×', num(v.height, 'cm'), '÷', num(2)];
    return [num(v.base, 'cm'), '×', num(v.height, 'cm')];
  },
  // 2026-09-30 本番に合わせて追加
  work: v => [num(v.workers1, '人'), '×', num(v.hours1, '時間'), '÷', num(v.workers2, '人')],
  speedTime: v => [num(v.speed1, 'km', '時速'), '×', num(v.hours1, '時間'), '×', num(60), '÷', num(v.speed2, 'km', '時速')],
  wage: (v, variant) => [num(v.total, variant === 'dollar' ? 'ドル' : '円'), '÷', num(v.hours, '時間')],
  cylinder: v => {
    const radius = v.diameter / 2;
    const cm = Math.round(v.heightM * 100) - v.gap;
    return [num(v.pi), '×', num(radius, 'cm'), '×', num(radius, 'cm'), '×', num(cm, 'cm'), '÷', num(1000)];
  },
});

const OPERATOR_EXPRESSION = Object.freeze({ '+': '+', '−': '-', '×': '*', '÷': '/', '(': '(', ')': ')' });

function tokenText(t) {
  if (typeof t === 'string') return t;
  if ('h' in t) return `${t.h}時${t.m}分`;
  return `${t.pre}${formatNumber(t.n)}${t.unit}`;
}

function tokenExpression(t) {
  if (typeof t === 'string') return OPERATOR_EXPRESSION[t];
  if ('h' in t) return `(${t.h} * 60 + ${t.m})`;
  return formatNumber(t.n);
}

function joinTokens(parts) {
  return parts.join(' ').replaceAll('( ', '(').replaceAll(' )', ')');
}

// { text: '4.2km ÷ (時速4km + 時速3km) × 60 = 36分', expression: '4.2 / (4 + 3) * 60' }
export function t1Formula(problem) {
  const template = FORMULA_TEMPLATES[problem.kind];
  if (!template || !problem.values) throw new RangeError(`式を作れない問題です: ${problem.kind}`);
  const tokens = template(problem.values, problem.variant);
  return {
    text: `${joinTokens(tokens.map(tokenText))} = ${formatT1Answer(problem, problem.answer)}`,
    expression: joinTokens(tokens.map(tokenExpression)),
  };
}

export function createT1Tally() {
  return { correct: 0, answered: 0 };
}

export function recordT1Answer(tally, correct) {
  return { correct: tally.correct + (correct ? 1 : 0), answered: tally.answered + 1 };
}

export function summarizeT1(tally) {
  return {
    score: tally.correct,
    detail: {
      answered: tally.answered,
      accuracy: tally.answered ? Math.round(tally.correct * 100 / tally.answered) : null,
    },
  };
}

export function buildT1Record({ date, tally, settings }) {
  const { score, detail } = summarizeT1(tally);
  return { id: `${date}-t1`, test: 't1', date, score, detail, settings: { ...settings } };
}
