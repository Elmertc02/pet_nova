import { Fragment, useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import writeXlsxFile from 'write-excel-file/browser';
import { localApi } from './localApiClient.js';

const TURNOS_REPORTE = ['Mañana', 'Tarde', 'Noche'];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function minutosEntreHoras(horaIni, horaFin) {
  if (!horaIni || !horaFin) return 0;
  const [h1, m1] = horaIni.split(':').map(Number);
  const [h2, m2] = horaFin.split(':').map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60;
  return mins;
}

function emptyForm() {
  return {
    ordenOp: '',
    fecha: todayIso(),
    turno: '',
    operador: '',
    maquina: '',
    codBotella: '',
    etiqIni: 0,
    etiqFin: 0,
    cantPorBolsa: 0,
    mermaBot: 0,
    mermaPref: 0,
    horaInicio: '',
    horaFin: '',
    observaciones: '',
  };
}

// Misma regla que calcBolsas() en DIGITALIZACION: fin - ini + 1 (con inicio > 0).
function calcularBolsas(etiqIni, etiqFin) {
  const ini = Number(etiqIni) || 0;
  const fin = Number(etiqFin) || 0;
  if (ini > 0 && fin >= ini) return fin - ini + 1;
  if (ini === 0 && fin > 0) return fin;
  return 0;
}

// Helpers de texto para el export a Excel -- mismo criterio de resumen que
// ya se usa en las celdas de la tabla "Reportes guardados".
function textoParadas(paradas) {
  if (!paradas || paradas.length === 0) return '';
  return paradas.map((p) => `${p.horaInicio && p.horaFin ? `${p.horaInicio}-${p.horaFin} ` : ''}${p.detalle}: ${p.minutos} min`).join(' | ');
}
function textoConsumoPreforma(consumos) {
  if (!consumos || consumos.length === 0) return '';
  return consumos.map((c) => `Caja ${c.numCaja}${c.op ? ` (OP ${c.op})` : ''}: ${c.cantidad}u${c.estado && c.estado !== 'ninguno' ? ` [${c.estado}]` : ''}`).join(' | ');
}
function textoDefectosPreforma(defectos) {
  if (!defectos || defectos.length === 0) return '';
  return defectos.map((d) => `Caja ${d.numCaja}${d.op ? ` (OP ${d.op})` : ''}: ${d.cantidad}u - ${d.descripcion}`).join(' | ');
}
function textoSaldoUsado(saldoUsado) {
  if (!saldoUsado || saldoUsado.length === 0) return '';
  return saldoUsado.map((s) => `${s.codBotella || ''}: ${s.cantidad}u`).join(' | ');
}

function fechaDDMMYYYY(iso) {
  const [yy, mm, dd] = String(iso || '').split('-');
  if (!yy || !mm || !dd) return iso || '';
  return `${dd}/${mm}/${yy}`;
}
function numFmt(n) {
  if (n === null || n === undefined || n === '') return '';
  return Number(n).toLocaleString('es-EC');
}

// Genera el PDF de un reporte individual con el mismo formato que la hoja de
// papel "PRODUCCION DE BOTELLAS SOPLADO" (REG-PRS-CB-01) que ya usa la
// planta -- pagina 1 con los datos de identificacion/produccion/mermas/cajas
// de preforma, y pagina 2 con las paradas programadas/no programadas.
// `botellaInfo` es opcional -- viene del catalogo (Productos e Insumos) y
// completa Cliente/Volumen/Gramaje/Color/Bot-h que el reporte en si no
// guarda. El formulario en papel tiene columnas para 3 turnos del mismo dia
// (1er/2do/3er); como cada reporte guardado es de un solo turno, ese turno
// se completa y los otros dos quedan en blanco (igual que en el papel
// cuando solo se trabajo un turno ese dia).
//
// Dibujado a mano con jsPDF (rect/text), no HTML+html2canvas -- la version
// con HTML/CSS calcado de DIGITALIZACION/templates/reporte_pdf.html se
// probo y `pdf.html()` (en esta version de jsPDF) escalaba mal el ancho y
// paginaba solo por su cuenta, pisando el addPage() manual y recortando el
// contenido. Con coordenadas fijas el resultado es determinista y se pudo
// verificar de punta a punta contra datos reales antes de integrarlo.
const CYAN_PDF = [0, 150, 166];
const BLUE_PDF = [27, 78, 172];
const BLACK_PDF = [0, 0, 0];

function generarReportePdf(r, botellaInfo = {}, logoDataUrl = null) {
  const TURNOS = ['Mañana', 'Tarde', 'Noche'];
  const tcol = Math.max(0, TURNOS.indexOf(r.turno));

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const MX = 8, MX2 = 202;
  const FULL = MX2 - MX;
  doc.setLineWidth(0.25);
  doc.setDrawColor(0, 0, 0);

  const rect = (x, y, w, h) => doc.rect(x, y, w, h);
  const text = (str, x, y, opts = {}) => {
    const { size = 7, bold = false, align = 'left', color = BLACK_PDF, angle = 0 } = opts;
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(...color);
    doc.text(String(str ?? ''), x, y, { align, angle });
  };
  // Linea punteada (subrayado tipo "para completar") bajo un valor, igual
  // que el estilo de DIGITALIZACION.
  const dotted = (x1, yy, x2) => {
    doc.setLineDashPattern([0.3, 0.5], 0);
    doc.setDrawColor(90, 90, 90);
    doc.setLineWidth(0.15);
    doc.line(x1, yy, x2, yy);
    doc.setLineDashPattern([], 0);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
  };
  const cellLV = (x, y, w, h, label, valor, opts = {}) => {
    const { labelSize = 6, valorSize = 7.5, valorBold = false, align = 'center', pad = 2 } = opts;
    const lx = align === 'center' ? x + w / 2 : x + pad;
    text(label, lx, y + 3.3, { size: labelSize, bold: true, align, color: CYAN_PDF });
    text(valor ?? '', lx, y + h - 2.4, { size: valorSize, align, bold: valorBold });
    const lineW = Math.min(w - pad * 2, 60);
    const lineX = align === 'center' ? lx - lineW / 2 : lx;
    dotted(lineX, y + h - 1.6, lineX + lineW);
  };
  // Encabezado de seccion -- solo texto negro en negrita centrado, sin
  // relleno (los navegadores no imprimen fondos de color salvo que el
  // usuario tilde "graficos de fondo", asi que en DIGITALIZACION esto
  // siempre sale en blanco/negro en la practica).
  const tituloSeccion = (x, y, w, h, titulo, size = 7.5) => {
    rect(x, y, w, h);
    text(titulo, x + w / 2, y + h / 2 + size * 0.32, { size, bold: true, align: 'center' });
  };

  // ============================== PAGINA 1 ==============================
  let y = 8;

  const headerH = 16;
  rect(MX, y, FULL, headerH);
  doc.line(MX + 32, y, MX + 32, y + headerH);
  doc.line(MX + 152, y, MX + 152, y + headerH);
  if (logoDataUrl) {
    const logoW = 22, logoH = logoW / (116 / 60);
    doc.addImage(logoDataUrl, 'PNG', MX + 16 - logoW / 2, y + 2, logoW, logoH);
  } else {
    text('EMPACAR S.A.', MX + 16, y + 8, { size: 7, bold: true, align: 'center', color: [200, 40, 40] });
  }
  text('EMPACAR S.A.', MX + 16, y + headerH - 1.5, { size: 5.5, align: 'center', color: [90, 90, 90] });
  text('PRODUCCIÓN DE BOTELLAS SOPLADO', MX + 92, y + headerH / 2 + 1.5, { size: 11.5, bold: true, align: 'center' });
  text('REG-PRS-CB-01 Rev.0', MX2 - 2, y + 6, { size: 6, align: 'right' });
  text('REVISIÓN: 12/06/2023', MX2 - 2, y + 10, { size: 6, bold: true, align: 'right' });
  text('PAGINA 1 de 1', MX2 - 2, y + 14, { size: 6, align: 'right' });
  y += headerH;

  const leftColW = 24;
  const infoX0 = MX + leftColW;
  const rowH = 8;

  rect(MX, y, leftColW, rowH);
  rect(infoX0, y, FULL - leftColW, rowH);
  cellLV(MX, y, leftColW, rowH, 'FECHA', fechaDDMMYYYY(r.fecha), { align: 'center' });
  cellLV(infoX0, y, FULL - leftColW, rowH, 'MAQ. SOPLADORA', r.maquina, { align: 'center', valorBold: true, valorSize: 9 });
  y += rowH;

  rect(MX, y, leftColW, rowH);
  rect(infoX0, y, (FULL - leftColW) * 0.6, rowH);
  rect(infoX0 + (FULL - leftColW) * 0.6, y, (FULL - leftColW) * 0.4, rowH);
  cellLV(infoX0, y, (FULL - leftColW) * 0.6, rowH, 'CLIENTE', botellaInfo.cliente, { align: 'left' });
  cellLV(infoX0 + (FULL - leftColW) * 0.6, y, (FULL - leftColW) * 0.4, rowH, 'VOLUMEN (ml)', numFmt(botellaInfo.volumen), { align: 'left' });
  y += rowH;

  const bigBoxY = y;
  const bigBoxH = rowH * 3;
  rect(MX, bigBoxY, leftColW, bigBoxH);
  const maquinaParts = String(r.maquina || '').split(' ');
  text(maquinaParts[0] || '', MX + leftColW / 2, bigBoxY + 8, { size: 8, bold: true, align: 'center', color: BLUE_PDF });
  text(maquinaParts.slice(1).join(' ') || '', MX + leftColW / 2, bigBoxY + 18, { size: 15, bold: true, align: 'center', color: BLUE_PDF });
  doc.setDrawColor(...BLUE_PDF);
  doc.setLineWidth(0.7);
  doc.line(MX + 2.5, bigBoxY + bigBoxH - 5, MX + leftColW - 2.5, bigBoxY + bigBoxH - 5);
  doc.setLineWidth(0.25);
  doc.setDrawColor(0, 0, 0);
  text('MÁQ.', MX + leftColW / 2, bigBoxY + bigBoxH - 2, { size: 6.5, bold: true, align: 'center', color: BLUE_PDF });

  rect(infoX0, y, FULL - leftColW, rowH);
  cellLV(infoX0, y, FULL - leftColW, rowH, 'CODIGO BOT.', r.codBotella, { align: 'center', valorBold: true });
  y += rowH;

  const col3w = (FULL - leftColW) / 3;
  rect(infoX0, y, col3w, rowH);
  rect(infoX0 + col3w, y, col3w, rowH);
  rect(infoX0 + col3w * 2, y, col3w, rowH);
  cellLV(infoX0, y, col3w, rowH, 'CODIGO PREF.', botellaInfo.codPreforma, { align: 'center' });
  cellLV(infoX0 + col3w, y, col3w, rowH, 'GRAMAJE', numFmt(botellaInfo.gramaje), { align: 'center' });
  cellLV(infoX0 + col3w * 2, y, col3w, rowH, 'COLOR', botellaInfo.color, { align: 'center' });
  y += rowH;

  rect(infoX0, y, FULL - leftColW, rowH);
  const anio = String(r.fecha || '').split('-')[0] || '';
  cellLV(infoX0, y, FULL - leftColW, rowH, 'OP ETIQUETA', `${r.ordenOp || ''}${anio ? '/' + anio : ''}`, { align: 'center' });
  y += rowH;

  const labelColW = 38;
  const turnoColW = (FULL - labelColW - 34) / 3;
  const totalColW = 34;
  const tCols = [MX, MX + labelColW, MX + labelColW + turnoColW, MX + labelColW + turnoColW * 2, MX + labelColW + turnoColW * 3];

  const filaTurno = (rowY, h, label, valores, opts = {}) => {
    // labelBoxX/labelBoxW dejan angostar el rect de la columna label -- lo
    // usan las filas de MERMAS para no dibujar de nuevo el borde de la
    // "casilla" MERMAS (ya la dibuja una sola vez el llamador, mergeada en
    // las 3 filas) ni las lineas horizontales que la cortarian en 3.
    rect(opts.labelBoxX ?? MX, rowY, opts.labelBoxW ?? labelColW, h);
    for (let i = 0; i < 4; i++) rect(tCols[i + 1], rowY, i < 3 ? turnoColW : totalColW, h);
    text(label, (opts.labelX ?? MX + 2), rowY + h / 2 + 1.4, { size: opts.labelSize ?? 6.5, bold: true, color: opts.labelBlack ? BLACK_PDF : CYAN_PDF });
    valores.forEach((v, i) => {
      if (v === null || v === undefined || v === '') return;
      const w = i < 3 ? turnoColW : totalColW;
      text(v, tCols[i + 1] + w / 2, rowY + h / 2 + 1.4, { size: opts.size ?? 7, bold: opts.bold, align: 'center' });
    });
  };
  const valoresTurno = (v) => {
    const arr = [null, null, null, null];
    if (v !== '' && v !== null && v !== undefined) { arr[tcol] = v; arr[3] = v; }
    return arr;
  };
  // RESPONSABLES / HORA INICIO / HORA FIN nunca repiten su valor en la
  // columna TOTAL (asi es tambien en DIGITALIZACION -- esa columna se
  // deja en blanco para esas 3 filas, a diferencia de mermas/botellas
  // buenas/total pref.utilizadas, que si suman a TOTAL).
  const valoresTurnoSinTotal = (v) => {
    const arr = [null, null, null, null];
    if (v !== '' && v !== null && v !== undefined) arr[tcol] = v;
    return arr;
  };

  const headerRowH = 6.5;
  rect(MX, y, labelColW, headerRowH);
  text('TURNO', MX + labelColW / 2, y + headerRowH / 2 + 1.4, { size: 7, bold: true, align: 'center' });
  ['1ER TURNO', '2DO TURNO', '3ER TURNO', 'TOTAL'].forEach((lbl, i) => {
    const w = i < 3 ? turnoColW : totalColW;
    rect(tCols[i + 1], y, w, headerRowH);
    text(lbl, tCols[i + 1] + w / 2, y + headerRowH / 2 + 1.4, { size: 6.5, bold: true, align: 'center' });
  });
  y += headerRowH;

  // RESPONSABLES: el operador arriba y cada ayudante en su propia linea,
  // dentro de LA MISMA casilla (una sola caja mergeada, sin lineas
  // horizontales entre nombres) -- "ayudante" viene como un string separado
  // por comas, se parte para listar uno por linea.
  const ayudantesIndividuales = (r.ayudante || '').split(',').map((a) => a.trim()).filter(Boolean);
  const responsables = [r.operador, ...ayudantesIndividuales].filter(Boolean);
  const filasResponsables = Math.max(1, responsables.length);
  const respRowH = 5;
  const respBoxH = respRowH * filasResponsables;
  rect(MX, y, labelColW, respBoxH);
  text('RESPONSABLES', MX + 2, y + 3.5, { size: 6.5, bold: true, color: CYAN_PDF });
  [0, 1, 2].forEach((col) => {
    rect(tCols[col + 1], y, turnoColW, respBoxH);
    if (col === tcol) {
      responsables.forEach((nombre, idx) => {
        text(nombre, tCols[col + 1] + turnoColW / 2, y + 3.5 + idx * respRowH, { size: 6.5, align: 'center' });
      });
    }
  });
  rect(tCols[4], y, totalColW, respBoxH);
  y += respBoxH;
  filaTurno(y, 5.5, 'HORA INICIO PRODUCCION', valoresTurnoSinTotal(r.horaInicio), { labelSize: 6 }); y += 5.5;
  filaTurno(y, 5.5, 'HORA FIN PRODUCCION', valoresTurnoSinTotal(r.horaFin), { labelSize: 6 }); y += 5.5;

  // N.Doc./Part.Prod./Cons.Mat -- siempre vacio, tal como queda en los
  // reportes reales de la planta (son campos que no se usan).
  const ndocColW = 8, blankColW = 6;
  const prodLabelW = labelColW - ndocColW - blankColW;
  for (let i = 0; i < 3; i++) {
    const h = 4.3;
    if (i === 0) rect(MX, y, ndocColW, h * 3);
    rect(MX + ndocColW, y, blankColW, h);
    rect(MX + ndocColW + blankColW, y, prodLabelW, h);
    text(['N.Doc.', 'Part. Prod.', 'Cons. Mat.'][i], MX + ndocColW + blankColW + 1.5, y + 3, { size: 6, bold: i === 0 });
    [0, 1, 2].forEach((col) => rect(tCols[col + 1], y, turnoColW, h));
    rect(tCols[4], y, totalColW, h);
    y += h;
  }

  // "MERMAS" en una sola casilla mergeada (borde unico, sin lineas
  // horizontales cortandola) que abarca las 3 filas de abajo -- por eso
  // filaTurno() se llama con labelBoxX/labelBoxW angostado, para que no
  // vuelva a dibujar el borde/las lineas de esta columna.
  const mermaRowH = 5;
  const mermaColW = 9;
  const mermasBoxY = y;
  rect(MX, y, mermaColW, mermaRowH * 3);
  // OJO con el texto rotado en esta version de jsPDF (probado a mano,
  // dibujando la caja + una cruz de referencia y mirando donde cae el
  // texto en cada intento):
  // - angle:90 lo dibuja HACIA AFUERA de la caja (a la izquierda) -- hay
  //   que usar angle:-90 para que caiga adentro.
  // - align:'center' NO centra en ningun eje: en el eje "ancho" (horizontal,
  //   el grosor de la fuente) el ancla queda en el borde izquierdo del
  //   texto, no en el medio -- se corrige sumando la mitad del alto de
  //   linea (getLineHeight()/scaleFactor, ~2.6mm半 -> +1.3).
  // - en el eje "largo" (vertical, la direccion en la que se lee la
  //   palabra) el ancla es el INICIO (arriba) del texto, no el centro --
  //   para centrarlo de verdad hay que calcular a mano
  //   boxTop + (altoCaja - anchoDelTexto)/2, usando doc.getTextWidth().
  const mermasBoxH = mermaRowH * 3;
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  const mermasTextLen = doc.getTextWidth('MERMAS');
  text('MERMAS', MX + mermaColW / 2 + 1.3, mermasBoxY + (mermasBoxH - mermasTextLen) / 2, { size: 6.5, bold: true, align: 'center', angle: -90 });

  const mermaFilaOpts = { labelSize: 6, labelX: MX + mermaColW + 1, labelBoxX: MX + mermaColW, labelBoxW: labelColW - mermaColW };
  filaTurno(y, mermaRowH, 'PREFORMA MALOGRADA', valoresTurno(numFmt(r.mermaPref)), mermaFilaOpts); y += mermaRowH;
  filaTurno(y, mermaRowH, 'BOTELLA MALOGRADA', valoresTurno(numFmt(r.mermaBot)), mermaFilaOpts); y += mermaRowH;
  filaTurno(y, mermaRowH, 'TOTAL MERMAS:', valoresTurno(numFmt(r.mermaTotal)), { ...mermaFilaOpts, labelBlack: true, bold: true }); y += mermaRowH;

  filaTurno(y, 6, 'BOTELLAS BUENAS:', valoresTurno(numFmt(r.botBuenas)), { bold: true }); y += 6;
  const totalPref = (r.consumosPreforma || []).reduce((s, c) => s + (Number(c.cantidad) || 0), 0);
  filaTurno(y, 6, 'TOTAL DE PREF.UTILIZADAS:', valoresTurno(totalPref ? numFmt(totalPref) : ''), { bold: true }); y += 6;

  const etiqRowH = 8;
  rect(MX, y, labelColW, etiqRowH * 2);
  text('NUMERO DE ETIQUETA', MX + 2, y + etiqRowH, { size: 6.5, bold: true });
  [0, 1, 2].forEach((col) => {
    rect(tCols[col + 1], y, turnoColW, etiqRowH);
    text('DEL Nro.', tCols[col + 1] + 2, y + 3, { size: 5.5, color: [130, 130, 130] });
    if (col === tcol) text(String(r.etiqIni ?? ''), tCols[col + 1] + turnoColW / 2, y + 6.5, { size: 7.5, bold: true, align: 'center' });
  });
  rect(tCols[4], y, totalColW, etiqRowH);
  y += etiqRowH;
  [0, 1, 2].forEach((col) => {
    rect(tCols[col + 1], y, turnoColW, etiqRowH);
    text('AL Nro.', tCols[col + 1] + 2, y + 3, { size: 5.5, color: [130, 130, 130] });
    if (col === tcol) text(String(r.etiqFin ?? ''), tCols[col + 1] + turnoColW / 2, y + 6.5, { size: 7.5, bold: true, align: 'center' });
  });
  rect(tCols[4], y, totalColW, etiqRowH);
  y += etiqRowH;

  const cantH = 7;
  rect(MX, y, labelColW, cantH);
  text('CANTIDAD', MX + 2, y + cantH / 2 + 1.3, { size: 6.5, bold: true });
  text(numFmt(r.numBolsas), MX + labelColW - 3, y + cantH / 2 + 1.3, { size: 7.5, bold: true, align: 'right' });
  const unidW = turnoColW * 1.6;
  rect(tCols[1], y, unidW, cantH);
  text('UNIDADES/BOLSA', tCols[1] + 2, y + cantH / 2 + 1.3, { size: 6.5, bold: true });
  text(numFmt(r.cantPorBolsa), tCols[1] + unidW - 3, y + cantH / 2 + 1.3, { size: 7.5, bold: true, align: 'right' });
  const cadW = FULL - labelColW - unidW;
  rect(tCols[1] + unidW, y, cadW, cantH);
  text('CADENCIA', tCols[1] + unidW + cadW / 2, y + 3, { size: 6.5, bold: true, align: 'center' });
  text(`Bot/h: ${botellaInfo.velocidad ? numFmt(botellaInfo.velocidad) : ''}`, tCols[1] + unidW + cadW / 2, y + 6, { size: 6.5, align: 'center' });
  y += cantH;
  y += 3;

  const cajaCols = [
    { w: 15, label: 'TURNOS' }, { w: 18, label: 'Nro CAJA' }, { w: 50, label: 'OP / RESINA' },
    { w: 35, label: 'SALDO ANTERIOR' }, { w: 35, label: 'TOTAL USADAS' }, { w: 0, label: 'SALDO' },
  ];
  cajaCols[5].w = FULL - cajaCols.slice(0, 5).reduce((s, c) => s + c.w, 0);
  tituloSeccion(MX, y, FULL, 5.5, 'CAJAS DE PREFORMAS UTILIZADAS');
  y += 5.5;
  let cx = MX;
  cajaCols.forEach((c) => { rect(cx, y, c.w, 5); text(c.label, cx + c.w / 2, y + 3.5, { size: 6, bold: true, align: 'center' }); cx += c.w; });
  y += 5;
  const cajaFilas = r.consumosPreforma || [];
  const cajaFilaH = 5;
  cajaFilas.forEach((c) => {
    cx = MX;
    const saldo = (Number(c.saldoAnterior) || 0) - (Number(c.cantidad) || 0);
    const vals = ['—', c.numCaja, `${c.op || ''}${c.resina ? ' / ' + c.resina : ''}`, numFmt(c.saldoAnterior), numFmt(c.cantidad), numFmt(saldo)];
    cajaCols.forEach((col, i) => { rect(cx, y, col.w, cajaFilaH); text(vals[i], cx + col.w / 2, y + 3.5, { size: 6.5, align: 'center', bold: i === 5 }); cx += col.w; });
    y += cajaFilaH;
  });
  const relleno = Math.max(7 - cajaFilas.length, 0);
  for (let i = 0; i < relleno; i++) { cx = MX; cajaCols.forEach((c) => { rect(cx, y, c.w, cajaFilaH); cx += c.w; }); y += cajaFilaH; }
  const saldoBotUsado = (r.saldoUsado || []).reduce((s, x) => s + (Number(x.cantidad) || 0), 0);
  if (saldoBotUsado > 0) {
    rect(MX, y, FULL, 5);
    text(`* Se utilizaron ${numFmt(saldoBotUsado)} botellas del saldo anterior — no requirieron soplar preformas en este turno.`, MX + 2, y + 3.3, { size: 6, color: [80, 80, 80] });
    y += 5;
  }
  y += 3;

  const matCols = [{ w: 32 }, { w: 30 }, { w: FULL - 62 }];
  tituloSeccion(MX, y, FULL, 5.5, 'MATERIALES UTILIZADOS');
  y += 5.5;
  cx = MX;
  ['BOLSAS USADAS', 'MALOGRADAS', 'OBSERVACIONES'].forEach((lbl, i) => { rect(cx, y, matCols[i].w, 5); text(lbl, cx + matCols[i].w / 2, y + 3.5, { size: 6, bold: true, align: 'center' }); cx += matCols[i].w; });
  y += 5;
  ['TURNO I', 'TURNO II', 'TURNO III', 'TOTAL'].forEach((lbl, i) => {
    const h = 8;
    const activo = i === tcol || i === 3;
    cx = MX;
    rect(cx, y, matCols[0].w, h);
    text(lbl, cx + 1.5, y + 3, { size: 5.5, color: [130, 130, 130] });
    if (activo) text(numFmt(r.numBolsas), cx + matCols[0].w / 2, y + 6.5, { size: 6.5, bold: i === 3, align: 'center' });
    cx += matCols[0].w;
    rect(cx, y, matCols[1].w, h); cx += matCols[1].w;
    if (i === 0) {
      rect(cx, y, matCols[2].w, h * 4);
      // Preformas observadas (defectuosas) + las observaciones libres del
      // turno (seccion Tiempos del formulario), una atras de la otra.
      const obsTexto = [textoDefectosPreforma(r.defectosPreforma), r.observaciones]
        .filter(Boolean).join(' | ');
      if (obsTexto) {
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        const lineas = doc.splitTextToSize(obsTexto, matCols[2].w - 4);
        lineas.slice(0, 9).forEach((linea, li) => {
          text(linea, cx + 2, y + 3.5 + li * 3.2, { size: 6 });
        });
      }
    }
    y += h;
  });

  // ============================== PAGINA 2 ==============================
  doc.addPage('a4', 'portrait');
  y = 8;
  const p2HeaderH = 14;
  rect(MX, y, FULL, p2HeaderH);
  doc.line(MX + 30, y, MX + 30, y + p2HeaderH);
  doc.line(MX + 150, y, MX + 150, y + p2HeaderH);
  if (logoDataUrl) {
    const logoW2 = 18, logoH2 = logoW2 / (116 / 60);
    doc.addImage(logoDataUrl, 'PNG', MX + 15 - logoW2 / 2, y + 2, logoW2, logoH2);
  } else {
    text('EMPACAR S.A.', MX + 15, y + 8, { size: 6, bold: true, align: 'center', color: [200, 40, 40] });
  }
  text('PRODUCCIÓN DE BOTELLAS SOPLADO', MX + 90, y + p2HeaderH / 2 + 1.5, { size: 10, bold: true, align: 'center' });
  text(r.maquina, MX2 - 2, y + 5, { size: 6.5, bold: true, align: 'right' });
  text(`Fecha: ${fechaDDMMYYYY(r.fecha)} | Turno: ${r.turno}`, MX2 - 2, y + 8.5, { size: 5.5, align: 'right' });
  text(`Operador: ${r.operador}`, MX2 - 2, y + 11.5, { size: 5.5, align: 'right' });
  y += p2HeaderH + 5;

  const tablaParadas = (titulo, paradas, filaCambioMolde) => {
    tituloSeccion(MX, y, FULL, 6.5, titulo, 9);
    y += 6.5;
    const cols = [{ w: 30, label: 'Hra. Inicio' }, { w: 30, label: 'Hra. Fin' }, { w: 18, label: 'Mint.' }, { w: 0, label: 'OBSERVACIONES' }];
    cols[3].w = FULL - cols.slice(0, 3).reduce((s, c) => s + c.w, 0);
    let cx2 = MX;
    cols.forEach((c) => { rect(cx2, y, c.w, 5); text(c.label, cx2 + c.w / 2, y + 3.5, { size: 6, bold: true, align: 'center' }); cx2 += c.w; });
    y += 5;
    if (filaCambioMolde) {
      cx2 = MX;
      const vals = [filaCambioMolde.horaInicio, filaCambioMolde.horaFin, String(filaCambioMolde.minutos), 'Cambio de Molde'];
      cols.forEach((c, i) => {
        rect(cx2, y, c.w, 6.5);
        text(vals[i], i === 3 ? cx2 + 2 : cx2 + c.w / 2, y + 4.3, { size: 6.5, bold: true, align: i === 3 ? 'left' : 'center' });
        cx2 += c.w;
      });
      y += 6.5;
    }
    (paradas || []).forEach((p) => {
      cx2 = MX;
      const vals = [p.horaInicio, p.horaFin, String(p.minutos), p.detalle];
      cols.forEach((c, i) => { rect(cx2, y, c.w, 6.5); text(vals[i], i === 3 ? cx2 + 2 : cx2 + c.w / 2, y + 4.3, { size: 6.5, align: i === 3 ? 'left' : 'center' }); cx2 += c.w; });
      y += 6.5;
    });
    const totalFilas = titulo.includes('NO PROGRAMADAS') ? 4 : 6;
    const extras = filaCambioMolde ? 1 : 0;
    const relleno2 = Math.max(totalFilas - (paradas || []).length - extras, 0);
    for (let i = 0; i < relleno2; i++) { cx2 = MX; cols.forEach((c) => { rect(cx2, y, c.w, 6.5); cx2 += c.w; }); y += 6.5; }
    y += 4;
  };

  const filaCM = r.tiempoCambioMolde ? { horaInicio: r.cmIni, horaFin: r.cmFin, minutos: r.tiempoCambioMolde } : null;
  tablaParadas('PARADAS PROGRAMADAS', r.paradasProgramadas, filaCM);
  tablaParadas('PARADAS NO PROGRAMADAS', r.paradasNoProgramadas, null);

  return doc;
}

// Logo real de EMPACAR S.A. (el mismo archivo que usa DIGITALIZACION,
// copiado a public/logos/logo-empacar-reporte.png) convertido a data URL
// para poder incrustarlo con doc.addImage(). Se pide una sola vez y se
// cachea -- no cambia entre exportaciones.
let logoReportePromise = null;
function cargarLogoReportePdf() {
  if (!logoReportePromise) {
    logoReportePromise = fetch('/logos/logo-empacar-reporte.png')
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error('logo no disponible'))))
      .then((blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }))
      .catch(() => null);
  }
  return logoReportePromise;
}

