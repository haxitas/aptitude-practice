// テスト1 計算: 10種類の問題生成、典型誤答の4択、判定、採点。DOMには触れない。
import { randInt, shuffle } from '../core/rng.js';

export const PROBLEM_KINDS = Object.freeze(['unit', 'speed', 'meeting', 'catchup', 'percentage', 'inversePercentage', 'price', 'average', 'elapsed', 'geometry']);

// 単位換算の組(大きい単位 → 小さい単位の向きを1行で書き、往復の2種類を作る)。
// 換算後 = 換算前 × num ÷ den。pre は「時速」などの前置き。
// confuse: 典型的に取り違える倍率(掛けると割るの逆、換算忘れは共通で加える)。
// forgotPower: 2乗・3乗の換算で「乗し忘れ」たときの倍率(長さの倍率のまま)。
const UNIT_PAIRS = Object.freeze([
  { ids: ['ha-to-m2', 'm2-to-ha'], big: 'ha', small: 'm²', num: 10000, den: 1, confuse: [100, 1000, 1000000] },
  { ids: ['a-to-m2', 'm2-to-a'], big: 'a', small: 'm²', num: 100, den: 1, confuse: [10, 1000, 10000] },
  { ids: ['km2-to-ha', 'ha-to-km2'], big: 'km²', small: 'ha', num: 100, den: 1, confuse: [1000, 10000, 1000000] },
  { ids: ['km-to-m', 'm-to-km'], big: 'km', small: 'm', num: 1000, den: 1, confuse: [100, 10000] },
  { ids: ['hours-to-minutes', 'minutes-to-hours'], big: '時間', small: '分', num: 60, den: 1, confuse: [100, 3600, 24] },
  // 2026-09-27 ユーザーの判断で追加
  { ids: ['m-to-cm', 'cm-to-m'], big: 'm', small: 'cm', num: 100, den: 1, confuse: [10, 1000, 10000] },
  { ids: ['cm-to-mm', 'mm-to-cm'], big: 'cm', small: 'mm', num: 10, den: 1, confuse: [100, 1000, 10000] },
  { ids: ['kg-to-g', 'g-to-kg'], big: 'kg', small: 'g', num: 1000, den: 1, confuse: [100, 10000] },
  { ids: ['t-to-kg', 'kg-to-t'], big: 't', small: 'kg', num: 1000, den: 1, confuse: [100, 10000] },
  { ids: ['L-to-mL', 'mL-to-L'], big: 'L', small: 'mL', num: 1000, den: 1, confuse: [100, 10000] },
  { ids: ['L-to-dL', 'dL-to-L'], big: 'L', small: 'dL', num: 10, den: 1, confuse: [100, 1000, 10000] },
  { ids: ['m3-to-L', 'L-to-m3'], big: 'm³', small: 'L', num: 1000, den: 1, confuse: [100, 10000, 1000000] },
  { ids: ['minutes-to-seconds', 'seconds-to-minutes'], big: '分', small: '秒', num: 60, den: 1, confuse: [100, 3600, 24] },
  { ids: ['days-to-hours', 'hours-to-days'], big: '日', small: '時間', num: 24, den: 1, confuse: [60, 12, 100] },
  { ids: ['ha-to-a', 'a-to-ha'], big: 'ha', small: 'a', num: 100, den: 1, confuse: [10, 1000, 10000] },
  // 速さ: 60 と 3600 の取り違え、km→m の換算忘れなど
  { ids: ['kmh-to-mpm', 'mpm-to-kmh'], big: 'km', bigPre: '時速', small: 'm', smallPre: '分速', num: 1000, den: 60,
    confuse: [1000 / 3600, 1000, 60, 1 / 60] },
  { ids: ['mps-to-kmh', 'kmh-to-mps'], big: 'm', bigPre: '秒速', small: 'km', smallPre: '時速', num: 3600, den: 1000,
    confuse: [60 / 1000, 3600, 60, 1000 / 3600] },
  // 2乗・3乗の換算(2026-09-27 ユーザーの判断で追加)
  { ids: ['m2-to-cm2', 'cm2-to-m2'], big: 'm²', small: 'cm²', num: 10000, den: 1, forgotPower: 100, confuse: [1000, 1000000] },
  { ids: ['cm2-to-mm2', 'mm2-to-cm2'], big: 'cm²', small: 'mm²', num: 100, den: 1, forgotPower: 10, confuse: [1000, 10000] },
  { ids: ['cm3-to-mm3', 'mm3-to-cm3'], big: 'cm³', small: 'mm³', num: 1000, den: 1, forgotPower: 10, confuse: [100, 1000000] },
  { ids: ['L-to-cm3', 'cm3-to-L'], big: 'L', small: 'cm³', num: 1000, den: 1, forgotPower: 10, confuse: [100, 10000] },
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
    num: pair.num, den: pair.den, confuse: pair.confuse, forgotPower: pair.forgotPower ?? null,
  };
  const reverse = {
    id: pair.ids[1], from: pair.small, fromPre: pair.smallPre ?? '', to: pair.big, toPre: pair.bigPre ?? '',
    num: pair.den, den: pair.num, confuse: pair.confuse.map(c => 1 / c),
    forgotPower: pair.forgotPower ? 1 / pair.forgotPower : null,
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

// required: 必ず入れる誤答(2乗・3乗の「乗し忘れ」)。桁ずらし(正解×10・÷10)は合わせて1つまで
export function makeT1Choices(answer, mistakes, rng, required = []) {
  if (!(Number.isInteger(answer) && answer > 0)) throw new RangeError('正解は正の整数である必要があります');
  const isShift = value => value === answer * 10 || value === answer / 10;
  const valid = value => Number.isInteger(value) && value > 0;
  const seen = new Set([answer]);
  const forced = [];
  for (const raw of required) {
    const value = roundNumber(raw);
    if (!valid(value) || seen.has(value)) throw new RangeError(`必ず入れる誤答が正の整数になりません: ${raw}`);
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
    throw new RangeError('正の整数の典型誤答を3つ作れません');
  }
  const distractors = [...forced, ...shuffle(rng, typical).slice(0, typicalNeeded)];
  if (shiftSlots) distractors.push(shuffle(rng, digitShifts)[0]);
  const choices = shuffle(rng, [answer, ...distractors]);
  return { choices, correctIndex: choices.indexOf(answer) };
}

// values: 不正解のときに出す式(t1Formula)に入れる数値。表示のために問題文を読み直さない
// answerPrefix: 答えの前置き(「時速」など)。options.required: 必ず入れる誤答
function finish(kind, variant, prompt, answer, unit, mistakes, rng, values, { answerPrefix = '', required = [] } = {}) {
  const roundedAnswer = roundNumber(answer);
  if (!Number.isInteger(roundedAnswer) || roundedAnswer <= 0) throw new Error(`整数の正解を作れませんでした: ${kind}/${variant}`);
  const choice = makeT1Choices(roundedAnswer, mistakes, rng, required);
  return {
    kind, variant, prompt, answer: roundedAnswer, unit, answerPrefix, values,
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
  const mistakes = [
    shown, // 換算し忘れ
    shown * v.den / v.num, // 掛けると割るを逆にする
    ...v.confuse.map(c => shown * c), // 倍率の取り違え
    ...v.confuse.map(c => shown / c), // 掛けると割るを逆にし、倍率も取り違える
    answer * 100, answer / 100, answer * 10, answer / 10,
  ].filter(value => value <= UNIT_DISTRACTOR_MAX); // すぐに誤りと分かる極端に大きな誤答は使わない
  return finish(
    'unit', v.id,
    `${v.fromPre}${formatNumber(shown)}${v.from}は${v.toPre}何${v.to}ですか?`,
    answer, v.to, mistakes, rng,
    { shown, num: v.num, den: v.den, from: v.from, fromPre: v.fromPre, to: v.to, toPre: v.toPre },
    { answerPrefix: v.toPre, required: v.forgotPower ? [shown * v.forgotPower] : [] },
  );
}

function speedProblem(rng, p) {
  const speed = randInt(rng, p.speedMin, p.speedMax);
  const hours = randInt(rng, p.speedHoursMin, p.speedHoursMax);
  const distance = speed * hours;
  const variant = ['distance', 'time', 'speed'][randInt(rng, 0, 2)];
  if (variant === 'distance') {
    return finish('speed', variant, `時速${speed}kmで${hours}時間進むと何kmですか?`, distance, 'km',
      [speed + hours, speed * 60, distance + speed, Math.abs(distance - speed), distance * 10, distance / 10], rng, { speed, hours, distance });
  }
  if (variant === 'time') {
    return finish('speed', variant, `${distance}kmを時速${speed}kmで進むと何時間ですか?`, hours, '時間',
      [distance - speed, hours * 60, distance + speed, speed + hours, distance, hours * 10, hours / 10], rng, { speed, hours, distance });
  }
  return finish('speed', variant, `${distance}kmを${hours}時間で進む速さは時速何kmですか?`, speed, 'km',
    [distance - hours, speed * 60, distance + hours, speed + hours, distance, speed * 10, speed / 10], rng, { speed, hours, distance },
    { answerPrefix: '時速' });
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

function meetingProblem(rng, p) {
  const { a, b, multiplier, length } = pickLap(rng, p);
  const difference = a - b;
  const minutes = difference * multiplier;
  const wrongOperation = (a + b) * multiplier;
  return finish('meeting', 'opposite',
    `周囲${formatNumber(length)}kmの池を時速${a}kmと時速${b}kmで反対方向に進むと、何分後に出会いますか?`,
    minutes, '分', [wrongOperation, minutes / 60, minutes * 60, minutes * 10, minutes / 10], rng, { length, a, b });
}

function catchupProblem(rng, p) {
  const { a, b, multiplier, length } = pickLap(rng, p);
  const sum = a + b;
  const difference = a - b;
  const minutes = sum * multiplier;
  const wrongOperation = difference * multiplier;
  return finish('catchup', 'same-direction',
    `周囲${formatNumber(length)}kmの池を時速${a}kmと時速${b}kmで同じ方向に進むと、速い人は何分後に追いつきますか?`,
    minutes, '分', [wrongOperation, minutes / 60, minutes * 60, minutes * 10, minutes / 10], rng, { length, a, b });
}

function percentageProblem(rng, p) {
  const percent = p.percentagePercents[randInt(rng, 0, p.percentagePercents.length - 1)];
  const unit = randInt(rng, p.percentageUnitMin, p.percentageUnitMax);
  const base = unit * 100;
  const answer = unit * percent;
  return finish('percentage', 'basic', `${base}の${percent}%はいくつですか?`, answer, '',
    [base * percent, base - answer, base + percent, Math.abs(base - percent), answer * 10, answer / 10], rng, { base, percent });
}

function inversePercentageProblem(rng, p) {
  const percent = p.percentagePercents[randInt(rng, 0, p.percentagePercents.length - 1)];
  const base = randInt(rng, p.percentageUnitMin, p.percentageUnitMax) * 100;
  const part = base * percent / 100;
  return finish('inversePercentage', 'basic', `${base}の何%が${part}ですか?`, percent, '%',
    [100 - percent, percent * 100, percent / 100, base - part, base * part, percent * 10, percent / 10], rng, { base, part });
}

function priceProblem(rng, p, forcedVariant = null) {
  const variant = forcedVariant ?? PRICE_VARIANTS[randInt(rng, 0, PRICE_VARIANTS.length - 1)];
  if (variant === 'total' || variant === 'unit-price') {
    const price = randInt(rng, p.priceMin, p.priceMax);
    const count = randInt(rng, p.priceCountMin, p.priceCountMax);
    const total = price * count;
    if (variant === 'total') return finish('price', 'total', `単価${price}円の商品を${count}個買うと、合計は何円ですか?`, total, '円',
      [price / count, price + count, price, total + price, total - price, total * 10, total / 10], rng, { price, count, total });
    return finish('price', 'unit-price', `${count}個で${total}円の商品は、単価が何円ですか?`, price, '円',
      [total * count, total - count, total, price + count, price * 10, price / 10], rng, { price, count, total });
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
    return finish('price', 'per-100g', `${grams}gで${total}円の品物は、${per}gあたり何円ですか?`, answer, '円',
      [total, total * grams / per, total / grams, grams * per / total, answer * 10, answer / 10], rng, { grams, total, per });
  }
  if (variant === 'per-gram-total') {
    // 2026-09-27 ユーザーの判断で追加: 「1gあたり3円の品物を250g買うと何円ですか?」
    const perGram = randInt(rng, Math.max(2, Math.ceil(p.priceMin / 10)), Math.max(2, Math.floor(p.priceMax / 10)));
    const grams = 50 * randInt(rng, 2 * p.priceCountMin, 2 * p.priceCountMax);
    const answer = perGram * grams;
    return finish('price', 'per-gram-total', `1gあたり${perGram}円の品物を${grams}g買うと何円ですか?`, answer, '円',
      [grams, perGram + grams, answer / 100, grams / perGram, answer * 100, answer * 10, answer / 10], rng, { perGram, grams });
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
  return finish('average', 'three', `${a}、${b}、${c}の平均はいくつですか?`, answer, '',
    [sum, sum / 2, sum * 3, sum - 3, answer * 10, answer / 10], rng, { a, b, c });
}

function elapsedProblem(rng, p) {
  const start = randInt(rng, p.clockStartHourMin, p.clockStartHourMax) * 60 + randInt(rng, 0, 59);
  const minutes = randInt(rng, p.elapsedMinutesMin, p.elapsedMinutesMax);
  const end = start + minutes;
  const h1 = Math.floor(start/60), m1 = start%60, h2 = Math.floor(end/60), m2 = end%60;
  return finish('elapsed', 'same-day', `${h1}時${m1}分から${h2}時${m2}分までは何分ですか?`, minutes, '分',
    [(h2-h1)*100+m2-m1, minutes*60, minutes/60, minutes+60, Math.abs(minutes-60), minutes*10, minutes/10], rng, { h1, m1, h2, m2 });
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
  if (variant === 'circle-circumference-diameter') {
    const diameter = p.circleDiameterUnit * randInt(rng, 1, p.circleMultiplierMax);
    const answer = diameter * pi;
    return finish('geometry', variant, `直径${diameter}cmの円の周の長さは何cmですか?${note}`, answer, 'cm',
      [diameter * 3, answer / 2, (diameter / 2) ** 2 * pi, answer * 10, answer / 10], rng, { diameter, pi },
      { required: [answer * 2] }); // 直径を半径として計算する
  }
  if (variant === 'circle-circumference-radius') {
    const radius = p.circleDiameterUnit / 2 * randInt(rng, 1, p.circleMultiplierMax);
    const answer = radius * 2 * pi;
    return finish('geometry', variant, `半径${radius}cmの円の周の長さは何cmですか?${note}`, answer, 'cm',
      [radius * pi, radius * 4 * pi, radius * 2 * 3, radius * radius * pi, answer * 10, answer / 10], rng, { radius, pi });
  }
  if (variant === 'circle-diameter') {
    const diameter = p.circleDiameterUnit * randInt(rng, 1, p.circleMultiplierMax);
    const circumference = roundNumber(diameter * pi);
    return finish('geometry', variant, `周の長さが${circumference}cmの円の直径は何cmですか?${note}`, diameter, 'cm',
      [diameter / 2, diameter * 2, circumference / 3, diameter * 10, diameter / 10], rng, { circumference, pi });
  }
  if (variant === 'circle-area') {
    const radius = p.circleAreaRadiusUnit * randInt(rng, 1, p.circleAreaMultiplierMax);
    const answer = radius * radius * pi;
    return finish('geometry', variant, `半径${radius}cmの円の面積は何cm²ですか?${note}`, answer, 'cm²',
      [radius * radius * 3, (radius * 2) ** 2 * pi, radius * 2 * pi, radius * pi, answer * 10, answer / 10], rng, { radius, pi });
  }
  if (variant === 'triangle-area') {
    const base = randInt(rng, min, max);
    const height = productEven(rng, base, min, max);
    const answer = base * height / 2;
    return finish('geometry', variant, `底辺${base}cm、高さ${height}cmの三角形の面積は何cm²ですか?`, answer, 'cm²',
      [base + height, (base + height) * 2, base * height * 2, answer * 10, answer / 10], rng, { base, height },
      { required: [base * height] }); // ÷2 のし忘れ
  }
  if (variant === 'trapezoid-area') {
    const top = randInt(rng, min, max - 1);
    const bottom = randInt(rng, top + 1, max);
    const height = productEven(rng, top + bottom, min, max);
    const answer = (top + bottom) * height / 2;
    return finish('geometry', variant, `上底${top}cm、下底${bottom}cm、高さ${height}cmの台形の面積は何cm²ですか?`, answer, 'cm²',
      [bottom * height, top * height, (bottom - top) * height / 2, top * bottom * height / 2, top + bottom + height, answer * 10, answer / 10],
      rng, { top, bottom, height }, { required: [(top + bottom) * height] }); // ÷2 のし忘れ
  }
  if (variant === 'parallelogram-area') {
    const base = randInt(rng, min, max);
    const height = randInt(rng, min, max);
    const answer = base * height;
    return finish('geometry', variant, `底辺${base}cm、高さ${height}cmの平行四辺形の面積は何cm²ですか?`, answer, 'cm²',
      [answer / 2, base + height, (base + height) * 2, answer * 2, answer * 10, answer / 10], rng, { base, height });
  }
  throw new RangeError(`不明な図形の問題です: ${variant}`);
}

const GENERATORS = { unit: unitProblem, speed: speedProblem, meeting: meetingProblem, catchup: catchupProblem, percentage: percentageProblem,
  inversePercentage: inversePercentageProblem, price: priceProblem, average: averageProblem, elapsed: elapsedProblem, geometry: geometryProblem };

// forcedVariant: 単位換算・単価の形を指定する(単体テストで全種類を確かめるため)
export function generateT1Problem(rng, p, previous = null, forcedKind = null, forcedVariant = null) {
  const kinds = forcedKind
    ? [forcedKind]
    : PROBLEM_KINDS.filter(kind => !previous || kind !== previous.kind || PROBLEM_KINDS.length === 1);
  // 単位換算だけ unitKindWeight の重みで選びやすくする(他の種類は1)
  const weights = kinds.map(kind => (kind === 'unit' ? p.unitKindWeight : 1));
  let r = rng() * weights.reduce((sum, w) => sum + w, 0);
  let index = 0;
  while (index < kinds.length - 1 && r >= weights[index]) r -= weights[index++];
  const kind = kinds[index];
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

// 答え・選択肢の書き方(速さは「時速◯km」)
export function formatT1Answer(problem, value) {
  return `${problem.answerPrefix ?? ''}${value}${problem.unit}`;
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
