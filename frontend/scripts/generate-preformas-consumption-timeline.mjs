import fs from 'node:fs';
import path from 'node:path';
import readXlsxFile from 'read-excel-file/node';

const excelPath = path.resolve('PREFORMAS SIN MOVIMIENTO.xlsx');
const outDir = path.resolve('dist');
const targetBoxes = 129;
const pendingByOp = [
  { op: '071I-2023', boxes: 1 },
  { op: '063TH-2025', boxes: 8 }
];
const todayKey = '2026-07-30';
const today = new Date('2026-07-30T23:59:59-04:00');

const numberFmt = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseBoxes(value) {
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return [String(value)];
    return String(value)
      .split('.')
      .map((token) => normalizeBoxToken(token))
      .filter(Boolean);
  }
  return String(value)
    .split(/[,\n;]/)
    .map((token) => normalizeBoxToken(token))
    .filter(Boolean);
}

function normalizeBoxToken(token) {
  const trimmed = String(token ?? '').trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return String(Math.trunc(numeric));
  return trimmed.toUpperCase();
}

function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function shortDate(dateKey) {
  const [year, month, day] = dateKey.split('-');
  return `${day}/${month}`;
}

function linePath(points) {
  return points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
}

function buildSeries(rows) {
  const byDate = new Map();
  const seen = new Set();

  for (const row of rows.slice(2)) {
    const date = toDate(row[1]);
    const op = String(row[9] ?? '').trim();
    if (!date || date > today || !op) continue;

    const dateKey = formatDate(date);
    for (const box of parseBoxes(row[11])) {
      const key = `${op}::${box}`;
      if (seen.has(key)) continue;
      seen.add(key);
      byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + 1);
    }
  }

  const sortedDates = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  const detectedBoxes = sortedDates.reduce((sum, [, count]) => sum + count, 0);
  let accumulated = 0;
  const series = sortedDates.map(([date, count]) => {
      accumulated += count;
      return {
        date,
        count,
        accumulated,
        remaining: Math.max(targetBoxes - accumulated, 0),
        progress: targetBoxes ? (accumulated / targetBoxes) * 100 : 0
      };
    });

  const last = series.at(-1);
  if (last && last.date < todayKey) {
    series.push({
      date: todayKey,
      count: 0,
      accumulated,
      remaining: Math.max(targetBoxes - accumulated, 0),
      progress: targetBoxes ? (accumulated / targetBoxes) * 100 : 0
    });
  }

  return {
    series,
    targetBoxes,
    detectedBoxes,
    consumed: accumulated,
    remaining: Math.max(targetBoxes - accumulated, 0),
    progress: targetBoxes ? (accumulated / targetBoxes) * 100 : 0
  };
}

