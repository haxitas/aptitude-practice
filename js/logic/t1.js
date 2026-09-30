// テスト1 計算: 18種類の問題生成、典型誤答の4択、判定、採点。DOMには触れない。
// 2026-09-30 本番に合わせて変更: 仕事算・速さと時間・時給・円筒を足し、問題文を短い場面の文章題にした。
// 2026-09-30 本番の記憶で変更: 1回15問(単位変換5 → 割合5 → 計算5)、割合の4種類を足し、暗算で一瞬の数値をやめた。
// 2026-10-01 ユーザーの実機の感想で変更: 問題文の数値は整数だけ(きりの悪い2〜4桁)。答えと選択肢は整数か小数第1位まで。
import { randInt, shuffle } from '../core/rng.js';

// 分野(2026-09-30 本番の記憶で追加)。1回は 単位変換 → 割合 → 計算 の順に各 questionsPerCategory 問
export const T1_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'unit', label: '単位変換', kinds: Object.freeze(['unit']) }),
  Object.freeze({ id: 'ratio', label: '割合', kinds: Object.freeze(['percentage', 'inversePercentage', 'markup', 'discount', 'wholeFromPart', 'yearOverYear']) }),
  Object.freeze({ id: 'calc', label: '計算', kinds: Object.freeze(['speed', 'meeting', 'catchup', 'elapsed', 'average', 'geometry', 'price', 'work', 'speedTime', 'wage', 'cylinder']) }),
]);

export const PROBLEM_KINDS = Object.freeze(T1_CATEGORIES.flatMap(c => c.kinds));

// ---- 場面(2026-09-30 本番に合わせて追加) ----
// 問題文は「場面の文。問いの文」にする。場面は種類ごとに3つ以上あり、ランダムに使う。
// 場面の文には数字を入れない(問題文の数値は、正解の計算に使う数値だけにする)。
// 場面ごとに使ってよい数値の範囲を持ち、その問題の数値に合う場面の中から選ぶ(2026-09-30 レビュー後の直し)。
// 数値の作り方と正解は変えず、場面の選び方だけを変える。
function pickScene(rng, list) {
  const index = randInt(rng, 0, list.length - 1);
  return { index, scene: list[index] };
}

// fits(場面) が真の場面から選ぶ。合う場面が無ければ(設定で数値の範囲を広げたときなど)、範囲に最も近い場面を使う
function pickFittingScene(rng, scenes, fits, distance = () => 0) {
  const fitting = scenes.filter(fits);
  if (fitting.length) return fitting[randInt(rng, 0, fitting.length - 1)];
  return scenes.reduce((best, scene) => (distance(scene) < distance(best) ? scene : best));
}

const inRange = (value, min, max) => value >= min - 1e-9 && value <= max + 1e-9;
// 範囲からどれだけ外れているか(比で測る)
const rangeGap = (value, min, max) => (value < min ? min / value : value > max ? value / max : 1);

// 単位換算: 量ごとの基準の単位への倍率(面積 m²・長さ m・重さ kg・体積 L・時間 分・速さ 時速km)
const UNIT_BASE = Object.freeze({
  area: { 'ha': 10000, 'a': 100, 'km²': 1e6, 'm²': 1, 'cm²': 1e-4, 'mm²': 1e-6 },
  length: { 'km': 1000, 'm': 1, 'cm': 0.01, 'mm': 0.001 },
  weight: { 'kg': 1, 'g': 0.001, 't': 1000 },
  volume: { 'L': 1, 'mL': 0.001, 'dL': 0.1, 'm³': 1000, 'cm³': 0.001, 'mm³': 1e-6 },
  time: { '時間': 60, '分': 1, '秒': 1 / 60, '日': 1440 },
  speed: { '時速km': 1, '分速m': 0.06, '秒速m': 3.6 },
});

// 単位換算の場面。min・max は基準の単位での範囲。q: 換算前の量(「時速6km」など)、ask: 問いの単位(「分速何m」など)
const UNIT_SCENES = Object.freeze({
  area: [
    { id: 'office', min: 100, max: 2000, text: (q, ask) => `事務所の床面積は${q}です。これは${ask}ですか?` },
    { id: 'hangar', min: 1000, max: 20000, text: (q, ask) => `格納庫の床面積は${q}です。これは${ask}ですか?` },
    { id: 'warehouse', min: 5000, max: 200000, text: (q, ask) => `物流倉庫の敷地は${q}です。これは${ask}ですか?` },
    { id: 'apron', min: 10000, max: 500000, text: (q, ask) => `新しい駐機場の広さは${q}です。これは${ask}ですか?` },
    { id: 'airport', min: 500000, max: 2e7, text: (q, ask) => `空港の敷地の広さは${q}です。これは${ask}ですか?` },
    { id: 'label', min: 1e-4, max: 1e-2, text: (q, ask) => `荷札のラベルの面積は${q}です。これは${ask}ですか?` },
    { id: 'window', min: 0.5, max: 5, text: (q, ask) => `窓ガラスの面積は${q}です。これは${ask}ですか?` },
    { id: 'panel', min: 1, max: 20, text: (q, ask) => `機体のパネルの面積は${q}です。これは${ask}ですか?` },
    { id: 'sheet', min: 1, max: 20, text: (q, ask) => `床に敷くシートの面積は${q}です。これは${ask}ですか?` },
  ],
  length: [
    { id: 'runway', min: 1000, max: 5000, text: (q, ask) => `滑走路の長さは${q}です。これは${ask}ですか?` },
    { id: 'road', min: 1000, max: 20000, text: (q, ask) => `空港から倉庫までの道のりは${q}です。これは${ask}ですか?` },
    { id: 'taxiway', min: 1000, max: 10000, text: (q, ask) => `飛行機が誘導路を${q}走りました。これは${ask}ですか?` },
    { id: 'width', min: 0.1, max: 2, text: (q, ask) => `荷物の幅は${q}です。これは${ask}ですか?` },
    { id: 'cable', min: 1, max: 20, text: (q, ask) => `整備用のケーブルの長さは${q}です。これは${ask}ですか?` },
    { id: 'part', min: 0.01, max: 0.3, text: (q, ask) => `部品の長さを測ると${q}でした。これは${ask}ですか?` },
  ],
  weight: [
    { id: 'baggage', min: 1, max: 30, text: (q, ask) => `手荷物の重さは${q}です。これは${ask}ですか?` },
    { id: 'catering', min: 1, max: 100, text: (q, ask) => `機内食の材料を${q}仕入れました。これは${ask}ですか?` },
    { id: 'cargo', min: 100, max: 20000, text: (q, ask) => `貨物の重さは${q}です。これは${ask}ですか?` },
    { id: 'truckload', min: 500, max: 20000, text: (q, ask) => `トラックに${q}の荷物を積みました。これは${ask}ですか?` },
  ],
  volume: [
    { id: 'drinks', min: 1, max: 50, text: (q, ask) => `機内で飲み物を${q}用意しました。これは${ask}ですか?` },
    { id: 'water', min: 1, max: 20, text: (q, ask) => `容器に水が${q}入っています。これは${ask}ですか?` },
    { id: 'fuel', min: 500, max: 20000, text: (q, ask) => `タンクに燃料が${q}入っています。これは${ask}ですか?` },
    { id: 'partVolume', min: 0.001, max: 0.02, text: (q, ask) => `部品の体積は${q}です。これは${ask}ですか?` },
    { id: 'screw', min: 0.001, max: 0.005, text: (q, ask) => `ねじの体積は${q}です。これは${ask}ですか?` },
    { id: 'partCase', min: 0.005, max: 0.02, text: (q, ask) => `小さな部品ケースの容積は${q}です。これは${ask}ですか?` },
  ],
  time: [
    { id: 'flight', min: 30, max: 1200, text: (q, ask) => `フライトの時間は${q}です。これは${ask}ですか?` },
    { id: 'maintenance', min: 10, max: 28800, text: (q, ask) => `機体の整備に${q}かかりました。これは${ask}ですか?` },
    { id: 'loading', min: 1, max: 180, text: (q, ask) => `荷物の積み込みに${q}かかりました。これは${ask}ですか?` },
    { id: 'voyage', min: 1440, max: 28800, text: (q, ask) => `貨物船での輸送に${q}かかりました。これは${ask}ですか?` },
  ],
  speed: [
    { id: 'taxiing', min: 5, max: 50, text: (q, ask) => `旅客機が地上を${q}で移動しています。これは${ask}ですか?` },
    { id: 'takeoff', min: 100, max: 360, text: (q, ask) => `離陸のために滑走する旅客機の速さは${q}です。これは${ask}ですか?` },
    { id: 'truck', min: 10, max: 100, text: (q, ask) => `トラックが${q}で走っています。これは${ask}ですか?` },
    { id: 'wind', min: 3, max: 100, text: (q, ask) => `風の速さは${q}です。これは${ask}ですか?` },
    { id: 'bicycle', min: 5, max: 30, text: (q, ask) => `自転車が${q}で走っています。これは${ask}ですか?` },
  ],
});