export default function ReportesView() {
  const [machines, setMachines] = useState([]);
  const [personal, setPersonal] = useState([]);
  const [reportes, setReportes] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [subView, setSubView] = useState('nuevo'); // 'nuevo' | 'historial' | 'produccion' | 'mermas'

  const [form, setForm] = useState(emptyForm);
  const [ayudantes, setAyudantes] = useState([]);
  const [ayudanteSel, setAyudanteSel] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [pdfExportingId, setPdfExportingId] = useState(null);
  const [procesandoValidacionId, setProcesandoValidacionId] = useState(null);

  const [opStatus, setOpStatus] = useState('idle'); // idle | loading | found | notfound | error
  const [opMessage, setOpMessage] = useState('');

  const [paradasProg, setParadasProg] = useState([]);
  const [paradasNoProg, setParadasNoProg] = useState([]);
  const [nuevaParadaProg, setNuevaParadaProg] = useState({ horaInicio: '', horaFin: '', detalle: '' });
  const [nuevaParadaNoProg, setNuevaParadaNoProg] = useState({ horaInicio: '', horaFin: '', detalle: '' });

  const [cmActivo, setCmActivo] = useState(false);
  const [cmIni, setCmIni] = useState('');
  const [cmFin, setCmFin] = useState('');
  // Se usa solo al editar un reporte viejo que todavia no tenia cm_ini/cm_fin
  // guardados (de antes de esta funcion) -- mantiene el total original hasta
  // que el usuario complete la hora inicio/fin a mano.
  const [cmMinutosFallback, setCmMinutosFallback] = useState(0);

  const [codPreforma, setCodPreforma] = useState('');
  const [preformaDescripcion, setPreformaDescripcion] = useState('');
  const [botellaDescripcion, setBotellaDescripcion] = useState('');
  const [cajasDisponibles, setCajasDisponibles] = useState([]);
  const [filasCaja, setFilasCaja] = useState([]); // filas de la cascada de consumo de preformas
  const [defectos, setDefectos] = useState([]); // [{key, filaCajaKey, cantidad, descripcion}]
  const [nuevoDefecto, setNuevoDefecto] = useState({ filaCajaKey: '', cantidad: '', descripcion: '' });

  const [finProduccionSaldo, setFinProduccionSaldo] = useState(false);
  const [finProduccionPedidoEspecial, setFinProduccionPedidoEspecial] = useState(false);
  const [saldoGenerado, setSaldoGenerado] = useState('');
  const [cantidadExtraPedido, setCantidadExtraPedido] = useState('');
  const [saldoDisponible, setSaldoDisponible] = useState([]);
  const [consumosSaldo, setConsumosSaldo] = useState([]); // [{key, saldoId, cantidad}]
  const [nuevoConsumoSaldo, setNuevoConsumoSaldo] = useState({ saldoId: '', cantidad: '' });

  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    Promise.all([localApi.getMachines(), localApi.getPersonal(), localApi.getReportesDiarios()])
      .then(([m, p, r]) => { setMachines(m); setPersonal(p); setReportes(r); setLoaded(true); })
      .catch((e) => { setLoadError(e.message || 'No se pudo conectar con el servidor local.'); setLoaded(true); });
  }, []);

  const minutosDisponibles = useMemo(() => minutosEntreHoras(form.horaInicio, form.horaFin), [form.horaInicio, form.horaFin]);
  const tiempoCambioMolde = useMemo(() => {
    if (!cmActivo) return 0;
    if (cmIni && cmFin) return minutosEntreHoras(cmIni, cmFin);
    return cmMinutosFallback;
  }, [cmActivo, cmIni, cmFin, cmMinutosFallback]);
  const minutosNuevaParadaProg = useMemo(
    () => minutosEntreHoras(nuevaParadaProg.horaInicio, nuevaParadaProg.horaFin),
    [nuevaParadaProg.horaInicio, nuevaParadaProg.horaFin],
  );
  const minutosNuevaParadaNoProg = useMemo(
    () => minutosEntreHoras(nuevaParadaNoProg.horaInicio, nuevaParadaNoProg.horaFin),
    [nuevaParadaNoProg.horaInicio, nuevaParadaNoProg.horaFin],
  );
  const numBolsas = useMemo(() => calcularBolsas(form.etiqIni, form.etiqFin), [form.etiqIni, form.etiqFin]);
  // Pedido especial: la cantidad extra que no alcanza a completar una bolsa
  // se suma igual a Botellas buenas (mismo criterio que "Saldo completar
  // pedido" en DIGITALIZACION).
  const botBuenas = useMemo(
    () => numBolsas * (Number(form.cantPorBolsa) || 0) + (finProduccionPedidoEspecial ? (Number(cantidadExtraPedido) || 0) : 0),
    [numBolsas, form.cantPorBolsa, finProduccionPedidoEspecial, cantidadExtraPedido],
  );
  const mermaTotal = useMemo(() => (Number(form.mermaBot) || 0) + (Number(form.mermaPref) || 0), [form.mermaBot, form.mermaPref]);
  // El saldo generado ("Fin de produccion con saldo") suma al total a cubrir
  // con preformas (esas botellas de mas tambien las consumieron); el saldo
  // usado ("Usar saldo de botella") resta, porque esas botellas ya estaban
  // producidas de un reporte anterior y no requieren preforma nueva ahora.
  const totalSaldoUsado = useMemo(() => consumosSaldo.reduce((s, c) => s + (Number(c.cantidad) || 0), 0), [consumosSaldo]);
  const totalProduccion = useMemo(
    () => mermaTotal + botBuenas + (Number(saldoGenerado) || 0) - totalSaldoUsado,
    [mermaTotal, botBuenas, saldoGenerado, totalSaldoUsado],
  );
  const reportesPendientesCount = useMemo(
    () => reportes.filter((r) => (r.estadoValidacion || 'pendiente') === 'pendiente').length,
    [reportes],
  );
  const totalParadasProg = paradasProg.reduce((sum, p) => sum + (Number(p.minutos) || 0), 0);
  const totalParadasNoProg = paradasNoProg.reduce((sum, p) => sum + (Number(p.minutos) || 0), 0);

  // Cascada de consumo de preformas: reparte el Total Produccion entre las
  // cajas en el orden en que se agregaron. Cada caja aporta hasta su
  // "disponible" (saldo anterior, ajustado por la Cantidad Irregular segun
  // el Estado); lo que no cubre pasa como remanente a la siguiente. La
  // ultima caja de la lista absorbe todo lo que quede, incluso si la deja
  // en saldo negativo (no alcanzo). "Cambio de caja" fuerza el total usado
  // de esa fila a la Cantidad Irregular indicada (lo que se uso antes del
  // cambio), sin importar su disponible. Traduccion de recalcCajas() en
  // DIGITALIZACION/static/js/reporte.js.
  //
  // Preformas Observadas: no son merma ni cuentan como produccion, solo se
  // "aparta" esa cantidad -- por eso el Total usado (suma de todas las
  // cajas) tiene que seguir dando exactamente el Total Produccion. Esta
  // caja fisicamente pierde sus observadas igual (se registran aparte, como
  // su propio movimiento -- ver server/cajasPreforma.js), pero esa cantidad
  // NO cuenta para cubrir la produccion: el hueco que deja se compensa
  // consumiendo de mas en la SIGUIENTE caja (mismo mecanismo que
  // "Faltante", pero automatico).
  const defectosPorFila = useMemo(() => {
    const map = {};
    for (const d of defectos) {
      map[d.filaCajaKey] = (map[d.filaCajaKey] || 0) + (Number(d.cantidad) || 0);
    }
    return map;
  }, [defectos]);

  const filasCajaCalc = useMemo(() => {
    let restante = totalProduccion;
    const n = filasCaja.length;
    return filasCaja.map((f, i) => {
      const sa = Number(f.saldoAnterior) || 0;
      const ci = Number(f.cantidadIrregular) || 0;
      const prefObs = defectosPorFila[f.key] || 0;
      const isLast = i === n - 1;
      let usadaProduccion; // lo que cuenta hacia el Total Produccion -- se muestra como "Total usado"
      let usadaFisica; // lo que realmente sale de la caja (produccion + observadas)
      if (!isLast && f.estado === 'cambio_caja') {
        usadaFisica = ci; // declarado por el operario, ya incluye lo observado
        usadaProduccion = Math.max(0, usadaFisica - prefObs);
        restante = Math.max(0, restante - usadaProduccion);
      } else if (isLast) {
        usadaProduccion = restante;
        usadaFisica = usadaProduccion + prefObs;
        restante = 0;
      } else {
        let disponible = sa;
        if (f.estado === 'sobrante') disponible = sa + ci;
        else if (f.estado === 'faltante') disponible = sa - ci;
        disponible = Math.max(disponible, 0);
        // Intenta cubrir sus propias observadas primero, y con lo que le
        // quede de "disponible" cubre produccion -- si no alcanza ni para
        // las observadas, el resto pasa igual a la siguiente caja.
        usadaFisica = Math.min(disponible, restante + prefObs);
        usadaProduccion = Math.max(0, usadaFisica - prefObs);
        restante -= usadaProduccion;
      }
      return { ...f, usadaProduccion, prefObs, usada: usadaProduccion, saldoActual: sa - usadaFisica };
    });
  }, [filasCaja, totalProduccion, defectosPorFila]);
  const totalConsumoPreforma = useMemo(() => filasCajaCalc.reduce((s, f) => s + f.usada, 0), [filasCajaCalc]);
  const totalPreformasObservadas = useMemo(() => defectos.reduce((s, d) => s + (Number(d.cantidad) || 0), 0), [defectos]);

  // Si se quita una fila de caja, los defectos que le apuntaban quedan huerfanos.
  useEffect(() => {
    setDefectos((current) => current.filter((d) => filasCaja.some((f) => f.key === d.filaCajaKey)));
  }, [filasCaja]);

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  useEffect(() => {
    if (!codPreforma) { setCajasDisponibles([]); return; }
    localApi.getCajasPreformaDisponibles(codPreforma).then(setCajasDisponibles).catch(() => setCajasDisponibles([]));
  }, [codPreforma]);

  // Saldo de botellas disponible para "Usar saldo de botella" -- siempre de
  // la MISMA botella que se esta reportando (Almacen Produccion -> Saldo de
  // botellas).
  useEffect(() => {
    const cod = form.codBotella.trim();
    if (!cod) { setSaldoDisponible([]); return; }
    localApi.getSaldoBotellasDisponibles(cod).then(setSaldoDisponible).catch(() => setSaldoDisponible([]));
  }, [form.codBotella]);

  // Trae la descripcion de la preforma (catalogo de Productos e Insumos) para
  // mostrarla junto al codigo de preforma auto-completado en Identificacion.
  useEffect(() => {
    if (!codPreforma) { setPreformaDescripcion(''); return; }
    localApi.getPreformasAdmin(codPreforma)
      .then((rows) => {
        const match = rows.find((p) => p.codigo.toLowerCase() === codPreforma.toLowerCase());
        setPreformaDescripcion(match?.descripcion || '');
      })
      .catch(() => setPreformaDescripcion(''));
  }, [codPreforma]);

  const buscarPorOp = async () => {
    const op = form.ordenOp.trim();
    if (!op) return;
    setOpStatus('loading');
    setOpMessage('');
    try {
      const data = await localApi.lookupEtiquetaByOp(op);
      setForm((current) => ({ ...current, maquina: data.maquinaNombre, codBotella: data.codBotella }));
      setCodPreforma(data.codPreforma || '');
      setOpStatus('found');
      setOpMessage(`Encontrado en Etiquetas: ${data.maquinaNombre} / ${data.codBotella}${data.codPreforma ? ` (preforma ${data.codPreforma})` : ''}.`);
      // El lookup de Etiquetas no trae la descripcion de la botella -- se
      // busca aparte en el catalogo (Productos e Insumos).
      cargarInfoBotella(data.maquinaNombre, data.codBotella);
    } catch (error) {
      setOpStatus(error.message?.includes('404') || error.message?.includes('No hay') ? 'notfound' : 'error');
      setOpMessage(error.message || 'No se pudo buscar la OP.');
    }
  };

  // Busca la botella en el catalogo de esa maquina (Productos e Insumos) para
  // mostrar su descripcion junto al codigo, y de paso -- si no vino ya
  // resuelta por la OP -- autocompletar el codigo de preforma vinculado.
  const cargarInfoBotella = async (maquina, codBotellaRaw, { permitirAutoPreforma = false } = {}) => {
    const codBotella = (codBotellaRaw || '').trim();
    if (!maquina || !codBotella) { setBotellaDescripcion(''); return; }
    try {
      const catalogo = await localApi.getBotellasCatalogo(maquina);
      const match = catalogo.find((b) => b.codBotella.toLowerCase() === codBotella.toLowerCase());
      setBotellaDescripcion(match?.descripcion || '');
      if (permitirAutoPreforma && !codPreforma && match?.codPreforma) setCodPreforma(match.codPreforma);
    } catch {
      // Sin catalogo disponible: el usuario puede completar preforma/descripcion a mano en Almacen.
      setBotellaDescripcion('');
    }
  };

  const agregarFilaCaja = () => {
    setFilasCaja((current) => [...current, {
      key: `${Date.now()}-${Math.random()}`,
      numCaja: '', op: '', resina: '', saldoAnterior: 0,
      cajaId: null, esNueva: false, estado: 'ninguno', cantidadIrregular: '',
    }]);
  };
  const actualizarFilaCaja = (index, patch) => {
    setFilasCaja((current) => current.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };
  const eliminarFilaCaja = (index) => setFilasCaja((current) => current.filter((_, i) => i !== index));

  // Normaliza un codigo de OP para comparar (mayusculas, "/" y "-" equivalentes).
  const normOp = (s) => (s || '').trim().toUpperCase().replace(/\//g, '-');

  // Compara N. caja + OP contra las cajas activas de la preforma actual. Si
  // coinciden ambos (o solo el numero y no hay ambiguedad) se toma la caja
  // existente y se autocompletan Resina y Saldo anterior. Si no hay ninguna
  // coincidencia, se marca como "caja nueva" -- solo se admite si esta
  // ligada al mismo codigo de preforma (viene de cajasDisponibles, que ya
  // esta filtrado por codPreforma).
  const resolverCajaFila = (index) => {
    setFilasCaja((current) => {
      const fila = current[index];
      if (!fila) return current;
      const numCajaVal = fila.numCaja.trim();
      if (!numCajaVal) return current.map((x, i) => (i === index ? { ...x, cajaId: null, esNueva: false } : x));
      const yaUsadas = new Set(current.filter((x, i) => i !== index && x.cajaId).map((x) => x.cajaId));
      const porNumero = cajasDisponibles.filter(
        (c) => c.numCaja.trim().toUpperCase() === numCajaVal.toUpperCase() && !yaUsadas.has(c.id),
      );
      let found = null;
      if (porNumero.length > 0) {
        if (fila.op.trim()) {
          const opN = normOp(fila.op);
          found = porNumero.find((c) => normOp(c.op) === opN) || null;
        } else if (porNumero.length === 1) {
          found = porNumero[0];
        }
      }
      return current.map((x, i) => {
        if (i !== index) return x;
        if (found) {
          return {
            ...x, cajaId: found.id, esNueva: false, saldoAnterior: found.cantidadActual,
            resina: x.resina || found.resina || '', op: x.op || found.op || '',
          };
        }
        return { ...x, cajaId: null, esNueva: true };
      });
    });
  };

  // Preformas observadas: solo se pueden atribuir a una de las cajas que ya
  // se estan usando en este reporte (filasCaja) -- no a cualquier caja del
  // catalogo.
  const agregarDefecto = () => {
    const cantidad = Number(nuevoDefecto.cantidad) || 0;
    const descripcion = nuevoDefecto.descripcion.trim();
    if (!nuevoDefecto.filaCajaKey || cantidad <= 0 || !descripcion) return;
    setDefectos((current) => [...current, {
      key: `${Date.now()}-${Math.random()}`,
      filaCajaKey: nuevoDefecto.filaCajaKey,
      cantidad,
      descripcion,
    }]);
    setNuevoDefecto({ filaCajaKey: '', cantidad: '', descripcion: '' });
  };
  const quitarDefecto = (key) => setDefectos((current) => current.filter((d) => d.key !== key));

  // Usar saldo de botella: solo entre los lotes de saldo disponibles para la
  // botella actual (saldoDisponible, ya filtrado por codBotella).
  const agregarConsumoSaldo = () => {
    const saldoId = Number(nuevoConsumoSaldo.saldoId) || 0;
    const cantidad = Number(nuevoConsumoSaldo.cantidad) || 0;
    const lote = saldoDisponible.find((s) => s.id === saldoId);
    if (!lote || cantidad <= 0) return;
    const yaUsado = consumosSaldo.filter((c) => c.saldoId === saldoId).reduce((s, c) => s + c.cantidad, 0);
    if (yaUsado + cantidad > lote.cantidadActual) return;
    setConsumosSaldo((current) => [...current, { key: `${Date.now()}-${Math.random()}`, saldoId, cantidad }]);
    setNuevoConsumoSaldo({ saldoId: '', cantidad: '' });
  };
  const quitarConsumoSaldo = (key) => setConsumosSaldo((current) => current.filter((c) => c.key !== key));

  const agregarAyudante = () => {
    if (!ayudanteSel || ayudantes.includes(ayudanteSel)) return;
    setAyudantes((current) => [...current, ayudanteSel]);
    setAyudanteSel('');
  };
  const quitarAyudante = (nombre) => setAyudantes((current) => current.filter((a) => a !== nombre));

  const agregarParada = (tipo) => {
    const nueva = tipo === 'prog' ? nuevaParadaProg : nuevaParadaNoProg;
    const minutos = minutosEntreHoras(nueva.horaInicio, nueva.horaFin);
    if (!nueva.detalle.trim() || !nueva.horaInicio || !nueva.horaFin || minutos <= 0) return;
    const item = { detalle: nueva.detalle.trim(), horaInicio: nueva.horaInicio, horaFin: nueva.horaFin, minutos };
    if (tipo === 'prog') {
      setParadasProg((current) => [...current, item]);
      setNuevaParadaProg({ horaInicio: '', horaFin: '', detalle: '' });
    } else {
      setParadasNoProg((current) => [...current, item]);
      setNuevaParadaNoProg({ horaInicio: '', horaFin: '', detalle: '' });
    }
  };
  const quitarParada = (tipo, index) => {
    if (tipo === 'prog') setParadasProg((current) => current.filter((_, i) => i !== index));
    else setParadasNoProg((current) => current.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm());
    setAyudantes([]);
    setParadasProg([]);
    setParadasNoProg([]);
    setNuevaParadaProg({ horaInicio: '', horaFin: '', detalle: '' });
    setNuevaParadaNoProg({ horaInicio: '', horaFin: '', detalle: '' });
    setCmActivo(false);
    setCmIni('');
    setCmFin('');
    setCmMinutosFallback(0);
    setOpStatus('idle');
    setOpMessage('');
    setCodPreforma('');
    setBotellaDescripcion('');
    setFilasCaja([]);
    setDefectos([]);
    setNuevoDefecto({ filaCajaKey: '', cantidad: '', descripcion: '' });
    setFinProduccionSaldo(false);
    setFinProduccionPedidoEspecial(false);
    setSaldoGenerado('');
    setCantidadExtraPedido('');
    setConsumosSaldo([]);
    setNuevoConsumoSaldo({ saldoId: '', cantidad: '' });
  };

  const guardar = async (event) => {
    event.preventDefault();
    setSaveError('');
    setSaveMessage('');

    if (!form.ordenOp.trim()) return setSaveError('Falta la orden de OP.');
    if (!form.fecha) return setSaveError('Falta la fecha.');
    if (!form.turno) return setSaveError('Selecciona el turno.');
    if (!form.operador) return setSaveError('Selecciona el operador.');
    if (!form.maquina) return setSaveError('Falta la maquina (busca la OP o selecciona a mano).');
    if (!form.codBotella.trim()) return setSaveError('Falta el codigo de botella.');
    if (filasCajaCalc.length > 0 && !codPreforma.trim()) {
      return setSaveError('No se pudo determinar el codigo de preforma. Completa el codigo de botella (o la OP) antes de registrar el consumo de preformas.');
    }
    for (const f of filasCajaCalc) {
      if (!f.numCaja.trim()) return setSaveError('Cada fila de consumo de preformas necesita un numero de caja.');
      if (f.esNueva && (Number(f.saldoAnterior) || 0) <= 0) {
        return setSaveError(`La caja nueva "${f.numCaja}" necesita una cantidad inicial (saldo anterior) mayor a 0.`);
      }
      if (f.estado === 'cambio_caja' && (Number(f.cantidadIrregular) || 0) <= 0) {
        return setSaveError(`La caja "${f.numCaja}" marcada como Cambio de caja necesita la cantidad usada.`);
      }
    }
    if (finProduccionSaldo && (Number(saldoGenerado) || 0) <= 0) {
      return setSaveError('Indica la cantidad de saldo generado (mayor a 0).');
    }

    setIsSaving(true);
    try {
      const saved = await localApi.saveReporteDiario({
        id: editingId || undefined,
        ordenOp: form.ordenOp,
        fecha: form.fecha,
        turno: form.turno,
        operador: form.operador,
        ayudante: ayudantes.join(', '),
        maquina: form.maquina,
        codBotella: form.codBotella,
        etiqIni: form.etiqIni,
        etiqFin: form.etiqFin,
        numBolsas,
        cantPorBolsa: form.cantPorBolsa,
        botBuenas,
        mermaBot: form.mermaBot,
        mermaPref: form.mermaPref,
        mermaTotal,
        totalProduccion,
        horaInicio: form.horaInicio,
        horaFin: form.horaFin,
        observaciones: form.observaciones,
        minutosDisponibles,
        paradasProgramadas: paradasProg,
        paradasNoProgramadas: paradasNoProg,
        tiempoCambioMolde,
        cmIni: cmActivo ? cmIni : '',
        cmFin: cmActivo ? cmFin : '',
        consumosPreforma: filasCajaCalc.map((f) => ({
          cajaId: f.cajaId,
          codPreforma,
          numCaja: f.numCaja.trim(),
          op: f.op.trim(),
          resina: f.resina.trim(),
          saldoAnterior: Number(f.saldoAnterior) || 0,
          cantidad: f.usada, // consumo normal, neto de las preformas observadas de esa caja
          estado: f.estado,
          cantidadIrregular: Number(f.cantidadIrregular) || 0,
          // Las preformas observadas de esta caja van aparte: restan del
          // "Total usado" de arriba, pero descuentan la caja como su propio
          // movimiento (con su descripcion), visible en Almacen Produccion.
          defectos: defectos
            .filter((d) => d.filaCajaKey === f.key)
            .map((d) => ({ cantidad: Number(d.cantidad) || 0, descripcion: d.descripcion.trim() })),
        })),
        finProduccionSaldo,
        finProduccionPedidoEspecial,
        saldoGenerado: finProduccionSaldo ? (Number(saldoGenerado) || 0) : 0,
        cantidadExtraPedido: finProduccionPedidoEspecial ? (Number(cantidadExtraPedido) || 0) : 0,
        consumosSaldo: consumosSaldo.map(({ saldoId, cantidad }) => ({ saldoId, cantidad })),
      });
      if (editingId) {
        setReportes((current) => current.map((r) => (r.id === saved.id ? saved : r)));
        setSaveMessage(`Reporte de la OP ${saved.ordenOp} actualizado.`);
      } else {
        setReportes((current) => [saved, ...current]);
        setSaveMessage(`Reporte de la OP ${saved.ordenOp} guardado.`);
      }
      resetForm();
    } catch (error) {
      setSaveError(error.message || 'No se pudo guardar el reporte.');
    } finally {
      setIsSaving(false);
    }
  };

  const eliminar = async (id) => {
    try {
      await localApi.deleteReporteDiario(id);
      setReportes((current) => current.filter((r) => r.id !== id));
      if (editingId === id) resetForm();
    } catch {
      // El usuario puede reintentar.
    }
  };

  // Validacion de supervisor: un reporte nuevo queda 'pendiente' y recien
  // pasa a Historial cuando alguien lo valida aca. Si se rechaza, el motivo
  // queda a la vista en la lista de rechazados (no se borra el reporte).
  const validarReporte = async (id) => {
    setProcesandoValidacionId(id);
    try {
      const actualizado = await localApi.validarReporteDiario(id);
      setReportes((current) => current.map((r) => (r.id === id ? actualizado : r)));
    } catch (error) {
      window.alert(`No se pudo validar el reporte: ${error.message || error}`);
    } finally {
      setProcesandoValidacionId(null);
    }
  };
  const rechazarReporte = async (id, motivo) => {
    setProcesandoValidacionId(id);
    try {
      const actualizado = await localApi.rechazarReporteDiario(id, motivo);
      setReportes((current) => current.map((r) => (r.id === id ? actualizado : r)));
    } catch (error) {
      window.alert(`No se pudo rechazar el reporte: ${error.message || error}`);
    } finally {
      setProcesandoValidacionId(null);
    }
  };
  const marcarPendienteReporte = async (id) => {
    setProcesandoValidacionId(id);
    try {
      const actualizado = await localApi.marcarPendienteReporteDiario(id);
      setReportes((current) => current.map((r) => (r.id === id ? actualizado : r)));
    } catch (error) {
      window.alert(`No se pudo reabrir el reporte: ${error.message || error}`);
    } finally {
      setProcesandoValidacionId(null);
    }
  };

  // Carga un reporte ya guardado en el formulario para editarlo. Ojo con
  // "Consumo de preformas": la cantidad que se muestra (saldoAnterior) tiene
  // que ser la que quedo registrada la primera vez que se lleno esa caja en
  // ESTE reporte -- no la que tiene la caja ahora (que ya puede estar mas
  // baja por consumos posteriores). Por eso se arma directo desde
  // r.consumosPreforma (dato historico ya guardado) y nunca se llama a
  // resolverCajaFila(), que es la funcion que recalcula contra el catalogo
  // en vivo (cajasDisponibles) -- esa solo se dispara si el usuario toca a
  // mano el numero de caja / OP durante la edicion.
  const cargarParaEditar = (r) => {
    setSaveError('');
    setSaveMessage('');
    setEditingId(r.id);
    setForm({
      ordenOp: r.ordenOp,
      fecha: r.fecha,
      turno: r.turno,
      operador: r.operador,
      maquina: r.maquina,
      codBotella: r.codBotella,
      etiqIni: r.etiqIni,
      etiqFin: r.etiqFin,
      cantPorBolsa: r.cantPorBolsa,
      mermaBot: r.mermaBot,
      mermaPref: r.mermaPref,
      horaInicio: r.horaInicio,
      horaFin: r.horaFin,
      observaciones: r.observaciones || '',
    });
    setAyudantes(r.ayudante ? r.ayudante.split(',').map((a) => a.trim()).filter(Boolean) : []);
    setOpStatus('idle');
    setOpMessage('');

    setParadasProg(r.paradasProgramadas || []);
    setParadasNoProg(r.paradasNoProgramadas || []);
    setNuevaParadaProg({ horaInicio: '', horaFin: '', detalle: '' });
    setNuevaParadaNoProg({ horaInicio: '', horaFin: '', detalle: '' });

    setCmActivo((Number(r.tiempoCambioMolde) || 0) > 0);
    setCmIni(r.cmIni || '');
    setCmFin(r.cmFin || '');
    setCmMinutosFallback(Number(r.tiempoCambioMolde) || 0);

    const codPref = r.consumosPreforma?.[0]?.codPreforma || '';
    setCodPreforma(codPref);

    const filas = (r.consumosPreforma || []).map((c) => ({
      key: `caja-${c.cajaId ?? c.id}-${Math.random()}`,
      numCaja: c.numCaja || '',
      op: c.op || '',
      resina: c.resina || '',
      saldoAnterior: Number(c.saldoAnterior) || 0,
      cajaId: c.cajaId || null,
      esNueva: false,
      estado: c.estado || 'ninguno',
      cantidadIrregular: c.cantidadIrregular ? String(c.cantidadIrregular) : '',
    }));
    // Una caja que solo tuvo preformas observadas (sin consumo normal) no
    // aparece en consumosPreforma -- se agrega aparte para no perder el
    // defecto que le apunta.
    const cajaIdsPresentes = new Set(filas.map((f) => f.cajaId).filter(Boolean));
    for (const d of r.defectosPreforma || []) {
      if (d.cajaId && !cajaIdsPresentes.has(d.cajaId)) {
        cajaIdsPresentes.add(d.cajaId);
        filas.push({
          key: `caja-def-${d.cajaId}-${Math.random()}`,
          numCaja: d.numCaja || '', op: d.op || '', resina: '',
          saldoAnterior: 0, cajaId: d.cajaId, esNueva: false,
          estado: 'ninguno', cantidadIrregular: '',
        });
      }
    }
    setFilasCaja(filas);

    const defectosCargados = [];
    for (const d of r.defectosPreforma || []) {
      const fila = filas.find((f) => f.cajaId === d.cajaId);
      if (!fila) continue;
      defectosCargados.push({
        key: `def-${d.id ?? Math.random()}`,
        filaCajaKey: fila.key,
        cantidad: d.cantidad,
        descripcion: d.descripcion || '',
      });
    }
    setDefectos(defectosCargados);
    setNuevoDefecto({ filaCajaKey: '', cantidad: '', descripcion: '' });

    setFinProduccionSaldo(!!r.finProduccionSaldo);
    setFinProduccionPedidoEspecial(!!r.finProduccionPedidoEspecial);
    setSaldoGenerado(r.finProduccionSaldo ? String(r.saldoGenerado || '') : '');
    setCantidadExtraPedido(r.finProduccionPedidoEspecial ? String(r.cantidadExtraPedido || '') : '');
    setConsumosSaldo((r.saldoUsado || []).map((s) => ({ key: `saldo-${s.id ?? Math.random()}`, saldoId: s.saldoId, cantidad: s.cantidad })));
    setNuevoConsumoSaldo({ saldoId: '', cantidad: '' });

    cargarInfoBotella(r.maquina, r.codBotella);
    setSubView('nuevo');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const exportarReportesExcel = async () => {
    if (reportes.length === 0) return;
    const texto = (fn) => (r) => ({ value: fn(r) ?? '', type: String });
    const columns = [
      { header: 'OP', cell: texto((r) => r.ordenOp) },
      { header: 'Fecha', cell: texto((r) => r.fecha) },
      { header: 'Turno', cell: texto((r) => r.turno) },
      { header: 'Operador', cell: texto((r) => r.operador) },
      { header: 'Ayudante', cell: texto((r) => r.ayudante || '') },
      { header: 'Maquina', cell: texto((r) => r.maquina) },
      { header: 'Cod. botella', cell: texto((r) => r.codBotella) },
      { header: 'Etiq. ini', cell: texto((r) => String(r.etiqIni ?? '')) },
      { header: 'Etiq. fin', cell: texto((r) => String(r.etiqFin ?? '')) },
      { header: 'Bolsas', cell: texto((r) => String(r.numBolsas ?? '')) },
      { header: 'Bot/bolsa', cell: texto((r) => String(r.cantPorBolsa ?? '')) },
      { header: 'Botellas buenas', cell: texto((r) => String(r.botBuenas ?? '')) },
      { header: 'Merma botellas', cell: texto((r) => String(r.mermaBot ?? '')) },
      { header: 'Merma preformas', cell: texto((r) => String(r.mermaPref ?? '')) },
      { header: 'Merma total', cell: texto((r) => String(r.mermaTotal ?? '')) },
      { header: 'Total produccion', cell: texto((r) => String(r.totalProduccion ?? '')) },
      { header: 'Hora inicio', cell: texto((r) => r.horaInicio || '') },
      { header: 'Hora fin', cell: texto((r) => r.horaFin || '') },
      { header: 'Tiempo disponible (min)', cell: texto((r) => String(r.minutosDisponibles ?? '')) },
      { header: 'Paradas programadas (min)', cell: texto((r) => String((r.paradasProgramadas || []).reduce((s, p) => s + (Number(p.minutos) || 0), 0))) },
      { header: 'Paradas programadas (detalle)', width: 40, cell: texto((r) => textoParadas(r.paradasProgramadas)) },
      { header: 'Paradas no programadas (min)', cell: texto((r) => String((r.paradasNoProgramadas || []).reduce((s, p) => s + (Number(p.minutos) || 0), 0))) },
      { header: 'Paradas no programadas (detalle)', width: 40, cell: texto((r) => textoParadas(r.paradasNoProgramadas)) },
      { header: 'Cambio de molde (min)', cell: texto((r) => String(r.tiempoCambioMolde ?? '')) },
      { header: 'Cambio de molde (hora)', cell: texto((r) => (r.cmIni && r.cmFin ? `${r.cmIni}-${r.cmFin}` : '')) },
      { header: 'Observaciones', width: 40, cell: texto((r) => r.observaciones || '') },
      { header: 'Consumo de preformas', width: 45, cell: texto((r) => textoConsumoPreforma(r.consumosPreforma)) },
      { header: 'Preforma observada', width: 40, cell: texto((r) => textoDefectosPreforma(r.defectosPreforma)) },
      { header: 'Fin produccion con saldo', cell: texto((r) => (r.finProduccionSaldo ? `Si (${r.saldoGenerado || 0}u)` : 'No')) },
      { header: 'Fin produccion pedido especial', cell: texto((r) => (r.finProduccionPedidoEspecial ? `Si (+${r.cantidadExtraPedido || 0}u)` : 'No')) },
      { header: 'Saldo de botella usado', width: 30, cell: texto((r) => textoSaldoUsado(r.saldoUsado)) },
      { header: 'Creado', cell: texto((r) => r.createdAt || '') },
    ];
    await writeXlsxFile(reportes, { columns, sheet: 'Reportes' }).toFile(`reportes-diarios-${todayIso()}.xlsx`);
  };

  // PDF individual de un reporte, con el mismo formato que la hoja de papel
  // "PRODUCCION DE BOTELLAS SOPLADO" (REG-PRS-CB-01) que ya usa la planta.
  // Cliente/Volumen/Gramaje/Color/Unidades por bolsa no se guardan en el
  // reporte -- se buscan en el catalogo de botellas (Productos e Insumos)
  // de esa maquina, igual que hace cargarInfoBotella() para la descripcion.
  const exportarReportePdfIndividual = async (r) => {
    setPdfExportingId(r.id);
    try {
      let botellaInfo = {};
      try {
        const catalogo = await localApi.getBotellasCatalogo(r.maquina);
        const match = catalogo.find((b) => b.codBotella.toLowerCase() === (r.codBotella || '').trim().toLowerCase());
        if (match) botellaInfo = match;
      } catch {
        botellaInfo = {};
      }

      const logoDataUrl = await cargarLogoReportePdf();
      const doc = generarReportePdf(r, botellaInfo, logoDataUrl);
      const [yy, mm, dd] = String(r.fecha || '').split('-');
      doc.save(`Reporte #${r.id} - ${dd}_${mm}_${yy}.pdf`);
    } catch (error) {
      console.error('No se pudo generar el PDF del reporte:', error);
      window.alert(`No se pudo generar el PDF: ${error?.message || error}`);
    } finally {
      setPdfExportingId(null);
    }
  };

  if (loadError) {
    return (
      <section className="etiquetas-section">
        <div className="etiquetas-intro-banner etiquetas-error-banner">
          <strong>No se pudo conectar con el servidor local.</strong> {loadError}
        </div>
      </section>
    );
  }

  return (
    <section className="etiquetas-section">
      <div className="etiquetas-intro-banner">
        Reporte diario portado de DIGITALIZACION, con las 14 columnas pedidas (sin el flujo de
        aprobacion todavia). Al escribir la OP con la letra de maquina (ej. <strong>088T</strong>)
        se busca en Etiquetas y se autocompleta Maquina y Codigo de botella; con eso tambien se
        resuelve la preforma para la seccion "Consumo de preformas" de abajo, que descuenta de las
        cajas cargadas en Almacen Produccion al guardar el reporte.
      </div>

      <div className="planificacion-subtabs">
        <button
          type="button" className={`secondary-action ${subView === 'nuevo' ? 'active-option' : ''}`}
          onClick={() => setSubView('nuevo')}
        >
          Nuevo reporte
        </button>
        <button
          type="button" className={`secondary-action ${subView === 'validacion' ? 'active-option' : ''}`}
          onClick={() => setSubView('validacion')}
        >
          Validacion{reportesPendientesCount > 0 ? ` (${reportesPendientesCount})` : ''}
        </button>
        <button
          type="button" className={`secondary-action ${subView === 'historial' ? 'active-option' : ''}`}
          onClick={() => setSubView('historial')}
        >
          Historial
        </button>
        <button
          type="button" className={`secondary-action ${subView === 'produccion' ? 'active-option' : ''}`}
          onClick={() => setSubView('produccion')}
        >
          Produccion
        </button>
        <button
          type="button" className={`secondary-action ${subView === 'mermas' ? 'active-option' : ''}`}
          onClick={() => setSubView('mermas')}
        >
          Mermas
        </button>
      </div>

      {subView === 'validacion' && (
        <ReportesValidacionVista
          reportes={reportes}
          loaded={loaded}
          procesandoId={procesandoValidacionId}
          validarReporte={validarReporte}
          rechazarReporte={rechazarReporte}
          marcarPendienteReporte={marcarPendienteReporte}
          cargarParaEditar={cargarParaEditar}
        />
      )}
      {subView === 'historial' && (
        <ReportesHistorialVista
          reportes={reportes}
          machines={machines}
          loaded={loaded}
          exportarReportesExcel={exportarReportesExcel}
          exportarReportePdfIndividual={exportarReportePdfIndividual}
          pdfExportingId={pdfExportingId}
          cargarParaEditar={cargarParaEditar}
          eliminar={eliminar}
        />
      )}
      {subView === 'produccion' && <ReportesProduccionVista reportes={reportes} machines={machines} />}
      {subView === 'mermas' && <ReportesMermasVista reportes={reportes} machines={machines} />}

      {subView === 'nuevo' && (
      <>
      {editingId && (
        <div className="etiquetas-intro-banner etiquetas-op-status-warn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <span>Editando el reporte #{editingId}. Al guardar se actualiza este mismo reporte (no se crea uno nuevo).</span>
          <button type="button" className="secondary-action" onClick={resetForm}>Cancelar edicion</button>
        </div>
      )}
      <form className="panel etiquetas-form" onSubmit={guardar}>
        <div className="section-heading">
          <div><span>Reportes</span><h2>Identificacion</h2></div>
        </div>

        <div className="form-grid etiquetas-form-grid">
          <label className="field">
            <span>Orden de OP</span>
            <input
              type="text"
              placeholder="Ej: 088T"
              value={form.ordenOp}
              onChange={(e) => { updateField('ordenOp', e.target.value); setOpStatus('idle'); }}
              onBlur={buscarPorOp}
            />
            {opStatus === 'loading' && <span className="etiquetas-op-status">Buscando...</span>}
            {opStatus === 'found' && <span className="etiquetas-op-status etiquetas-op-status-ok">{opMessage}</span>}
            {opStatus === 'notfound' && <span className="etiquetas-op-status etiquetas-op-status-warn">{opMessage}</span>}
            {opStatus === 'error' && <span className="etiquetas-op-status etiquetas-op-status-warn">{opMessage}</span>}
          </label>
          <label className="field">
            <span>Fecha</span>
            <input type="date" value={form.fecha} onChange={(e) => updateField('fecha', e.target.value)} />
          </label>
          <label className="field">
            <span>Turno</span>
            <select value={form.turno} onChange={(e) => updateField('turno', e.target.value)}>
              <option value="">Seleccionar turno</option>
              {TURNOS_REPORTE.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Operador</span>
            <select value={form.operador} onChange={(e) => updateField('operador', e.target.value)}>
              <option value="">Seleccionar</option>
              {personal.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Maquina</span>
            <select
              value={form.maquina}
              onChange={(e) => {
                updateField('maquina', e.target.value);
                if (form.codBotella.trim()) cargarInfoBotella(e.target.value, form.codBotella, { permitirAutoPreforma: true });
              }}
            >
              <option value="">Seleccionar</option>
              {machines.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Codigo de botella</span>
            <input
              type="text"
              value={form.codBotella}
              onChange={(e) => { updateField('codBotella', e.target.value); setCodPreforma(''); setBotellaDescripcion(''); }}
              onBlur={() => cargarInfoBotella(form.maquina, form.codBotella, { permitirAutoPreforma: true })}
            />
          </label>
          <label className="field">
            <span>Descripcion de la botella</span>
            <input
              type="text"
              readOnly
              placeholder="Se completa con el codigo de botella"
              value={botellaDescripcion}
            />
          </label>
          <label className="field">
            <span>Preforma vinculada</span>
            <input
              type="text"
              readOnly
              placeholder="Se completa con el codigo de botella"
              value={codPreforma ? `${codPreforma}${preformaDescripcion ? ' — ' + preformaDescripcion : ''}` : ''}
            />
          </label>
        </div>

        <div className="sec-title">Ayudantes</div>
        {ayudantes.length > 0 && (
          <div className="etiquetas-chips">
            {ayudantes.map((a) => (
              <span key={a} className="etiquetas-chip">
                {a}
                <button type="button" onClick={() => quitarAyudante(a)}>x</button>
              </span>
            ))}
          </div>
        )}
        <div className="planificacion-mant-form" style={{ gridTemplateColumns: '1fr auto' }}>
          <select value={ayudanteSel} onChange={(e) => setAyudanteSel(e.target.value)}>
            <option value="">Agregar ayudante...</option>
            {personal.filter((p) => !ayudantes.includes(p.nombre)).map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
          </select>
          <button type="button" className="secondary-action" onClick={agregarAyudante}>+ Agregar</button>
        </div>

        <div className="section-heading" style={{ marginTop: 24 }}>
          <div><span>Reportes</span><h2>Produccion</h2></div>
        </div>
        <div className="form-grid etiquetas-form-grid">
          <label className="field">
            <span>Inicio de etiqueta</span>
            <input type="number" min="0" value={form.etiqIni} onChange={(e) => updateField('etiqIni', Number(e.target.value) || 0)} />
          </label>
          <label className="field">
            <span>Fin de etiqueta</span>
            <input type="number" min="0" value={form.etiqFin} onChange={(e) => updateField('etiqFin', Number(e.target.value) || 0)} />
          </label>
          <label className="field">
            <span>Numero de bolsas <small>(fin - inicio + 1)</small></span>
            <input type="number" value={numBolsas} readOnly />
          </label>
          <label className="field">
            <span>Cantidad de botellas por bolsa</span>
            <input type="number" min="0" value={form.cantPorBolsa} onChange={(e) => updateField('cantPorBolsa', Number(e.target.value) || 0)} />
          </label>
        </div>
        <div className="form-grid etiquetas-form-grid">
          <label className="field">
            <span>Botellas buenas <small>{finProduccionPedidoEspecial ? '(bolsas x cant/bolsa + cantidad extra)' : '(bolsas x cant/bolsa)'}</small></span>
            <input type="number" value={botBuenas} readOnly />
          </label>
          <label className="field">
            <span>Merma botellas</span>
            <input type="number" min="0" value={form.mermaBot} onChange={(e) => updateField('mermaBot', Number(e.target.value) || 0)} />
          </label>
          <label className="field">
            <span>Merma preformas</span>
            <input type="number" min="0" value={form.mermaPref} onChange={(e) => updateField('mermaPref', Number(e.target.value) || 0)} />
          </label>
          <label className="field">
            <span>Merma total <small>(bot. + pref.)</small></span>
            <input type="number" value={mermaTotal} readOnly />
          </label>
        </div>
        <div className="form-grid etiquetas-form-grid">
          <label className="field">
            <span>Total produccion <small>(merma total + buenas + saldo generado - saldo usado)</small></span>
            <input type="number" value={totalProduccion} readOnly />
          </label>
        </div>

        <div className="form-grid etiquetas-form-grid">
          <label className="planificacion-checkbox">
            <input
              type="checkbox"
              checked={finProduccionSaldo}
              onChange={(e) => { setFinProduccionSaldo(e.target.checked); if (!e.target.checked) setSaldoGenerado(''); }}
            />
            Fin de produccion con saldo
          </label>
          <label className="planificacion-checkbox">
            <input
              type="checkbox"
              checked={finProduccionPedidoEspecial}
              onChange={(e) => { setFinProduccionPedidoEspecial(e.target.checked); if (!e.target.checked) setCantidadExtraPedido(''); }}
            />
            Fin de produccion pedido especial
          </label>
        </div>
        {finProduccionSaldo && (
          <div className="form-grid etiquetas-form-grid">
            <label className="field">
              <span>Saldo generado <small>(botellas de mas -- quedan guardadas en Almacen Produccion)</small></span>
              <input type="number" min="1" value={saldoGenerado} onChange={(e) => setSaldoGenerado(e.target.value)} />
            </label>
          </div>
        )}
        {finProduccionPedidoEspecial && (
          <div className="form-grid etiquetas-form-grid">
            <label className="field">
              <span>Cantidad extra <small>(botellas de mas que no completan una bolsa -- se suman a Botellas buenas)</small></span>
              <input type="number" min="1" value={cantidadExtraPedido} onChange={(e) => setCantidadExtraPedido(e.target.value)} />
            </label>
          </div>
        )}

        <div className="sec-title" style={{ marginTop: 18 }}>Usar saldo de botella</div>
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: -4, marginBottom: 8 }}>
          Botellas ya producidas en un reporte anterior de esta misma botella (saldo generado). Usarlas aca
          resta del Total Produccion que hay que cubrir con preformas nuevas.
        </p>
        {!form.codBotella.trim() ? (
          <p className="etiquetas-empty">Completa el Codigo de botella en Identificacion para ver el saldo disponible.</p>
        ) : saldoDisponible.length === 0 ? (
          <p className="etiquetas-empty">No hay saldo disponible para "{form.codBotella}" en Almacen Produccion.</p>
        ) : (
          <>
            {consumosSaldo.length > 0 && (
              <ul className="planificacion-mant-list">
                {consumosSaldo.map((c) => {
                  const lote = saldoDisponible.find((s) => s.id === c.saldoId);
                  return (
                    <li key={c.key}>
                      <span>Saldo del {lote?.fecha || '?'} — {c.cantidad.toLocaleString()} u</span>
                      <button type="button" className="etiquetas-delete-button" onClick={() => quitarConsumoSaldo(c.key)}>Quitar</button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="planificacion-mant-form" style={{ gridTemplateColumns: '1fr 120px auto' }}>
              <select value={nuevoConsumoSaldo.saldoId} onChange={(e) => setNuevoConsumoSaldo((c) => ({ ...c, saldoId: e.target.value }))}>
                <option value="">Seleccionar saldo...</option>
                {saldoDisponible.map((s) => {
                  const yaUsado = consumosSaldo.filter((c) => c.saldoId === s.id).reduce((sum, c) => sum + c.cantidad, 0);
                  return (
                    <option key={s.id} value={s.id}>
                      {s.fecha} — saldo {(s.cantidadActual - yaUsado).toLocaleString()}
                    </option>
                  );
                })}
              </select>
              <input
                type="number" min="1" placeholder="Cantidad"
                value={nuevoConsumoSaldo.cantidad}
                onChange={(e) => setNuevoConsumoSaldo((c) => ({ ...c, cantidad: e.target.value }))}
              />
              <button type="button" className="secondary-action" onClick={agregarConsumoSaldo}>+ Agregar</button>
            </div>
            <p className="etiquetas-parada-total">Total usado de saldo: {totalSaldoUsado.toLocaleString()} u</p>
          </>
        )}

        <div className="section-heading" style={{ marginTop: 24 }}>
          <div><span>Reportes</span><h2>Consumo de preformas</h2></div>
        </div>
        <p className="etiquetas-op-status" style={{ marginBottom: 10 }}>
          {codPreforma
            ? <>Preforma resuelta: <strong>{codPreforma}</strong> (segun el codigo de botella / OP de arriba).</>
            : 'Aun no se resolvio el codigo de preforma -- completa Codigo de botella (o la OP) en Identificacion.'}
        </p>

        {filasCaja.length === 0 ? (
          <p className="etiquetas-empty">Sin cajas registradas para este reporte todavia.</p>
        ) : (
          <div className="etiquetas-table-wrap">
            <table className="etiquetas-table">
              <thead>
                <tr>
                  <th>Turno</th><th>Cod. preforma</th><th>N. caja</th><th>OP</th><th>Resina</th>
                  <th>Saldo anterior</th><th>Total usado</th><th>Saldo actual</th><th>Estado</th>
                  <th>Cant. irregular</th><th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {filasCajaCalc.map((f, i) => (
                  <tr key={f.key}>
                    <td>{form.turno || '-'}</td>
                    <td>{codPreforma || '-'}</td>
                    <td>
                      <input
                        style={{ width: 100 }}
                        placeholder="Nro caja"
                        value={f.numCaja}
                        onChange={(e) => actualizarFilaCaja(i, { numCaja: e.target.value })}
                        onBlur={() => resolverCajaFila(i)}
                      />
                      {f.esNueva && (
                        <span className="etiquetas-op-status-warn" style={{ display: 'block', fontSize: '0.72rem' }}>
                          Caja nueva
                        </span>
                      )}
                    </td>
                    <td>
                      <input
                        style={{ width: 90 }}
                        placeholder="OP"
                        value={f.op}
                        onChange={(e) => actualizarFilaCaja(i, { op: e.target.value })}
                        onBlur={() => resolverCajaFila(i)}
                      />
                    </td>
                    <td>
                      <input
                        style={{ width: 100 }}
                        value={f.resina}
                        onChange={(e) => actualizarFilaCaja(i, { resina: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number" min="0" style={{ width: 90 }}
                        value={f.saldoAnterior}
                        readOnly={!f.esNueva}
                        title={f.esNueva ? 'Cantidad inicial de la caja nueva (requerido)' : 'Cantidad actual de la caja (automatico)'}
                        onChange={(e) => actualizarFilaCaja(i, { saldoAnterior: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      {f.usada.toLocaleString()}
                      {f.prefObs > 0 && (
                        <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 400, color: 'var(--muted)' }}>
                          (+{f.prefObs.toLocaleString()} observada aparte, compensada en la siguiente caja)
                        </span>
                      )}
                    </td>
                    <td style={{ color: f.saldoActual < 0 ? '#B85450' : undefined, fontWeight: f.saldoActual < 0 ? 700 : undefined }}>
                      {f.saldoActual.toLocaleString()}
                    </td>
                    <td>
                      <select
                        value={f.estado}
                        onChange={(e) => actualizarFilaCaja(i, {
                          estado: e.target.value,
                          cantidadIrregular: e.target.value === 'ninguno' ? '' : f.cantidadIrregular,
                        })}
                      >
                        <option value="ninguno">Ninguno</option>
                        <option value="faltante">Faltante</option>
                        <option value="sobrante">Sobrante</option>
                        <option value="cambio_caja">Cambio de caja</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number" min="0" style={{ width: 90 }}
                        placeholder={f.estado === 'cambio_caja' ? 'Usadas' : ''}
                        disabled={f.estado === 'ninguno'}
                        value={f.cantidadIrregular}
                        onChange={(e) => actualizarFilaCaja(i, { cantidadIrregular: e.target.value })}
                      />
                    </td>
                    <td>
                      <button type="button" className="etiquetas-delete-button" onClick={() => eliminarFilaCaja(i)}>Quitar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="save-row" style={{ marginTop: 8 }}>
          <button type="button" className="secondary-action" onClick={agregarFilaCaja}>+ Agregar caja</button>
          {filasCaja.length > 0 && (
            <span>Total consumido: {totalConsumoPreforma.toLocaleString()} u (Total produccion: {totalProduccion.toLocaleString()} u)</span>
          )}
        </div>

        <div className="sec-title" style={{ marginTop: 18 }}>
          Preformas observadas
          {totalPreformasObservadas > 0 && <span style={{ marginLeft: 8, fontWeight: 700 }}>Total: {totalPreformasObservadas.toLocaleString()}</span>}
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: -4, marginBottom: 8 }}>
          Preformas que si se sacaron de una caja pero no se convirtieron en botella (defecto/descarte). No cuentan
          como Merma botella ni Merma preforma, ni como produccion -- solo se apartan. La caja elegida igual las
          pierde (queda registrado aparte, visible en el historial de esa caja en Almacen Produccion), y como esa
          cantidad no cuenta para el Total Produccion, se compensa consumiendo de mas en la SIGUIENTE caja de la
          lista -- asi el Total usado (suma de todas las cajas) siempre da igual al Total Produccion.
        </p>
        {filasCaja.length === 0 ? (
          <p className="etiquetas-empty">Agrega primero al menos una caja arriba para poder registrar preformas observadas.</p>
        ) : (
          <>
            {defectos.length > 0 && (
              <ul className="planificacion-mant-list">
                {defectos.map((d) => {
                  const fila = filasCaja.find((f) => f.key === d.filaCajaKey);
                  return (
                    <li key={d.key}>
                      <span>Caja {fila?.numCaja || '?'} — {d.cantidad.toLocaleString()} u — {d.descripcion}</span>
                      <button type="button" className="etiquetas-delete-button" onClick={() => quitarDefecto(d.key)}>Quitar</button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="planificacion-mant-form" style={{ gridTemplateColumns: '140px 90px 1fr auto' }}>
              <select
                value={nuevoDefecto.filaCajaKey}
                onChange={(e) => setNuevoDefecto((c) => ({ ...c, filaCajaKey: e.target.value }))}
              >
                <option value="">Caja...</option>
                {filasCaja.map((f) => (
                  <option key={f.key} value={f.key}>Caja {f.numCaja || '(sin numero)'}</option>
                ))}
              </select>
              <input
                type="number" min="1" placeholder="Cantidad"
                value={nuevoDefecto.cantidad}
                onChange={(e) => setNuevoDefecto((c) => ({ ...c, cantidad: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarDefecto(); } }}
              />
              <input
                type="text" placeholder="Descripcion del defecto"
                value={nuevoDefecto.descripcion}
                onChange={(e) => setNuevoDefecto((c) => ({ ...c, descripcion: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarDefecto(); } }}
              />
              <button type="button" className="secondary-action" onClick={agregarDefecto}>+ Agregar</button>
            </div>
          </>
        )}

        <div className="section-heading" style={{ marginTop: 24 }}>
          <div><span>Reportes</span><h2>Tiempos</h2></div>
        </div>
        <div className="form-grid etiquetas-form-grid">
          <label className="field">
            <span>Hora inicio</span>
            <input type="time" value={form.horaInicio} onChange={(e) => updateField('horaInicio', e.target.value)} />
          </label>
          <label className="field">
            <span>Hora fin</span>
            <input type="time" value={form.horaFin} onChange={(e) => updateField('horaFin', e.target.value)} />
          </label>
          <label className="field">
            <span>Tiempo disponible (min)</span>
            <input type="number" value={minutosDisponibles} readOnly />
          </label>
        </div>

        <div className="sec-title">Parada programada (arranque)</div>
        {paradasProg.length > 0 && (
          <ul className="planificacion-mant-list">
            {paradasProg.map((p, i) => (
              <li key={i}>
                <span>{p.horaInicio && p.horaFin ? `${p.horaInicio}–${p.horaFin} · ` : ''}{p.detalle} — {p.minutos} min</span>
                <button type="button" className="etiquetas-delete-button" onClick={() => quitarParada('prog', i)}>Quitar</button>
              </li>
            ))}
          </ul>
        )}
        <div className="planificacion-mant-form" style={{ gridTemplateColumns: '110px 110px 80px 1fr auto' }}>
          <input type="time" value={nuevaParadaProg.horaInicio} onChange={(e) => setNuevaParadaProg((c) => ({ ...c, horaInicio: e.target.value }))} />
          <input type="time" value={nuevaParadaProg.horaFin} onChange={(e) => setNuevaParadaProg((c) => ({ ...c, horaFin: e.target.value }))} />
          <input type="number" value={minutosNuevaParadaProg} readOnly placeholder="Min" />
          <input type="text" placeholder="Descripción" value={nuevaParadaProg.detalle} onChange={(e) => setNuevaParadaProg((c) => ({ ...c, detalle: e.target.value }))} />
          <button type="button" className="secondary-action" onClick={() => agregarParada('prog')}>+ Agregar</button>
        </div>
        <p className="etiquetas-parada-total">Total: {totalParadasProg} min</p>

        <div className="sec-title">Parada no programada (averias)</div>
        {paradasNoProg.length > 0 && (
          <ul className="planificacion-mant-list">
            {paradasNoProg.map((p, i) => (
              <li key={i}>
                <span>{p.horaInicio && p.horaFin ? `${p.horaInicio}–${p.horaFin} · ` : ''}{p.detalle} — {p.minutos} min</span>
                <button type="button" className="etiquetas-delete-button" onClick={() => quitarParada('noprog', i)}>Quitar</button>
              </li>
            ))}
          </ul>
        )}
        <div className="planificacion-mant-form" style={{ gridTemplateColumns: '110px 110px 80px 1fr auto' }}>
          <input type="time" value={nuevaParadaNoProg.horaInicio} onChange={(e) => setNuevaParadaNoProg((c) => ({ ...c, horaInicio: e.target.value }))} />
          <input type="time" value={nuevaParadaNoProg.horaFin} onChange={(e) => setNuevaParadaNoProg((c) => ({ ...c, horaFin: e.target.value }))} />
          <input type="number" value={minutosNuevaParadaNoProg} readOnly placeholder="Min" />
          <input type="text" placeholder="Descripción" value={nuevaParadaNoProg.detalle} onChange={(e) => setNuevaParadaNoProg((c) => ({ ...c, detalle: e.target.value }))} />
          <button type="button" className="secondary-action" onClick={() => agregarParada('noprog')}>+ Agregar</button>
        </div>
        <p className="etiquetas-parada-total">Total: {totalParadasNoProg} min</p>

        <div className="sec-title">Cambio de molde</div>
        <label className="planificacion-checkbox" style={{ marginBottom: 10 }}>
          <input type="checkbox" checked={cmActivo} onChange={(e) => setCmActivo(e.target.checked)} />
          Registrar tiempo de cambio de molde
        </label>
        {cmActivo && (
          <div className="form-grid etiquetas-form-grid">
            <label className="field">
              <span>Inicio</span>
              <input type="time" value={cmIni} onChange={(e) => setCmIni(e.target.value)} />
            </label>
            <label className="field">
              <span>Fin</span>
              <input type="time" value={cmFin} onChange={(e) => setCmFin(e.target.value)} />
            </label>
            <label className="field">
              <span>Minutos</span>
              <input type="number" value={tiempoCambioMolde} readOnly />
            </label>
          </div>
        )}

        <div className="form-grid etiquetas-form-grid">
          <label className="field field-wide">
            <span>Observaciones</span>
            <textarea
              rows={3}
              placeholder="Notas del turno (opcional)"
              value={form.observaciones}
              onChange={(e) => updateField('observaciones', e.target.value)}
            />
          </label>
        </div>

        <div className="save-row">
          <button type="submit" className="primary-action" disabled={isSaving}>
            {isSaving ? 'Guardando...' : editingId ? 'Actualizar reporte' : 'Guardar reporte'}
          </button>
          <button type="button" className="secondary-action" onClick={resetForm}>{editingId ? 'Cancelar edicion' : 'Limpiar'}</button>
          {saveError && <span className="etiquetas-form-error">{saveError}</span>}
          {!saveError && saveMessage && <span>{saveMessage}</span>}
        </div>
      </form>
      </>
      )}
    </section>
  );
}

const MESES_HISTORIAL = [
  { v: '01', l: 'Enero' }, { v: '02', l: 'Febrero' }, { v: '03', l: 'Marzo' }, { v: '04', l: 'Abril' },
  { v: '05', l: 'Mayo' }, { v: '06', l: 'Junio' }, { v: '07', l: 'Julio' }, { v: '08', l: 'Agosto' },
  { v: '09', l: 'Septiembre' }, { v: '10', l: 'Octubre' }, { v: '11', l: 'Noviembre' }, { v: '12', l: 'Diciembre' },
];
const DIAS_HISTORIAL = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));

// "Historial" -- separado del formulario de carga a pedido del usuario (antes
// convivian en la misma pantalla). Filtros: maquina, año/mes/dia (sacados de
// r.fecha, formato ISO yyyy-mm-dd) y un buscador libre que matchea contra
// codigo de botella U OP (no hace falta elegir cual de los dos).
function ReportesHistorialVista({ reportes, machines, loaded, exportarReportesExcel, exportarReportePdfIndividual, pdfExportingId, cargarParaEditar, eliminar }) {
  const [filtroMaquina, setFiltroMaquina] = useState('');
  const [filtroAnio, setFiltroAnio] = useState('');
  const [filtroMes, setFiltroMes] = useState('');
  const [filtroDia, setFiltroDia] = useState('');
  const [busqueda, setBusqueda] = useState('');

  // Historial = solo lo ya validado por un supervisor -- lo pendiente vive
  // en la pestaña Validacion, y lo rechazado en su lista aparte ahi mismo.
  const reportesValidados = useMemo(() => reportes.filter((r) => (r.estadoValidacion || 'pendiente') === 'validado'), [reportes]);

  const anios = useMemo(() => {
    const set = new Set(reportesValidados.map((r) => (r.fecha || '').split('-')[0]).filter(Boolean));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [reportesValidados]);

  const filtrados = useMemo(() => reportesValidados.filter((r) => {
    if (filtroMaquina && r.maquina !== filtroMaquina) return false;
    const [anio, mes, dia] = (r.fecha || '').split('-');
    if (filtroAnio && anio !== filtroAnio) return false;
    if (filtroMes && mes !== filtroMes) return false;
    if (filtroDia && dia !== filtroDia) return false;
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      const matchBotella = (r.codBotella || '').toLowerCase().includes(q);
      const matchOp = (r.ordenOp || '').toLowerCase().includes(q);
      if (!matchBotella && !matchOp) return false;
    }
    return true;
  }), [reportesValidados, filtroMaquina, filtroAnio, filtroMes, filtroDia, busqueda]);

  const hayFiltros = filtroMaquina || filtroAnio || filtroMes || filtroDia || busqueda.trim();
  const limpiarFiltros = () => { setFiltroMaquina(''); setFiltroAnio(''); setFiltroMes(''); setFiltroDia(''); setBusqueda(''); };

  return (
    <div className="panel etiquetas-history">
      <div className="section-heading">
        <div><span>Reportes</span><h2>Historial ({filtrados.length}{filtrados.length !== reportesValidados.length ? ` de ${reportesValidados.length}` : ''})</h2></div>
        <button type="button" className="secondary-action" disabled={reportes.length === 0} onClick={exportarReportesExcel}>
          Exportar a Excel
        </button>
      </div>
      <p className="etiquetas-op-status" style={{ marginTop: -6, marginBottom: 12 }}>
        Solo se muestran los reportes ya validados por un supervisor. Los pendientes de revision y los rechazados estan en la pestaña "Validacion".
      </p>

      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', marginBottom: 14 }}>
        <label className="field">
          <span>Maquina</span>
          <select value={filtroMaquina} onChange={(e) => setFiltroMaquina(e.target.value)}>
            <option value="">Todas</option>
            {machines.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Año</span>
          <select value={filtroAnio} onChange={(e) => setFiltroAnio(e.target.value)}>
            <option value="">Todos</option>
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Mes</span>
          <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)}>
            <option value="">Todos</option>
            {MESES_HISTORIAL.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Dia</span>
          <select value={filtroDia} onChange={(e) => setFiltroDia(e.target.value)}>
            <option value="">Todos</option>
            {DIAS_HISTORIAL.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Buscar (codigo de botella u OP)</span>
          <input type="text" placeholder="Ej: 46493-100 o 088T" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </label>
      </div>
      {hayFiltros && (
        <div className="save-row" style={{ marginTop: -8, marginBottom: 14 }}>
          <button type="button" className="secondary-action" onClick={limpiarFiltros}>Limpiar filtros</button>
        </div>
      )}

      {!loaded ? <p className="etiquetas-empty">Cargando...</p> : reportesValidados.length === 0 ? (
        <p className="etiquetas-empty">Todavia no hay reportes validados.</p>
      ) : filtrados.length === 0 ? (
        <p className="etiquetas-empty">Ningun reporte coincide con los filtros.</p>
      ) : (
        <div className="etiquetas-table-wrap">
          <table className="etiquetas-table">
            <thead>
              <tr>
                <th>OP</th><th>Fecha</th><th>Turno</th><th>Operador</th><th>Ayudante</th>
                <th>Maquina</th><th>Botella</th><th>Etiq. ini</th><th>Etiq. fin</th><th>Bolsas</th>
                <th>Bot/bolsa</th><th>Buenas</th><th>Merma bot.</th><th>Merma pref.</th><th>Merma total</th>
                <th>Total prod.</th><th>T. disp.</th><th>P. prog.</th><th>P. no prog.</th><th>Cambio molde</th>
                <th>Consumo pref.</th><th>Pref. observada</th><th>Saldo</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((r) => (
                <tr key={r.id}>
                  <td>{r.ordenOp}</td>
                  <td>{r.fecha}</td>
                  <td>{r.turno}</td>
                  <td>{r.operador}</td>
                  <td>{r.ayudante || '-'}</td>
                  <td>{r.maquina}</td>
                  <td>{r.codBotella}</td>
                  <td>{r.etiqIni}</td>
                  <td>{r.etiqFin}</td>
                  <td>{r.numBolsas}</td>
                  <td>{r.cantPorBolsa}</td>
                  <td>{r.botBuenas}</td>
                  <td>{r.mermaBot}</td>
                  <td>{r.mermaPref}</td>
                  <td>{r.mermaTotal}</td>
                  <td>{r.totalProduccion}</td>
                  <td>{r.minutosDisponibles} min</td>
                  <td>{r.paradasProgramadas.reduce((s, p) => s + (Number(p.minutos) || 0), 0)} min</td>
                  <td>{r.paradasNoProgramadas.reduce((s, p) => s + (Number(p.minutos) || 0), 0)} min</td>
                  <td>{r.tiempoCambioMolde} min</td>
                  <td>
                    {r.consumosPreforma.length === 0 ? '-' : r.consumosPreforma.map((c) => (
                      `${c.numCaja}: ${c.cantidad}${c.estado && c.estado !== 'ninguno' ? ` (${c.estado})` : ''}`
                    )).join(', ')}
                  </td>
                  <td>
                    {!r.defectosPreforma || r.defectosPreforma.length === 0 ? '-' : r.defectosPreforma.map((d) => (
                      `${d.numCaja}: ${d.cantidad} (${d.descripcion})`
                    )).join(', ')}
                  </td>
                  <td>
                    {[
                      r.finProduccionSaldo ? `Generado: ${r.saldoGenerado?.toLocaleString() ?? 0}` : '',
                      r.saldoUsado?.length > 0 ? `Usado: ${r.saldoUsado.reduce((s, x) => s + x.cantidad, 0).toLocaleString()}` : '',
                      r.finProduccionPedidoEspecial ? `Pedido especial (+${r.cantidadExtraPedido?.toLocaleString() ?? 0})` : '',
                    ].filter(Boolean).join(' / ') || '-'}
                  </td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="secondary-action" disabled={pdfExportingId === r.id} onClick={() => exportarReportePdfIndividual(r)}>
                      {pdfExportingId === r.id ? 'Generando...' : 'PDF'}
                    </button>
                    <button type="button" className="secondary-action" onClick={() => cargarParaEditar(r)}>Editar</button>
                    <button type="button" className="etiquetas-delete-button" onClick={() => eliminar(r.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Validacion de supervisor -- todo reporte nuevo entra como "pendiente" y
// recien pasa a Historial cuando alguien lo valida aca; si se rechaza queda
// documentado con su motivo en su propia lista, sin borrarse, para que
// quede el historial de todos los rechazados (se puede reabrir a pendiente
// para que el operador lo corrija y lo reenvie).
function ReportesValidacionVista({ reportes, loaded, procesandoId, validarReporte, rechazarReporte, marcarPendienteReporte, cargarParaEditar }) {
  const [rechazandoId, setRechazandoId] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [previewId, setPreviewId] = useState(null);
  const [previewData, setPreviewData] = useState({}); // { [reporteId]: { loading, botellaDescripcion, codPreforma, preformaDescripcion } }

  const pendientes = useMemo(() => reportes.filter((r) => (r.estadoValidacion || 'pendiente') === 'pendiente'), [reportes]);
  const rechazados = useMemo(
    () => reportes.filter((r) => r.estadoValidacion === 'rechazado').sort((a, b) => (b.rechazadoEn || '').localeCompare(a.rechazadoEn || '')),
    [reportes],
  );

  const abrirRechazo = (id) => { setRechazandoId(id); setMotivo(''); };
  const cancelarRechazo = () => { setRechazandoId(null); setMotivo(''); };
  const confirmarRechazo = async (id) => {
    if (!motivo.trim()) return;
    await rechazarReporte(id, motivo.trim());
    setRechazandoId(null);
    setMotivo('');
  };

  // Vista previa de Identificacion (sin Operador/Ayudantes/Etiquetas
  // inicio-fin, a pedido) -- descripcion de botella y preforma se buscan al
  // catalogo recien al abrir, y quedan en cache por reporte.
  const togglePreview = async (r) => {
    if (previewId === r.id) { setPreviewId(null); return; }
    setPreviewId(r.id);
    if (previewData[r.id]) return;
    setPreviewData((current) => ({ ...current, [r.id]: { loading: true } }));
    const codPreforma = r.consumosPreforma?.[0]?.codPreforma || '';
    let botellaDescripcion = '';
    let preformaDescripcion = '';
    try {
      const catalogo = await localApi.getBotellasCatalogo(r.maquina);
      const match = catalogo.find((b) => b.codBotella.toLowerCase() === (r.codBotella || '').trim().toLowerCase());
      botellaDescripcion = match?.descripcion || '';
    } catch { /* sin catalogo disponible */ }
    if (codPreforma) {
      try {
        const rows = await localApi.getPreformasAdmin(codPreforma);
        const match = rows.find((p) => p.codigo.toLowerCase() === codPreforma.toLowerCase());
        preformaDescripcion = match?.descripcion || '';
      } catch { /* sin catalogo disponible */ }
    }
    setPreviewData((current) => ({ ...current, [r.id]: { loading: false, botellaDescripcion, codPreforma, preformaDescripcion } }));
  };

  if (!loaded) return <div className="panel"><p className="etiquetas-empty">Cargando...</p></div>;

  return (
    <>
      <div className="panel etiquetas-history">
        <div className="section-heading">
          <div><span>Reportes</span><h2>Pendientes de validacion ({pendientes.length})</h2></div>
        </div>
        {pendientes.length === 0 ? (
          <p className="etiquetas-empty">No hay reportes esperando validacion.</p>
        ) : (
          <div className="etiquetas-table-wrap">
            <table className="etiquetas-table">
              <thead>
                <tr>
                  <th>OP</th><th>Fecha</th><th>Turno</th><th>Maquina</th><th>Botella</th>
                  <th>Operador</th><th>Buenas</th><th>Merma total</th><th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {pendientes.map((r) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td>{r.ordenOp}</td>
                      <td>{r.fecha}</td>
                      <td>{r.turno}</td>
                      <td>{r.maquina}</td>
                      <td>{r.codBotella}</td>
                      <td>{r.operador}</td>
                      <td>{r.botBuenas}</td>
                      <td>{r.mermaTotal}</td>
                      <td style={{ display: 'flex', gap: 6, whiteSpace: 'nowrap' }}>
                        <button type="button" className="secondary-action" onClick={() => togglePreview(r)}>
                          {previewId === r.id ? 'Ocultar' : 'Vista previa'}
                        </button>
                        <button type="button" className="secondary-action" disabled={procesandoId === r.id} onClick={() => validarReporte(r.id)}>
                          {procesandoId === r.id ? '...' : 'Validar'}
                        </button>
                        <button type="button" className="etiquetas-delete-button" disabled={procesandoId === r.id} onClick={() => abrirRechazo(r.id)}>
                          Rechazar
                        </button>
                        <button type="button" className="secondary-action" onClick={() => cargarParaEditar(r)}>Editar</button>
                      </td>
                    </tr>
                    {previewId === r.id && (
                      <tr>
                        <td colSpan={9} style={{ background: 'var(--panel-alt, rgba(127,127,127,0.06))', padding: '10px 14px' }}>
                          {previewData[r.id]?.loading ? (
                            <p className="etiquetas-empty">Cargando vista previa...</p>
                          ) : (
                            <div className="form-grid etiquetas-form-grid" style={{ marginBottom: 0 }}>
                              <div className="field"><span>Orden de OP</span><strong>{r.ordenOp}</strong></div>
                              <div className="field"><span>Fecha</span><strong>{r.fecha}</strong></div>
                              <div className="field"><span>Turno</span><strong>{r.turno}</strong></div>
                              <div className="field"><span>Maquina</span><strong>{r.maquina}</strong></div>
                              <div className="field"><span>Codigo de botella</span><strong>{r.codBotella}</strong></div>
                              <div className="field"><span>Descripcion de la botella</span><strong>{previewData[r.id]?.botellaDescripcion || '-'}</strong></div>
                              <div className="field">
                                <span>Preforma vinculada</span>
                                <strong>
                                  {previewData[r.id]?.codPreforma
                                    ? `${previewData[r.id].codPreforma}${previewData[r.id].preformaDescripcion ? ' — ' + previewData[r.id].preformaDescripcion : ''}`
                                    : '-'}
                                </strong>
                              </div>
                              <div className="field"><span>Inicio de etiqueta</span><strong>{r.etiqIni}</strong></div>
                              <div className="field"><span>Fin de etiqueta</span><strong>{r.etiqFin}</strong></div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    {rechazandoId === r.id && (
                      <tr>
                        <td colSpan={9} style={{ background: 'var(--panel-alt, rgba(127,127,127,0.06))', padding: '10px 14px' }}>
                          <div className="planificacion-mant-form" style={{ gridTemplateColumns: '1fr auto auto' }}>
                            <input
                              type="text" autoFocus placeholder="Motivo del rechazo"
                              value={motivo} onChange={(e) => setMotivo(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarRechazo(r.id); } }}
                            />
                            <button type="button" className="etiquetas-delete-button" disabled={!motivo.trim() || procesandoId === r.id} onClick={() => confirmarRechazo(r.id)}>
                              Confirmar rechazo
                            </button>
                            <button type="button" className="secondary-action" onClick={cancelarRechazo}>Cancelar</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel etiquetas-history">
        <div className="section-heading">
          <div><span>Reportes</span><h2>Rechazados ({rechazados.length})</h2></div>
        </div>
        {rechazados.length === 0 ? (
          <p className="etiquetas-empty">No hay reportes rechazados.</p>
        ) : (
          <div className="etiquetas-table-wrap">
            <table className="etiquetas-table">
              <thead>
                <tr>
                  <th>OP</th><th>Fecha</th><th>Maquina</th><th>Botella</th><th>Operador</th>
                  <th>Motivo</th><th>Rechazado por</th><th>Rechazado el</th><th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {rechazados.map((r) => (
                  <tr key={r.id}>
                    <td>{r.ordenOp}</td>
                    <td>{r.fecha}</td>
                    <td>{r.maquina}</td>
                    <td>{r.codBotella}</td>
                    <td>{r.operador}</td>
                    <td style={{ color: '#B85450', fontWeight: 600 }}>{r.motivoRechazo}</td>
                    <td>{r.rechazadoPor || '-'}</td>
                    <td>{r.rechazadoEn || '-'}</td>
                    <td style={{ display: 'flex', gap: 6, whiteSpace: 'nowrap' }}>
                      <button type="button" className="secondary-action" disabled={procesandoId === r.id} onClick={() => marcarPendienteReporte(r.id)}>
                        Reabrir
                      </button>
                      <button type="button" className="secondary-action" onClick={() => cargarParaEditar(r)}>Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// Filtros compartidos por Produccion/Mermas: maquina + rango de fechas
// (cubre "un dia" con desde=hasta, o "una semana"/"un mes" con el rango
// que corresponda -- mas simple y flexible que repetir el esquema
// Año/Mes/Semana de Planificacion, que depende de que el reporte tenga una
// "semana" etiquetada como los planes, y los reportes no la tienen).
function FiltrosReportes({ machines, filtroMaquina, setFiltroMaquina, filtroDesde, setFiltroDesde, filtroHasta, setFiltroHasta }) {
  return (
    <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
      <label className="field">
        <span>Maquina</span>
        <select value={filtroMaquina} onChange={(e) => setFiltroMaquina(e.target.value)}>
          <option value="">Todas</option>
          {machines.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Desde</span>
        <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} />
      </label>
      <label className="field">
        <span>Hasta</span>
        <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} />
      </label>
    </div>
  );
}

// Solo produccion (botellas buenas) -- filtrable por maquina/dia/semana
// (rango de fechas).
function ReportesProduccionVista({ reportes, machines }) {
  const [filtroMaquina, setFiltroMaquina] = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');

  const filtrados = reportes.filter((r) => {
    if (filtroMaquina && r.maquina !== filtroMaquina) return false;
    if (filtroDesde && r.fecha < filtroDesde) return false;
    if (filtroHasta && r.fecha > filtroHasta) return false;
    return true;
  });
  const totalBuenas = filtrados.reduce((sum, r) => sum + (Number(r.botBuenas) || 0), 0);

  return (
    <div className="panel etiquetas-history">
      <div className="section-heading">
        <div><span>Reportes</span><h2>Produccion ({filtrados.length})</h2></div>
      </div>

      <FiltrosReportes
        machines={machines}
        filtroMaquina={filtroMaquina} setFiltroMaquina={setFiltroMaquina}
        filtroDesde={filtroDesde} setFiltroDesde={setFiltroDesde}
        filtroHasta={filtroHasta} setFiltroHasta={setFiltroHasta}
      />

      <div className="save-row">
        <span className="etiquetas-stat-badge">
          Total botellas buenas <strong>{totalBuenas.toLocaleString()}</strong>
        </span>
      </div>

      {filtrados.length === 0 ? (
        <p className="etiquetas-empty">Sin reportes de produccion para ese filtro.</p>
      ) : (
        <div className="etiquetas-table-wrap">
          <table className="etiquetas-table">
            <thead>
              <tr><th>OP</th><th>Fecha</th><th>Turno</th><th>Maquina</th><th>Botella</th><th>Buenas</th></tr>
            </thead>
            <tbody>
              {filtrados.map((r) => (
                <tr key={r.id}>
                  <td>{r.ordenOp}</td>
                  <td>{r.fecha}</td>
                  <td>{r.turno}</td>
                  <td>{r.maquina}</td>
                  <td>{r.codBotella}</td>
                  <td>{(Number(r.botBuenas) || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Mermas (botella + preforma) -- filtrable por maquina/dia/semana, con la
// OP de la(s) caja(s) de preforma usada(s) en cada reporte (consumo normal
// y preforma observada por separado, cada una con su propia OP).
function ReportesMermasVista({ reportes, machines }) {
  const [filtroMaquina, setFiltroMaquina] = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');

  const filtrados = reportes.filter((r) => {
    if (filtroMaquina && r.maquina !== filtroMaquina) return false;
    if (filtroDesde && r.fecha < filtroDesde) return false;
    if (filtroHasta && r.fecha > filtroHasta) return false;
    return (Number(r.mermaBot) || 0) > 0 || (Number(r.mermaPref) || 0) > 0 || (r.defectosPreforma?.length ?? 0) > 0;
  });
  const totalMermaBot = filtrados.reduce((sum, r) => sum + (Number(r.mermaBot) || 0), 0);
  const totalMermaPref = filtrados.reduce((sum, r) => sum + (Number(r.mermaPref) || 0), 0);

  return (
    <div className="panel etiquetas-history">
      <div className="section-heading">
        <div><span>Reportes</span><h2>Mermas ({filtrados.length})</h2></div>
      </div>

      <FiltrosReportes
        machines={machines}
        filtroMaquina={filtroMaquina} setFiltroMaquina={setFiltroMaquina}
        filtroDesde={filtroDesde} setFiltroDesde={setFiltroDesde}
        filtroHasta={filtroHasta} setFiltroHasta={setFiltroHasta}
      />

      <div className="save-row">
        <span className="etiquetas-stat-badge etiquetas-stat-badge-warn">
          Merma botella <strong>{totalMermaBot.toLocaleString()}</strong>
        </span>
        <span className="etiquetas-stat-badge etiquetas-stat-badge-warn">
          Merma preforma <strong>{totalMermaPref.toLocaleString()}</strong>
        </span>
      </div>

      {filtrados.length === 0 ? (
        <p className="etiquetas-empty">Sin mermas para ese filtro.</p>
      ) : (
        <div className="etiquetas-table-wrap">
          <table className="etiquetas-table">
            <thead>
              <tr>
                <th>OP</th><th>Fecha</th><th>Turno</th><th>Maquina</th><th>Botella</th>
                <th>Merma botella</th><th>Merma preforma</th><th>OP preforma usada</th><th>Preforma observada</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((r) => (
                <tr key={r.id}>
                  <td>{r.ordenOp}</td>
                  <td>{r.fecha}</td>
                  <td>{r.turno}</td>
                  <td>{r.maquina}</td>
                  <td>{r.codBotella}</td>
                  <td>{(Number(r.mermaBot) || 0).toLocaleString()}</td>
                  <td>{(Number(r.mermaPref) || 0).toLocaleString()}</td>
                  <td>
                    {r.consumosPreforma.length === 0 ? '-' : r.consumosPreforma.map((c) => (
                      `Caja ${c.numCaja} · OP ${c.op || 's/d'}: ${(Number(c.cantidad) || 0).toLocaleString()}u`
                    )).join(' / ')}
                  </td>
                  <td>
                    {!r.defectosPreforma || r.defectosPreforma.length === 0 ? '-' : r.defectosPreforma.map((d) => (
                      `Caja ${d.numCaja} · OP ${d.op || 's/d'}: ${(Number(d.cantidad) || 0).toLocaleString()}u${d.descripcion ? ` (${d.descripcion})` : ''}`
                    )).join(' / ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
