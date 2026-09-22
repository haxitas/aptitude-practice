function niceStep(value) {
  if (!(Number.isFinite(value) && value > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const scaled = value / power;
  const factor = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return Math.max(1, factor * power);
}

export function makeScoreTicks(scores, preferredCount) {
  const finite = scores.filter(Number.isFinite);
  const highest = finite.length ? Math.max(0, ...finite) : 0;
  const divisions = Math.max(1, Math.floor(preferredCount) - 1);
  const step = niceStep(highest / divisions);
  const max = highest === 0 ? step : Math.ceil(highest / step) * step;
  const values = [];
  for (let value = 0; value <= max + step / 2; value += step) values.push(value);
  return { min: 0, max, step, values };
}

function timeOf(record) {
  const value = new Date(record?.date).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function makeChartLayout(records, width, height, options) {
  const ordered = [...records].sort((a, b) => timeOf(a) - timeOf(b));
  const ticks = makeScoreTicks(ordered.map(record => record.score), options.preferredTickCount);
  const xMin = options.left;
  const xMax = width - options.right;
  const yMin = options.top;
  const yMax = height - options.bottom;
  const usableWidth = Math.max(0, xMax - xMin);
  const usableHeight = Math.max(0, yMax - yMin);
  const points = ordered.map((record, index) => {
    const x = ordered.length === 1
      ? xMin + usableWidth / 2
      : xMin + (usableWidth * index) / (ordered.length - 1);
    const score = Number.isFinite(record.score) ? Math.max(0, record.score) : 0;
    const y = yMax - (score / ticks.max) * usableHeight;
    return { record, x, y };
  });
  return { points, ticks: ticks.values, yMin, yMax, xMin, xMax, yScoreMax: ticks.max, yMaxScore: ticks.max };
}

function sameSetting(actual, expected) {
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && actual.length === expected.length
      && expected.every((value, index) => sameSetting(actual[index], value));
  }
  return Object.is(actual, expected);
}

export function recordUsesCustomSettings(recordSettings, defaults) {
  if (!recordSettings || typeof recordSettings !== 'object') return true;
  return Object.entries(defaults).some(([key, value]) => !(key in recordSettings) || !sameSetting(recordSettings[key], value));
}

export function makeHistoryModel(records, testId, defaults, limit) {
  const tableRecords = records
    .filter(record => record?.test === testId)
    .sort((a, b) => timeOf(b) - timeOf(a))
    .slice(0, limit)
    .map(record => ({ ...record, customSettings: recordUsesCustomSettings(record.settings, defaults) }));
  return { tableRecords, chartRecords: [...tableRecords].reverse() };
}