// 速さの問題の場面(時速 min〜max km)。旅客機は時速200km以上なので、時速2〜20kmの問題には使わない
const SPEED_SCENES = Object.freeze([
  { id: 'walker', min: 2, max: 6, subject: '人', past: '歩きました', verb: '歩く', place: '駅' },
  { id: 'runner', min: 6, max: 15, subject: 'ランナー', past: '走りました', verb: '走る', place: 'ゴール' },
  { id: 'bicycle', min: 8, max: 25, subject: '自転車', past: '走りました', verb: '走る', place: '公園' },
  { id: 'truck', min: 10, max: 80, subject: 'トラック', past: '走りました', verb: '走る', place: '倉庫' },
  { id: 'ship', min: 10, max: 40, subject: '船', past: '進みました', verb: '進む', place: '港' },
]);

// 周回(出会い・追いつき)の場面。slow・fast は遅い方・速い方の分速(m)の範囲
// (2026-10-01 問題文を整数だけにするため、時速 km から分速 m に変更。歩くのは分速100mまで、走るのは分速100m以上)
const LAP_SCENES = Object.freeze([
  { id: 'pondWalkers', slow: [50, 100], fast: [50, 100], place: '池のまわり',
    who: (a, b) => `分速${a}mと分速${b}mで歩くふたり`, faster: '速い方', slower: '遅い方' },
  { id: 'joggers', slow: [100, 250], fast: [100, 250], place: '公園のジョギングコース',
    who: (a, b) => `分速${a}mと分速${b}mで走るふたりのランナー`, faster: '速い方', slower: '遅い方' },
  { id: 'walkerRunner', slow: [50, 100], fast: [100, 250], place: '公園の周回コース',
    who: (a, b) => `分速${a}mで走る人と分速${b}mで歩く人`, faster: '走る人', slower: '歩く人' },
]);

// 図形の問題に使う物の名前。円は直径(cm)の範囲を持つ。多角形は辺が2〜20cmなので小さな物にする
const CIRCLE_NOUNS = Object.freeze([
  { id: 'tray', name: '丸いトレー', min: 20, max: 60 },
  { id: 'table', name: '丸いテーブル', min: 40, max: 200 },
  { id: 'flowerbed', name: '円形の花壇', min: 50, max: 600 },
  { id: 'fountain', name: '円形の噴水', min: 100, max: 600 },
]);
const GEOMETRY_NOUNS = Object.freeze({
  triangle: ['三角形の小旗', '三角形の板', '三角形のラベル'],
  trapezoid: ['台形の板', '台形の部品', '台形のタイル'],
  parallelogram: ['平行四辺形の板', '平行四辺形のタイル', '平行四辺形のシール'],
});

// 単位換算の組(大きい単位 → 小さい単位の向きを1行で書き、往復の2種類を作る)。
// 換算後 = 換算前 × num ÷ den。pre は「時速」などの前置き。
// confuse: 典型的に取り違える倍率(掛けると割るの逆、換算忘れは共通で加える)。
// forgotPower: 2乗・3乗の換算で「乗し忘れ」たときの倍率(長さの倍率のまま)。
const UNIT_PAIRS = Object.freeze([
  { ids: ['ha-to-m2', 'm2-to-ha'], scene: 'area', big: 'ha', small: 'm²', num: 10000, den: 1, confuse: [100, 1000, 1000000] },
  { ids: ['a-to-m2', 'm2-to-a'], scene: 'area', big: 'a', small: 'm²', num: 100, den: 1, confuse: [10, 1000, 10000] },
  { ids: ['km2-to-ha', 'ha-to-km2'], scene: 'area', big: 'km²', small: 'ha', num: 100, den: 1, confuse: [1000, 10000, 1000000] },
  { ids: ['km-to-m', 'm-to-km'], scene: 'length', big: 'km', small: 'm', num: 1000, den: 1, confuse: [100, 10000] },
  { ids: ['hours-to-minutes', 'minutes-to-hours'], scene: 'time', big: '時間', small: '分', num: 60, den: 1, confuse: [100, 3600, 24] },
  // 2026-09-27 ユーザーの判断で追加
  { ids: ['m-to-cm', 'cm-to-m'], scene: 'length', big: 'm', small: 'cm', num: 100, den: 1, confuse: [10, 1000, 10000] },
  { ids: ['cm-to-mm', 'mm-to-cm'], scene: 'length', big: 'cm', small: 'mm', num: 10, den: 1, confuse: [100, 1000, 10000] },
  { ids: ['kg-to-g', 'g-to-kg'], scene: 'weight', big: 'kg', small: 'g', num: 1000, den: 1, confuse: [100, 10000] },
  { ids: ['t-to-kg', 'kg-to-t'], scene: 'weight', big: 't', small: 'kg', num: 1000, den: 1, confuse: [100, 10000] },
  { ids: ['L-to-mL', 'mL-to-L'], scene: 'volume', big: 'L', small: 'mL', num: 1000, den: 1, confuse: [100, 10000] },
  { ids: ['L-to-dL', 'dL-to-L'], scene: 'volume', big: 'L', small: 'dL', num: 10, den: 1, confuse: [100, 1000, 10000] },
  { ids: ['m3-to-L', 'L-to-m3'], scene: 'volume', big: 'm³', small: 'L', num: 1000, den: 1, confuse: [100, 10000, 1000000] },
  { ids: ['minutes-to-seconds', 'seconds-to-minutes'], scene: 'time', big: '分', small: '秒', num: 60, den: 1, confuse: [100, 3600, 24] },
  { ids: ['days-to-hours', 'hours-to-days'], scene: 'time', big: '日', small: '時間', num: 24, den: 1, confuse: [60, 12, 100] },
  { ids: ['ha-to-a', 'a-to-ha'], scene: 'area', big: 'ha', small: 'a', num: 100, den: 1, confuse: [10, 1000, 10000] },
  // 速さ: 60 と 3600 の取り違え、km→m の換算忘れなど
  // bigScale: 大きい単位の量の範囲を unitValueMin〜unitValueMax の何倍にするか(時速3〜60km、秒速5〜100m)
  { ids: ['kmh-to-mpm', 'mpm-to-kmh'], scene: 'speed', big: 'km', bigPre: '時速', small: 'm', smallPre: '分速', num: 1000, den: 60, bigScale: 3,
    confuse: [1000 / 3600, 1000, 60, 1 / 60] },
  { ids: ['mps-to-kmh', 'kmh-to-mps'], scene: 'speed', big: 'm', bigPre: '秒速', small: 'km', smallPre: '時速', num: 3600, den: 1000, bigScale: 5,
    confuse: [60 / 1000, 3600, 60, 1000 / 3600] },
  // 2乗・3乗の換算(2026-09-27 ユーザーの判断で追加)
  { ids: ['m2-to-cm2', 'cm2-to-m2'], scene: 'area', big: 'm²', small: 'cm²', num: 10000, den: 1, forgotPower: 100, confuse: [1000, 1000000] },
  { ids: ['cm2-to-mm2', 'mm2-to-cm2'], scene: 'area', big: 'cm²', small: 'mm²', num: 100, den: 1, forgotPower: 10, confuse: [1000, 10000] },
  { ids: ['cm3-to-mm3', 'mm3-to-cm3'], scene: 'volume', big: 'cm³', small: 'mm³', num: 1000, den: 1, forgotPower: 10, confuse: [100, 1000000] },
  { ids: ['L-to-cm3', 'cm3-to-L'], scene: 'volume', big: 'L', small: 'cm³', num: 1000, den: 1, forgotPower: 10, confuse: [100, 10000] },
]);

// 単位換算の誤答の上限(正解は100万以下。誤答もその10倍まで)
const UNIT_DISTRACTOR_MAX = 10000000;

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

