import path from 'node:path';
import readXlsxFile from 'read-excel-file/node';
import writeExcelFile from 'write-excel-file/node';

const inputPath = path.resolve('PREFORMAS SIN MOVIMIENTO.xlsx');
const outputPath = path.resolve('PREFORMAS SIN MOVIMIENTO - registros por OP.xlsx');
const fallbackOutputPath = path.resolve('PREFORMAS SIN MOVIMIENTO - registros por OP actualizado.xlsx');

const numberFmt = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

function cleanSheetName(value) {
  return String(value)
    .replace(/[\\/*?:[\]]/g, '-')
    .slice(0, 31);
}

function cell(value, options = {}) {
  return { value: value ?? null, ...options };
}

function headerCell(value) {
  return cell(value, {
    fontWeight: 'bold',
    textColor: '#ffffff',
    backgroundColor: '#4472C4',
    align: 'center',
    alignVertical: 'center',
  });
}

function labelCell(value) {
  return cell(value, {
    fontWeight: 'bold',
    backgroundColor: '#D9EAF7',
  });
}

function summaryValue(value) {
  return cell(value, {
    fontWeight: 'bold',
    backgroundColor: '#F3F6FA',
  });
}

function dataCell(value, columnIndex) {
  if (value instanceof Date) {
    return cell(value, { type: Date, format: 'dd/mm/yyyy' });
  }
  if (typeof value === 'number' && columnIndex >= 5 && columnIndex <= 8) {
    return cell(value, { type: Number, format: '#,##0' });
  }
  return cell(value);
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
    aptas += toNumber(row[5]);
    usadas += toNumber(row[6]);
    desperdicio += toNumber(row[7]) || Math.max(toNumber(row[6]) - toNumber(row[5]), 0);
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

function buildOpSheet(op, headers, records) {
  const summary = summarizeRecords(records);
  const rows = [
    [cell(`Registros separados por OP: ${op}`, { fontWeight: 'bold', fontSize: 18 })],
    [],
    [labelCell('Filas'), summaryValue(summary.filas), labelCell('Fechas'), summaryValue(summary.fechas), labelCell('Cajas unicas'), summaryValue(summary.cajasUnicas)],
    [labelCell('Cajas leidas'), summaryValue(summary.cajasLeidas), labelCell('Duplicadas'), summaryValue(summary.cajasDuplicadas), labelCell('Merma'), summaryValue(`${pctFmt.format(summary.mermaPct)}%`)],
    [labelCell('Botellas aptas'), summaryValue(summary.aptas), labelCell('Total usadas'), summaryValue(summary.usadas), labelCell('Desperdicio'), summaryValue(summary.desperdicio)],
    [],
    headers.map(headerCell),
    ...records.map((row) => headers.map((_, index) => dataCell(row[index], index))),
  ];

  return {
    data: rows,
    sheet: cleanSheetName(op),
    columns: headers.map((_, index) => ({ width: index === 3 ? 34 : index === 11 ? 22 : 16 })),
    stickyRowsCount: 7,
  };
}

function buildSummarySheet(opGroups, headers) {
  const rows = [
    [cell('Resumen de registros por OP', { fontWeight: 'bold', fontSize: 18 })],
    [cell(`Fuente: ${path.basename(inputPath)}`)],
    [],
    ['OP', 'Filas', 'Fechas', 'Cajas leidas', 'Duplicadas', 'Cajas unicas', 'Botellas aptas', 'Total usadas', 'Desperdicio', 'Merma %'].map(headerCell),
  ];

  for (const [op, records] of opGroups) {
    const summary = summarizeRecords(records);
    rows.push([
      cell(op, { fontWeight: 'bold' }),
      cell(summary.filas, { type: Number }),
      cell(summary.fechas, { type: Number }),
      cell(summary.cajasLeidas, { type: Number }),
      cell(summary.cajasDuplicadas, { type: Number }),
      cell(summary.cajasUnicas, { type: Number }),
      cell(summary.aptas, { type: Number, format: '#,##0' }),
      cell(summary.usadas, { type: Number, format: '#,##0' }),
      cell(summary.desperdicio, { type: Number, format: '#,##0' }),
      cell(summary.mermaPct / 100, { type: Number, format: '0.00%' }),
    ]);
  }

  const totalSummary = summarizeOpGroups(opGroups);
  rows.push([
    cell('TOTAL', { fontWeight: 'bold', backgroundColor: '#E2F0D9' }),
    summaryValue(totalSummary.filas),
    summaryValue(totalSummary.fechas),
    summaryValue(totalSummary.cajasLeidas),
    summaryValue(totalSummary.cajasDuplicadas),
    summaryValue(totalSummary.cajasUnicas),
    summaryValue(totalSummary.aptas),
    summaryValue(totalSummary.usadas),
    summaryValue(totalSummary.desperdicio),
    cell(totalSummary.mermaPct / 100, { type: Number, format: '0.00%', fontWeight: 'bold', backgroundColor: '#E2F0D9' }),
  ]);

  return {
    data: rows,
    sheet: 'Resumen OPs',
    columns: headers.slice(0, 10).map((_, index) => ({ width: index === 0 ? 18 : 15 })),
    stickyRowsCount: 4,
  };
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
  buildSummarySheet(sortedGroups, headers),
  ...[...sortedGroups.entries()].map(([op, records]) => buildOpSheet(op, headers, records)),
];

let writtenPath = outputPath;
try {
  await writeExcelFile(sheets).toFile(outputPath);
} catch (error) {
  if (error?.code !== 'EBUSY') throw error;
  writtenPath = fallbackOutputPath;
  await writeExcelFile(sheets).toFile(writtenPath);
}

console.log(JSON.stringify({
  output: writtenPath,
  ops: [...sortedGroups.keys()],
  sheets: sheets.map((sheet) => sheet.sheet),
  totalRecords: [...sortedGroups.values()].reduce((sum, records) => sum + records.length, 0),
}, null, 2));
