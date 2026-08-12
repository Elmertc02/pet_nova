import fs from 'node:fs';
import path from 'node:path';
import readXlsxFile from 'read-excel-file/node';

const excelPath = path.resolve('PREFORMAS SIN MOVIMIENTO.xlsx');
const outputPath = path.resolve('src', 'preformasDashboardData.js');
const OBSERVED_TARGET_BOXES = 129;
const OBSERVED_PENDING_BY_OP = [
  { opCaja: '071I-2023', boxes: 1 },
  { opCaja: '063TH-2025', boxes: 8 },
];
const workbook = await readXlsxFile(excelPath);

const consumptionRows = workbook.find((sheet) => sheet.sheet.trim().toLowerCase() === 'consumo actual')?.data ?? [];
const inventoryRows = workbook.find((sheet) => sheet.sheet === 'Hoja3')?.data ?? [];

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toDateKey(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return '';
}

function parseBoxes(value) {
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return [String(value)];
    return String(value).split('.').map(normalizeBox).filter(Boolean);
  }
  return String(value).split(/[,\n;]/).map(normalizeBox).filter(Boolean);
}

function normalizeBox(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? String(Math.trunc(numeric)) : trimmed.toUpperCase();
}

function normalizeOp(value) {
  const op = String(value ?? '').trim().toUpperCase();
  return op === '016E-2026' ? '016E-2025' : op;
}

function fixTextEncoding(value) {
  const text = String(value ?? '').trim();
  if (!text.includes('Ã')) return text;
  return Buffer.from(text, 'latin1').toString('utf8');
}

function normalizeFormat(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/BOT[-\s]*CR.*2000.*46\.66.*GR.*SF\s*-\s*LEONEL/i, 'BOT-CR-3000 CC-54.6 GR SF-LEONEL');
}

const records = consumptionRows.slice(2).map((row) => {
  const date = toDateKey(row[1]);
  const opCaja = normalizeOp(row[9]);
  const aptas = toNumber(row[5]);
  const usadas = toNumber(row[6]);
  const desperdicio = toNumber(row[7]) || Math.max(usadas - aptas, 0);
  const boxes = parseBoxes(row[11]);

  return {
    date,
    operator: String(row[2] ?? '').trim(),
    format: normalizeFormat(row[3]),
    order: String(row[4] ?? '').trim(),
    aptas,
    usadas,
    desperdicio,
    saldo: toNumber(row[8]),
    opCaja,
    resin: String(row[10] ?? '').trim(),
    boxes,
    from: toNumber(row[12]),
    to: toNumber(row[13]),
    bags: toNumber(row[14]),
  };
}).filter((record) => record.date && record.opCaja && record.usadas > 0);

const observedInventory = inventoryRows.slice(1)
  .map((row) => ({
    opCaja: normalizeOp(row[1]),
    initialBoxes: toNumber(row[2]),
    excelConsumedBoxes: toNumber(row[3]),
    mayBoxes: toNumber(row[4]),
    juneBoxes: toNumber(row[5]),
    risk: fixTextEncoding(row[6]),
    note: fixTextEncoding(row[7]),
  }))
  .filter((row) => /\d/.test(row.opCaja) && row.opCaja.includes('-') && row.initialBoxes > 0);

const boxesByOp = new Map();
const wasteByOp = new Map();
const boxesByDate = new Map();
const wasteByFormat = new Map();
const allBoxes = new Set();

for (const record of records) {
  if (!wasteByOp.has(record.opCaja)) {
    wasteByOp.set(record.opCaja, { opCaja: record.opCaja, aptas: 0, usadas: 0, desperdicio: 0, records: 0 });
  }
  const waste = wasteByOp.get(record.opCaja);
  waste.aptas += record.aptas;
  waste.usadas += record.usadas;
  waste.desperdicio += record.desperdicio;
  waste.records += 1;

  if (!boxesByOp.has(record.opCaja)) boxesByOp.set(record.opCaja, new Set());
  const opBoxes = boxesByOp.get(record.opCaja);
  for (const box of record.boxes) {
    const key = `${record.opCaja}::${box}`;
    const isNewBox = !allBoxes.has(key);
    opBoxes.add(box);
    allBoxes.add(key);
    if (isNewBox) {
      boxesByDate.set(record.date, (boxesByDate.get(record.date) ?? 0) + 1);
    }
  }

  if (record.format) {
    if (!wasteByFormat.has(record.format)) {
      wasteByFormat.set(record.format, { format: record.format, usadas: 0, desperdicio: 0 });
    }
    const formatWaste = wasteByFormat.get(record.format);
    formatWaste.usadas += record.usadas;
    formatWaste.desperdicio += record.desperdicio;
  }
}