function buildSvg(data) {
  const width = 1600;
  const height = 900;
  const chart = { x: 110, y: 230, w: 1360, h: 420 };
  const maxY = Math.ceil((Math.max(data.targetBoxes, data.consumed, 1) + 10) / 10) * 10;
  const xStep = chart.w / Math.max(data.series.length - 1, 1);
  const yPos = (value) => chart.y + chart.h - (value / maxY) * chart.h;

  const points = data.series.map((row, index) => ({
    x: chart.x + index * xStep,
    y: yPos(row.accumulated),
    ...row
  }));
  const remainingPoints = data.series.map((row, index) => ({
    x: chart.x + index * xStep,
    y: yPos(row.remaining),
    ...row
  }));

  const gridTicks = [...new Set([0, 20, 40, 60, 80, 100, 120, data.targetBoxes, maxY])].filter((tick) => tick <= maxY).sort((a, b) => a - b);
  const grid = gridTicks.map((tick) => {
    const y = yPos(tick);
    return `<line class="grid" x1="${chart.x}" y1="${y}" x2="${chart.x + chart.w}" y2="${y}"/>
      <text class="tick right" x="${chart.x - 18}" y="${y + 5}">${tick}</text>`;
  }).join('\n');

  const dateLabels = data.series
    .filter((_, index) => index % 5 === 0 || index === data.series.length - 1)
    .map((row, index, filtered) => {
      const originalIndex = data.series.findIndex((item) => item.date === row.date);
      const x = chart.x + originalIndex * xStep;
      return `<text class="tick center" x="${x}" y="${chart.y + chart.h + 36}">${shortDate(row.date)}</text>`;
    })
    .join('\n');

  const markers = points
    .filter((_, index) => index % 5 === 0 || index === points.length - 1)
    .map((point) => `
      <circle cx="${point.x}" cy="${point.y}" r="5" fill="#ffffff" stroke="#2563eb" stroke-width="4"/>
      <text class="tiny center" x="${point.x}" y="${point.y - 13}">${point.accumulated}</text>`)
    .join('\n');

  const dailyBars = points.map((point) => {
    const barH = (point.count / 12) * 92;
    return `<rect x="${point.x - 5}" y="${chart.y + chart.h + 96 - barH}" width="10" height="${barH}" rx="3" fill="#93c5fd"/>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <style>
      .bg { fill: #f5f7fb; }
      .card { fill: #ffffff; stroke: #d9e2ec; stroke-width: 1.5; }
      .title { fill: #152238; font-family: Arial, Helvetica, sans-serif; font-size: 38px; font-weight: 800; }
      .subtitle { fill: #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 18px; }
      .label { fill: #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 800; letter-spacing: .4px; }
      .value { fill: #152238; font-family: Arial, Helvetica, sans-serif; font-size: 36px; font-weight: 800; }
      .note { fill: #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 15px; }
      .grid { stroke: #dbe3ee; stroke-width: 1.4; }
      .tick { fill: #475569; font-family: Arial, Helvetica, sans-serif; font-size: 13px; font-weight: 700; }
      .tiny { fill: #152238; font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 800; }
      .center { text-anchor: middle; }
      .right { text-anchor: end; }
    </style>
  </defs>
  <rect class="bg" width="${width}" height="${height}"/>
  <text class="title" x="70" y="62">Avance de consumo de preformas observadas</text>
  <text class="subtitle" x="70" y="92">Consumo acumulado por fecha | Objetivo: ${numberFmt.format(data.targetBoxes)} cajas | Corte: ${shortDate(todayKey)}/2026</text>

  <rect class="card" x="70" y="120" width="300" height="86" rx="10"/>
  <text class="label" x="92" y="148">TOTAL OBJETIVO</text>
  <text class="value" x="92" y="186">${numberFmt.format(data.targetBoxes)}</text>

  <rect class="card" x="395" y="120" width="300" height="86" rx="10"/>
  <text class="label" x="417" y="148">CONSUMIDAS</text>
  <text class="value" x="417" y="186">${numberFmt.format(data.consumed)}</text>

  <rect class="card" x="720" y="120" width="300" height="86" rx="10"/>
  <text class="label" x="742" y="148">PENDIENTES</text>
  <text class="value" x="742" y="186">${numberFmt.format(data.remaining)}</text>

  <rect class="card" x="1045" y="120" width="360" height="86" rx="10"/>
  <text class="label" x="1067" y="148">CUMPLIMIENTO</text>
  <text class="value" x="1067" y="186">${pctFmt.format(data.progress)}%</text>

  <rect class="card" x="70" y="218" width="1460" height="594" rx="12"/>
  <text class="note" x="${chart.x}" y="${chart.y - 18}">Cajas acumuladas consumidas</text>
  ${grid}
  <path d="M${chart.x},${yPos(0)} L${linePath(points).slice(1)} L${chart.x + chart.w},${yPos(0)} Z" fill="#dbeafe" opacity="0.58"/>
  <path d="${linePath(points)}" fill="none" stroke="#2563eb" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="${linePath(remainingPoints)}" fill="none" stroke="#f97316" stroke-width="4" stroke-dasharray="9 8" stroke-linejoin="round" stroke-linecap="round"/>
  ${markers}
  ${dateLabels}
  <line x1="${chart.x}" y1="${chart.y + chart.h}" x2="${chart.x + chart.w}" y2="${chart.y + chart.h}" stroke="#94a3b8" stroke-width="1.5"/>
  <text class="note" x="${chart.x}" y="${chart.y + chart.h + 76}">Cajas nuevas consumidas por fecha</text>
  ${dailyBars}

  <rect x="900" y="222" width="570" height="44" rx="9" fill="#f8fafc" stroke="#e2e8f0"/>
  <line x1="924" y1="244" x2="976" y2="244" stroke="#2563eb" stroke-width="6" stroke-linecap="round"/>
  <text class="note" x="990" y="249">Consumidas acumuladas</text>
  <line x1="1248" y1="244" x2="1300" y2="244" stroke="#f97316" stroke-width="4" stroke-dasharray="9 8" stroke-linecap="round"/>
  <text class="note" x="1314" y="249">Saldo por consumir</text>

  <text class="note" x="70" y="842">Pendiente: 9 cajas (${pendingByOp.map((item) => `${item.op}: ${item.boxes}`).join(' | ')}).</text>
  <text class="note" x="70" y="868">Regla: si una celda tiene varios numeros separados por coma, cada numero cuenta como caja; si se repite dentro de la misma OP, no se duplica.</text>
</svg>`;
}

const workbookRows = await readXlsxFile(excelPath);
const rows = workbookRows.find((sheet) => sheet.sheet === 'Consumo actual ')?.data;
if (!rows) throw new Error('No se encontro la hoja "Consumo actual ".');

const data = buildSeries(rows);
const svg = buildSvg(data);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'avance-consumo-preformas.svg'), svg, 'utf8');
console.log(JSON.stringify({
  objetivo: data.targetBoxes,
  detectadas: data.detectedBoxes,
  consumidas: data.consumed,
  pendientes: data.remaining,
  cumplimiento: data.progress,
  fechas: data.series.length,
  desde: data.series[0]?.date,
  hasta: data.series.at(-1)?.date
}, null, 2));
