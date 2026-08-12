import fs from 'node:fs';
import path from 'node:path';
import readXlsxFile from 'read-excel-file/node';
import { chromium } from 'playwright';

const excelPath = path.resolve('PREFORMAS SIN MOVIMIENTO.xlsx');
const outDir = path.resolve('dist');
const targetOp = process.argv[2] ?? '071I-2023';
const fileSlug = targetOp.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const svgPath = path.join(outDir, `resumen-op-${fileSlug}.svg`);
const pngPath = path.join(outDir, `resumen-op-${fileSlug}.png`);
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const numberFmt = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toDateKey(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return '';
}

function normalizeOp(value) {
  const op = String(value ?? '').trim().toUpperCase();
  return op === '016E-2026' ? '016E-2025' : op;
}

function normalizeBox(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? String(Math.trunc(numeric)) : trimmed.toUpperCase();
}

function parseBoxes(value) {
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return [String(value)];
    return String(value).split('.').map(normalizeBox).filter(Boolean);
  }
  return String(value).split(/[,\n;]/).map(normalizeBox).filter(Boolean);
}

function summarizeOp(rows) {
  const seenBoxes = new Set();
  const rowsByDate = new Map();
  const duplicates = [];
  let aptas = 0;
  let usadas = 0;
  let desperdicio = 0;
  let rowCount = 0;
  let readBoxCount = 0;

  for (const row of rows.slice(2)) {
    const op = normalizeOp(row[9]);
    if (op !== targetOp.toUpperCase()) continue;

    const date = toDateKey(row[1]);
    const aptasRow = toNumber(row[5]);
    const usadasRow = toNumber(row[6]);
    const desperdicioRow = toNumber(row[7]) || Math.max(usadasRow - aptasRow, 0);
    const boxes = parseBoxes(row[11]);
    const newBoxes = [];
    const duplicateBoxes = [];

    for (const box of boxes) {
      readBoxCount += 1;
      if (seenBoxes.has(box)) {
        duplicateBoxes.push(box);
      } else {
        seenBoxes.add(box);
        newBoxes.push(box);
      }
    }

    if (duplicateBoxes.length) {
      duplicates.push({
        date,
        raw: String(row[11] ?? ''),
        boxes: duplicateBoxes,
      });
    }

    rowCount += 1;
    aptas += aptasRow;
    usadas += usadasRow;
    desperdicio += desperdicioRow;

    if (!rowsByDate.has(date)) {
      rowsByDate.set(date, { date, rows: 0, aptas: 0, usadas: 0, desperdicio: 0, boxes: [] });
    }
    const day = rowsByDate.get(date);
    day.rows += 1;
    day.aptas += aptasRow;
    day.usadas += usadasRow;
    day.desperdicio += desperdicioRow;
    day.boxes.push(...newBoxes);
  }

  const dates = [...rowsByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const uniqueBoxes = [...seenBoxes].sort((a, b) => Number(a) - Number(b));

  return {
    targetOp,
    rowCount,
    dateCount: dates.length,
    aptas,
    usadas,
    desperdicio,
    mermaPct: usadas ? (desperdicio / usadas) * 100 : 0,
    readBoxCount,
    duplicateCount: duplicates.reduce((sum, item) => sum + item.boxes.length, 0),
    uniqueBoxes,
    dates,
    duplicates,
  };
}

function makeCard(x, title, value, suffix = '') {
  return `
    <rect class="card" x="${x}" y="120" width="250" height="88" rx="10"/>
    <text class="card-label" x="${x + 22}" y="150">${escapeXml(title)}</text>
    <text class="card-value" x="${x + 22}" y="190">${escapeXml(value)}${suffix ? `<tspan class="suffix"> ${escapeXml(suffix)}</tspan>` : ''}</text>`;
}

function makeSvg(data) {
  const width = 1600;
  const height = 1100;
  const maxBoxes = Math.max(1, ...data.dates.map((day) => day.boxes.length));
  const bars = data.dates.map((day, index) => {
    const x = 106 + index * 100;
    const barH = (day.boxes.length / maxBoxes) * 165;
    return `
      <rect x="${x}" y="${535 - barH}" width="48" height="${barH}" rx="6" fill="#2563eb"/>
      <text class="bar-value" x="${x + 24}" y="${523 - barH}">${day.boxes.length}</text>
      <text class="axis-label" x="${x + 24}" y="570" transform="rotate(-35 ${x + 24} 570)">${day.date.slice(5).replace('-', '/')}</text>`;
  }).join('\n');

  const detailRows = data.dates.map((day, index) => {
    const x = index < 6 ? 88 : 828;
    const y = 690 + (index % 6) * 34;
    const boxes = day.boxes.join(', ');
    return `<text class="detail" x="${x}" y="${y}">${day.date}: ${day.boxes.length} cajas (${escapeXml(boxes)})</text>`;
  }).join('\n');

  const duplicateRows = data.duplicates.length
    ? data.duplicates.slice(0, 5).map((item, index) => (
      `<text class="detail" x="110" y="${988 + index * 28}">${item.date}: ${escapeXml(item.raw)} | repetida(s): ${escapeXml(item.boxes.join(', '))}</text>`
    )).join('\n')
    : '<text class="detail" x="110" y="988">Sin cajas repetidas dentro de esta OP.</text>';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <style>
      .bg { fill: #f5f7fb; }
      .panel { fill: #ffffff; stroke: #d9e2ec; stroke-width: 1.4; }
      .card { fill: #ffffff; stroke: #d9e2ec; stroke-width: 1.4; }
      .title { fill: #152238; font-family: Arial, Helvetica, sans-serif; font-size: 42px; font-weight: 800; }
      .subtitle { fill: #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 19px; }
      .section { fill: #152238; font-family: Arial, Helvetica, sans-serif; font-size: 24px; font-weight: 800; }
      .card-label { fill: #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 800; letter-spacing: .3px; }
      .card-value { fill: #152238; font-family: Arial, Helvetica, sans-serif; font-size: 34px; font-weight: 800; }
      .suffix { fill: #64748b; font-size: 16px; font-weight: 700; }
      .muted { fill: #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 16px; }
      .metric { fill: #152238; font-family: Arial, Helvetica, sans-serif; font-size: 22px; font-weight: 800; }
      .detail { fill: #334155; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: 700; }
      .bar-value { fill: #152238; font-family: Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 800; text-anchor: middle; }
      .axis-label { fill: #475569; font-family: Arial, Helvetica, sans-serif; font-size: 13px; font-weight: 800; text-anchor: end; }
      .grid { stroke: #dbe3ee; stroke-width: 1.2; }
    </style>
  </defs>
  <rect class="bg" width="${width}" height="${height}"/>
  <text class="title" x="70" y="70">Resumen por OP ${escapeXml(data.targetOp)}</text>
  <text class="subtitle" x="70" y="102">Validacion de conteo unico por OP + N CAJA | Fuente: PREFORMAS SIN MOVIMIENTO.xlsx</text>

  ${makeCard(70, 'CAJAS LEIDAS', numberFmt.format(data.readBoxCount))}
  ${makeCard(345, 'DUPLICADAS', numberFmt.format(data.duplicateCount))}
  ${makeCard(620, 'CAJAS UNICAS', numberFmt.format(data.uniqueBoxes.length))}
  ${makeCard(895, 'MERMA', pctFmt.format(data.mermaPct), '%')}
  ${makeCard(1170, 'FILAS / FECHAS', `${data.rowCount} / ${data.dateCount}`)}

  <rect class="panel" x="70" y="240" width="1460" height="360" rx="12"/>
  <text class="section" x="96" y="282">Cajas nuevas contadas por fecha</text>
  <text class="muted" x="96" y="310">Cada barra suma solo cajas no vistas antes dentro de la OP ${escapeXml(data.targetOp)}.</text>
  <line class="grid" x1="96" y1="535" x2="1490" y2="535"/>
  ${bars}

  <rect class="panel" x="70" y="630" width="1460" height="270" rx="12"/>
  <text class="section" x="96" y="666">Detalle de cajas por fecha</text>
  ${detailRows}

  <rect class="panel" x="70" y="924" width="1460" height="160" rx="12"/>
  <text class="section" x="96" y="950">Cajas repetidas no contadas doble</text>
  ${duplicateRows}
</svg>`;
}

async function exportPng() {
  const browser = await chromium.launch({ executablePath: chromePath });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2 });
  const svg = fs.readFileSync(svgPath, 'utf8');
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">${svg}</body></html>`);
  await page.screenshot({ path: pngPath, fullPage: false });
  await browser.close();
}

const workbook = await readXlsxFile(excelPath);
const rows = workbook.find((sheet) => sheet.sheet.trim().toLowerCase() === 'consumo actual')?.data ?? [];
const data = summarizeOp(rows);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(svgPath, makeSvg(data), 'utf8');
await exportPng();

console.log(JSON.stringify({
  op: data.targetOp,
  cajasLeidas: data.readBoxCount,
  duplicadas: data.duplicateCount,
  cajasUnicas: data.uniqueBoxes.length,
  aptas: data.aptas,
  usadas: data.usadas,
  desperdicio: data.desperdicio,
  mermaPct: data.mermaPct,
  png: pngPath,
  svg: svgPath,
}, null, 2));