// 往復それぞれを1つの種類にする。pair* は組の向き(大きい単位 → 小さい単位)の倍率
const UNIT_VARIANTS = Object.freeze(UNIT_PAIRS.flatMap(pair => {
  const common = { pairIds: pair.ids, pairNum: pair.num, pairDen: pair.den, bigScale: pair.bigScale ?? 1 };
  const forward = {
    id: pair.ids[0], from: pair.big, fromPre: pair.bigPre ?? '', to: pair.small, toPre: pair.smallPre ?? '',
    num: pair.num, den: pair.den, confuse: pair.confuse, forgotPower: pair.forgotPower ?? null, scene: pair.scene,
  };
  const reverse = {
    id: pair.ids[1], from: pair.small, fromPre: pair.smallPre ?? '', to: pair.big, toPre: pair.bigPre ?? '',
    num: pair.den, den: pair.num, confuse: pair.confuse.map(c => 1 / c),
    forgotPower: pair.forgotPower ? 1 / pair.forgotPower : null, scene: pair.scene,
  };
  return [forward, reverse].map(v => Object.freeze({ ...v, ...common }));
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

// 答えと選択肢の小数の桁数の上限。問題文は整数だけ
// (2026-09-30 本番の記憶で第1位まで → 第3位まで。2026-10-01 ユーザーの実機の感想で第3位までを取り消し、第1位まで)
export const T1_MAX_DECIMALS = 1;

// ---- 暗算で一瞬の問題をなくす(2026-09-30 本番の記憶で追加) ----
// きりのいい数: 有効数字1桁の整数(1桁の整数と、10・60・300・3000 のような数)。
// 560・23570 のように有効数字が2桁以上あれば、きりのいい数とはしない
export function isRoundNumber(value) {
  return Number.isInteger(value) && significantDigits(value) <= 1;
}

// 有効数字の桁数(整数の末尾の0は数えない。例: 3.47 → 3、560 → 2、0.0582 → 3)
export function significantDigits(value) {
  let text = formatNumber(Math.abs(value)).replace('.', '').replace(/^0+/, '');
  if (Number.isInteger(value)) text = text.replace(/0+$/, '');
  return text.length;
}

// min〜max の、小数第 decimals 位までの数を選ぶ。きりのいい数は避け、小数のときは最後の桁を0にしない。
// minSig: 有効数字の桁数の下限(暗算で一瞬にならないよう、問題の中心の数は3桁以上にする)
function pickValue(rng, min, max, decimals, minSig = 0) {
  const scale = 10 ** decimals;
  const lo = Math.ceil(min * scale - 1e-9);
  const hi = Math.floor(max * scale + 1e-9);
  for (let i = 0; i < 1000; i++) {
    const n = randInt(rng, lo, hi);
    const value = n / scale;
    if ((decimals > 0 ? n % 10 !== 0 : !isRoundNumber(value)) && significantDigits(value) >= minSig) return value;
  }
  throw new RangeError(`きりのいい数でない値を選べません: ${min}〜${max}`);
}

// 5の倍数でない整数の率(%)
function pickRate(rng, min, max) {
  for (let i = 0; i < 1000; i++) {
    const r = randInt(rng, min, max);
    if (r % 5 !== 0) return r;
  }
  return randInt(rng, min, max);
}

// 条件を満たすまで作り直す(乱数で選んだ数の組のうち、答えが小数第1位までになるものだけを使うため)
function retry(make, what) {
  for (let i = 0; i < 2000; i++) {
    const got = make();
    if (got) return got;
  }
  throw new RangeError(`${what}の数値の組を作れません`);
}

// required: 必ず入れる誤答(2乗・3乗の「乗し忘れ」など)。桁ずらし(正解×10・÷10)は合わせて1つまで
// decimals: 答えと誤答の小数の桁数の上限(既定は第1位まで。人数など整数で答えるものは0)
export function makeT1Choices(answer, mistakes, rng, required = [], decimals = T1_MAX_DECIMALS) {
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
// options.decimals: 答えの小数の桁数の上限。options.answerFormat: 'hm' なら答え(分)を「◯時間◯分」で表す
// options.scene: 使った場面(単体テストで場面の数を確かめるため)
function finish(kind, variant, prompt, answer, unit, mistakes, rng, values,
  { answerPrefix = '', required = [], decimals = T1_MAX_DECIMALS, answerFormat = null, scene = null } = {}) {
  const roundedAnswer = roundNumber(answer);
  if (!hasDecimals(roundedAnswer, decimals)) throw new Error(`正しい形の正解を作れませんでした: ${kind}/${variant}`);
  const choice = makeT1Choices(roundedAnswer, mistakes, rng, required, decimals);
  return {
    kind, variant, prompt, answer: roundedAnswer, unit, answerPrefix, answerFormat, values, scene,
    ...choice,
    signature: `${kind}|${variant}|${prompt}|${roundedAnswer}`,
  };
}

// ---- 単位変換 ----
// 2026-10-01 ユーザーの実機の感想で変更: 問題文の数(換算前の量 x)は、promptNumberMin〜promptNumberMax(2〜4桁)の
// きりのいい数でない整数。答え x × num ÷ den が整数か小数第1位までになる数だけを使う
// (x は den ÷ gcd(10 × num, den) の倍数。例: 252分 → 4.2時間、時速126km → 秒速35m)。
// 答えは unitAnswerMax まで。数値に合う場面があり、2乗・3乗の「乗し忘れ」も小数第1位までで答えと違う数になるものだけ。
// m²→ha・cm²→m²(÷10000)は、この形では作れない(x が1000の倍数 = きりのいい数だけになる)ので出さない。
// 典型誤答を3つ作れない数(誤答が極端に大きくなる、小数第2位以下になるなど)も使わない。
function unitMistakes(v, shown, answer) {
  return [
    shown, // 換算し忘れ
    shown * v.den / v.num, // 掛けると割るを逆にする
    ...v.confuse.map(c => shown * c), // 倍率の取り違え
    ...v.confuse.map(c => shown / c), // 掛けると割るを逆にし、倍率も取り違える
    answer * 100, answer / 100, answer * 10, answer / 10,
  ].filter(value => value <= UNIT_DISTRACTOR_MAX); // すぐに誤りと分かる極端に大きな誤答は使わない
}

const unitRequired = (v, shown) => (v.forgotPower ? [shown * v.forgotPower] : []);

const unitCandidateCache = new WeakMap();
function unitCandidates(v, p) {
  let byVariant = unitCandidateCache.get(p);
  if (!byVariant) {
    byVariant = new Map();
    unitCandidateCache.set(p, byVariant);
  }
  if (byVariant.has(v.id)) return byVariant.get(v.id);
  const step = v.den / gcd(10 * v.num, v.den);
  const list = [];
  for (let x = Math.ceil(p.promptNumberMin / step) * step; x <= p.promptNumberMax; x += step) {
    if (isRoundNumber(x)) continue;
    const answer = roundNumber(x * v.num / v.den);
    if (answer > p.unitAnswerMax || !hasDecimals(answer, T1_MAX_DECIMALS)) continue;
    if (v.forgotPower) {
      const forgot = roundNumber(x * v.forgotPower);
      if (!hasDecimals(forgot, T1_MAX_DECIMALS) || forgot === answer) continue;
    }
    const amount = x * UNIT_BASE[v.scene][`${v.fromPre}${v.from}`];
    if (!UNIT_SCENES[v.scene].some(sc => inRange(amount, sc.min, sc.max))) continue;
    try {
      makeT1Choices(answer, unitMistakes(v, x, answer), () => 0, unitRequired(v, x));
    } catch {
      continue;
    }
    list.push(x);
  }
  byVariant.set(v.id, list);
  return list;
}

// 設定 p で作れる単位変換の種類(2026-10-01 追加)
export function unitVariantsFor(p) {
  return UNIT_VARIANTS.filter(v => unitCandidates(v, p).length > 0).map(v => v.id);
}

function unitProblem(rng, p, forcedVariant = null) {
  const available = unitVariantsFor(p);
  const id = forcedVariant ?? available[randInt(rng, 0, available.length - 1)];
  const v = UNIT_VARIANTS.find(x => x.id === id);
  if (!v) throw new RangeError(`不明な単位換算です: ${forcedVariant}`);
  const candidates = unitCandidates(v, p);
  if (!candidates.length) throw new RangeError(`${id} は問題文を2〜4桁の整数にすると答えを小数第1位までにできないので出さない`);
  // 桁数(2・3・4桁)を同じ確率で選んでから、その桁数の中で選ぶ
  const byDigits = [2, 3, 4].map(d => candidates.filter(x => String(x).length === d)).filter(list => list.length);
  const bucket = byDigits[randInt(rng, 0, byDigits.length - 1)];
  const shown = bucket[randInt(rng, 0, bucket.length - 1)];
  const answer = roundNumber(shown * v.num / v.den);
  // t は「メートルトン」とも言う(2026-09-30 本番に合わせて追加)
  const tonWord = rng() < 0.5 ? 'メートルトン' : 't';
  const label = unit => (unit === 't' ? tonWord : unit);
  const from = label(v.from);
  const to = label(v.to);
  // 換算前の量を基準の単位に直し、それに合う場面を選ぶ
  const amount = shown * UNIT_BASE[v.scene][`${v.fromPre}${v.from}`];
  const scene = pickFittingScene(rng, UNIT_SCENES[v.scene], sc => inRange(amount, sc.min, sc.max), sc => rangeGap(amount, sc.min, sc.max));
  return finish(
    'unit', v.id,
    scene.text(`${v.fromPre}${shown}${from}`, `${v.toPre}何${to}`),
    answer, to, unitMistakes(v, shown, answer), rng,
    { shown, num: v.num, den: v.den, from, fromPre: v.fromPre, to, toPre: v.toPre },
    { answerPrefix: v.toPre, required: unitRequired(v, shown), scene: `unit:${v.scene}:${scene.id}` },
  );
}

// 問題文に使う数か(きりのいい数でない、promptNumberMin〜promptNumberMax の整数)
function isPromptNumber(value, p) {
  return Number.isInteger(value) && value >= p.promptNumberMin && value <= p.promptNumberMax && !isRoundNumber(value);
}

// min〜max の、step の倍数で、きりのいい数でない整数
function pickMultiple(rng, min, max, step) {
  const lo = Math.ceil(min / step);
  const hi = Math.floor(max / step);
  for (let i = 0; i < 1000; i++) {
    const value = step * randInt(rng, lo, hi);
    if (!isRoundNumber(value)) return value;
  }
  throw new RangeError(`きりのいい数でない ${step} の倍数を選べません: ${min}〜${max}`);
}

// 誤答を小数第1位までに丸める(2026-10-01 以前はお金の形の第2位まで)
const round1 = value => Math.round(value * 10) / 10;

// ---- 計算: 速さ(2026-10-01 問題文を整数だけにした。時速は整数、時間は分で書く) ----
// 距離: 時速47kmで156分 → 122.2km / 時間: 197km を時速47km → 4.2時間 / 速さ: 122kmを150分 → 時速48.8km
function speedProblem(rng, p) {
  const variant = ['distance', 'time', 'speed'][randInt(rng, 0, 2)];
  let values;
  if (variant === 'time') {
    // 距離(整数)÷ 時速(整数)= 時間(小数第1位。ちょうどの時間にはしない)
    values = retry(() => {
      const speed = pickValue(rng, p.speedMin, p.speedMax, 0);
      const hours = pickValue(rng, p.speedHoursMin, p.speedHoursMax, 1);
      const distance = roundNumber(speed * hours);
      return isPromptNumber(distance, p) ? { speed, minutes: null, hours, distance } : null;
    }, '速さ');
  } else {
    values = retry(() => {
      const speed = pickValue(rng, p.speedMin, p.speedMax, 0);
      const minutes = pickValue(rng, p.speedMinutesMin, p.speedMinutesMax, 0);
      const distance = roundNumber(speed * minutes / 60);
      // 距離を求めるときは答えが小数第1位まで、速さを求めるときは問題文の距離が整数
      const ok = variant === 'distance' ? hasDecimals(distance, T1_MAX_DECIMALS) : isPromptNumber(distance, p);
      return ok ? { speed, minutes, hours: null, distance } : null;
    }, '速さ');
  }
  const { speed, minutes, hours, distance } = values;
  // 速さに合う場面(歩く人・ランナー・自転車・トラック・船)を選ぶ(2026-09-30 レビュー後の直し)
  const sc = pickFittingScene(rng, SPEED_SCENES, x => inRange(speed, x.min, x.max), x => rangeGap(speed, x.min, x.max));
  const scene = `speed:${sc.id}`;
  if (variant === 'distance') {
    const prompt = `${sc.subject}が時速${speed}kmで${minutes}分${sc.past}。何km進みましたか?`;
    return finish('speed', variant, prompt, distance, 'km',
      [speed * minutes, speed * minutes / 100, speed / minutes * 60, distance + speed, Math.abs(distance - speed), distance * 10, distance / 10].map(round1),
      rng, values, { scene });
  }
  if (variant === 'time') {
    const prompt = `${sc.place}まで${distance}kmあります。${sc.subject}が時速${speed}kmで${sc.verb}と何時間かかりますか?`;
    return finish('speed', variant, prompt, hours, '時間',
      [distance * speed, hours * 60, speed / distance, distance - speed, hours + 1, hours * 10, hours / 10].map(round1), rng, values, { scene });
  }
  return finish('speed', variant, `${sc.subject}が${distance}kmを${minutes}分で${sc.past}。速さは時速何kmですか?`, speed, 'km',
    [distance * minutes, distance / minutes, minutes / distance * 60, distance * 60, speed + 1, speed * 10, speed / 10].map(round1), rng, values,
    { answerPrefix: '時速', scene });
}

// ---- 計算: 出会い・追いつき ----
// 2026-10-01 問題文を整数だけにした: 周囲は m、ふたりの速さは分速 m(整数)。答えの分は小数第1位まで。
// ふたりの分速と答えの分(0.1分きざみ)を先に決め、周囲の長さ(整数)を逆算する
function pickLap(rng, p, kind) {
  return retry(() => {
    const a = pickValue(rng, p.lapSpeedMin, p.lapSpeedMax, 0);
    const b = pickValue(rng, p.lapSpeedMin, p.lapSpeedMax, 0);
    if (a <= b) return null;
    const tenths = randInt(rng, p.lapMinutesMin * 10, p.lapMinutesMax * 10);
    const length = roundNumber(tenths * (kind === 'meeting' ? a + b : a - b) / 10);
    return isPromptNumber(length, p) && length >= 100 ? { a, b, minutes: tenths / 10, length } : null;
  }, '周回');
}

// 周回の場面は、ふたりの分速に合うものを選ぶ(2026-09-30 レビュー後の直し)。「周囲◯m」の形は保つ
function pickLapScene(rng, a, b) {
  const fits = sc => inRange(b, ...sc.slow) && inRange(a, ...sc.fast);
  const gap = sc => rangeGap(b, ...sc.slow) * rangeGap(a, ...sc.fast);
  return pickFittingScene(rng, LAP_SCENES, fits, gap);
}

function meetingProblem(rng, p) {
  const { a, b, minutes, length } = pickLap(rng, p, 'meeting');
  const scene = pickLapScene(rng, a, b);
  return finish('meeting', 'opposite',
    `周囲${length}mの${scene.place}を、${scene.who(a, b)}が同じ地点から反対方向に進み始めました。何分後に出会いますか?`,
    minutes, '分', [length / (a - b), minutes * 60, length / a, minutes * 2, minutes + 60, minutes * 10, minutes / 10].map(round1), rng, { length, a, b },
    { scene: `meeting:${scene.id}` });
}

function catchupProblem(rng, p) {
  const { a, b, minutes, length } = pickLap(rng, p, 'catchup');
  const scene = pickLapScene(rng, a, b);
  return finish('catchup', 'same-direction',
    `周囲${length}mの${scene.place}を、${scene.who(a, b)}が同じ地点から同じ方向に進み始めました。${scene.faster}は何分後に${scene.slower}に追いつきますか?`,
    minutes, '分', [length / (a + b), minutes * 60, length / a, minutes * 2, minutes + 60, minutes * 10, minutes / 10].map(round1), rng, { length, a, b },
    { scene: `catchup:${scene.id}` });
}

// ---- 割合 ----
// 割合: 「貨物1260kgのうち28%が郵便物」→ 352.8kg。率は5の倍数でない整数。答えが小数第1位までになる組だけ
function percentageProblem(rng, p) {
  // 旅客機1便の乗客は500人まで(2026-09-30 レビュー後の直し)で、人数は整数。乗客の場面は先に選び、数値をその場面に合わせる
  const passengers = rng() < 1 / 3;
  const { base, percent, answer } = retry(() => {
    const b = pickValue(rng, p.percentBaseMin, passengers ? Math.min(500, p.percentBaseMax) : p.percentBaseMax, 0, 3);
    const r = pickRate(rng, p.percentMin, p.percentMax);
    const a = roundNumber(b * r / 100);
    return passengers ? (Number.isInteger(a) ? { base: b, percent: r, answer: a } : null)
      : (hasDecimals(a, T1_MAX_DECIMALS) ? { base: b, percent: r, answer: a } : null);
  }, '割合');
  const scene = passengers
    ? { id: 'passengers', unit: '人', text: `乗客${base}人のうち${percent}%がビジネスクラスです。ビジネスクラスの乗客は何人ですか?` }
    : pickScene(rng, [
      { id: 'cargo', unit: 'kg', text: `貨物${base}kgのうち${percent}%が郵便物です。郵便物は何kgですか?` },
      { id: 'fare', unit: 'ドル', text: `運賃${base}ドルのうち${percent}%が燃料費です。燃料費は何ドルですか?` },
    ]).scene;
  return finish('percentage', 'basic', scene.text, answer, scene.unit,
    [base * percent, base - answer, base + answer, answer * 2, base * percent / 1000, answer * 10, answer / 10].map(round1), rng, { base, percent },
    { scene: `percentage:${scene.id}` });
}

// 割合の逆算: 「定員287人の便に232人」→ 何%。答えは整数の%で、問題文の数も整数になる組だけ
function inversePercentageProblem(rng, p) {
  // 場面を先に選び、数値をその場面に合わせる(定員は500人まで)
  const kind = ['seats', 'parcels', 'budget'][randInt(rng, 0, 2)];
  const { base, percent, part } = retry(() => {
    const b = pickValue(rng, p.percentBaseMin, kind === 'seats' ? Math.min(500, p.percentBaseMax) : p.percentBaseMax, 0, 3);
    const r = pickRate(rng, p.percentMin, p.percentMax);
    const k = roundNumber(b * r / 100);
    return Number.isInteger(k) && k >= p.promptNumberMin ? { base: b, percent: r, part: k } : null;
  }, '割合の逆算');
  const scene = {
    seats: { id: 'seats', text: `定員${base}人の便に${part}人が乗っています。搭乗率は何%ですか?` },
    parcels: { id: 'parcels', text: `${base}個の荷物のうち${part}個を積み終えました。何%を積み終えましたか?` },
    budget: { id: 'budget', text: `予算${base}ドルのうち${part}ドルを使いました。予算の何%を使いましたか?` },
  }[kind];
  return finish('inversePercentage', 'basic', scene.text, percent, '%',
    [100 - percent, part / base, base / part, percent * 10, percent / 10, 100 + percent].map(round1), rng, { base, part },
    { scene: `inversePercentage:${scene.id}` });
}

// 利益率(2026-09-30 本番の記憶で追加): 「製造コスト560ドルの部品に33%の利益を乗せて売る」→ 560 × (1 + 0.33) = 744.8ドル
function markupProblem(rng, p) {
  const { cost, rate, answer } = retry(() => {
    const c = pickValue(rng, p.percentBaseMin, p.percentBaseMax, 0, 3);
    const r = pickRate(rng, p.markupRateMin, p.markupRateMax);
    const a = roundNumber(c * (100 + r) / 100);
    return hasDecimals(a, T1_MAX_DECIMALS) ? { cost: c, rate: r, answer: a } : null;
  }, '利益率');
  const { index, scene } = pickScene(rng, [
    `部品メーカーは製造コスト${cost}ドルの部品に${rate}%の利益を乗せて売ります。航空会社はいくらで買えますか?`,
    `整備会社は原価${cost}ドルの作業に${rate}%の利益を乗せて請け負います。請負額はいくらですか?`,
    `機内食の会社は原価${cost}ドルの料理に${rate}%の利益を乗せて売ります。売値はいくらですか?`,
  ]);
  return finish('markup', 'basic', scene, answer, 'ドル',
    [cost * rate / 100, cost * (100 - rate) / 100, cost / (1 + rate / 100), cost + rate, answer * 10, answer / 10].map(round1),
    rng, { cost, rate }, { scene: `markup:${index}` });
}

// 割引(2026-09-30 本番の記憶で追加): 定価と割引率から売値、売値と割引率から定価。
// 2026-10-01 問題文を整数だけにした: 売値を求めるときは定価が整数、定価を求めるときは売値が整数。答えは小数第1位まで
export const DISCOUNT_VARIANTS = Object.freeze(['sale-price', 'list-price']);
function discountProblem(rng, p, forcedVariant = null) {
  const variant = forcedVariant ?? DISCOUNT_VARIANTS[randInt(rng, 0, 1)];
  if (!DISCOUNT_VARIANTS.includes(variant)) throw new RangeError(`不明な割引の問題です: ${variant}`);
  const { list, rate, sale } = retry(() => {
    const shown = pickValue(rng, p.percentBaseMin, p.percentBaseMax, 0, 3);
    const r = pickRate(rng, p.discountRateMin, p.discountRateMax);
    const other = roundNumber(variant === 'sale-price' ? shown * (100 - r) / 100 : shown * 100 / (100 - r));
    if (!hasDecimals(other, T1_MAX_DECIMALS)) return null;
    return variant === 'sale-price' ? { list: shown, rate: r, sale: other } : { list: other, rate: r, sale: shown };
  }, '割引');
  const { index, scene: item } = pickScene(rng, ['免税店のバッグ', '機内販売の時計', '整備用の工具']);
  if (variant === 'sale-price') {
    return finish('discount', variant, `定価${list}ドルの${item}が${rate}%引きになっています。売値はいくらですか?`, sale, 'ドル',
      [list * rate / 100, list * (100 + rate) / 100, list / (1 - rate / 100), list - rate, sale * 10, sale / 10].map(round1),
      rng, { list, rate, sale }, { scene: `discount:${index}` });
  }
  return finish('discount', variant, `${item}が${rate}%引きの${sale}ドルで売られています。定価はいくらですか?`, list, 'ドル',
    [sale * (100 + rate) / 100, sale * (100 - rate) / 100, sale + rate, sale / (rate / 100), list * 10, list / 10].map(round1),
    rng, { list, rate, sale }, { scene: `discount:${index}` });
}

// 全体の逆算(2026-09-30 本番の記憶で追加): 「ファーストクラスの乗客は56人で、全体の32%」→ 175人。答えが整数になる組だけ
function wholeFromPartProblem(rng, p) {
  // 部分(人数)が整数で有効数字3桁になるよう、率ごとに全体を 100/gcd(率,100) の倍数から選ぶ
  const { whole, part, rate } = retry(() => {
    const r = pickRate(rng, p.percentMin, p.markupRateMax);
    const step = 100 / gcd(r, 100);
    const lo = Math.ceil(Math.max(p.wholeMin, 10000 / r) / step);
    const hi = Math.floor(p.wholeMax / step);
    if (lo > hi) return null;
    const w = step * randInt(rng, lo, hi);
    const k = w * r / 100;
    return !isRoundNumber(w) && significantDigits(k) >= 3 && k <= p.promptNumberMax ? { whole: w, part: k, rate: r } : null;
  }, '全体の逆算');
  const { index, scene } = pickScene(rng, [
    { unit: '人', text: `ファーストクラスの乗客は${part}人で、乗客全体の${rate}%でした。乗客は全部で何人ですか?` },
    { unit: '人', text: `乗り継ぎの乗客は${part}人で、乗客全体の${rate}%でした。乗客は全部で何人ですか?` },
    { unit: '便', text: `ある日に遅れて到着した便は${part}便で、全体の${rate}%でした。この日の便は全部で何便ですか?` },
  ]);
  return finish('wholeFromPart', 'basic', scene.text, whole, scene.unit,
    [Math.round(part * rate / 100), Math.round(part * (100 + rate) / 100), Math.round(part * (100 - rate) / rate), part + rate, whole * 10, Math.round(whole / 10)],
    rng, { part, rate }, { decimals: 0, scene: `wholeFromPart:${index}` });
}

// 前年比(2026-09-30 本番の記憶で追加): 「去年から14%伸びて5358ドル」→ 去年は4700ドル。去年の値が割り切れる組だけ。
// 2026-10-01 今年の値も4桁までにした
function yearOverYearProblem(rng, p) {
  const { last, rate, now } = retry(() => {
    const g = pickRate(rng, p.growthRateMin, p.growthRateMax);
    const step = 100 / gcd(100 + g, 100);
    const y = step * randInt(rng, Math.ceil(p.yearValueMin / step), Math.floor(p.yearValueMax / step));
    const t = y * (100 + g) / 100;
    return isPromptNumber(t, p) ? { last: y, rate: g, now: t } : null;
  }, '前年比');
  const { index, scene } = pickScene(rng, [
    { unit: 'ドル', text: `A社の売上は去年から${rate}%伸びて${now}ドルでした。去年の売上は何ドルですか?` },
    { unit: '人', text: `ある日の空港の利用者は、去年の同じ日から${rate}%増えて${now}人でした。去年の同じ日の利用者は何人ですか?` },
    { unit: 'kg', text: `ある日の貨物の取扱量は、去年の同じ日から${rate}%増えて${now}kgでした。去年の同じ日の取扱量は何kgですか?` },
  ]);
  return finish('yearOverYear', 'basic', scene.text, last, scene.unit,
    [Math.round(now * (100 - rate) / 100), Math.round(now * (100 + rate) / 100), now - rate, Math.round(now / (rate / 100)), last * 10, Math.round(last / 10)],
    rng, { now, rate }, { decimals: 0, scene: `yearOverYear:${index}` });
}

// ---- 計算: 単価と合計 ----
// 100gあたりの値段の組(2026-10-01 問題文を整数だけにした): グラムと合計(ドル)が整数で、100gあたりが小数第1位までになる組
const per100gCache = new WeakMap();
function per100gCandidates(p) {
  if (per100gCache.has(p)) return per100gCache.get(p);
  const list = [];
  for (let grams = p.per100gGramsMin; grams <= p.per100gGramsMax; grams++) {
    if (isRoundNumber(grams)) continue;
    for (let total = p.per100gTotalMin; total <= p.per100gTotalMax; total++) {
      const answer = roundNumber(total * 100 / grams);
      // 答えがきりのいい数(39ドル・390g → 10ドルなど)になる組は、暗算で一瞬なので使わない
      if (!isRoundNumber(total) && hasDecimals(answer, T1_MAX_DECIMALS) && !isRoundNumber(answer)) list.push({ grams, total });
    }
  }
  per100gCache.set(p, list);
  return list;
}

function priceProblem(rng, p, forcedVariant = null) {
  const variant = forcedVariant ?? PRICE_VARIANTS[randInt(rng, 0, PRICE_VARIANTS.length - 1)];
  if (variant === 'total' || variant === 'unit-price') {
    // 合計も有効数字3桁以上で4桁までの組だけ(単価を求める問題で、問題文の数が大きくなりすぎないように)
    const { price, count, total } = retry(() => {
      const pr = pickValue(rng, p.priceMin, p.priceMax, 0, 3);
      const c = pickValue(rng, p.priceCountMin, p.priceCountMax, 0);
      return significantDigits(pr * c) >= 3 && pr * c <= p.promptNumberMax ? { price: pr, count: c, total: pr * c } : null;
    }, '単価と合計');
    // 単価に合う品物を選ぶ(機内販売の品物は100円以上。2026-09-30 レビュー後の直し)
    const sc = pickFittingScene(rng, [
      { id: 'souvenir', min: 100, max: 3000, name: '機内販売の品物' },
      { id: 'snack', min: 10, max: 300, name: 'お菓子' },
      { id: 'part', min: 10, max: 3000, name: '部品' },
    ], x => inRange(price, x.min, x.max), x => rangeGap(price, x.min, x.max));
    if (variant === 'total') {
      return finish('price', 'total', `単価${price}円の${sc.name}を${count}個買いました。合計は何円ですか?`, total, '円',
        [price / count, price + count, total + price, total - price, total * 10, total / 10].map(round1), rng, { price, count, total },
        { scene: `price:${sc.id}` });
    }
    return finish('price', 'unit-price', `同じ${sc.name}を${count}個買うと${total}円でした。単価は何円ですか?`, price, '円',
      [total * count, total - count, price + count, price - count, price * 10, price / 10].map(round1), rng, { price, count, total }, { scene: `price:${sc.id}` });
  }
  if (variant === 'per-100g') {
    // 「250gで13ドルの品物は、100gあたり何ドル?」→ 5.2ドル
    const per = 100;
    const list = per100gCandidates(p);
    const { grams, total } = list[randInt(rng, 0, list.length - 1)];
    const answer = roundNumber(total * per / grams);
    const { index, scene } = pickScene(rng, ['コーヒー豆', 'お茶の葉', 'ナッツ']);
    return finish('price', 'per-100g', `${scene}が${grams}gで${total}ドルです。${per}gあたり何ドルですか?`, answer, 'ドル',
      [total, total * grams / per, total / grams, grams * per / total, answer + 1, answer * 2, answer * 10, answer / 10].map(round1), rng, { grams, total, per },
      { scene: `price:per100g-${index}` });
  }
  if (variant === 'per-gram-total') {
    // 「1gあたり12円の品物を347g買うと何円?」
    const perGram = pickValue(rng, 11, 29, 0);
    const grams = pickValue(rng, 101, 999, 0, 3);
    const answer = perGram * grams;
    const { index, scene } = pickScene(rng, ['チョコレート', 'ナッツ', '香辛料']);
    return finish('price', 'per-gram-total', `1gあたり${perGram}円の${scene}があります。${grams}g買うと何円ですか?`, answer, '円',
      [grams, perGram + grams, answer / 100, grams / perGram, answer * 100, answer * 10, answer / 10].map(round1), rng, { perGram, grams },
      { scene: `price:perGram-${index}` });
  }
  throw new RangeError(`不明な単価の問題です: ${variant}`);
}

// ---- 計算: 平均(2026-10-01 問題文を整数だけにした: 2桁の整数3つ。平均が割り切れる組だけ) ----
function averageProblem(rng, p) {
  const { a, b, c } = retry(() => {
    const x = pickValue(rng, p.averageMin, p.averageMax, 0);
    const y = pickValue(rng, p.averageMin, p.averageMax, 0);
    const z = pickValue(rng, p.averageMin, p.averageMax, 0);
    return (x + y + z) % 3 === 0 ? { a: x, b: y, c: z } : null;
  }, '平均');
  const sum = a + b + c;
  const answer = sum / 3;
  const { index, scene } = pickScene(rng, [
    { unit: '分', text: `ある便の三日間の遅れは${a}分、${b}分、${c}分でした。平均は何分ですか?` },
    { unit: 'kg', text: `三つの荷物の重さは${a}kg、${b}kg、${c}kgです。平均は何kgですか?` },
    { unit: 'L', text: `三つの容器に入った燃料は${a}L、${b}L、${c}Lです。平均は何Lですか?` },
  ]);
  return finish('average', 'three', scene.text, answer, scene.unit,
    [sum, sum / 2, sum * 3, sum - 3, answer * 10, answer / 10].map(round1), rng, { a, b, c }, { scene: `average:${index}` });
}

// ---- 計算: 経過時間(時刻の分のどちらかは、きりのいい数にしない) ----
function elapsedProblem(rng, p) {
  const { h1, m1, h2, m2, minutes } = retry(() => {
    const start = randInt(rng, p.clockStartHourMin, p.clockStartHourMax) * 60 + randInt(rng, 0, 59);
    const span = randInt(rng, p.elapsedMinutesMin, p.elapsedMinutesMax);
    const end = start + span;
    const got = { h1: Math.floor(start / 60), m1: start % 60, h2: Math.floor(end / 60), m2: end % 60, minutes: span };
    return isRoundNumber(got.m1) && isRoundNumber(got.m2) ? null : got;
  }, '経過時間');
  const { index, scene } = pickScene(rng, [
    `${h1}時${m1}分に出発した便が${h2}時${m2}分に着きました。飛行時間は何分ですか?`,
    `機体の整備を${h1}時${m1}分に始め、${h2}時${m2}分に終えました。整備には何分かかりましたか?`,
    `荷物の積み込みを${h1}時${m1}分に始め、${h2}時${m2}分に終えました。何分かかりましたか?`,
  ]);
  return finish('elapsed', 'same-day', scene, minutes, '分',
    [(h2 - h1) * 100 + m2 - m1, minutes * 60, minutes / 60, minutes + 60, Math.abs(minutes - 60), minutes * 10, minutes / 10].map(round1), rng, { h1, m1, h2, m2 },
    { scene: `elapsed:${index}` });
}

// ---- 計算: 図形(円周率は3.14) ----
// 2026-10-01 問題文を整数だけにした。答えが小数第1位までになるよう:
// 円周の直径・半径は5の倍数、円周から直径を求める問題は直径が50の倍数(周は157の倍数)、円の面積の半径は5の倍数(15・25・…)。
// 多角形の辺と高さは2桁の整数(11〜99cm)。
// 誤答は典型的な間違い(半径と直径の取り違え、円周率を3にする、÷2のし忘れ、周と面積の混同など)から作る。
function geometryProblem(rng, p, forcedVariant = null) {
  const variant = forcedVariant ?? GEOMETRY_VARIANTS[randInt(rng, 0, GEOMETRY_VARIANTS.length - 1)];
  const pi = p.circlePi;
  const note = `(円周率は${formatNumber(pi)})`;
  // 辺と高さ
  const side = () => pickValue(rng, p.geometryLengthMin, p.geometryLengthMax, 0);
  // 場面は形ごとの物の名前(2026-09-30 本番に合わせて変更)。円は直径に合う物を選ぶ(2026-09-30 レビュー後の直し)
  let noun;
  let scene;
  const circleNoun = diameter => {
    const sc = pickFittingScene(rng, CIRCLE_NOUNS, x => inRange(diameter, x.min, x.max), x => rangeGap(diameter, x.min, x.max));
    noun = sc.name;
    scene = `geometry:${sc.id}`;
  };
  if (!variant.startsWith('circle')) {
    const shape = variant.replace('-area', '');
    const nounIndex = randInt(rng, 0, GEOMETRY_NOUNS[shape].length - 1);
    noun = GEOMETRY_NOUNS[shape][nounIndex];
    scene = `geometry:${shape}-${nounIndex}`;
  }
  if (variant === 'circle-circumference-diameter') {
    const diameter = pickMultiple(rng, p.circleDiameterMin, p.circleDiameterMax, 5);
    const answer = roundNumber(diameter * pi);
    circleNoun(diameter);
    return finish('geometry', variant, `${noun}の直径は${diameter}cmです。周の長さは何cmですか?${note}`, answer, 'cm',
      [diameter * 3, answer / 2, (diameter / 2) ** 2 * pi, answer * 10, answer / 10].map(round1), rng, { diameter, pi },
      { required: [answer * 2], scene }); // 直径を半径として計算する
  }
  if (variant === 'circle-circumference-radius') {
    const radius = pickMultiple(rng, p.circleDiameterMin / 2, p.circleDiameterMax / 2, 5);
    const answer = roundNumber(radius * 2 * pi);
    circleNoun(radius * 2);
    return finish('geometry', variant, `${noun}の半径は${radius}cmです。周の長さは何cmですか?${note}`, answer, 'cm',
      [radius * pi, radius * 4 * pi, radius * 2 * 3, radius * radius * pi, answer * 10, answer / 10].map(round1), rng, { radius, pi }, { scene });
  }
  if (variant === 'circle-diameter') {
    // 周(整数)÷ 3.14 が小数第1位までになるのは、直径が50の倍数のとき(周は157の倍数)
    const diameter = 50 * randInt(rng, Math.ceil(p.circleDiameterMin / 50), Math.floor(p.circleDiameterMax / 50));
    const circumference = roundNumber(diameter * pi);
    circleNoun(diameter);
    return finish('geometry', variant, `${noun}の周の長さは${circumference}cmです。直径は何cmですか?${note}`, diameter, 'cm',
      [diameter / 2, diameter * 2, circumference / 3, diameter * 10, diameter / 10].map(round1), rng, { circumference, pi }, { scene });
  }
  if (variant === 'circle-area') {
    const radius = pickMultiple(rng, p.circleAreaRadiusMin, p.circleAreaRadiusMax, 5);
    const answer = roundNumber(radius * radius * pi);
    circleNoun(radius * 2);
    return finish('geometry', variant, `${noun}の半径は${radius}cmです。面積は何cm²ですか?${note}`, answer, 'cm²',
      [radius * radius * 3, (radius * 2) ** 2 * pi, radius * 2 * pi, radius * pi, answer * 10, answer / 10].map(round1), rng, { radius, pi }, { scene });
  }
  if (variant === 'triangle-area') {
    const base = side();
    const height = side();
    const answer = base * height / 2;
    return finish('geometry', variant, `${noun}は底辺${base}cm、高さ${height}cmです。面積は何cm²ですか?`, answer, 'cm²',
      [base + height, (base + height) * 2, base * height * 2, answer * 10, answer / 10].map(round1), rng, { base, height },
      { required: [base * height], scene }); // ÷2 のし忘れ
  }
  if (variant === 'trapezoid-area') {
    const { top, bottom } = retry(() => {
      const t = side();
      const b = side();
      return t < b ? { top: t, bottom: b } : null;
    }, '台形');
    const height = side();
    const answer = (top + bottom) * height / 2;
    return finish('geometry', variant, `${noun}は上底${top}cm、下底${bottom}cm、高さ${height}cmです。面積は何cm²ですか?`, answer, 'cm²',
      [bottom * height, top * height, (bottom - top) * height / 2, top * bottom * height / 2, top + bottom + height, answer * 10, answer / 10].map(round1),
      rng, { top, bottom, height }, { required: [(top + bottom) * height], scene }); // ÷2 のし忘れ
  }
  if (variant === 'parallelogram-area') {
    const base = side();
    const height = side();
    const answer = base * height;
    return finish('geometry', variant, `${noun}は底辺${base}cm、高さ${height}cmです。面積は何cm²ですか?`, answer, 'cm²',
      [answer / 2, base + height, (base + height) * 2, answer * 2, answer * 10, answer / 10].map(round1), rng, { base, height }, { scene });
  }
  throw new RangeError(`不明な図形の問題です: ${variant}`);
}

// ---- 計算: 本番に出た形(2026-09-30 本番に合わせて追加) ----

// 仕事算: 人数と時間は反比例。「12人で35時間かかる作業を、8人で行うと何時間?」→ 52.5時間。
// 人数は3〜24人、時間は2桁の整数(2026-10-01 問題文を整数だけにした)。答えが小数第1位までになる組だけ
function workProblem(rng, p) {
  const { workers1, hours1, workers2 } = retry(() => {
    const w1 = pickValue(rng, p.workWorkersMin, p.workWorkersMax, 0);
    const w2 = pickValue(rng, p.workWorkersMin, p.workWorkersMax, 0);
    const h = pickValue(rng, p.workHoursMin, p.workHoursMax, 0);
    return w1 !== w2 && hasDecimals(roundNumber(w1 * h / w2), T1_MAX_DECIMALS) ? { workers1: w1, hours1: h, workers2: w2 } : null;
  }, '仕事算');
  const answer = roundNumber(workers1 * hours1 / workers2);
  const proportional = roundNumber(hours1 * workers2 / workers1); // 比例で計算する(典型的な間違い)
  const { index, scene } = pickScene(rng, ['機体の清掃', '荷物の積み込み', '倉庫の整理']);
  return finish('work', 'basic',
    `${workers1}人で${hours1}時間かかる${scene}があります。${workers2}人で行うと何時間かかりますか?`,
    answer, '時間',
    [workers1 * hours1, hours1, hours1 + Math.abs(workers1 - workers2), answer + 1, answer - 1, answer * 10, answer / 10].map(round1),
    rng, { workers1, hours1, workers2 },
    { required: hasDecimals(proportional, T1_MAX_DECIMALS) && proportional !== answer ? [proportional] : [], scene: `work:${index}` });
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
        // 暗算で一瞬にならないよう、時速はどちらも きりのいい数にせず、少なくとも一方は有効数字3桁にする
        const plain = !isRoundNumber(speed1) && !isRoundNumber(speed2) && Math.max(significantDigits(speed1), significantDigits(speed2)) >= 3;
        if (speed2 !== speed1 && plain && (speed1 * hours1 * 60) % speed2 === 0) list.push({ speed1, hours1, speed2 });
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
  return finish('speedTime', 'basic', scene, minutes, '', mistakes.filter(m => Number.isInteger(m)), rng, { speed1, hours1, speed2 },
    { answerFormat: 'hm', decimals: 0, scene: `speedTime:${index}` });
}

// 時給: 給料 ÷ 時間。時間はきりのいい数にしない。ドルは小数第1位まで(2026-10-01 第2位まで → 第1位まで)、円は整数で割り切れる組だけ。
// 給料は4桁まで
function wageProblem(rng, p, forcedVariant = null) {
  const variant = forcedVariant ?? (rng() < 0.5 ? 'dollar' : 'yen');
  if (variant !== 'dollar' && variant !== 'yen') throw new RangeError(`不明な時給の問題です: ${variant}`);
  // 給料も有効数字3桁以上になる組だけ(暗算で一瞬にならないように)
  const { hours, answer, total } = retry(() => {
    let h;
    let a;
    if (variant === 'dollar') {
      // 時給(0.1ドル単位)を 10/gcd(時間,10) の倍数にして、給料をドルの整数にする
      h = pickValue(rng, p.wageHoursMin, p.wageHoursMax, 0);
      const step = 10 / gcd(h, 10);
      a = step * randInt(rng, Math.ceil(p.wageDollarMin * 10 / step), Math.floor(p.wageDollarMax * 10 / step)) / 10;
    } else {
      // 円は給料を4桁までにするため、時給を先に選び、時間は 給料の上限 ÷ 時給 まで(1桁の時間も使う)
      a = 10 * randInt(rng, Math.ceil(p.wageYenMin / 10), Math.floor(p.wageYenMax / 10));
      h = randInt(rng, p.wageHoursMin, Math.min(p.wageHoursMax, Math.floor(p.promptNumberMax / a)));
    }
    const t = roundNumber(h * a);
    return significantDigits(t) >= 3 && isPromptNumber(t, p) ? { hours: h, answer: a, total: t } : null;
  }, '時給');
  const unit = variant === 'dollar' ? 'ドル' : '円';
  const mistakes = variant === 'dollar'
    ? [total / (hours + 1), total / (hours - 1), answer + 1, answer - 1, answer + 10, answer * 10, answer / 10].map(round1)
    : [total / (hours + 1), total / (hours - 1), answer + 100, answer - 100, answer + 10, answer * 10, answer / 10].map(Math.round);
  const { index, scene } = pickScene(rng, variant === 'dollar' ? [
    `${hours}時間働いて${total}ドルの給料をもらいました。時給は何ドルですか?`,
    `整備士が${hours}時間の作業で${total}ドルを受け取りました。時給は何ドルですか?`,
    `通訳の仕事を${hours}時間して${total}ドルをもらいました。時給は何ドルですか?`,
  ] : [
    `${hours}時間働いて${total}円の給料をもらいました。時給は何円ですか?`,
    `空港の売店で${hours}時間働き、${total}円を受け取りました。時給は何円ですか?`,
    `荷物の仕分けを${hours}時間して${total}円をもらいました。時給は何円ですか?`,
  ]);
  return finish('wage', variant, scene, answer, unit, mistakes, rng, { hours, total },
    { decimals: variant === 'dollar' ? 1 : 0, scene: `wage:${index}` });
}

// 円筒の容積: 3.14 × 半径 × 半径 × (高さ − 上から下げた分) ÷ 1000 = 約◯L(小数第1位で四捨五入)。
// 2026-10-01 問題文を整数だけにした: 直径は2桁の整数(cm)、高さは cm の整数
function cylinderProblem(rng, p) {
  const pi = p.circlePi;
  const diameter = pickValue(rng, p.cylinderDiameterMin, p.cylinderDiameterMax, 0);
  const heightCm = pickValue(rng, p.cylinderHeightMin, p.cylinderHeightMax, 0);
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
  // 缶は直径30cm・高さ1mまで、タンクは直径20cm以上(2026-09-30 レビュー後の直し)
  const scene = pickFittingScene(rng, [
    { id: 'can', vessel: '円筒の缶', edge: '上', content: '燃料', fits: () => diameter <= 30 && heightCm <= 100 },
    { id: 'tank', vessel: '円柱形のタンク', edge: '上', content: '水', fits: () => diameter >= 20 },
    { id: 'container', vessel: '円筒形の容器', edge: 'ふち', content: '油', fits: () => true },
  ], sc => sc.fits());
  return finish('cylinder', 'fuel',
    `直径${diameter}cm、高さ${heightCm}cmの${scene.vessel}があります。${scene.edge}から${gap}cm下まで${scene.content}を入れると、約何L入りますか?(円周率は${formatNumber(pi)})`,
    answer, 'L', mistakes, rng, { diameter, heightCm, gap, pi },
    { answerPrefix: '約', decimals: 1, required: [round1(pi * radius * radius * heightCm / 1000)], scene: `cylinder:${scene.id}` }); // 上から下げた分を引き忘れる
}

const GENERATORS = { unit: unitProblem, speed: speedProblem, meeting: meetingProblem, catchup: catchupProblem, percentage: percentageProblem,
  inversePercentage: inversePercentageProblem, markup: markupProblem, discount: discountProblem, wholeFromPart: wholeFromPartProblem,
  yearOverYear: yearOverYearProblem, price: priceProblem, average: averageProblem, elapsed: elapsedProblem, geometry: geometryProblem,
  work: workProblem, speedTime: speedTimeProblem, wage: wageProblem, cylinder: cylinderProblem };

// forcedKind・forcedVariant: 種類と形を指定する(単体テストで全種類を確かめるため)。
// 指定がなければ、直前と違う種類を同じ確率で選ぶ(本番の形式は generateT1Round)
export function generateT1Problem(rng, p, previous = null, forcedKind = null, forcedVariant = null) {
  const kinds = PROBLEM_KINDS.filter(kind => kind !== previous?.kind);
  const kind = forcedKind ?? kinds[randInt(rng, 0, kinds.length - 1)];
  if (!GENERATORS[kind]) throw new RangeError(`不明な問題種類です: ${kind}`);
  return GENERATORS[kind](rng, p, forcedVariant);
}

// 1回分の問題(2026-09-30 本番の記憶で変更): 単位変換 → 割合 → 計算 の順に、各 questionsPerCategory 問(既定5問、計15問)。
// 分野の中の順番はランダム。単位変換は違う換算を、割合と計算は違う種類を出す(種類が足りなければ一巡してから繰り返す)
export function generateT1Round(rng, p) {
  const n = p.questionsPerCategory;
  const out = [];
  for (const category of T1_CATEGORIES) {
    const pool = category.id === 'unit' ? unitVariantsFor(p) : category.kinds;
    const order = [];
    while (order.length < n) order.push(...shuffle(rng, pool));
    for (const pick of order.slice(0, n)) {
      const problem = category.id === 'unit' ? GENERATORS.unit(rng, p, pick) : GENERATORS[pick](rng, p);
      out.push({ ...problem, category: category.id });
    }
  }
  return out;
}

// 開始前の画面に出す換算の一覧(2026-09-30 本番の記憶で追加)
const withCommas = value => formatNumber(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const T1_CONVERSIONS = Object.freeze(UNIT_PAIRS.map(pair => {
  const big = pair.big === 't' ? 't(メートルトン)' : pair.big;
  if (pair.ids[0] === 'kmh-to-mpm') return '時速1km = 分速 1,000/60 m(約16.67m)';
  if (pair.ids[0] === 'mps-to-kmh') return '秒速1m = 時速3.6km(時速1km = 秒速 1/3.6m)';
  return `1${big}${pair.big === 't' ? '' : ' '}= ${withCommas(pair.num / pair.den)}${pair.small}`;
}));

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
  if (problem.answerFormat === 'hm') {
    // ちょうどの時間は「◯時間」、0時間なら「◯分」(2026-09-30 追加の直し)
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    if (minutes === 0) return `${hours}時間`;
    return hours === 0 ? `${minutes}分` : `${hours}時間${minutes}分`;
  }
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
  // 2026-10-01 問題文を整数だけにした: 速さの時間は分、周回は m と分速
  speed: (v, variant) => {
    if (variant === 'distance') return [num(v.speed, 'km', '時速'), '×', num(v.minutes, '分'), '÷', num(60)];
    if (variant === 'time') return [num(v.distance, 'km'), '÷', num(v.speed, 'km', '時速')];
    return [num(v.distance, 'km'), '÷', num(v.minutes, '分'), '×', num(60)];
  },
  meeting: v => [num(v.length, 'm'), '÷', '(', num(v.a, 'm', '分速'), '+', num(v.b, 'm', '分速'), ')'],
  catchup: v => [num(v.length, 'm'), '÷', '(', num(v.a, 'm', '分速'), '−', num(v.b, 'm', '分速'), ')'],
  percentage: v => [num(v.base), '×', num(v.percent), '÷', num(100)],
  inversePercentage: v => [num(v.part), '÷', num(v.base), '×', num(100)],
  price: (v, variant, problem) => {
    if (variant === 'total') return [num(v.price, '円'), '×', num(v.count, '個')];
    if (variant === 'unit-price') return [num(v.total, '円'), '÷', num(v.count, '個')];
    if (variant === 'per-100g') return [num(v.total, problem.unit), '÷', num(v.grams, 'g'), '×', num(v.per)]; // 2026-09-30 からドル
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
  // 割合の新しい4種類(2026-09-30 本番の記憶で追加)
  markup: v => [num(v.cost, 'ドル'), '×', '(', num(1), '+', num(v.rate / 100), ')'],
  discount: (v, variant) => (variant === 'sale-price'
    ? [num(v.list, 'ドル'), '×', '(', num(1), '−', num(v.rate / 100), ')']
    : [num(v.sale, 'ドル'), '÷', '(', num(1), '−', num(v.rate / 100), ')']),
  wholeFromPart: (v, _variant, problem) => [num(v.part, problem.unit), '÷', num(v.rate / 100)],
  yearOverYear: (v, _variant, problem) => [num(v.now, problem.unit), '÷', '(', num(1), '+', num(v.rate / 100), ')'],
  cylinder: v => {
    const radius = v.diameter / 2;
    const cm = v.heightCm - v.gap;
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
  const tokens = template(problem.values, problem.variant, problem);
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
