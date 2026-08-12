import fs from 'node:fs';
import path from 'node:path';
import readXlsxFile from 'read-excel-file/node';

const inputPath = path.resolve('PREFORMAS SIN MOVIMIENTO.xlsx');
const outputPath = path.resolve('dist', 'preformas-op-sheets-data.json');

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
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

function toDateKey(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return '';
}

function valueForExcel(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toDateKey(value);
  return value ?? '';
}

function summarizeRecords(records) {
  const boxes = new Set();
  let readBoxes = 0;
  let duplicateBoxes = 0;
  let aptas = 0;
  let usadas = 0;
  let desperdicio = 0;
  const dates = new Set();

  for (const row of records) {
    const rowBoxes = parseBoxes(row[11]);
    const aptasRow = toNumber(row[5]);
    const usadasRow = toNumber(row[6]);
    aptas += aptasRow;
    usadas += usadasRow;
    desperdicio += toNumber(row[7]) || Math.max(usadasRow - aptasRow, 0);
    if (toDateKey(row[1])) dates.add(toDateKey(row[1]));

    for (const box of rowBoxes) {
      readBoxes += 1;
      if (boxes.has(box)) {
        duplicateBoxes += 1;
      } else {
        boxes.add(box);
      }
    }
  }

  return {
    filas: records.length,
    fechas: dates.size,
    aptas,
    usadas,
    desperdicio,
    mermaPct: usadas ? (desperdicio / usadas) * 100 : 0,
    cajasLeidas: readBoxes,
    cajasDuplicadas: duplicateBoxes,
    cajasUnicas: boxes.size,
  };
}

function summarizeOpGroups(opGroups) {
  const boxes = new Set();
  let readBoxes = 0;
  let duplicateBoxes = 0;
  let aptas = 0;
  let usadas = 0;
  let desperdicio = 0;
  let filas = 0;
  const dates = new Set();

  for (const [op, records] of opGroups) {
    for (const row of records) {
      const rowBoxes = parseBoxes(row[11]);
      const aptasRow = toNumber(row[5]);
      const usadasRow = toNumber(row[6]);
      filas += 1;
      aptas += aptasRow;
      usadas += usadasRow;
      desperdicio += toNumber(row[7]) || Math.max(usadasRow - aptasRow, 0);
      if (toDateKey(row[1])) dates.add(toDateKey(row[1]));

      for (const box of rowBoxes) {
        readBoxes += 1;
        const key = `${op}::${box}`;
        if (boxes.has(key)) {
          duplicateBoxes += 1;
        } else {
          boxes.add(key);
        }
      }
    }
  }

  return {
    filas,
    fechas: dates.size,
    aptas,
    usadas,
    desperdicio,
    mermaPct: usadas ? (desperdicio / usadas) * 100 : 0,
    cajasLeidas: readBoxes,
    cajasDuplicadas: duplicateBoxes,
    cajasUnicas: boxes.size,
  };
}

function cleanSheetName(value) {
  return String(value)
    .replace(/[\\/*?:[\]]/g, '-')
    .slice(0, 31);
}

function buildOpRows(op, headers, records) {
  const summary = summarizeRecords(records);
  return [
    [`Registros separados por OP: ${op}`],
    [],
    ['Filas', summary.filas, 'Fechas', summary.fechas, 'Cajas unicas', summary.cajasUnicas],
    ['Cajas leidas', summary.cajasLeidas, 'Duplicadas', summary.cajasDuplicadas, 'Merma', `${summary.mermaPct.toFixed(2)}%`],
    ['Botellas aptas', summary.aptas, 'Total usadas', summary.usadas, 'Desperdicio', summary.desperdicio],
    [],
    headers,
    ...records.map((row) => headers.map((_, index) => valueForExcel(row[index]))),
  ];
}

function buildSummaryRows(opGroups) {
  const rows = [
    ['Resumen de registros por OP'],
    [`Fuente: ${path.basename(inputPath)}`],
    [],
    ['OP', 'Filas', 'Fechas', 'Cajas leidas', 'Duplicadas', 'Cajas unicas', 'Botellas aptas', 'Total usadas', 'Desperdicio', 'Merma %'],
  ];

  for (const [op, records] of opGroups) {
    const summary = summarizeRecords(records);
    rows.push([
      op,
      summary.filas,
      summary.fechas,
      summary.cajasLeidas,
      summary.cajasDuplicadas,
      summary.cajasUnicas,
      summary.aptas,
      summary.usadas,
      summary.desperdicio,
      `${summary.mermaPct.toFixed(2)}%`,
    ]);
  }

  const totalSummary = summarizeOpGroups(opGroups);
  rows.push([
    'TOTAL',
    totalSummary.filas,
    totalSummary.fechas,
    totalSummary.cajasLeidas,
    totalSummary.cajasDuplicadas,
    totalSummary.cajasUnicas,
    totalSummary.aptas,
    totalSummary.usadas,
    totalSummary.desperdicio,
    `${totalSummary.mermaPct.toFixed(2)}%`,
  ]);

  return rows;
}

const workbook = await readXlsxFile(inputPath);
const consumptionSheet = workbook.find((sheet) => sheet.sheet.trim().toLowerCase() === 'consumo actual');
if (!consumptionSheet) throw new Error('No se encontro la hoja "Consumo actual".');

const rows = consumptionSheet.data;
const headers = rows[2].map((value, index) => value || `COLUMNA ${index + 1}`);
const opGroups = new Map();

for (const row of rows.slice(3)) {
  const op = normalizeOp(row[9]);
  if (!op) continue;
  if (!opGroups.has(op)) opGroups.set(op, []);
  opGroups.get(op).push(row);
}

const sortedGroups = new Map([...opGroups.entries()].sort(([a], [b]) => a.localeCompare(b)));
const sheets = [
  { sheet: 'Resumen OPs', rows: buildSummaryRows(sortedGroups) },
  ...[...sortedGroups.entries()].map(([op, records]) => ({
    sheet: cleanSheetName(op),
    rows: buildOpRows(op, headers, records),
  })),
];

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({
  source: path.basename(inputPath),
  sheets,
  ops: [...sortedGroups.keys()],
  totalRecords: [...sortedGroups.values()].reduce((sum, records) => sum + records.length, 0),
}, null, 2), 'utf8');

console.log(JSON.stringify({
  output: outputPath,
  ops: [...sortedGroups.keys()],
  totalRecords: [...sortedGroups.values()].reduce((sum, records) => sum + records.length, 0),
}, null, 2));
