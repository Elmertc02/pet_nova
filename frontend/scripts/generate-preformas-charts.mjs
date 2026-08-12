import fs from 'node:fs';
import path from 'node:path';
import readXlsxFile from 'read-excel-file/node';

const excelPath = path.resolve('PREFORMAS SIN MOVIMIENTO.xlsx');
const outDir = path.resolve('dist');
const today = new Date('2026-07-30T23:59:59-04:00');

const money = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

function normalizeBoxToken(token) {
  const trimmed = String(token ?? '').trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return String(Math.trunc(numeric));
  return trimmed.toUpperCase();
}

function parseBoxes(value) {
  if (value === null || value === undefined || value === '') return [];

  if (typeof value === 'number') {
    if (Number.isInteger(value)) return [String(value)];

    // Excel can convert "22,21" into 22.21 depending on locale/cell format.
    return String(value)
      .split('.')
      .map(normalizeBoxToken)
      .filter(Boolean);
  }

  return String(value)
    .split(/[,\n;]/)
    .map(normalizeBoxToken)
    .filter(Boolean);
}

function formatDate(value) {
  return value.toISOString().slice(0, 10);
}

function barColor(index) {
  const colors = ['#2563eb', '#0f766e', '#f97316', '#7c3aed', '#dc2626', '#475569', '#0891b2'];
  return colors[index % colors.length];
}

function readSheet(workbookRows, sheetName) {
  const sheet = workbookRows.find((entry) => entry?.sheet === sheetName);
  if (!sheet) {
    throw new Error(`No se encontro la hoja "${sheetName}".`);
  }
  return sheet.data;
}

function summarizeRows(rows) {
  const records = [];
  const warnings = [];

  for (const row of rows.slice(2)) {
    const date = toDate(row[1]);
    const aptas = toNumber(row[5]);
    const usadas = toNumber(row[6]);
    const op = String(row[9] ?? '').trim();
    const nCajaRaw = row[11];

    if (!date || !op || aptas === null || usadas === null || usadas <= 0) continue;
    if (date > today) continue;

    const cajas = parseBoxes(nCajaRaw);
    if (typeof nCajaRaw === 'number' && Number.isInteger(nCajaRaw) && nCajaRaw > 500) {
      warnings.push(`${formatDate(date)} ${op}: N CAJA "${nCajaRaw}" se conto como una sola caja porque no trae coma.`);
    }

    records.push({
      date,
      op,
      aptas,
      usadas,
      desperdicio: Math.max(usadas - aptas, 0),
      cajas,
      nCajaRaw
    });
  }

  const byOp = new Map();
  const uniqueTotal = new Set();

  for (const record of records) {
    if (!byOp.has(record.op)) {
      byOp.set(record.op, {
        op: record.op,
        aptas: 0,
        usadas: 0,
        desperdicio: 0,
        cajas: new Set(),
        filas: 0
      });
    }

    const summary = byOp.get(record.op);
    summary.aptas += record.aptas;
    summary.usadas += record.usadas;
    summary.desperdicio += record.desperdicio;
    summary.filas += 1;

    for (const caja of record.cajas) {
      const key = `${record.op}::${caja}`;
      summary.cajas.add(caja);
      uniqueTotal.add(key);
    }
  }

  const summaries = [...byOp.values()].map((item) => ({
    op: item.op,
    aptas: item.aptas,
    usadas: item.usadas,
    desperdicio: item.desperdicio,
    mermaPct: item.usadas ? (item.desperdicio / item.usadas) * 100 : 0,
    cajasUsadas: item.cajas.size,
    filas: item.filas
  }));

  const totals = summaries.reduce(
    (acc, item) => {
      acc.aptas += item.aptas;
      acc.usadas += item.usadas;
      acc.desperdicio += item.desperdicio;
      return acc;
    },
    { aptas: 0, usadas: 0, desperdicio: 0, cajasUsadas: uniqueTotal.size }
  );
  totals.mermaPct = totals.usadas ? (totals.desperdicio / totals.usadas) * 100 : 0;

  return {
    records,
    summaries,
    totals,
    warnings,
    minDate: records.reduce((min, r) => (!min || r.date < min ? r.date : min), null),
    maxDate: records.reduce((max, r) => (!max || r.date > max ? r.date : max), null)
  };
}

