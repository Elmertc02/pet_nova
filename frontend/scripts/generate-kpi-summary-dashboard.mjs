import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('dist');
const width = 1920;
const height = 1080;

const fmtPct = (value, digits = 2) => `${value.toFixed(digits).replace('.', ',')}%`;
const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function linePath(points) {
  return points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
}

function chartScale({ x, y, w, h, max }) {
  return (value) => y + h - (value / max) * h;
}

function drawReclamosPanel() {
  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC', 'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN'];
  const values = [0.50, 2.43, 1.07, 1.25, 0.50, 2.29, 1.88, 2.15, 0.87, 1.41, 0.48, 1.07, 0.55, 0.41, 0.89, 0, 0.45, 0];
  const x = 70, y = 170, w = 810, h = 250, max = 3;
  const yPos = chartScale({ x, y, w, h, max });
  const step = w / (values.length - 1);
  const points = values.map((value, index) => ({ x: x + step * index, y: yPos(value), value }));
  const bars = points.map((point, index) => {
    const barW = 18;
    const barColor = index < 12 ? '#dbeafe' : '#ccfbf1';
    return `<rect x="${point.x - barW / 2}" y="${point.y}" width="${barW}" height="${y + h - point.y}" rx="4" fill="${barColor}"/>`;
  }).join('\n');
  const labels = points.map((point, index) => index % 2 === 0 || values[index] >= 1.8
    ? `<text x="${point.x}" y="${point.y - 8}" class="tiny center">${values[index] === 0 ? '0%' : fmtPct(values[index])}</text>`
    : '').join('\n');
  const xLabels = months.map((month, index) => `<text x="${x + step * index}" y="${y + h + 34}" class="tick center">${month}</text>`).join('\n');
  const grid = [0, 0.5, 1, 1.5, 2, 2.5, 3].map((tick) => {
    const yy = yPos(tick);
    return `<line x1="${x}" y1="${yy}" x2="${x + w}" y2="${yy}" class="grid"/><text x="${x - 18}" y="${yy + 5}" class="tick right">${fmtPct(tick, 1)}</text>`;
  }).join('\n');
  const avgY = yPos(1.01);
  const splitX = x + step * 11.5;

  return `
    <g>
      <text x="70" y="130" class="panel-title">Reclamos / despachos por mes (%)</text>
      <text x="70" y="156" class="muted">Enero 2025 - junio 2026</text>
      ${grid}
      <line x1="${splitX}" y1="${y}" x2="${splitX}" y2="${y + h + 18}" stroke="#94a3b8" stroke-dasharray="7 8" stroke-width="2"/>
      <line x1="${x}" y1="${avgY}" x2="${x + w}" y2="${avgY}" stroke="#f97316" stroke-dasharray="8 8" stroke-width="3"/>
      <text x="${x + w - 8}" y="${avgY - 9}" class="tiny right">Prom. 1,01%</text>
      <line x1="${x}" y1="${y + h}" x2="${x + w}" y2="${y + h}" stroke="#ef4444" stroke-width="3"/>
      ${bars}
      <path d="${linePath(points)}" fill="none" stroke="#2563eb" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
      ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5" fill="#fff" stroke="#2563eb" stroke-width="4"/>`).join('\n')}
      ${labels}
      ${xLabels}
      <text x="${x + step * 5.5}" y="${y + h + 72}" class="year center">2025</text>
      <text x="${x + step * 14.5}" y="${y + h + 72}" class="year center">2026</text>
    </g>`;
}

function drawComparativaPanel() {
  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN'];
  const y25 = [0.50, 2.43, 1.07, 1.25, 0.50, 2.29];
  const y26 = [0.55, 0.41, 0.89, 0.00, 0.45, 0.00];
  const x = 1030, y = 132, w = 760, h = 280, max = 3;
  const yPos = chartScale({ x, y, w, h, max });
  const step = w / (months.length - 1);
  const p25 = y25.map((value, index) => ({ x: x + step * index, y: yPos(value), value }));
  const p26 = y26.map((value, index) => ({ x: x + step * index, y: yPos(value), value }));
  const grid = [0, 0.5, 1, 1.5, 2, 2.5, 3].map((tick) => {
    const yy = yPos(tick);
    return `<line x1="${x}" y1="${yy}" x2="${x + w}" y2="${yy}" class="grid"/><text x="${x - 18}" y="${yy + 5}" class="tick right">${fmtPct(tick, 1)}</text>`;
  }).join('\n');
  const labels = months.map((month, index) => `<text x="${x + step * index}" y="${y + h + 34}" class="tick center">${month}</text>`).join('\n');
  const avg25 = yPos(1.34);
  const avg26 = yPos(0.38);

  return `
    <g>
      <text x="1030" y="130" class="panel-title">Comparativa 1er KPI</text>
      <text x="1030" y="156" class="muted">Enero a junio | 2025 vs 2026</text>
      <rect x="1030" y="168" width="176" height="56" rx="8" class="mini-card"/>
      <text x="1048" y="191" class="mini-label">PROM. 2025</text>
      <text x="1048" y="215" class="mini-value">1,34%</text>
      <rect x="1228" y="168" width="176" height="56" rx="8" class="mini-card"/>
      <text x="1246" y="191" class="mini-label">PROM. 2026</text>
      <text x="1246" y="215" class="mini-value">0,38%</text>
      <rect x="1426" y="168" width="176" height="56" rx="8" class="mini-card"/>
      <text x="1444" y="191" class="mini-label">DIFERENCIA</text>
      <text x="1444" y="215" class="mini-value">-0,96 pp</text>
      <rect x="1624" y="168" width="166" height="56" rx="8" class="mini-card"/>
      <text x="1642" y="191" class="mini-label">PICO</text>
      <text x="1642" y="215" class="mini-value">2,43%</text>
      <g transform="translate(0 106)">
        ${grid}
        <line x1="${x}" y1="${avg25}" x2="${x + w}" y2="${avg25}" stroke="#f97316" stroke-dasharray="8 8" stroke-width="3"/>
        <line x1="${x}" y1="${avg26}" x2="${x + w}" y2="${avg26}" stroke="#64748b" stroke-dasharray="8 8" stroke-width="3"/>
        <path d="${linePath(p25)}" fill="none" stroke="#f97316" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
        <path d="${linePath(p26)}" fill="none" stroke="#64748b" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
        ${p25.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5" fill="#fff" stroke="#f97316" stroke-width="4"/>`).join('\n')}
        ${p26.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5" fill="#fff" stroke="#64748b" stroke-width="4"/>`).join('\n')}
        ${p25.map((point) => `<text x="${point.x}" y="${point.y - 10}" class="tiny center">${point.value.toFixed(2).replace('.', ',')}</text>`).join('\n')}
        ${p26.map((point) => `<text x="${point.x}" y="${point.y + 22}" class="tiny muted-fill center">${point.value.toFixed(2).replace('.', ',')}</text>`).join('\n')}
        ${labels}
      </g>
    </g>`;
}

function drawKpi2Panel() {
  const months = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO'];
  const values = [6.1, 2.5, 17.4, 0.0, 0.5, 0.0];
  const x = 70, y = 660, w = 810, h = 250, max = 20;
  const yPos = chartScale({ x, y, w, h, max });
  const step = w / (values.length - 1);
  const points = values.map((value, index) => ({ x: x + step * index, y: yPos(value), value }));
  const grid = [0, 5, 10, 15, 20].map((tick) => {
    const yy = yPos(tick);
    return `<line x1="${x}" y1="${yy}" x2="${x + w}" y2="${yy}" class="grid"/><text x="${x - 18}" y="${yy + 5}" class="tick right">${tick}</text>`;
  }).join('\n');
  const labels = months.map((month, index) => `<text x="${x + step * index}" y="${y + h + 34}" class="tick center">${month}</text>`).join('\n');

  return `
    <g>
      <text x="70" y="602" class="panel-title">KPI2 - %Cantidad observada</text>
      <text x="70" y="630" class="muted">Enero a junio</text>
      ${grid}
      <path d="${linePath(points)}" fill="none" stroke="#2563eb" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
      ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5" fill="#2563eb"/>`).join('\n')}
      ${points.map((point) => `<text x="${point.x}" y="${point.y - 12}" class="tiny center">${point.value.toFixed(1).replace('.', ',')}</text>`).join('\n')}
      ${labels}
    </g>`;
}

function drawDiasPanel() {
  const clients = ['LEONEL V.', 'NOEL J.', 'LAUVAL', 'PROVIPAL', 'LEONEL V.', 'DELY SOY', 'DELY SOY', 'DELY SOY', 'DELY SOY', 'PROLIBO', 'ACTIVA', 'JAIME C.'];
  const values = [8, 7, 7, 19, 3, 9, 24, 24, 17, 28, 55, 41];
  const x = 1030, y = 660, w = 760, h = 250, max = 60;
  const yPos = chartScale({ x, y, w, h, max });
  const step = w / (values.length - 1);
  const points = values.map((value, index) => ({ x: x + step * index, y: yPos(value), value }));
  const grid = [0, 15, 30, 45, 60].map((tick) => {
    const yy = yPos(tick);
    return `<line x1="${x}" y1="${yy}" x2="${x + w}" y2="${yy}" class="grid"/><text x="${x - 18}" y="${yy + 5}" class="tick right">${tick}</text>`;
  }).join('\n');
  const labels = clients.map((client, index) => `<text x="${x + step * index - 6}" y="${y + h + 44}" class="tick rotate">${esc(client)}</text>`).join('\n');

  return `
    <g>
      <text x="1030" y="602" class="panel-title">Días respuesta</text>
      <text x="1030" y="630" class="muted">Tiempo de respuesta por cliente</text>
      ${grid}
      <path d="${linePath(points)}" fill="none" stroke="#2563eb" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
      ${points.map((point) => `<rect x="${point.x - 5}" y="${point.y - 5}" width="10" height="10" transform="rotate(45 ${point.x} ${point.y})" fill="#2563eb"/>`).join('\n')}
      ${points.map((point) => `<text x="${point.x}" y="${point.y - 12}" class="tiny center">${point.value}</text>`).join('\n')}
      ${labels}
    </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <style>
      .bg { fill: #f5f7fb; }
      .panel { fill: #ffffff; stroke: #d9e2ec; stroke-width: 1.5; }
      .panel-title { fill: #152238; font-family: Arial, Helvetica, sans-serif; font-size: 28px; font-weight: 800; }
      .title { fill: #152238; font-family: Arial, Helvetica, sans-serif; font-size: 42px; font-weight: 800; }
      .subtitle { fill: #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 20px; }
      .muted { fill: #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 17px; }
      .muted-fill { fill: #64748b; }
      .grid { stroke: #dbe3ee; stroke-width: 1.5; }
      .tick { fill: #475569; font-family: Arial, Helvetica, sans-serif; font-size: 13px; font-weight: 700; }
      .tiny { fill: #152238; font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 800; }
      .year { fill: #152238; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: 800; }
      .center { text-anchor: middle; }
      .right { text-anchor: end; }
      .rotate { transform-box: fill-box; transform-origin: center; transform: rotate(-45deg); text-anchor: end; }
      .mini-card { fill: #f8fafc; stroke: #d9e2ec; stroke-width: 1.2; }
      .mini-label { fill: #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 800; }
      .mini-value { fill: #152238; font-family: Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 800; }
    </style>
  </defs>
  <rect class="bg" width="1920" height="1080"/>
  <text x="70" y="44" class="title">Resumen de indicadores</text>
  <text x="70" y="74" class="subtitle">Reclamos, KPI comparativo, cantidad observada y días de respuesta</text>

  <rect class="panel" x="40" y="96" width="880" height="460" rx="12"/>
  <rect class="panel" x="990" y="96" width="850" height="460" rx="12"/>
  <rect class="panel" x="40" y="584" width="880" height="430" rx="12"/>
  <rect class="panel" x="990" y="584" width="850" height="430" rx="12"/>

  ${drawReclamosPanel()}
  ${drawComparativaPanel()}
  ${drawKpi2Panel()}
  ${drawDiasPanel()}
</svg>`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'resumen-indicadores-calidad.svg'), svg, 'utf8');
console.log(path.join(outDir, 'resumen-indicadores-calidad.svg'));