const observedInventoryWithConsumption = observedInventory.map((item) => {
  const consumedBoxes = boxesByOp.get(item.opCaja)?.size ?? item.excelConsumedBoxes;
  return {
    ...item,
    consumedBoxes,
    remainingBoxes: Math.max(item.initialBoxes - consumedBoxes, 0),
    progress: item.initialBoxes ? (consumedBoxes / item.initialBoxes) * 100 : 0,
  };
});

const inventorySummary = {
  initialBoxes: OBSERVED_TARGET_BOXES,
  consumedBoxes: allBoxes.size,
  remainingBoxes: Math.max(OBSERVED_TARGET_BOXES - allBoxes.size, 0),
  pendingByOp: OBSERVED_PENDING_BY_OP,
};
inventorySummary.progress = inventorySummary.initialBoxes ? (inventorySummary.consumedBoxes / inventorySummary.initialBoxes) * 100 : 0;

const wasteByOpCaja = [...wasteByOp.values()]
  .map((item) => ({
    ...item,
    mermaPct: item.usadas ? (item.desperdicio / item.usadas) * 100 : 0,
    boxes: boxesByOp.get(item.opCaja)?.size ?? 0,
  }))
  .sort((a, b) => b.mermaPct - a.mermaPct);

const boxesByNCaja = [...boxesByOp.entries()]
  .map(([opCaja, boxes]) => ({ opCaja, boxes: boxes.size }))
  .sort((a, b) => b.boxes - a.boxes);

let accumulatedBoxes = 0;
const dailyConsumption = [...boxesByDate.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([date, boxes]) => {
    accumulatedBoxes += boxes;
    return { date, boxes, accumulatedBoxes };
  });

const formatWaste = [...wasteByFormat.values()]
  .map((item) => ({
    ...item,
    mermaPct: item.usadas ? (item.desperdicio / item.usadas) * 100 : 0,
  }))
  .sort((a, b) => b.desperdicio - a.desperdicio)
  .slice(0, 8);

const totals = records.reduce(
  (acc, record) => {
    acc.aptas += record.aptas;
    acc.usadas += record.usadas;
    acc.desperdicio += record.desperdicio;
    acc.bags += record.bags;
    return acc;
  },
  { aptas: 0, usadas: 0, desperdicio: 0, bags: 0, boxes: allBoxes.size }
);
totals.mermaPct = totals.usadas ? (totals.desperdicio / totals.usadas) * 100 : 0;

const dates = records.map((record) => record.date).sort();
const data = {
  generatedAt: new Date().toISOString(),
  source: {
    workbook: 'PREFORMAS SIN MOVIMIENTO.xlsx',
    sheet: 'Consumo actual',
  },
  period: {
    from: dates[0] ?? '',
    to: dates.at(-1) ?? '',
  },
  totals,
  inventorySummary,
  observedInventory: observedInventoryWithConsumption,
  wasteByOpCaja,
  boxesByNCaja,
  dailyConsumption,
  formatWaste,
};

fs.writeFileSync(
  outputPath,
  `// Archivo generado por scripts/generate-preformas-dashboard-data.mjs\nexport const preformasDashboardData = ${JSON.stringify(data, null, 2)};\n`,
  'utf8'
);

console.log(`Datos de preformas generados: ${outputPath}`);
console.log(`${records.length} registros | ${wasteByOpCaja.length} OP/CAJA | ${totals.boxes} cajas consumidas`);
