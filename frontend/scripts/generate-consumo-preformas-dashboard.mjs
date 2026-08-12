import fs from 'node:fs';
import path from 'node:path';
import readXlsxFile from 'read-excel-file/node';

const excelPath = path.resolve('PREFORMAS SIN MOVIMIENTO.xlsx');
const outDir = path.resolve('dist');
const publicDir = path.resolve('public');
const today = new Date('2026-07-30T23:59:59-04:00');

const numberFmt = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const correctedLeonelFormat = 'BOT-CR-3000 CC-54.6 GR SF-LEONEL';

function normalizeFormat(value) {
  const format = String(value ?? '').trim();
  if (/BOT[-\s]*CR.*2000.*46\.66.*GR.*SF/i.test(format)) {
    return correctedLeonelFormat;
  }
  return format;
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

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

function formatDate(value) {
  return value.toISOString().slice(0, 10);
}

function summarize(rows) {
  const records = [];
  const byOp = new Map();
  const byFormat = new Map();
  const uniqueBoxes = new Set();

  for (const row of rows.slice(2)) {
    const date = toDate(row[1]);
    const format = normalizeFormat(row[3]);
    const aptas = toNumber(row[5]);
    const usadas = toNumber(row[6]);
    const op = String(row[9] ?? '').trim();
    const boxes = parseBoxes(row[11]);

    if (!date || date > today || !format || !op || aptas === null || usadas === null || usadas <= 0) continue;

    const desperdicio = Math.max(usadas - aptas, 0);
    records.push({ date, format, op, aptas, usadas, desperdicio, boxes });

    if (!byOp.has(op)) {
      byOp.set(op, { op, aptas: 0, usadas: 0, desperdicio: 0, boxes: new Set() });
    }
    const opSummary = byOp.get(op);
    opSummary.aptas += aptas;
    opSummary.usadas += usadas;
    opSummary.desperdicio += desperdicio;
    for (const box of boxes) {
      opSummary.boxes.add(box);
      uniqueBoxes.add(`${op}::${box}`);
    }

    if (!byFormat.has(format)) {
      byFormat.set(format, { format, aptas: 0, usadas: 0, desperdicio: 0 });
    }
    const formatSummary = byFormat.get(format);
    formatSummary.aptas += aptas;
    formatSummary.usadas += usadas;
    formatSummary.desperdicio += desperdicio;
  }

  const opRows = [...byOp.values()].map((row) => ({
    op: row.op,
    aptas: row.aptas,
    usadas: row.usadas,
    desperdicio: row.desperdicio,
    mermaPct: row.usadas ? (row.desperdicio / row.usadas) * 100 : 0,
    cajas: row.boxes.size
  }));

  const formatRows = [...byFormat.values()].map((row) => ({
    format: row.format,
    aptas: row.aptas,
    usadas: row.usadas,
    desperdicio: row.desperdicio,
    mermaPct: row.usadas ? (row.desperdicio / row.usadas) * 100 : 0
  }));

  const totals = records.reduce(
    (acc, row) => {
      acc.aptas += row.aptas;
      acc.usadas += row.usadas;
      acc.desperdicio += row.desperdicio;
      return acc;
    },
    { aptas: 0, usadas: 0, desperdicio: 0, cajas: uniqueBoxes.size }
  );
  totals.mermaPct = totals.usadas ? (totals.desperdicio / totals.usadas) * 100 : 0;

  return {
    records,
    opRows,
    formatRows,
    totals,
    minDate: records.reduce((min, r) => (!min || r.date < min ? r.date : min), null),
    maxDate: records.reduce((max, r) => (!max || r.date > max ? r.date : max), null)
  };
}

function drawOpWasteRows(rows) {
  const sorted = [...rows].sort((a, b) => b.mermaPct - a.mermaPct);
  const maxPct = Math.max(1, ...sorted.map((row) => row.mermaPct));
  const colors = ['#2457a6', '#0f766e', '#f97316', '#7c3aed'];

  return sorted
    .map((row, index) => {
      const y = 450 + index * 48;
      const width = (row.mermaPct / maxPct) * 330;
      return `
        <text x="664" y="${y}" class="ink" font-size="20" font-weight="800">${escapeXml(row.op)}</text>
        <rect x="820" y="${y - 24}" width="330" height="27" rx="5" class="bar-bg"/>
        <rect x="820" y="${y - 24}" width="${width.toFixed(1)}" height="27" rx="5" fill="${colors[index % colors.length]}"/>
        <text x="1170" y="${y}" class="ink" font-size="20" font-weight="800">${pctFmt.format(row.mermaPct)}%</text>
        <text x="664" y="${y + 23}" class="small" font-size="15">${numberFmt.format(row.desperdicio)} und. | ${numberFmt.format(row.cajas)} cajas unicas</text>`;
    })
    .join('\n');
}

function drawBoxRows(rows) {
  const sorted = [...rows].sort((a, b) => b.cajas - a.cajas);
  const maxBoxes = Math.max(1, ...sorted.map((row) => row.cajas));
  const colors = ['#2457a6', '#0f766e', '#f97316', '#7c3aed'];

  return sorted
    .map((row, index) => {
      const y = 440 + index * 45;
      const width = (row.cajas / maxBoxes) * 300;
      return `
        <text x="1300" y="${y}" class="ink" font-size="21" font-weight="800">${escapeXml(row.op)}</text>
        <rect x="1455" y="${y - 25}" width="300" height="28" rx="5" class="bar-bg"/>
        <rect x="1455" y="${y - 25}" width="${width.toFixed(1)}" height="28" rx="5" fill="${colors[index % colors.length]}"/>
        <text x="1776" y="${y}" class="ink" font-size="21" font-weight="800">${numberFmt.format(row.cajas)}</text>`;
    })
    .join('\n');
}

function drawFormatRows(rows) {
  const filtered = rows
    .sort((a, b) => b.mermaPct - a.mermaPct)
    .slice(0, 5);
  const maxPct = Math.max(1, ...filtered.map((row) => row.mermaPct));
  const colors = ['#2457a6', '#0f766e', '#f97316', '#7c3aed', '#475569'];

  return filtered
    .map((row, index) => {
      const y = 790 + index * 42;
      const width = (row.mermaPct / maxPct) * 700;
      return `
        <text x="96" y="${y}" class="ink" font-size="19" font-weight="800">${escapeXml(row.format)}</text>
        <rect x="610" y="${y - 24}" width="700" height="28" rx="5" class="bar-bg"/>
        <rect x="610" y="${y - 24}" width="${width.toFixed(1)}" height="28" rx="5" fill="${colors[index % colors.length]}"/>
        <text x="1330" y="${y}" class="ink" font-size="20" font-weight="800">${pctFmt.format(row.mermaPct)}%</text>
        <text x="1445" y="${y}" class="small">${numberFmt.format(row.desperdicio)} und.</text>`;
    })
    .join('\n');
}

function buildSvg(data) {
  const opWasteRows = drawOpWasteRows(data.opRows);
  const boxRows = drawBoxRows(data.opRows);
  const formatRows = drawFormatRows(data.formatRows);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <style>
      .bg { fill: #f4f7fb; }
      .ink { fill: #152238; font-family: Arial, Helvetica, sans-serif; }
      .muted { fill: #667085; font-family: Arial, Helvetica, sans-serif; }
      .card { fill: #ffffff; stroke: #d9e2ec; stroke-width: 1.5; }
      .panel-title { fill: #152238; font-family: Arial, Helvetica, sans-serif; font-size: 28px; font-weight: 800; }
      .kpi-label { fill: #667085; font-family: Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; }
      .kpi-value { fill: #152238; font-family: Arial, Helvetica, sans-serif; font-size: 44px; font-weight: 800; }
      .kpi-note { fill: #667085; font-family: Arial, Helvetica, sans-serif; font-size: 18px; }
      .small { fill: #667085; font-family: Arial, Helvetica, sans-serif; font-size: 17px; }
      .axis { stroke: #d9e2ec; stroke-width: 2; }
      .bar-bg { fill: #edf2f7; }
      .white { fill: #ffffff; font-family: Arial, Helvetica, sans-serif; }
    </style>
  </defs>

  <rect class="bg" width="1920" height="1080"/>
  <rect x="0" y="0" width="1920" height="118" fill="#152238"/>
  <text x="64" y="58" class="white" font-size="38" font-weight="800">Consumo de preformas observadas</text>
  <text x="64" y="92" class="white" font-size="20" opacity=".78">Vista del proceso | Periodo: ${formatDate(data.minDate)} al ${formatDate(data.maxDate)}</text>
  <rect x="1494" y="30" width="362" height="58" rx="6" fill="#ffffff" opacity=".12"/>
  <text x="1520" y="66" class="white" font-size="22" font-weight="700">Preformas observadas en consumo</text>

  <rect class="card" x="64" y="150" width="338" height="144" rx="8"/>
  <text class="kpi-label" x="88" y="193">Cajas unicas</text>
  <text class="kpi-value" x="88" y="250">${numberFmt.format(data.totals.cajas)}</text>
  <text class="kpi-note" x="88" y="278">cajas</text>

  <rect class="card" x="426" y="150" width="338" height="144" rx="8"/>
  <text class="kpi-label" x="450" y="193">Preformas usadas</text>
  <text class="kpi-value" x="450" y="250">${numberFmt.format(data.totals.usadas)}</text>

  <rect class="card" x="788" y="150" width="338" height="144" rx="8"/>
  <text class="kpi-label" x="812" y="193">Botellas aptas</text>
  <text class="kpi-value" x="812" y="250">${numberFmt.format(data.totals.aptas)}</text>

  <rect class="card" x="1150" y="150" width="338" height="144" rx="8"/>
  <text class="kpi-label" x="1174" y="193">Desperdicio total</text>
  <text class="kpi-value" x="1174" y="250">${numberFmt.format(data.totals.desperdicio)}</text>

  <rect class="card" x="1512" y="150" width="344" height="144" rx="8"/>
  <text class="kpi-label" x="1536" y="193">Desperdicio general</text>
  <text x="1536" y="250" class="ink" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="800">${pctFmt.format(data.totals.mermaPct)}%</text>

  <rect class="card" x="64" y="326" width="520" height="300" rx="8"/>
  <text class="panel-title" x="96" y="372">Vista general</text>
  <text class="muted" x="96" y="406" font-size="20">Resultado del consumo de preformas observadas.</text>
  <circle cx="242" cy="510" r="82" fill="#eef4ff" stroke="#bfdbfe" stroke-width="18"/>
  <path d="M242 428 A82 82 0 1 1 176 558" stroke="#2457a6" stroke-width="7" stroke-linecap="round" fill="none"/>
  <text x="242" y="504" text-anchor="middle" class="ink" font-size="44" font-weight="800">${pctFmt.format(data.totals.mermaPct)}%</text>
  <text x="242" y="536" text-anchor="middle" class="muted" font-size="18">desperdicio</text>
  <line x1="96" y1="592" x2="552" y2="592" class="axis"/>
  <text x="96" y="622" class="muted" font-size="19">Perdida registrada en el uso de material observado.</text>

  <rect class="card" x="616" y="326" width="620" height="360" rx="8"/>
  <text class="panel-title" x="648" y="372">Desperdicio por OP de caja</text>
  <text class="muted" x="648" y="406" font-size="20">Merma calculada por cada OP consumida.</text>
  ${opWasteRows}

  <rect class="card" x="1268" y="326" width="588" height="360" rx="8"/>
  <text class="panel-title" x="1300" y="372">Cajas unicas por OP</text>
  <text class="muted" x="1300" y="406" font-size="20">Conteo sin duplicar dentro de la misma OP.</text>
  ${boxRows}

  <rect class="card" x="64" y="690" width="1792" height="300" rx="8"/>
  <text class="panel-title" x="96" y="736">Desperdicio por formato</text>
  <text class="muted" x="96" y="766" font-size="20">Formatos con mayor porcentaje de desperdicio.</text>
  ${formatRows}

  <text x="64" y="1034" class="muted" font-size="18">Fuente: PREFORMAS SIN MOVIMIENTO.xlsx | Cajas contadas por OP + N CAJA, separando valores por coma y sin duplicar en la misma OP.</text>
</svg>`;
}

const workbookRows = await readXlsxFile(excelPath);
const rows = workbookRows.find((sheet) => sheet.sheet === 'Consumo actual ')?.data;
if (!rows) throw new Error('No se encontro la hoja "Consumo actual ".');

const data = summarize(rows);
const svg = buildSvg(data);

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'consumo-preformas-observadas.svg'), svg, 'utf8');
fs.writeFileSync(path.join(publicDir, 'consumo-preformas-observadas.svg'), svg, 'utf8');

console.log(JSON.stringify({
  cajas: data.totals.cajas,
  usadas: data.totals.usadas,
  aptas: data.totals.aptas,
  desperdicio: data.totals.desperdicio,
  mermaPct: data.totals.mermaPct,
  ops: data.opRows.map((row) => ({ op: row.op, cajas: row.cajas })),
  formatos: data.formatRows
    .sort((a, b) => b.mermaPct - a.mermaPct)
    .slice(0, 5)
    .map((row) => ({ format: row.format, mermaPct: row.mermaPct }))
}, null, 2));