function makeMermaSvg(data) {
  const rows = [...data.summaries].sort((a, b) => b.mermaPct - a.mermaPct);
  const width = 1280;
  const height = 760;
  const left = 250;
  const right = 110;
  const top = 220;
  const rowH = 64;
  const barH = 26;
  const maxPct = Math.max(1, ...rows.map((r) => r.mermaPct));
  const chartW = width - left - right;
  const chartBottom = top + rows.length * rowH;

  const bars = rows
    .map((row, index) => {
      const y = top + index * rowH;
      const barW = (row.mermaPct / maxPct) * chartW;
      return `
        <text class="op" x="${left - 18}" y="${y + 22}" text-anchor="end">${escapeXml(row.op)}</text>
        <rect class="bar-bg" x="${left}" y="${y}" width="${chartW}" height="${barH}" rx="5"/>
        <rect x="${left}" y="${y}" width="${barW}" height="${barH}" rx="5" fill="${barColor(index)}"/>
        <text class="value" x="${left + barW + 10}" y="${y + 19}">${pct.format(row.mermaPct)}%</text>
        <text class="small" x="${left}" y="${y + 46}">Desperdicio ${money.format(row.desperdicio)} | usadas ${money.format(row.usadas)} | aptas ${money.format(row.aptas)}</text>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Merma por OP/Caja</title>
  <desc id="desc">Merma porcentual por OP/Caja calculada como total usadas menos botellas aptas dividido entre total usadas.</desc>
  <defs>
    <style>
      .bg { fill: #ffffff; }
      .title { fill: #172033; font: 700 34px Arial, Helvetica, sans-serif; }
      .subtitle { fill: #64748b; font: 400 16px Arial, Helvetica, sans-serif; }
      .card { fill: #f8fafc; stroke: #e2e8f0; stroke-width: 1; rx: 8; }
      .card-label { fill: #64748b; font: 700 12px Arial, Helvetica, sans-serif; }
      .card-value { fill: #0f172a; font: 700 26px Arial, Helvetica, sans-serif; }
      .op { fill: #334155; font: 700 15px Arial, Helvetica, sans-serif; }
      .value { fill: #0f172a; font: 700 15px Arial, Helvetica, sans-serif; }
      .small { fill: #64748b; font: 400 13px Arial, Helvetica, sans-serif; }
      .bar-bg { fill: #e2e8f0; }
      .axis { stroke: #cbd5e1; stroke-width: 1; }
    </style>
  </defs>
  <rect class="bg" width="${width}" height="${height}"/>
  <text class="title" x="${width / 2}" y="52" text-anchor="middle">Merma de preformas observadas por OP/Caja</text>
  <text class="subtitle" x="${width / 2}" y="82" text-anchor="middle">Periodo ${formatDate(data.minDate)} a ${formatDate(data.maxDate)} | hasta 2026-07-30</text>

  <rect class="card" x="70" y="108" width="250" height="66"/>
  <text class="card-label" x="90" y="132">MERMA TOTAL</text>
  <text class="card-value" x="90" y="160">${pct.format(data.totals.mermaPct)}%</text>
  <rect class="card" x="345" y="108" width="250" height="66"/>
  <text class="card-label" x="365" y="132">DESPERDICIO</text>
  <text class="card-value" x="365" y="160">${money.format(data.totals.desperdicio)}</text>
  <rect class="card" x="620" y="108" width="250" height="66"/>
  <text class="card-label" x="640" y="132">TOTAL USADAS</text>
  <text class="card-value" x="640" y="160">${money.format(data.totals.usadas)}</text>
  <rect class="card" x="895" y="108" width="315" height="66"/>
  <text class="card-label" x="915" y="132">BOTELLAS APTAS</text>
  <text class="card-value" x="915" y="160">${money.format(data.totals.aptas)}</text>

  <line class="axis" x1="${left}" y1="${chartBottom + 8}" x2="${left + chartW}" y2="${chartBottom + 8}"/>
  ${bars}
  <text class="small" x="${left}" y="${height - 32}">Formula: Merma % = (Total usadas - Botellas aptas) / Total usadas.</text>
</svg>`;
}

function makeCajasSvg(data) {
  const rows = [...data.summaries].sort((a, b) => b.cajasUsadas - a.cajasUsadas);
  const width = 1280;
  const height = 760;
  const left = 250;
  const right = 110;
  const top = 190;
  const rowH = 64;
  const barH = 28;
  const maxBoxes = Math.max(1, ...rows.map((r) => r.cajasUsadas));
  const chartW = width - left - right;
  const chartBottom = top + rows.length * rowH;

  const bars = rows
    .map((row, index) => {
      const y = top + index * rowH;
      const barW = (row.cajasUsadas / maxBoxes) * chartW;
      return `
        <text class="op" x="${left - 18}" y="${y + 22}" text-anchor="end">${escapeXml(row.op)}</text>
        <rect class="bar-bg" x="${left}" y="${y}" width="${chartW}" height="${barH}" rx="5"/>
        <rect x="${left}" y="${y}" width="${barW}" height="${barH}" rx="5" fill="${barColor(index)}"/>
        <text class="value" x="${left + barW + 10}" y="${y + 20}">${money.format(row.cajasUsadas)} cajas</text>
        <text class="small" x="${left}" y="${y + 48}">Merma ${pct.format(row.mermaPct)}% | desperdicio ${money.format(row.desperdicio)}</text>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Cajas usadas por OP/Caja</title>
  <desc id="desc">Cantidad de cajas usadas por OP/Caja, contando una sola vez las cajas repetidas dentro de la misma OP.</desc>
  <defs>
    <style>
      .bg { fill: #ffffff; }
      .title { fill: #172033; font: 700 34px Arial, Helvetica, sans-serif; }
      .subtitle { fill: #64748b; font: 400 16px Arial, Helvetica, sans-serif; }
      .card { fill: #f8fafc; stroke: #e2e8f0; stroke-width: 1; rx: 8; }
      .card-label { fill: #64748b; font: 700 12px Arial, Helvetica, sans-serif; }
      .card-value { fill: #0f172a; font: 700 30px Arial, Helvetica, sans-serif; }
      .op { fill: #334155; font: 700 15px Arial, Helvetica, sans-serif; }
      .value { fill: #0f172a; font: 700 15px Arial, Helvetica, sans-serif; }
      .small { fill: #64748b; font: 400 13px Arial, Helvetica, sans-serif; }
      .bar-bg { fill: #e2e8f0; }
      .axis { stroke: #cbd5e1; stroke-width: 1; }
    </style>
  </defs>
  <rect class="bg" width="${width}" height="${height}"/>
  <text class="title" x="${width / 2}" y="52" text-anchor="middle">Cajas usadas de preformas observadas por OP/Caja</text>
  <text class="subtitle" x="${width / 2}" y="82" text-anchor="middle">Conteo unico por OP + N CAJA | periodo ${formatDate(data.minDate)} a ${formatDate(data.maxDate)}</text>

  <rect class="card" x="70" y="108" width="280" height="66"/>
  <text class="card-label" x="90" y="132">CAJAS USADAS EN TOTAL</text>
  <text class="card-value" x="90" y="162">${money.format(data.totals.cajasUsadas)}</text>
  <rect class="card" x="375" y="108" width="280" height="66"/>
  <text class="card-label" x="395" y="132">OP/CAJA CON MAYOR USO</text>
  <text class="card-value" x="395" y="162">${escapeXml(rows[0]?.op ?? '-')}</text>
  <rect class="card" x="680" y="108" width="250" height="66"/>
  <text class="card-label" x="700" y="132">CAJAS DE ESA OP</text>
  <text class="card-value" x="700" y="162">${money.format(rows[0]?.cajasUsadas ?? 0)}</text>
  <rect class="card" x="955" y="108" width="255" height="66"/>
  <text class="card-label" x="975" y="132">OPS CONSUMIDAS</text>
  <text class="card-value" x="975" y="162">${money.format(rows.length)}</text>

  <line class="axis" x1="${left}" y1="${chartBottom + 8}" x2="${left + chartW}" y2="${chartBottom + 8}"/>
  ${bars}
  <text class="small" x="${left}" y="${height - 32}">Regla: si una caja se repite en la misma OP, se cuenta una sola vez. Si el mismo numero aparece en otra OP, se cuenta como caja distinta.</text>
</svg>`;
}

function makeCsv(data) {
  const headers = ['OP/CAJA', 'Botellas aptas', 'Total usadas', 'Desperdicio', 'Merma %', 'Cajas usadas unicas'];
  const lines = [headers.join(';')];
  for (const row of [...data.summaries].sort((a, b) => a.op.localeCompare(b.op))) {
    lines.push([
      row.op,
      row.aptas,
      row.usadas,
      row.desperdicio,
      row.mermaPct.toFixed(4),
      row.cajasUsadas
    ].join(';'));
  }
  lines.push([
    'TOTAL',
    data.totals.aptas,
    data.totals.usadas,
    data.totals.desperdicio,
    data.totals.mermaPct.toFixed(4),
    data.totals.cajasUsadas
  ].join(';'));
  return `${lines.join('\n')}\n`;
}

function writeTextWithFallback(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
  } catch (error) {
    if (error?.code !== 'EBUSY') throw error;
    const parsed = path.parse(filePath);
    const fallbackPath = path.join(parsed.dir, `${parsed.name}-actualizado${parsed.ext}`);
    fs.writeFileSync(fallbackPath, content, 'utf8');
    return fallbackPath;
  }
}

const workbookRows = await readXlsxFile(excelPath);
const rows = readSheet(workbookRows, 'Consumo actual ');
const data = summarizeRows(rows);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'merma-preformas-op-caja.svg'), makeMermaSvg(data), 'utf8');
fs.writeFileSync(path.join(outDir, 'cajas-preformas-op-caja.svg'), makeCajasSvg(data), 'utf8');
const csvPath = writeTextWithFallback(path.join(outDir, 'resumen-preformas-op-caja.csv'), makeCsv(data));
const warningsPath = writeTextWithFallback(path.join(outDir, 'advertencias-preformas-op-caja.txt'), data.warnings.join('\n') + '\n');

console.log(JSON.stringify({
  records: data.records.length,
  ops: data.summaries.length,
  minDate: formatDate(data.minDate),
  maxDate: formatDate(data.maxDate),
  totals: {
    ...data.totals
  },
  warnings: data.warnings
  ,
  csvPath,
  warningsPath
}, null, 2));
