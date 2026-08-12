import { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { localApi } from './localApiClient.js';
import {
  calcularDistribucion, calcularDistribucionCombinada, calcularSeguimiento, calcularHistorialSemana,
  asegurarHorarios, DIAS, DIAS_ABR, MESES, SEMANAS,
} from './planificacionEngine.js';

const TURNOS_MANT = [
  { value: 'AMBOS', label: 'Ambos turnos' },
  { value: 'MANANA', label: 'Manana' },
  { value: 'NOCHE', label: 'Noche' },
];

const COMBO_MAQUINA = 'SEM 63/78';
const COLOR_78 = 'var(--teal)';
const COLOR_63 = 'var(--blue)';

function emptyHorasPorDia() {
  return Object.fromEntries(DIAS.map((d) => [d, { manana: 8, noche: 0 }]));
}

function nuevoBotellaForm() {
  return {
    anio: new Date().getFullYear(), mes: MESES[new Date().getMonth()], semana: SEMANAS[0],
    maquina: '', fechaDomingo: '',
  };
}

// "semana" se guarda como un solo texto "<MES> SEMANA <N>" (ver guardarPlan);
// esto la separa de vuelta para poder filtrar por mes y por semana aparte
// en Vista general.
function parseSemana(semanaTexto) {
  const m = /^(.*?)\s+(SEMANA\s*\d+)$/.exec(String(semanaTexto ?? '').trim());
  return { mes: m?.[1] ?? '', semana: m?.[2] ?? String(semanaTexto ?? '') };
}

// El año no tiene columna propia (no la tiene tampoco DIGITALIZACION) -- se
// guarda dentro de datos.anio al crear el plan; para planes viejos que no lo
// tengan, se cae al año de la fecha del domingo o al de creacion.
function obtenerAnio(plan) {
  if (plan.datos?.anio) return String(plan.datos.anio);
  if (plan.fecha) return plan.fecha.slice(0, 4);
  if (plan.createdAt) return plan.createdAt.slice(0, 4);
  return '';
}

// Resumen de un plan guardado (lista de botellas + total producido), igual
// para maquina individual y para SEM 63/78 -- reusado en la tabla de Vista
// general y en el export a PDF.
function resumenPlan(plan) {
  const esPar = !!plan.datos?.esPar;
  const bots = esPar ? (plan.datos?.botellasCombo ?? []) : (plan.datos?.botellas ?? []);
  const total = esPar
    ? (plan.datos?.diasTotales78 ?? []).reduce((a, b) => a + b, 0) + (plan.datos?.diasTotales63 ?? []).reduce((a, b) => a + b, 0)
    : (plan.datos?.diasTotales ?? []).reduce((a, b) => a + b, 0);
  return { bots, total };
}

// Gris neutro de cabecera para las tablas de resumen del PDF (los PDF no
// entienden variables CSS).
const GRIS_RESUMEN = [235, 235, 235];

// Colores de acento de las tarjetas del kanban, mismo criterio que las
// tarjetas en pantalla (`.planificacion-kanban-card*`, border-left teal
// para produccion / amber para cambio de molde / blue para mantenimiento),
// mas un color propio para turno NOCHE (coral) para que se distinga de un
// vistazo del turno MAÑANA (teal). RGB porque los PDF no entienden
// variables CSS.
const ACCENT_TEAL = [8, 125, 125];
const ACCENT_AMBER = [180, 108, 15];
const ACCENT_BLUE = [36, 87, 166];
const ACCENT_NOCHE = [176, 68, 60];
const GRIS_ZEBRA = [246, 246, 249];
const GRIS_TOTAL = [235, 235, 235];
const KAN_FS = 7;
const KAN_LINE_H = 9;
const KAN_BLOCK_GAP = 6;
const KAN_PAD = 5;

// Agrupa los bloques de una maquina en 7 listas (una por dia).
function agruparBloquesPorDia(bloques) {
  const porDia = Array.from({ length: 7 }, () => []);
  (bloques ?? []).forEach((e) => { if (e.diaIdx >= 0) porDia[e.diaIdx].push(e); });
  return porDia;
}

// Cantidad de lineas de texto que ocupa un bloque (produccion: cod+turno /
// descripcion / cantidad+horas / bot-h+horario aproximado -- cambio de
// molde y mantenimiento: titulo + horas), para poder calcular la altura
// exacta de la celda.
function altoBloque(e) {
  const lineas = (e.mantenimiento || e.cambioMolde) ? 3 : 5;
  return lineas * KAN_LINE_H;
}

function altoCelda(bloques) {
  if (!bloques.length) return KAN_LINE_H;
  return bloques.reduce((sum, e) => sum + altoBloque(e), 0) + KAN_BLOCK_GAP * (bloques.length - 1);
}

function truncarTexto(doc, texto, maxWidth) {
  if (doc.getTextWidth(texto) <= maxWidth) return texto;
  let t = texto;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

// Dibuja a mano, dentro de una celda del kanban combinado, todos los
// bloques de ese dia -- cada uno con una barrita de color a la izquierda
// (teal produccion / amber cambio de molde / blue mantenimiento) y, en los
// bloques de produccion, el turno coloreado distinto segun MAÑANA (teal) o
// NOCHE (coral) -- para que las tarjetas y los turnos se distingan de un
// vistazo, tal como se ve en pantalla.
function dibujarBloquesCelda(doc, cell, bloques) {
  const cx = cell.x + KAN_PAD;
  const barW = 2.4;
  const textX = cx + barW + 4;
  const maxW = cell.width - KAN_PAD * 2 - barW - 4;
  let cy = cell.y + KAN_PAD;

  bloques.forEach((e) => {
    const alto = altoBloque(e);
    const accent = e.cambioMolde ? ACCENT_AMBER : e.mantenimiento ? ACCENT_BLUE : ACCENT_TEAL;
    doc.setFillColor(...accent);
    doc.rect(cx, cy, barW, alto - 2, 'F');

    doc.setFontSize(KAN_FS);
    let ly = cy + KAN_LINE_H * 0.75;

    if (e.mantenimiento) {
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...ACCENT_BLUE);
      doc.text('MANTENIMIENTO', textX, ly);
      ly += KAN_LINE_H;
      doc.setFont(undefined, 'normal');
      doc.text(`${e.horas.toFixed(1)}h`, textX, ly);
      ly += KAN_LINE_H;
      doc.setTextColor(130, 130, 130);
      doc.text(e.horaTexto ?? '', textX, ly);
    } else if (e.cambioMolde) {
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...ACCENT_AMBER);
      doc.text(truncarTexto(doc, e.cmInicio ? 'CAMBIO MOLDE INICIO' : 'CAMBIO MOLDE', maxW), textX, ly);
      ly += KAN_LINE_H;
      doc.setFont(undefined, 'normal');
      doc.text(`${e.horas.toFixed(1)}h`, textX, ly);
      ly += KAN_LINE_H;
      doc.setTextColor(130, 130, 130);
      doc.text(e.horaTexto ?? '', textX, ly);
    } else {
      // Turno de la botella al lado del codigo -- sin simbolos (bullet/circulo)
      // porque las fuentes estandar de jsPDF no los soportan y corrompen el
      // texto; el color (teal/coral) ya alcanza para distinguir dia de noche.
      const cod = e.bot?.cod ?? '';
      doc.setFont(undefined, 'bold');
      doc.setTextColor(20, 20, 20);
      doc.text(cod, textX, ly);
      const codW = doc.getTextWidth(`${cod}  `);
      const esNoche = e.turno === 'NOCHE';
      doc.setTextColor(...(esNoche ? ACCENT_NOCHE : ACCENT_TEAL));
      doc.text(truncarTexto(doc, esNoche ? 'NOCHE' : 'MAÑANA', Math.max(20, maxW - codW)), textX + codW, ly);
      ly += KAN_LINE_H;

      // Descripcion resaltada (bold + oscura) en vez de gris clara -- tiene
      // que leerse de un vistazo, no quedar como texto secundario apagado.
      doc.setFont(undefined, 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text(truncarTexto(doc, e.bot?.desc ?? '', maxW), textX, ly);
      ly += KAN_LINE_H;

      doc.setFont(undefined, 'bold');
      doc.setTextColor(20, 20, 20);
      doc.text(`${(e.botellas ?? 0).toLocaleString()}u   ${e.horas.toFixed(1)}h`, textX, ly);
      ly += KAN_LINE_H;

      // bot/h y horario van en lineas separadas (no juntos en una) para que
      // el horario nunca se recorte por falta de ancho.
      doc.setFont(undefined, 'normal');
      doc.setTextColor(130, 130, 130);
      if (e.bot?.vel > 0) doc.text(`${e.bot.vel.toLocaleString()} bot/h`, textX, ly);
      ly += KAN_LINE_H;
      doc.text(e.horaTexto ?? '', textX, ly);
    }

    cy += alto + KAN_BLOCK_GAP;
  });

  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
}

const sumarArr = (arr) => (arr ?? []).reduce((a, b) => a + b, 0);

// Planes guardados antes de que la lista de una maquina individual tuviera
// id estable por botella (necesario para el cambio de molde individual, ver
// cmOverridesIndividual) no lo tienen -- esto les asigna uno al cargarlos
// para editar, y deja el contador (idRef) listo para las altas siguientes.
function conIdsAsegurados(botellas, idRef) {
  return botellas.map((b) => {
    if (b.id != null) { idRef.current = Math.max(idRef.current, Number(b.id) || 0); return b; }
    idRef.current += 1;
    return { ...b, id: idRef.current };
  });
}

// Planes guardados antes de que se empezara a guardar codPreforma/gramaje
// por botella no lo tienen en datos.botellas -- esto lo completa al vuelo
// buscando por codigo en el catalogo real de esa maquina (Productos e
// insumos), sin tener que volver a guardar el plan.
function conFallbackCatalogo(botellas, maquina, catalogPorMaquina) {
  const mapa = catalogPorMaquina?.[maquina];
  if (!mapa) return botellas;
  return botellas.map((b) => {
    if (b.codPreforma && b.gramaje != null) return b;
    const info = mapa.get(b.cod);
    if (!info) return b;
    return {
      ...b,
      codPreforma: b.codPreforma || info.codPreforma || '',
      gramaje: b.gramaje != null ? b.gramaje : info.gramaje,
    };
  });
}

// De cada plan guardado (individual o combinado SEM 63/78) saca una "fila"
// de maquina por sub-maquina, todas con la misma forma, para poder
// mezclarlas en una unica tabla de kanban + una unica grilla de resumen
// -- asi todas las maquinas de la semana quedan juntas al exportar, igual
// que la "Vista Semanal" de DIGITALIZACION.
function filasMaquinaDePlan(p, catalogPorMaquina) {
  const esPar = !!p.datos?.esPar;
  const horasPD = p.datos?.horasPorDia ?? {};
  if (esPar) {
    const bots78 = conFallbackCatalogo((p.datos.botellasCombo ?? []).filter((b) => b.submaq !== '63'), 'SEM 78', catalogPorMaquina);
    const bots63 = conFallbackCatalogo((p.datos.botellasCombo ?? []).filter((b) => b.submaq === '63'), 'SEM 63', catalogPorMaquina);
    return [
      {
        label: 'SEM 78', semanaTexto: p.semana, bloques: asegurarHorarios(p.datos.resultado78, horasPD),
        diaTotales: p.datos.diasTotales78, total: sumarArr(p.datos.diasTotales78),
        botellas: bots78, botellasPorDia: p.datos.botellasPorDia78,
      },
      {
        label: 'SEM 63', semanaTexto: p.semana, bloques: asegurarHorarios(p.datos.resultado63, horasPD),
        diaTotales: p.datos.diasTotales63, total: sumarArr(p.datos.diasTotales63),
        botellas: bots63, botellasPorDia: p.datos.botellasPorDia63,
      },
    ];
  }
  const botellas = conFallbackCatalogo(p.datos.botellas ?? [], p.maquina, catalogPorMaquina);
  return [{
    label: p.maquina, semanaTexto: p.semana, bloques: asegurarHorarios(p.datos.resultado, horasPD),
    diaTotales: p.datos.diasTotales, total: sumarArr(p.datos.diasTotales),
    botellas, botellasPorDia: p.datos.botellasPorDia,
  }];
}

// Tabla unica de kanban con todas las maquinas juntas (una fila por
// maquina/sub-maquina + una fila TOTAL al final con la suma por dia y el
// gran total) -- mismo formato que "Vista Semanal" de DIGITALIZACION. Cada
// fila de maquina se pinta con una franja gris alterna (zebra) para que no
// se confundan entre si, y el contenido de cada dia se dibuja a mano
// (`dibujarBloquesCelda`) para poder colorear cambio de molde y turno
// noche/dia de forma distinta.
function agregarKanbanCombinadoPdf(doc, y, filas) {
  const totalesDia = [0, 0, 0, 0, 0, 0, 0];
  let granTotal = 0;
  const porDiaPorFila = filas.map((f) => agruparBloquesPorDia(f.bloques));

  const body = filas.map((f, i) => {
    (f.diaTotales ?? []).forEach((v, d) => { totalesDia[d] += v || 0; });
    granTotal += f.total;
    const diasCeldas = porDiaPorFila[i].map((bloques) => ({
      content: bloques.length ? '' : '-',
      styles: { minCellHeight: altoCelda(bloques) + KAN_PAD * 2, halign: bloques.length ? 'left' : 'center' },
    }));
    return [`${f.label}\n${f.semanaTexto}`, ...diasCeldas, f.total.toLocaleString()];
  });
  const filaTotalIdx = body.length;
  body.push([
    'TOTAL', ...totalesDia.map((v) => (v > 0 ? v.toLocaleString() : '-')), granTotal.toLocaleString(),
  ]);

  // Anchos fijos para las 9 columnas (maquina + 7 dias + total), calculados
  // a partir del ancho real de pagina para que autoTable no tenga que
  // recalcularlos (evita que columnas con contenido dibujado a mano -- sin
  // texto real que medir -- se achiquen o generen advertencias de ancho).
  const pageMargin = 40;
  const usableW = doc.internal.pageSize.getWidth() - pageMargin * 2;
  const col0W = 68;
  const colTotalW = 46;
  const dayW = (usableW - col0W - colTotalW) / 7;
  const columnStylesDias = Object.fromEntries(
    Array.from({ length: 7 }, (_, i) => [i + 1, { cellWidth: dayW }]),
  );

  autoTable(doc, {
    startY: y,
    head: [['MAQUINA', ...DIAS_ABR, 'TOTAL']],
    body,
    tableWidth: usableW,
    margin: { left: pageMargin, right: pageMargin },
    // Evita que una fila alta (muchos bloques ese dia) se corte a la mitad
    // entre dos paginas -- el dibujo a mano de didDrawCell no sabe
    // continuarse en la pagina siguiente, asi que si no entra completa se
    // mueve entera a la pagina de al lado en vez de partirse.
    rowPageBreak: 'avoid',
    styles: { fontSize: KAN_FS, cellPadding: KAN_PAD, valign: 'top' },
    headStyles: { fillColor: [40, 55, 75], textColor: [255, 255, 255] },
    columnStyles: {
      ...columnStylesDias,
      0: { fontStyle: 'bold', valign: 'middle', cellWidth: col0W },
      8: { fontStyle: 'bold', halign: 'center', valign: 'middle', cellWidth: colTotalW },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      // Linea gruesa y oscura arriba de cada fila (ademas del zebra) para
      // que se note bien donde termina una maquina y empieza la siguiente,
      // incluso cuando las tarjetas de una fila son altas.
      data.cell.styles.lineWidth = { top: 1.2, right: 0.1, bottom: 0.1, left: 0.1 };
      data.cell.styles.lineColor = [90, 100, 115];
      if (data.row.index === filaTotalIdx) {
        data.cell.styles.fillColor = GRIS_TOTAL;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.valign = 'middle';
        return;
      }
      // Zebra: cada maquina alterna fondo para que se note donde empieza y
      // termina cada una, en vez de verse todo pegado.
      if (data.row.index % 2 === 1) data.cell.styles.fillColor = GRIS_ZEBRA;
    },
    didDrawCell: (data) => {
      // Si una fila queda mas alta que una pagina (muchos bloques ese dia),
      // autoTable la corta entre paginas y en ese repintado llama a este
      // hook con row.index = -1 (fila "de continuacion") -- sin datos
      // nuestros asociados, asi que se ignora en vez de romper.
      if (data.section !== 'body' || data.row.index === filaTotalIdx || !porDiaPorFila[data.row.index]) return;
      const col = data.column.index;
      if (col < 1 || col > 7) return;
      const bloques = porDiaPorFila[data.row.index][col - 1];
      if (bloques.length) dibujarBloquesCelda(doc, data.cell, bloques);
    },
  });
  return doc.lastAutoTable.finalY + 20;
}

// Grilla de 2 columnas con un cuadro de resumen (Cod Botella / Descripcion /
// Preforma / Gramaje / Velocidad / Cantidad) por maquina, mismo formato que
// "Detalle de botellas planificadas" de DIGITALIZACION. Devuelve el nuevo Y.
function agregarResumenGridPdf(doc, y, filas) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const gap = 20;
  const colWidth = (pageWidth - margin * 2 - gap) / 2;

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('DETALLE DE BOTELLAS PLANIFICADAS', margin, y);
  doc.setFont(undefined, 'normal');
  y += 18;

  const dibujarCuadro = (f, startX, startY) => {
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(50, 50, 50);
    doc.text(f.label, startX + colWidth / 2, startY, { align: 'center' });
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    const filasTabla = (f.botellas ?? []).map((b) => {
      const prod = DIAS.reduce((sum, d) => sum + (f.botellasPorDia?.[b.cod]?.[d] || 0), 0);
      return [
        b.cod, b.desc, b.codPreforma || '-', b.gramaje != null ? String(b.gramaje) : '-',
        (b.vel ?? 0).toLocaleString(), prod.toLocaleString(),
      ];
    });
    autoTable(doc, {
      startY: startY + 6,
      body: filasTabla,
      head: [['COD BOTELLA', 'DESCRIPCION', 'PREFORMA', 'GRAMAJE', 'VELOCIDAD', 'CANTIDAD']],
      styles: { fontSize: 7, cellPadding: 4, halign: 'center' },
      columnStyles: { 1: { halign: 'left' } },
      headStyles: { fillColor: GRIS_RESUMEN, textColor: [60, 60, 60], fontStyle: 'bold' },
      margin: { left: startX },
      tableWidth: colWidth,
    });
    return doc.lastAutoTable.finalY;
  };

  // Altura aproximada (titulo + cabecera + una fila por botella) para decidir
  // si el par de cuadros entra en la pagina actual antes de dibujarlo.
  const alturaEstimada = (f) => 26 + 20 + Math.max(1, (f.botellas ?? []).length) * 16;

  for (let i = 0; i < filas.length; i += 2) {
    const izq = filas[i];
    const der = filas[i + 1];
    const necesaria = Math.max(alturaEstimada(izq), der ? alturaEstimada(der) : 0);
    if (y + necesaria > pageHeight - margin) {
      doc.addPage();
      y = margin + 20;
    }
    const yIzq = dibujarCuadro(izq, margin, y);
    const yDer = der ? dibujarCuadro(der, margin + colWidth + gap, y) : y;
    y = Math.max(yIzq, yDer) + 26;
  }

  return y;
}

// Arma el PDF de la lista de planes ya filtrada (Vista general): agrupa
// todas las maquinas por semana (todas las semanas encontradas en el
// filtrado, una pagina por semana) y arma, para cada semana, UNA sola
// tabla de kanban con todas las maquinas juntas + fila TOTAL, seguida de
// la grilla de cuadros de resumen por maquina -- mismo formato que la
// "Vista Semanal" impresa de DIGITALIZACION. Devuelve el documento (sin
// guardarlo) para poder mostrarlo en una vista previa antes de descargarlo.
// Pagina final con el total general de todo lo que se exporto (todas las
// semanas/maquinas que entraron en el filtro) -- para cuando el filtro
// junta varias semanas (ej. un mes entero, un año entero) y no alcanza con
// el TOTAL de cada semana por separado.
function agregarTotalGeneralPdf(doc, grupos, filtrosTxt) {
  doc.addPage();
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.text('TOTAL GENERAL', 40, 42);
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(filtrosTxt, 40, 58);
  doc.text(`Generado: ${new Date().toLocaleString('es-BO')}`, 40, 70);
  doc.setTextColor(0, 0, 0);

  const granTotal = grupos.reduce((sum, g) => sum + g.filas.reduce((s, f) => s + f.total, 0), 0);

  const filasSemana = grupos.map((g) => [
    `${g.semana}${g.anio ? ` (${g.anio})` : ''}`,
    g.filas.reduce((s, f) => s + f.total, 0).toLocaleString(),
  ]);
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text('Total por semana', 40, 96);
  doc.setFont(undefined, 'normal');
  autoTable(doc, {
    startY: 104,
    head: [['SEMANA', 'TOTAL']],
    body: filasSemana,
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: GRIS_RESUMEN, textColor: [60, 60, 60], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 40, right: 40 },
    tableWidth: 320,
  });

  const totalPorMaquina = new Map();
  grupos.forEach((g) => g.filas.forEach((f) => {
    totalPorMaquina.set(f.label, (totalPorMaquina.get(f.label) || 0) + f.total);
  }));
  const filasMaquina = Array.from(totalPorMaquina.entries()).map(([label, total]) => [label, total.toLocaleString()]);
  const yMaquinas = doc.lastAutoTable.finalY + 26;
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text('Total por maquina', 40, yMaquinas);
  doc.setFont(undefined, 'normal');
  autoTable(doc, {
    startY: yMaquinas + 8,
    head: [['MAQUINA', 'TOTAL']],
    body: filasMaquina,
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: GRIS_RESUMEN, textColor: [60, 60, 60], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 40, right: 40 },
    tableWidth: 320,
  });

  const yFinal = doc.lastAutoTable.finalY + 34;
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(8, 125, 125);
  doc.text(`TOTAL GENERAL: ${granTotal.toLocaleString()} unidades`, 40, yFinal);
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'normal');
}

function construirPdfPlanes(planesFiltrados, filtros, catalogPorMaquina) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const filtrosTxt = [
    filtros.anio && `Año: ${filtros.anio}`,
    filtros.mes && `Mes: ${filtros.mes}`,
    filtros.semana && `Semana: ${filtros.semana}`,
    filtros.maquina && `Maquina: ${filtros.maquina}`,
  ].filter(Boolean).join('  |  ') || 'Sin filtros (todas las planificaciones)';

  // Agrupa por semana (todas las maquinas de la misma semana van juntas en
  // una sola tabla), preservando el orden en que aparecen los planes.
  const grupos = [];
  const indicePorSemana = new Map();
  planesFiltrados.forEach((p) => {
    const clave = `${obtenerAnio(p) || ''}__${p.semana || ''}`;
    if (!indicePorSemana.has(clave)) {
      indicePorSemana.set(clave, grupos.length);
      grupos.push({ semana: p.semana, anio: obtenerAnio(p), filas: [] });
    }
    grupos[indicePorSemana.get(clave)].filas.push(...filasMaquinaDePlan(p, catalogPorMaquina));
  });

  grupos.forEach((grupo, idx) => {
    if (idx > 0) doc.addPage();
    const titulo = `VISTA SEMANAL — ${grupo.semana}${grupo.anio ? ` (${grupo.anio})` : ''}`;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.text(titulo, 40, 42);
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(filtrosTxt, 40, 58);
    doc.text(`Generado: ${new Date().toLocaleString('es-BO')}`, 40, 70);
    doc.setTextColor(0, 0, 0);

    let y = 90;
    y = agregarKanbanCombinadoPdf(doc, y, grupo.filas);
    agregarResumenGridPdf(doc, y, grupo.filas);
  });

  // Si el filtro junta mas de una semana (ej. un mes entero, un año
  // entero), se agrega una pagina final con el total general de todo lo
  // exportado -- el TOTAL de cada pagina de semana ya alcanza cuando es
  // una sola.
  if (grupos.length > 1) {
    agregarTotalGeneralPdf(doc, grupos, filtrosTxt);
  }

  // Nombre del archivo segun la semana/mes exportado -- ej.
  // "VISTA SEMANAL - AGOSTO SEMANA 1.pdf" (mismo criterio que el titulo de
  // cada pagina, pero con guion simple en vez de raya para el nombre de
  // archivo). Si el filtrado junta mas de una semana, se generaliza.
  let filename;
  if (grupos.length === 1) {
    const g = grupos[0];
    filename = `VISTA SEMANAL - ${g.semana}${g.anio ? ` ${g.anio}` : ''}.pdf`;
  } else if (grupos.length > 1) {
    filename = `VISTA SEMANAL - ${grupos.length} semanas.pdf`;
  } else {
    filename = 'VISTA SEMANAL.pdf';
  }

  return { doc, filename };
}

// Handlers genericos para una lista de botellas (reordenar/quitar/editar
// cantidad-velocidad) -- se usan tanto para la lista de maquina normal como
// para la lista unica de SEM 63/78.
function crearManejadoresLista(setLista) {
  return {
    remove: (i) => setLista((cur) => cur.filter((_, idx) => idx !== i)),
    move: (i, dir) => setLista((cur) => {
      const next = [...cur];
      const j = i + dir;
      if (j < 0 || j >= next.length) return cur;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    }),
    updateField: (i, field, value) => setLista((cur) => cur.map(
      (b, idx) => (idx === i ? { ...b, [field]: Number(value) || 0 } : b),
    )),
  };
}

// Lista de botellas cargadas, con reordenar/editar -- reusada para maquina
// individual y para la lista unica de SEM 63/78 (con badge de sub-maquina y
// boton para cambiarla).
function ListaBotellas({ botellas, onRemove, onMove, onUpdateField, onToggleSubmaq }) {
  if (!botellas.length) return null;
  return (
    <ul className="planificacion-bot-list">
      {botellas.map((b, i) => (
        <li key={b.id ?? `${b.cod}-${i}`}>
          <div className="planificacion-bot-order">
            <button type="button" onClick={() => onMove(i, -1)} disabled={i === 0}>↑</button>
            <span>{i + 1}</span>
            <button type="button" onClick={() => onMove(i, 1)} disabled={i === botellas.length - 1}>↓</button>
          </div>
          {onToggleSubmaq && (
            <button
              type="button"
              className="planificacion-combo-badge"
              style={{ background: b.submaq === '63' ? COLOR_63 : COLOR_78 }}
              title="Cambiar de sub-maquina"
              onClick={() => onToggleSubmaq(i)}
            >
              SEM {b.submaq === '63' ? '63' : '78'}
            </button>
          )}
          <div className="planificacion-bot-info">
            <strong>{b.cod}</strong>
            <span>{b.desc}</span>
          </div>
          <label className="planificacion-bot-num">
            <span>Vel/h</span>
            <input type="number" value={b.vel} onChange={(e) => onUpdateField(i, 'vel', e.target.value)} />
          </label>
          <label className="planificacion-bot-num">
            <span>Cantidad</span>
            <input type="number" value={b.cant} onChange={(e) => onUpdateField(i, 'cant', e.target.value)} />
          </label>
          <button type="button" className="etiquetas-delete-button" onClick={() => onRemove(i)}>Quitar</button>
        </li>
      ))}
    </ul>
  );
}

// Buscador con autocompletado para agregar una botella (maquina individual,
// o una de las dos sub-maquinas de SEM 63/78).
function BuscadorBotella({ maquina, catalogo, query, setQuery, isOpen, setIsOpen, fieldRef, onAdd, placeholder }) {
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalogo.slice(0, 20);
    return catalogo
      .filter((b) => b.codBotella.toLowerCase().includes(q) || b.descripcion.toLowerCase().includes(q))
      .slice(0, 20);
  }, [catalogo, query]);

  return (
    <div className="planificacion-add-row" ref={fieldRef}>
      <input
        type="text"
        placeholder={maquina ? (placeholder || 'Buscar codigo o descripcion...') : 'Selecciona una maquina primero'}
        value={query}
        disabled={!maquina}
        onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
      />
      {isOpen && suggestions.length > 0 && (
        <div className="etiquetas-autocomplete-dropdown">
          {suggestions.map((item) => (
            <button
              type="button"
              key={item.codBotella}
              className="etiquetas-autocomplete-option"
              onMouseDown={() => onAdd(item)}
            >
              <strong>{item.codBotella}</strong>
              <span>{item.descripcion || 'Sin descripcion'} {item.velocidad ? `- ${item.velocidad}/h` : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Tabla de resultado (Botella x Dia = cantidad) -- se muestra debajo del
// kanban, como en DIGITALIZACION (kanban primero, tabla resumen despues).
function TablaResultado({ botellas, diasTotales, botellasPorDia, faltantes }) {
  const grandTotal = diasTotales.reduce((a, b) => a + b, 0);
  return (
    <>
      {faltantes.length > 0 && (
        <div className="etiquetas-intro-banner etiquetas-error-banner">
          Sin slot disponible en la semana: {faltantes.map((f) => `${f.bot.cod}: ${f.botellas.toLocaleString()} u`).join(' | ')}
        </div>
      )}
      <div className="etiquetas-table-wrap">
        <table className="etiquetas-table">
          <thead>
            <tr>
              <th>Botella</th>
              <th>Descripcion</th>
              {DIAS_ABR.map((d) => <th key={d}>{d}</th>)}
              <th>Total</th>
              <th>Pedido</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {botellas.map((b) => {
              const dias = DIAS.map((d) => botellasPorDia[b.cod]?.[d] || 0);
              const prod = dias.reduce((a, v) => a + v, 0);
              const pct = b.cant > 0 ? Math.round((prod / b.cant) * 100) : 0;
              return (
                <tr key={b.cod}>
                  <td>{b.cod}</td>
                  <td>{b.desc}</td>
                  {dias.map((v, i) => <td key={i}>{v > 0 ? v.toLocaleString() : '-'}</td>)}
                  <td>{prod.toLocaleString()}</td>
                  <td>{b.cant.toLocaleString()}</td>
                  <td>{pct}%</td>
                </tr>
              );
            })}
            <tr>
              <td><strong>TOTAL</strong></td>
              <td />
              {diasTotales.map((v, i) => <td key={i}>{v > 0 ? v.toLocaleString() : '-'}</td>)}
              <td><strong>{grandTotal.toLocaleString()}</strong></td>
              <td /><td />
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

// Kanban de 7 columnas (una por dia), igual criterio visual que
// DIGITALIZACION (renderDistPar/kanbanHtml) pero con los colores y bordes
// del resto de la app (var(--teal)/var(--blue)/var(--line)/var(--panel)) en
// vez de los hex fijos del original, para no romper el diseño actual.
// Kanban de 7 columnas para el resultado de una maquina -- se usa tanto
// para SEM 63/78 (con override de cambio de molde editable por bloque,
// cmOverrides/onSetCm) como para cualquier maquina individual (sin
// override -- cmOverrides/onSetCm quedan undefined y el cambio de molde se
// muestra fijo).
function KanbanMaquina({ label, color, bloques, total, cmHoras, cmOverrides, onSetCm }) {
  const porDia = useMemo(() => {
    const dias = Array.from({ length: 7 }, () => []);
    bloques.forEach((e) => { if (e.diaIdx >= 0) dias[e.diaIdx].push(e); });
    return dias;
  }, [bloques]);

  return (
    <div className="planificacion-kanban">
      <div className="planificacion-kanban-header" style={{ background: color }}>
        <span>{label}</span>
        <span>{total.toLocaleString()} u</span>
      </div>
      <div className="planificacion-kanban-grid">
        {DIAS_ABR.map((d, di) => (
          <div key={d}>
            <div className="planificacion-kanban-col-hdr" style={{ background: color }}>{d}</div>
            <div className="planificacion-kanban-col-body">
              {porDia[di].length === 0 ? (
                <div className="planificacion-kanban-empty">—</div>
              ) : porDia[di].map((e, i) => (
                e.mantenimiento ? (
                  <div key={i} className="planificacion-kanban-card planificacion-kanban-card-mant">
                    <div className="planificacion-kanban-card-cm-row">
                      <span>🔧 Mantenimiento</span>
                      <span>{e.horas.toFixed(1)}h</span>
                    </div>
                    <div className="planificacion-kanban-card-extra">
                      <span>{e.horaTexto}</span>
                    </div>
                  </div>
                ) : e.cambioMolde ? (
                  <div key={i} className="planificacion-kanban-card planificacion-kanban-card-cm">
                    <div className="planificacion-kanban-card-cm-row">
                      <span>⚙ {e.cmInicio ? 'Cambio molde inicio' : 'Cambio molde'}</span>
                      {onSetCm ? (
                        <>
                          <input
                            type="number" min="0" step="0.5"
                            value={cmOverrides[e.id] !== undefined ? cmOverrides[e.id] : cmHoras}
                            onChange={(ev) => onSetCm(e.id, ev.target.value)}
                          />
                          <span>h</span>
                        </>
                      ) : (
                        <span>{e.horas.toFixed(1)}h</span>
                      )}
                    </div>
                    <div className="planificacion-kanban-card-extra">
                      <span>{e.horaTexto}</span>
                    </div>
                  </div>
                ) : (
                  <div key={i} className="planificacion-kanban-card" style={{ borderLeftColor: color }}>
                    <div className="planificacion-kanban-card-title">{e.bot.cod}</div>
                    <div className="planificacion-kanban-card-desc">{e.bot.desc}</div>
                    <div className="planificacion-kanban-card-meta">
                      <span>{e.botellas.toLocaleString()} u</span>
                      <span>{e.horas.toFixed(1)}h</span>
                    </div>
                    <div className="planificacion-kanban-card-extra">
                      {e.bot.vel > 0 && <span>{e.bot.vel.toLocaleString()} bot/h</span>}
                      <span>{e.horaTexto}</span>
                    </div>
                  </div>
                )
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Barra de uso del pool compartido por dia: cuanto de las horas del dia se
// va en SEM 78, cuanto en SEM 63, y cuanto queda libre -- mismo criterio
// visual que la barra de horas de DIGITALIZACION (kanbanHtml), pero
// separando el color por sub-maquina en vez de un solo color de "ocupacion".
function PoolCompartido({ horasPorDia, res78, res63 }) {
  const porDia = useMemo(() => {
    const u78 = Array(7).fill(0);
    const u63 = Array(7).fill(0);
    res78.forEach((e) => { if (e.diaIdx >= 0 && !e.faltante) u78[e.diaIdx] += e.horas; });
    res63.forEach((e) => { if (e.diaIdx >= 0 && !e.faltante) u63[e.diaIdx] += e.horas; });
    return DIAS.map((dia, i) => ({
      total: (Number(horasPorDia[dia]?.manana) || 0) + (Number(horasPorDia[dia]?.noche) || 0),
      u78: u78[i],
      u63: u63[i],
    }));
  }, [horasPorDia, res78, res63]);

  return (
    <div className="planificacion-pool-resumen">
      <div className="sec-title" style={{ marginTop: 0 }}>Pool compartido — horas por dia</div>
      <div className="planificacion-pool-grid">
        {DIAS_ABR.map((d, i) => {
          const { total, u78, u63 } = porDia[i];
          const pct78 = total > 0 ? Math.min(100, (u78 / total) * 100) : 0;
          const pct63 = total > 0 ? Math.min(100, (u63 / total) * 100) : 0;
          return (
            <div key={d} className="planificacion-pool-col">
              <span className="planificacion-pool-col-lbl">{d}</span>
              <div className="planificacion-pool-bar">
                <div className="planificacion-pool-bar-78" style={{ width: `${pct78}%`, background: COLOR_78 }} />
                <div className="planificacion-pool-bar-63" style={{ width: `${pct63}%`, background: COLOR_63 }} />
              </div>
              <span className="planificacion-pool-col-val">{(u78 + u63).toFixed(1)}/{total.toFixed(1)}h</span>
            </div>
          );
        })}
      </div>
      <div className="planificacion-pool-legend">
        <span><i style={{ background: COLOR_78 }} /> SEM 78</span>
        <span><i style={{ background: COLOR_63 }} /> SEM 63</span>
        <span><i style={{ background: '#e0e0e0' }} /> Libre</span>
      </div>
    </div>
  );
}

// ═══ Seguimiento (Planeacion Dinamica de DIGITALIZACION) ════════════════════
// Compara lo producido real (Reportes diarios) contra lo planificado para
// los planes cuya semana incluye hoy, y reparte de nuevo lo que falta
// producir entre los dias que quedan -- con paros de mantenimiento,
// botellas agregadas a mitad de semana y reasignaciones a otra maquina.

function hoyISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function sumarDiasISO(fechaISO, dias) {
  const d = new Date(`${fechaISO}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diaIdxDesdeFecha(fechaDomingoISO, fechaISO) {
  if (!fechaDomingoISO || !fechaISO) return null;
  const domingo = new Date(`${fechaDomingoISO}T00:00:00`);
  const fecha = new Date(`${fechaISO}T00:00:00`);
  if (Number.isNaN(domingo.getTime()) || Number.isNaN(fecha.getTime())) return null;
  const diff = Math.round((fecha - domingo) / 86400000);
  return diff >= 0 && diff <= 6 ? diff : null;
}

// Un plan esta "vigente" si su semana (domingo..domingo+6) incluye hoy --
// se deja tambien el domingo siguiente como en DIGITALIZACION, para no
// perder el plan justo al cierre del sabado.
function planVigenteHoy(plan, hoy) {
  if (!plan.fecha) return false;
  return plan.fecha <= hoy && hoy <= sumarDiasISO(plan.fecha, 7);
}

// Agrupa la produccion real reportada (Reportes diarios) por dia de esa
// semana (diaIdx 0-6) y codigo de botella, para una o mas maquinas
// (las submaquinas de SEM 63/78 se archivan en Reportes como "SEM 78"/
// "SEM 63" reales, no como "SEM 63/78").
function reportesPorDiaDePlan(reportesDiarios, plan, maquinas) {
  const porDia = {};
  reportesDiarios.forEach((r) => {
    if (!maquinas.includes(r.maquina)) return;
    const idx = diaIdxDesdeFecha(plan.fecha, r.fecha);
    if (idx == null) return;
    const cod = r.codBotella;
    if (!cod) return;
    porDia[idx] = porDia[idx] || {};
    porDia[idx][cod] = (porDia[idx][cod] || 0) + (Number(r.botBuenas) || 0);
  });
  return porDia;
}

// Horas que le faltan a una lista de botellas para terminar lo planificado
// (restante / velocidad, sumado) -- usado para repartir proporcionalmente
// el pool compartido de SEM 63/78 entre sus dos sub-maquinas (cada una se
// lleva la porcion de horas que quedan segun cuanto necesita para terminar
// lo suyo, mismo criterio que DIGITALIZACION).
function horasNecesarias(botellas, botellasPorDia, reportesPorDia, diaIdxHoy) {
  let horas = 0;
  botellas.forEach((b) => {
    const diasOrig = botellasPorDia[b.cod] || {};
    const total = DIAS.reduce((sum, d) => sum + (diasOrig[d] || 0), 0);
    if (total <= 0) return;
    let producido = 0;
    for (let idx = 0; idx < diaIdxHoy; idx += 1) producido += reportesPorDia[idx]?.[b.cod] || 0;
    const restante = Math.max(0, total - producido);
    if (b.vel > 0) horas += restante / b.vel;
  });
  return horas;
}

function escalarHorasPorDia(horasPorDia, factor, diaIdxHoy) {
  const out = {};
  DIAS.forEach((d, idx) => {
    if (idx < diaIdxHoy) { out[d] = { manana: 0, noche: 0 }; return; }
    out[d] = {
      manana: (Number(horasPorDia[d]?.manana) || 0) * factor,
      noche: (Number(horasPorDia[d]?.noche) || 0) * factor,
    };
  });
  return out;
}

// Arma los "grupos" de Seguimiento de un plan vigente -- uno para maquina
// individual, dos (SEM 78 y SEM 63) para un plan combinado, cada uno ya
// con calcularSeguimiento corrido.
function gruposSeguimientoDePlan(plan, reportesDiarios, parosTodos, adicionesTodos, hoy) {
  const diaIdxHoy = diaIdxDesdeFecha(plan.fecha, hoy);
  if (diaIdxHoy == null) return null;
  const esPar = !!plan.datos?.esPar;
  const parosSemana = parosTodos.filter((p) => p.semana === plan.semana && p.maquina === plan.maquina);
  const adicionesSemana = adicionesTodos.filter((a) => a.semana === plan.semana && a.maquina === plan.maquina);

  if (esPar) {
    const bots78 = (plan.datos.botellasCombo ?? []).filter((b) => b.submaq !== '63');
    const bots63 = (plan.datos.botellasCombo ?? []).filter((b) => b.submaq === '63');
    const bpd78 = plan.datos.botellasPorDia78 ?? {};
    const bpd63 = plan.datos.botellasPorDia63 ?? {};
    const reportesPorDia = reportesPorDiaDePlan(reportesDiarios, plan, ['SEM 78', 'SEM 63']);
    const h78 = horasNecesarias(bots78, bpd78, reportesPorDia, diaIdxHoy);
    const h63 = horasNecesarias(bots63, bpd63, reportesPorDia, diaIdxHoy);
    const tot = h78 + h63;
    const prop78 = tot > 0 ? h78 / tot : 0.5;
    const prop63 = tot > 0 ? h63 / tot : 0.5;
    const horasBase = plan.datos.horasPorDia ?? {};
    const seg78 = calcularSeguimiento({
      botellas: bots78, resultadoOriginal: plan.datos.resultado78 ?? [], botellasPorDia: bpd78,
      horasPorDia: escalarHorasPorDia(horasBase, prop78, diaIdxHoy),
      cmHoras: plan.datos.cmHoras ?? 2, cmOverrides: plan.datos.cmOverrides ?? {},
      reportesPorDia, paros: parosSemana,
      adiciones: adicionesSemana.filter((a) => a.submaq !== '63'), diaIdxHoy,
    });
    const seg63 = calcularSeguimiento({
      botellas: bots63, resultadoOriginal: plan.datos.resultado63 ?? [], botellasPorDia: bpd63,
      horasPorDia: escalarHorasPorDia(horasBase, prop63, diaIdxHoy),
      cmHoras: plan.datos.cmHoras ?? 2, cmOverrides: plan.datos.cmOverrides ?? {},
      reportesPorDia, paros: parosSemana,
      adiciones: adicionesSemana.filter((a) => a.submaq === '63'), diaIdxHoy,
    });
    return {
      plan, diaIdxHoy, esPar: true, parosSemana, adicionesSemana,
      grupos: [
        { label: 'SEM 78', color: COLOR_78, submaq: '78', ...seg78 },
        { label: 'SEM 63', color: COLOR_63, submaq: '63', ...seg63 },
      ],
    };
  }

  const reportesPorDia = reportesPorDiaDePlan(reportesDiarios, plan, [plan.maquina]);
  const seg = calcularSeguimiento({
    botellas: plan.datos.botellas ?? [], resultadoOriginal: plan.datos.resultado ?? [],
    botellasPorDia: plan.datos.botellasPorDia ?? {}, horasPorDia: plan.datos.horasPorDia ?? {},
    cmHoras: plan.datos.cmHoras ?? 2, cmOverrides: plan.datos.cmOverrides ?? {},
    reportesPorDia, paros: parosSemana, adiciones: adicionesSemana, diaIdxHoy,
  });
  return {
    plan, diaIdxHoy, esPar: false, parosSemana, adicionesSemana,
    grupos: [{ label: plan.maquina, color: COLOR_78, submaq: '', ...seg }],
  };
}

// Tarjeta de un dia pasado: Plan vs Real de una botella, coloreada segun
// cumplio/no cumplio/sin reporte -- mismo look que las tarjetas de
// produccion del kanban de "Nueva planificacion", solo que comparando dos
// numeros en vez de mostrar uno.
function CardSeguimientoPasado({ b, dato }) {
  const { planOriginal: plan, real } = dato;
  const sinReporte = plan > 0 && real <= 0;
  const cumplida = plan > 0 && real >= plan;
  const pct = plan > 0 ? Math.round((real / plan) * 100) : (real > 0 ? 100 : null);
  const clase = sinReporte ? 'planificacion-seg-card-sinrep' : cumplida ? 'planificacion-seg-card-ok' : 'planificacion-seg-card-bajo';
  return (
    <div className={`planificacion-kanban-card planificacion-seg-kcard ${clase}`}>
      <div className="planificacion-kanban-card-title">
        {b.cod}{b.esAdicion && <span className="planificacion-seg-adic-badge">+ADIC</span>}
      </div>
      <div className="planificacion-kanban-card-desc">{b.desc}</div>
      <div className="planificacion-kanban-card-meta">
        <span>Plan {plan.toLocaleString()}</span>
        <span>Real {real.toLocaleString()}</span>
      </div>
      <div className="planificacion-seg-kcard-pct">{sinReporte ? 'Sin reporte' : `${pct}%`}</div>
    </div>
  );
}

// Tarjeta de hoy/futuro: lo recien repartido con lo que falta producir --
// mismo look que una tarjeta de produccion normal, con un borde propio
// para distinguirla de "lo planificado originalmente".
function CardSeguimientoProyectado({ b, dato, color }) {
  return (
    <div className="planificacion-kanban-card planificacion-seg-kcard planificacion-seg-card-proyectado" style={{ borderLeftColor: color }}>
      <div className="planificacion-kanban-card-title">
        {b.cod}{b.esAdicion && <span className="planificacion-seg-adic-badge">+ADIC</span>}
      </div>
      <div className="planificacion-kanban-card-desc">{b.desc}</div>
      <div className="planificacion-kanban-card-meta">
        <span>{dato.cantidad.toLocaleString()} u</span>
        <span>Proyectado</span>
      </div>
    </div>
  );
}

// Kanban de 7 dias (domingo a sabado) de un grupo (maquina o sub-maquina):
// dias pasados muestran Plan vs Real por botella, hoy y los que quedan
// muestran lo recien repartido, y los paros de esa semana aparecen como
// tarjeta propia (mismo azul que un mantenimiento) en el dia que
// corresponda -- todo en el mismo lenguaje visual que el kanban de "Nueva
// planificacion" (KanbanMaquina).
function KanbanSeguimiento({ label, color, grupo, diaIdxHoy, parosPorDia }) {
  const porDia = useMemo(() => {
    const dias = Array.from({ length: 7 }, () => []);
    Object.entries(parosPorDia || {}).forEach(([di, lista]) => {
      lista.forEach((p) => dias[Number(di)].push({ tipo: 'paro', paro: p }));
    });
    grupo.botellas.forEach((b) => {
      b.diasPasado.forEach((d) => { if (d.planOriginal > 0 || d.real > 0) dias[d.diaIdx].push({ tipo: 'pasado', b, dato: d }); });
      b.diasFuturo.forEach((d) => { if (d.cantidad > 0) dias[d.diaIdx].push({ tipo: 'futuro', b, dato: d }); });
    });
    return dias;
  }, [grupo.botellas, parosPorDia]);

  const total = grupo.botellas.reduce(
    (sum, b) => sum + b.producidoAcumulado + b.diasFuturo.reduce((s, d) => s + d.cantidad, 0), 0,
  );

  return (
    <div className="planificacion-kanban">
      <div className="planificacion-kanban-header" style={{ background: color }}>
        <span>{label}</span>
        <span>{total.toLocaleString()} u</span>
      </div>
      <div className="planificacion-kanban-grid">
        {DIAS_ABR.map((d, di) => (
          <div key={d}>
            <div className="planificacion-kanban-col-hdr" style={{ background: color }}>
              {d}{di === diaIdxHoy ? <><br /><small>HOY</small></> : null}
            </div>
            <div className={`planificacion-kanban-col-body ${di < diaIdxHoy ? 'planificacion-seg-col-pasado' : ''}`}>
              {porDia[di].length === 0 ? (
                <div className="planificacion-kanban-empty">—</div>
              ) : porDia[di].map((c, i) => (
                c.tipo === 'paro' ? (
                  <div key={i} className="planificacion-kanban-card planificacion-kanban-card-mant">
                    <span>🔧 Paro</span>
                    <span>{c.paro.horas}h{c.paro.motivo ? ` · ${c.paro.motivo}` : ''}</span>
                  </div>
                ) : c.tipo === 'pasado' ? (
                  <CardSeguimientoPasado key={i} b={c.b} dato={c.dato} />
                ) : (
                  <CardSeguimientoProyectado key={i} b={c.b} dato={c.dato} color={color} />
                )
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Resumen compacto por botella debajo del kanban: cuanto falta, %
// cumplimiento (de lo que ya deberia estar hecho, cuanto se hizo), y a que
// ritmo real va -- cuantos dias/horas mas le llevaria terminar si sigue
// asi (no al ritmo ideal de la velocidad configurada).
function ResumenBotellaSeguimiento({ b }) {
  return (
    <div className="planificacion-seg-resumen-bot">
      <div className="planificacion-seg-resumen-bot-titulo">
        <strong>{b.cod}</strong>
        <span className="planificacion-kanban-card-desc">{b.desc}</span>
        {b.esAdicion && <span className="planificacion-seg-adic-badge">+ ADICION</span>}
      </div>
      <div className="planificacion-seg-resumen-bot-badges">
        <span className="planificacion-badge">Restante: {b.restante.toLocaleString()} u</span>
        {b.pctCumplimiento != null && (
          <span className={`planificacion-badge ${b.pctCumplimiento >= 100 ? 'planificacion-seg-badge-ok' : 'planificacion-seg-badge-bajo'}`}>
            Cumplimiento: {b.pctCumplimiento}%
          </span>
        )}
        {b.restante > 0 && (
          b.diasEstimadosAlRitmoReal != null ? (
            <span className={`planificacion-badge ${b.alcanzaEstaSemana ? '' : 'planificacion-seg-badge-bajo'}`}>
              A este ritmo: {b.diasEstimadosAlRitmoReal}d (~{b.horasEstimadasAlRitmoReal}h){!b.alcanzaEstaSemana ? ' — no alcanza esta semana' : ''}
            </span>
          ) : (
            <span className="planificacion-badge">Sin datos de ritmo real todavia</span>
          )
        )}
      </div>
    </div>
  );
}

// Tarjeta de un plan vigente: cabecera + formularios de paro/adicion +
// tabla(s) plan-vs-real/proyectado + no-producibles con reasignar +
// reasignadas hacia esta maquina + leyenda.
function PlanSeguimientoCard({
  item, machines, onAddParo, onDeleteParo, onAddAdicion, onDeleteAdicion,
  onReasignar, onDeleteReasignacion, reasignadasHaciaEstaMaquina,
}) {
  const { plan, diaIdxHoy, esPar, grupos, parosSemana, adicionesSemana } = item;
  const [formAbierto, setFormAbierto] = useState(null);
  const [formParo, setFormParo] = useState({ diaIdx: diaIdxHoy, horas: '', motivo: '' });
  const [formAdic, setFormAdic] = useState({
    codBot: '', descripcion: '', cantidad: '', vel: '', despuesDe: '', notas: '', submaq: '78',
  });
  const [catalogoAdic, setCatalogoAdic] = useState([]);
  const [reasigDestino, setReasigDestino] = useState({});
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (formAbierto !== 'adic') return;
    const maquinaBusq = esPar ? (formAdic.submaq === '63' ? 'SEM 63' : 'SEM 78') : plan.maquina;
    localApi.getBotellasCatalogo(maquinaBusq).then(setCatalogoAdic).catch(() => setCatalogoAdic([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formAbierto, esPar, formAdic.submaq, plan.maquina]);

  const parosPorDia = {};
  parosSemana.forEach((p) => { (parosPorDia[p.diaIdx] = parosPorDia[p.diaIdx] || []).push(p); });

  const guardarParo = async () => {
    if (!formParo.horas || Number(formParo.horas) <= 0) { setMensaje('Indica las horas de paro.'); return; }
    setGuardando(true); setMensaje('');
    try {
      await onAddParo({
        semana: plan.semana, maquina: plan.maquina, diaIdx: Number(formParo.diaIdx),
        diaNombre: DIAS[Number(formParo.diaIdx)], horas: Number(formParo.horas), motivo: formParo.motivo,
      });
      setFormAbierto(null);
      setFormParo({ diaIdx: diaIdxHoy, horas: '', motivo: '' });
    } catch (error) {
      setMensaje(error.message || 'No se pudo registrar el paro.');
    } finally {
      setGuardando(false);
    }
  };

  const guardarAdic = async () => {
    if (!formAdic.codBot || !formAdic.cantidad || !formAdic.vel) {
      setMensaje('Completa botella, cantidad y velocidad.');
      return;
    }
    setGuardando(true); setMensaje('');
    try {
      await onAddAdicion({
        semana: plan.semana, maquina: plan.maquina, codBot: formAdic.codBot, descripcion: formAdic.descripcion,
        cantidad: Number(formAdic.cantidad), vel: Number(formAdic.vel), despuesDe: formAdic.despuesDe,
        notas: formAdic.notas, submaq: esPar ? formAdic.submaq : '',
      });
      setFormAbierto(null);
      setFormAdic({ codBot: '', descripcion: '', cantidad: '', vel: '', despuesDe: '', notas: '', submaq: '78' });
    } catch (error) {
      setMensaje(error.message || 'No se pudo agregar la botella.');
    } finally {
      setGuardando(false);
    }
  };

  const reasignar = async (np) => {
    const key = `${np.submaqLabel}-${np.cod}`;
    const destino = reasigDestino[key];
    if (!destino) { setMensaje('Selecciona la maquina destino.'); return; }
    setGuardando(true); setMensaje('');
    try {
      await onReasignar({
        semana: plan.semana, maqOrigen: plan.maquina, maqDestino: destino,
        codBot: np.cod, descripcion: np.desc, cantidad: np.restante, vel: np.vel,
        motivo: 'desplazada_por_ajuste_dinamico',
      });
      setMensaje(`Reasignada a ${destino}.`);
    } catch (error) {
      setMensaje(error.message || 'No se pudo reasignar.');
    } finally {
      setGuardando(false);
    }
  };

  const noProducibles = grupos.flatMap((g) => g.noProducibles.map((np) => ({ ...np, submaq: g.submaq, submaqLabel: g.label })));
  const botellasParaDespuesDe = grupos
    .filter((g) => !esPar || g.submaq === formAdic.submaq)
    .flatMap((g) => g.botellas.filter((b) => !b.esAdicion));

  return (
    <div className="panel planificacion-seg-card">
      <div className="planificacion-result-header">
        <strong>{plan.maquina}</strong>
        <span className="planificacion-badge">{plan.semana}</span>
        <span className="planificacion-badge planificacion-badge-accent">Hoy: {DIAS[diaIdxHoy]}</span>
        <div className="planificacion-seg-actions">
          <button type="button" className="secondary-action" onClick={() => setFormAbierto((f) => (f === 'paro' ? null : 'paro'))}>
            🔧 + Paro
          </button>
          <button type="button" className="secondary-action" onClick={() => setFormAbierto((f) => (f === 'adic' ? null : 'adic'))}>
            ➕ + Botella
          </button>
        </div>
      </div>

      {mensaje && <div className="etiquetas-form-error" style={{ margin: '6px 0' }}>{mensaje}</div>}

      {formAbierto === 'paro' && (
        <div className="planificacion-mant-form">
          <select value={formParo.diaIdx} onChange={(e) => setFormParo((c) => ({ ...c, diaIdx: e.target.value }))}>
            {DIAS.map((d, idx) => <option key={d} value={idx}>{DIAS_ABR[idx]}</option>)}
          </select>
          <input
            type="number" min="0.5" step="0.5" placeholder="Horas paro"
            value={formParo.horas} onChange={(e) => setFormParo((c) => ({ ...c, horas: e.target.value }))}
          />
          <input
            type="text" placeholder="Motivo (opcional)"
            value={formParo.motivo} onChange={(e) => setFormParo((c) => ({ ...c, motivo: e.target.value }))}
          />
          <button type="button" className="primary-action" onClick={guardarParo} disabled={guardando}>Registrar</button>
        </div>
      )}

      {formAbierto === 'adic' && (
        <div className="planificacion-seg-adic-form">
          {esPar && (
            <select
              value={formAdic.submaq}
              onChange={(e) => setFormAdic((c) => ({ ...c, submaq: e.target.value, codBot: '', descripcion: '', vel: '' }))}
            >
              <option value="78">SEM 78</option>
              <option value="63">SEM 63</option>
            </select>
          )}
          <select
            value={formAdic.codBot}
            onChange={(e) => {
              const item = catalogoAdic.find((b) => b.codBotella === e.target.value);
              setFormAdic((c) => ({
                ...c, codBot: e.target.value,
                descripcion: item?.descripcion || c.descripcion,
                vel: item?.velocidad ? String(item.velocidad) : c.vel,
              }));
            }}
          >
            <option value="">-- botella --</option>
            {catalogoAdic.map((b) => (
              <option key={b.codBotella} value={b.codBotella}>{b.codBotella}{b.descripcion ? ` · ${b.descripcion}` : ''}</option>
            ))}
          </select>
          <input
            type="number" min="1" placeholder="Cantidad"
            value={formAdic.cantidad} onChange={(e) => setFormAdic((c) => ({ ...c, cantidad: e.target.value }))}
          />
          <input
            type="number" min="1" placeholder="Vel (bot/h)"
            value={formAdic.vel} onChange={(e) => setFormAdic((c) => ({ ...c, vel: e.target.value }))}
          />
          <select value={formAdic.despuesDe} onChange={(e) => setFormAdic((c) => ({ ...c, despuesDe: e.target.value }))}>
            <option value="">Al inicio</option>
            {botellasParaDespuesDe.map((b) => <option key={b.cod} value={b.cod}>Despues de {b.cod}</option>)}
          </select>
          <button type="button" className="primary-action" onClick={guardarAdic} disabled={guardando}>Agregar</button>
        </div>
      )}

      {grupos.map((g) => (
        <div key={g.label}>
          <KanbanSeguimiento label={g.label} color={g.color} grupo={g} diaIdxHoy={diaIdxHoy} parosPorDia={parosPorDia} />
          {g.botellas.map((b) => <ResumenBotellaSeguimiento key={b.id ?? b.cod} b={b} />)}
        </div>
      ))}

      <div className="planificacion-seg-leyenda">
        <span className="planificacion-seg-leyenda-chip planificacion-seg-ok" /> Real ≥ plan
        <span className="planificacion-seg-leyenda-chip planificacion-seg-bajo" /> Real &lt; plan
        <span className="planificacion-seg-leyenda-chip planificacion-seg-sinrep" /> Sin reporte
        <span className="planificacion-seg-leyenda-chip planificacion-seg-proyectado" /> Proyectado
      </div>

      {(parosSemana.length > 0 || adicionesSemana.length > 0) && (
        <div className="planificacion-seg-listas">
          {parosSemana.length > 0 && (
            <div>
              <div className="sec-title">Paros registrados</div>
              <ul className="planificacion-mant-list">
                {parosSemana.map((p) => (
                  <li key={p.id}>
                    <span>{p.diaNombre || DIAS_ABR[p.diaIdx]} - {p.horas}h{p.motivo ? ` - ${p.motivo}` : ''}</span>
                    <button type="button" className="etiquetas-delete-button" onClick={() => onDeleteParo(p.id)}>Quitar</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {adicionesSemana.length > 0 && (
            <div>
              <div className="sec-title">Botellas agregadas esta semana</div>
              <ul className="planificacion-mant-list">
                {adicionesSemana.map((a) => (
                  <li key={a.id}>
                    <span>{a.codBot} — {a.descripcion} — {a.cantidad.toLocaleString()}u{esPar && a.submaq ? ` (SEM ${a.submaq})` : ''}</span>
                    <button type="button" className="etiquetas-delete-button" onClick={() => onDeleteAdicion(a.id)}>Quitar</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {noProducibles.length > 0 && (
        <div className="planificacion-seg-noprod">
          <div className="sec-title">⚠ No alcanza el tiempo — botellas desplazadas</div>
          {noProducibles.map((np) => (
            <div key={`${np.submaqLabel}-${np.cod}`} className="planificacion-seg-noprod-row">
              <div>
                <strong>{np.cod}</strong>
                {esPar && <span className="planificacion-combo-badge" style={{ background: np.submaq === '63' ? COLOR_63 : COLOR_78, marginLeft: 6 }}>{np.submaqLabel}</span>}
                <span> {np.desc} — {np.restante.toLocaleString()} u sin producir</span>
              </div>
              <div className="planificacion-seg-noprod-actions">
                {np.esAdicion && (
                  <button type="button" className="etiquetas-delete-button" onClick={() => onDeleteAdicion(np.adicionId)}>
                    ✕ Quitar adicion
                  </button>
                )}
                <select
                  value={reasigDestino[`${np.submaqLabel}-${np.cod}`] || ''}
                  onChange={(e) => setReasigDestino((c) => ({ ...c, [`${np.submaqLabel}-${np.cod}`]: e.target.value }))}
                >
                  <option value="">Reasignar a...</option>
                  {machines.filter((m) => m.nombre !== plan.maquina).map((m) => (
                    <option key={m.id} value={m.nombre}>{m.nombre}</option>
                  ))}
                </select>
                <button type="button" className="secondary-action" onClick={() => reasignar(np)} disabled={guardando}>
                  ↗ Reasignar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {reasignadasHaciaEstaMaquina.length > 0 && (
        <div className="planificacion-seg-reasig">
          <div className="sec-title">↗ Botellas reasignadas a {plan.maquina}</div>
          {reasignadasHaciaEstaMaquina.map((r) => (
            <div key={r.id} className="planificacion-seg-noprod-row">
              <div><strong>{r.codBot}</strong> {r.descripcion} — {r.cantidad.toLocaleString()} u — desde {r.maqOrigen}</div>
              <button type="button" className="etiquetas-delete-button" onClick={() => onDeleteReasignacion(r.id)}>✕ Quitar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Visor de historial -- se calcula en vivo (plan vs. real, cruzando "planes"
// con "reportes_diarios"), no con snapshots guardados: la idea original de un
// boton "Guardar historial" que congelara el estado no se termino usando (se
// llego a armar la tabla planificacion_historial pero nunca se conecto a
// ningun boton real, asi que se saco -- ver auditoria de base de datos).
// Fila de una botella en el historial (semana ya completa o en curso, sin
// redistribuir nada) -- mismo look de tabla Plan/Real que se usaba antes
// en Seguimiento, apropiado aca porque el historial es para revisar varias
// semanas/maquinas de una, no para actuar sobre una semana puntual.
function FilaHistorialBotella({ b }) {
  return (
    <tr>
      <td>
        <strong>{b.cod}</strong>
        <div className="planificacion-kanban-card-desc">{b.desc}</div>
      </td>
      {b.dias.map((d) => {
        if (d.plan <= 0 && d.real <= 0) return <td key={d.dia} className="planificacion-seg-empty">—</td>;
        if (d.plan > 0 && d.real <= 0) {
          return (
            <td key={d.dia} className="planificacion-seg-cell planificacion-seg-sinrep">
              Plan {d.plan.toLocaleString()}<br />Sin reporte
            </td>
          );
        }
        const ok = d.real >= d.plan;
        return (
          <td key={d.dia} className={`planificacion-seg-cell ${ok ? 'planificacion-seg-ok' : 'planificacion-seg-bajo'}`}>
            {d.plan > 0 && <>Plan {d.plan.toLocaleString()}<br /></>}
            Real {d.real.toLocaleString()}
          </td>
        );
      })}
      <td>
        <strong>{b.realTotal.toLocaleString()}</strong> / {b.total.toLocaleString()}
        {b.pct != null && (
          <div className={`planificacion-seg-desfase ${b.pct >= 100 ? 'planificacion-seg-desfase-adelanto' : 'planificacion-seg-desfase-atraso'}`}>
            {b.pct}%
          </div>
        )}
      </td>
    </tr>
  );
}

function TablaHistorialGrupo({ label, hist }) {
  if (!hist.botellas.length) return null;
  const pctGrupo = hist.totalPlan > 0 ? Math.round((hist.totalReal / hist.totalPlan) * 100) : null;
  return (
    <div>
      <div className="sec-title">
        {label} — {hist.totalReal.toLocaleString()} / {hist.totalPlan.toLocaleString()} u
        {pctGrupo != null ? ` (${pctGrupo}%)` : ''}
      </div>
      <div className="etiquetas-table-wrap">
        <table className="etiquetas-table">
          <thead>
            <tr><th>Botella</th>{DIAS_ABR.map((d) => <th key={d}>{d}</th>)}<th>Total</th></tr>
          </thead>
          <tbody>{hist.botellas.map((b) => <FilaHistorialBotella key={b.cod} b={b} />)}</tbody>
        </table>
      </div>
    </div>
  );
}

// Historial calculado en vivo (sin guardar snapshots): cruza Reportes
// diarios contra CUALQUIER plan guardado (vigente o ya terminado) con los
// mismos filtros de Vista general (año/mes/semana/maquina), asi siempre
// esta al dia sin tener que apretar "Guardar" cada vez.
function HistorialLiveVista({ planes, reportesDiarios, machines }) {
  const [filtroAnio, setFiltroAnio] = useState('');
  const [filtroMes, setFiltroMes] = useState('');
  const [filtroSemana, setFiltroSemana] = useState('');
  const [filtroMaquina, setFiltroMaquina] = useState('');

  const aniosDisponibles = Array.from(new Set(planes.map((p) => obtenerAnio(p)).filter(Boolean))).sort();

  const planesFiltrados = planes.filter((p) => {
    const { mes: mesPlan, semana: semanaPlan } = parseSemana(p.semana);
    return (!filtroAnio || obtenerAnio(p) === filtroAnio)
      && (!filtroMes || mesPlan === filtroMes)
      && (!filtroSemana || semanaPlan === filtroSemana)
      && (!filtroMaquina || p.maquina === filtroMaquina)
      && p.fecha;
  });

  const items = planesFiltrados.map((p) => {
    const esPar = !!p.datos?.esPar;
    if (esPar) {
      const reportesPorDia = reportesPorDiaDePlan(reportesDiarios, p, ['SEM 78', 'SEM 63']);
      const bots78 = (p.datos.botellasCombo ?? []).filter((b) => b.submaq !== '63');
      const bots63 = (p.datos.botellasCombo ?? []).filter((b) => b.submaq === '63');
      return {
        plan: p,
        grupos: [
          { label: 'SEM 78', hist: calcularHistorialSemana({ botellas: bots78, botellasPorDia: p.datos.botellasPorDia78 ?? {}, reportesPorDia }) },
          { label: 'SEM 63', hist: calcularHistorialSemana({ botellas: bots63, botellasPorDia: p.datos.botellasPorDia63 ?? {}, reportesPorDia }) },
        ],
      };
    }
    const reportesPorDia = reportesPorDiaDePlan(reportesDiarios, p, [p.maquina]);
    return {
      plan: p,
      grupos: [{
        label: p.maquina,
        hist: calcularHistorialSemana({ botellas: p.datos.botellas ?? [], botellasPorDia: p.datos.botellasPorDia ?? {}, reportesPorDia }),
      }],
    };
  }).filter((it) => it.grupos.some((g) => g.hist.botellas.length));

  const totalReal = items.reduce((sum, it) => sum + it.grupos.reduce((s, g) => s + g.hist.totalReal, 0), 0);
  const totalPlan = items.reduce((sum, it) => sum + it.grupos.reduce((s, g) => s + g.hist.totalPlan, 0), 0);

  return (
    <div>
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <label className="field">
          <span>Año</span>
          <select value={filtroAnio} onChange={(e) => setFiltroAnio(e.target.value)}>
            <option value="">Todos</option>
            {aniosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Mes</span>
          <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)}>
            <option value="">Todos</option>
            {MESES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Semana</span>
          <select value={filtroSemana} onChange={(e) => setFiltroSemana(e.target.value)}>
            <option value="">Todas</option>
            {SEMANAS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Maquina</span>
          <select value={filtroMaquina} onChange={(e) => setFiltroMaquina(e.target.value)}>
            <option value="">Todas</option>
            {machines.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
          </select>
        </label>
      </div>

      {items.length === 0 ? (
        <p className="etiquetas-empty">Sin reportes de produccion para ese filtro todavia.</p>
      ) : (
        <>
          <div className="planificacion-badge planificacion-badge-accent" style={{ marginBottom: 14 }}>
            Total real: {totalReal.toLocaleString()} / {totalPlan.toLocaleString()} planificado
            {totalPlan > 0 ? ` (${Math.round((totalReal / totalPlan) * 100)}%)` : ''}
          </div>
          {items.map((it) => (
            <div key={it.plan.id} className="planificacion-seg-hist-plan">
              <div className="planificacion-result-header">
                <strong>{it.plan.maquina}</strong>
                <span className="planificacion-badge">{it.plan.semana}</span>
                {obtenerAnio(it.plan) && <span className="planificacion-badge">{obtenerAnio(it.plan)}</span>}
              </div>
              {it.grupos.map((g) => <TablaHistorialGrupo key={g.label} label={g.label} hist={g.hist} />)}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function SeguimientoVista({
  planes, planesLoaded, reportesDiarios, reportesLoaded, paros, adiciones, reasignaciones, machines,
  onAddParo, onDeleteParo, onAddAdicion, onDeleteAdicion, onReasignar, onDeleteReasignacion,
}) {
  const [verHistorial, setVerHistorial] = useState(false);
  const hoy = useMemo(() => hoyISO(), []);

  const planesVigentes = useMemo(() => planes.filter((p) => planVigenteHoy(p, hoy)), [planes, hoy]);
  const items = useMemo(
    () => planesVigentes.map((p) => gruposSeguimientoDePlan(p, reportesDiarios, paros, adiciones, hoy)).filter(Boolean),
    [planesVigentes, reportesDiarios, paros, adiciones, hoy],
  );

  return (
    <div className="panel planificacion-result">
      <div className="section-heading">
        <div><span>Planificacion</span><h2>Seguimiento</h2></div>
        <button type="button" className="secondary-action" onClick={() => setVerHistorial((v) => !v)}>
          📜 {verHistorial ? 'Ocultar historial' : 'Ver historial'}
        </button>
      </div>

      {!planesLoaded || !reportesLoaded ? (
        <p className="etiquetas-empty">Cargando...</p>
      ) : verHistorial ? (
        <HistorialLiveVista planes={planes} reportesDiarios={reportesDiarios} machines={machines} />
      ) : items.length === 0 ? (
        <p className="etiquetas-empty">
          No hay un plan vigente para la semana actual (ninguno con fecha del domingo guardada que incluya hoy).
        </p>
      ) : items.map((item) => (
        <PlanSeguimientoCard
          key={item.plan.id}
          item={item} machines={machines}
          onAddParo={onAddParo} onDeleteParo={onDeleteParo}
          onAddAdicion={onAddAdicion} onDeleteAdicion={onDeleteAdicion}
          onReasignar={onReasignar} onDeleteReasignacion={onDeleteReasignacion}
          reasignadasHaciaEstaMaquina={reasignaciones.filter((r) => r.semana === item.plan.semana && r.maqDestino === item.plan.maquina)}
        />
      ))}
    </div>
  );
}

export default function PlanificacionView() {
  const [subView, setSubView] = useState('nueva'); // 'nueva' | 'general'
  const [machines, setMachines] = useState([]);
  const [loadError, setLoadError] = useState('');

  const [config, setConfig] = useState(nuevoBotellaForm);
  const [catalogo, setCatalogo] = useState([]);
  const [botellasPlan, setBotellasPlan] = useState([]);
  const [productQuery, setProductQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const productFieldRef = useRef(null);
  const botIdRef = useRef(0);

  const [cmHoras, setCmHoras] = useState(2);
  const [cmInicio, setCmInicio] = useState(false);
  // Cambio de molde individual por botella (algunos moldes tardan mas o
  // menos que otros) -- { [id de la botella]: horas }, en vez de cmHoras
  // global para ese cambio puntual.
  const [cmOverridesIndividual, setCmOverridesIndividual] = useState({});
  const [mantenimientos, setMantenimientos] = useState([]);
  const [mantForm, setMantForm] = useState({ dia: 'all', turno: 'AMBOS', horas: 0 });
  const [horasPorDia, setHorasPorDia] = useState(emptyHorasPorDia);

  const [resultado, setResultado] = useState(null);
  const [calcError, setCalcError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // Id del plan guardado que se esta editando (null = plan nuevo) -- al
  // guardar con este seteado, se actualiza ese plan en vez de crear uno.
  const [editingPlanId, setEditingPlanId] = useState(null);

  const [planes, setPlanes] = useState([]);
  const [planesLoaded, setPlanesLoaded] = useState(false);
  const [filtroAnio, setFiltroAnio] = useState('');
  const [filtroMes, setFiltroMes] = useState('');
  const [filtroSemana, setFiltroSemana] = useState('');
  const [filtroMaquina, setFiltroMaquina] = useState('');
  // Vista previa del PDF de Vista general antes de descargarlo:
  // { doc, url, filename } o null si esta cerrada.
  const [pdfPreview, setPdfPreview] = useState(null);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [pdfError, setPdfError] = useState('');

  // ── Seguimiento (Planeacion Dinamica) ────────────────────────────────────
  const [reportesDiarios, setReportesDiarios] = useState([]);
  const [reportesLoaded, setReportesLoaded] = useState(false);
  const [paros, setParos] = useState([]);
  const [adiciones, setAdiciones] = useState([]);
  const [reasignaciones, setReasignaciones] = useState([]);
  const [seguimientoLoaded, setSeguimientoLoaded] = useState(false);

  // ── SEM 63/78 (maquina combinada) ──────────────────────────────────────
  // Una sola lista, orden de produccion real -- cualquier combinacion entre
  // sub-maquinas (ver calcularDistribucionCombinada).
  const [botellasCombo, setBotellasCombo] = useState([]);
  const [catalogo78, setCatalogo78] = useState([]);
  const [catalogo63, setCatalogo63] = useState([]);
  const [productQuery78, setProductQuery78] = useState('');
  const [productQuery63, setProductQuery63] = useState('');
  const [isDropdown78Open, setIsDropdown78Open] = useState(false);
  const [isDropdown63Open, setIsDropdown63Open] = useState(false);
  const productField78Ref = useRef(null);
  const productField63Ref = useRef(null);
  const comboIdRef = useRef(0);
  const [cmOverrides, setCmOverrides] = useState({});
  const [resultadoCombinado, setResultadoCombinado] = useState(null);

  useEffect(() => {
    localApi.getMachines('planificacion')
      .then(setMachines)
      .catch((error) => setLoadError(error.message || 'No se pudo conectar con el servidor local.'));
  }, []);

  useEffect(() => {
    if (!config.maquina || config.maquina === COMBO_MAQUINA) {
      setCatalogo([]);
      return;
    }
    localApi.getBotellasCatalogo(config.maquina).then(setCatalogo).catch(() => setCatalogo([]));
  }, [config.maquina]);

  // El catalogo real ya trae "SEM 63" y "SEM 78" como maquinas propias (no
  // existe una fila "SEM 63/78" -- esa combinacion es solo de
  // Planificacion), asi que cada sub-maquina busca directo por su nombre.
  useEffect(() => {
    if (config.maquina !== COMBO_MAQUINA) { setCatalogo78([]); setCatalogo63([]); return; }
    localApi.getBotellasCatalogo('SEM 78').then(setCatalogo78).catch(() => setCatalogo78([]));
    localApi.getBotellasCatalogo('SEM 63').then(setCatalogo63).catch(() => setCatalogo63([]));
  }, [config.maquina]);

  useEffect(() => {
    function onClickOutside(event) {
      if (productFieldRef.current && !productFieldRef.current.contains(event.target)) setIsDropdownOpen(false);
      if (productField78Ref.current && !productField78Ref.current.contains(event.target)) setIsDropdown78Open(false);
      if (productField63Ref.current && !productField63Ref.current.contains(event.target)) setIsDropdown63Open(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const loadPlanes = () => {
    localApi.getPlanes().then((data) => { setPlanes(data); setPlanesLoaded(true); }).catch(() => setPlanesLoaded(true));
  };

  useEffect(() => {
    if ((subView === 'general' || subView === 'seguimiento') && !planesLoaded) loadPlanes();
  }, [subView, planesLoaded]);

  // Reportes/paros/adiciones/reasignaciones solo hacen falta en Seguimiento
  // -- se cargan la primera vez que se entra a esa pestaña.
  useEffect(() => {
    if (subView !== 'seguimiento' || seguimientoLoaded) return;
    setSeguimientoLoaded(true);
    Promise.all([
      localApi.getReportesDiarios().catch(() => []),
      localApi.getParos().catch(() => []),
      localApi.getAdiciones().catch(() => []),
      localApi.getReasignaciones().catch(() => []),
    ]).then(([reportes, p, a, r]) => {
      setReportesDiarios(reportes);
      setReportesLoaded(true);
      setParos(p);
      setAdiciones(a);
      setReasignaciones(r);
    });
  }, [subView, seguimientoLoaded]);

  const agregarParo = async (paro) => {
    const nuevo = await localApi.addParo(paro);
    setParos((cur) => [...cur, nuevo]);
  };
  const quitarParo = async (id) => {
    await localApi.deleteParo(id);
    setParos((cur) => cur.filter((p) => p.id !== id));
  };
  const agregarAdicion = async (adicion) => {
    const nueva = await localApi.addAdicion(adicion);
    setAdiciones((cur) => [...cur, nueva]);
  };
  const quitarAdicion = async (id) => {
    await localApi.deleteAdicion(id);
    setAdiciones((cur) => cur.filter((a) => a.id !== id));
  };
  const reasignarBotella = async (reasignacion) => {
    const nueva = await localApi.addReasignacion(reasignacion);
    setReasignaciones((cur) => [...cur, nueva]);
  };
  const quitarReasignacion = async (id) => {
    await localApi.deleteReasignacion(id);
    setReasignaciones((cur) => cur.filter((r) => r.id !== id));
  };

  const isCombo = config.maquina === COMBO_MAQUINA;

  const updateConfig = (field, value) => setConfig((current) => ({ ...current, [field]: value }));

  const addBotella = (item) => {
    botIdRef.current += 1;
    setBotellasPlan((current) => [
      ...current,
      {
        id: botIdRef.current, cod: item.codBotella, desc: item.descripcion, vel: item.velocidad, cant: 10000,
        codPreforma: item.codPreforma || '', gramaje: item.gramaje ?? null,
      },
    ]);
    setProductQuery('');
    setIsDropdownOpen(false);
  };
  const h = crearManejadoresLista(setBotellasPlan);
  const hCombo = crearManejadoresLista(setBotellasCombo);

  const addBotellaCombo = (item, submaq) => {
    comboIdRef.current += 1;
    setBotellasCombo((current) => [...current, {
      id: comboIdRef.current, cod: item.codBotella, desc: item.descripcion, vel: item.velocidad, cant: 10000, submaq,
      codPreforma: item.codPreforma || '', gramaje: item.gramaje ?? null,
    }]);
    if (submaq === '78') { setProductQuery78(''); setIsDropdown78Open(false); }
    else { setProductQuery63(''); setIsDropdown63Open(false); }
  };
  const toggleSubmaqCombo = (i) => setBotellasCombo((current) => current.map(
    (b, idx) => (idx === i ? { ...b, submaq: b.submaq === '63' ? '78' : '63' } : b),
  ));

  const addMantenimiento = () => setMantenimientos((current) => [...current, { ...mantForm }]);
  const removeMantenimiento = (index) => setMantenimientos((current) => current.filter((_, i) => i !== index));

  const updateHoras = (dia, tipo, value) => setHorasPorDia((current) => ({
    ...current,
    [dia]: { ...current[dia], [tipo]: Number(value) || 0 },
  }));

  const setCmOverrideBloque = (id, value) => {
    setCmOverrides((current) => ({ ...current, [id]: Number(value) || 0 }));
  };
  const setCmOverrideBloqueIndividual = (id, value) => {
    setCmOverridesIndividual((current) => ({ ...current, [id]: Number(value) || 0 }));
  };

  // Una vez que ya se calculo una vez, cualquier cambio (cantidades,
  // velocidad, orden, altas/bajas de botellas, horas por dia, cambio de
  // molde, overrides) recalcula solo -- no hace falta agregar una botella
  // nueva ni volver a apretar "Calcular distribucion" para que el
  // resultado quede al dia con esos ajustes.
  useEffect(() => {
    if (!resultadoCombinado) return;
    if (!botellasCombo.length) { setResultadoCombinado(null); return; }
    const salida = calcularDistribucionCombinada({ botellasCombo, horasPorDia, cmHoras, cmOverrides });
    if (salida.error) { setResultadoCombinado(null); setCalcError(salida.error); return; }
    setCalcError('');
    setResultadoCombinado(salida);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botellasCombo, horasPorDia, cmHoras, cmOverrides]);

  useEffect(() => {
    if (!resultado) return;
    if (!botellasPlan.length && !mantenimientos.length) { setResultado(null); return; }
    const salida = calcularDistribucion({
      botellas: botellasPlan, mantenimientos, horasPorDia, cmHoras, cmInicio, cmOverrides: cmOverridesIndividual,
    });
    if (salida.error) { setResultado(null); setCalcError(salida.error); return; }
    setCalcError('');
    setResultado(salida);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botellasPlan, mantenimientos, horasPorDia, cmHoras, cmInicio, cmOverridesIndividual]);

  const calcular = () => {
    setCalcError('');
    setSaveMessage('');
    if (!config.maquina) return setCalcError('Selecciona una maquina.');

    if (isCombo) {
      if (!botellasCombo.length) return setCalcError('Agrega al menos una botella a SEM 78 o SEM 63.');
      const salida = calcularDistribucionCombinada({ botellasCombo, horasPorDia, cmHoras, cmOverrides });
      if (salida.error) return setCalcError(salida.error);
      setResultadoCombinado(salida);
      setResultado(null);
      return;
    }

    if (!botellasPlan.length && !mantenimientos.length) return setCalcError('Agrega al menos una botella o un mantenimiento.');
    const salida = calcularDistribucion({
      botellas: botellasPlan, mantenimientos, horasPorDia, cmHoras, cmInicio, cmOverrides: cmOverridesIndividual,
    });
    if (salida.error) return setCalcError(salida.error);
    setResultado(salida);
    setResultadoCombinado(null);
  };

  const guardarPlan = async () => {
    if (isCombo ? !resultadoCombinado : !resultado) return;
    setIsSaving(true);
    setSaveMessage('');
    try {
      const datos = isCombo ? {
        esPar: true,
        anio: config.anio,
        botellasCombo,
        cmHoras,
        horasPorDia,
        cmOverrides,
        resultado78: resultadoCombinado.res78,
        resultado63: resultadoCombinado.res63,
        diasTotales78: resultadoCombinado.diasTotales78,
        diasTotales63: resultadoCombinado.diasTotales63,
        botellasPorDia78: resultadoCombinado.botellasPorDia78,
        botellasPorDia63: resultadoCombinado.botellasPorDia63,
      } : {
        anio: config.anio,
        botellas: botellasPlan,
        mantenimientos,
        cmHoras,
        cmInicio,
        cmOverrides: cmOverridesIndividual,
        horasPorDia,
        resultado: resultado.resultado,
        diasTotales: resultado.diasTotales,
        botellasPorDia: resultado.botellasPorDia,
      };
      await localApi.savePlan({
        id: editingPlanId || undefined,
        semana: `${config.mes} ${config.semana}`,
        maquina: config.maquina,
        fecha: config.fechaDomingo,
        datos,
      });
      setSaveMessage(editingPlanId ? 'Plan actualizado.' : 'Plan guardado.');
      setPlanesLoaded(false);
    } catch (error) {
      setCalcError(error.message || 'No se pudo guardar el plan.');
    } finally {
      setIsSaving(false);
    }
  };

  // Carga un plan guardado de vuelta en el formulario (por si el usuario se
  // olvido de algo) y recalcula al toque para no obligar a apretar
  // "Calcular distribucion" de nuevo. Guardar despues de esto actualiza ese
  // mismo plan en vez de crear uno nuevo (ver editingPlanId en guardarPlan).
  const cargarPlanParaEditar = (p) => {
    const { mes, semana } = parseSemana(p.semana);
    const anio = Number(obtenerAnio(p)) || new Date().getFullYear();
    const horas = p.datos?.horasPorDia ?? emptyHorasPorDia();

    setConfig({ anio, mes: mes || MESES[0], semana: semana || SEMANAS[0], maquina: p.maquina, fechaDomingo: p.fecha || '' });
    setHorasPorDia(horas);
    setSaveMessage('');
    setCalcError('');
    setEditingPlanId(p.id);

    if (p.datos?.esPar) {
      const combo = p.datos.botellasCombo ?? [];
      const cmH = p.datos.cmHoras ?? 2;
      const overrides = p.datos.cmOverrides ?? {};
      comboIdRef.current = combo.reduce((max, b) => Math.max(max, Number(b.id) || 0), 0);
      setBotellasCombo(combo);
      setCmHoras(cmH);
      setCmOverrides(overrides);
      setBotellasPlan([]);
      setMantenimientos([]);
      setResultado(null);
      if (combo.length) {
        const salida = calcularDistribucionCombinada({ botellasCombo: combo, horasPorDia: horas, cmHoras: cmH, cmOverrides: overrides });
        if (salida.error) { setResultadoCombinado(null); setCalcError(salida.error); } else setResultadoCombinado(salida);
      } else {
        setResultadoCombinado(null);
      }
    } else {
      const cmH = p.datos?.cmHoras ?? 2;
      const cmIni = p.datos?.cmInicio ?? false;
      const overridesInd = p.datos?.cmOverrides ?? {};
      const bots = conIdsAsegurados(p.datos?.botellas ?? [], botIdRef);
      const mants = p.datos?.mantenimientos ?? [];
      setBotellasPlan(bots);
      setMantenimientos(mants);
      setCmHoras(cmH);
      setCmInicio(cmIni);
      setCmOverridesIndividual(overridesInd);
      setBotellasCombo([]);
      setCmOverrides({});
      setResultadoCombinado(null);
      if (bots.length || mants.length) {
        const salida = calcularDistribucion({
          botellas: bots, mantenimientos: mants, horasPorDia: horas, cmHoras: cmH, cmInicio: cmIni, cmOverrides: overridesInd,
        });
        if (salida.error) { setResultado(null); setCalcError(salida.error); } else setResultado(salida);
      } else {
        setResultado(null);
      }
    }

    setSubView('nueva');
  };

  // Sale del modo edicion y deja el formulario en blanco para una
  // planificacion nueva.
  const cancelarEdicion = () => {
    setEditingPlanId(null);
    setConfig(nuevoBotellaForm());
    setBotellasPlan([]);
    setBotellasCombo([]);
    setMantenimientos([]);
    setCmHoras(2);
    setCmInicio(false);
    setCmOverrides({});
    setCmOverridesIndividual({});
    setHorasPorDia(emptyHorasPorDia());
    setResultado(null);
    setResultadoCombinado(null);
    setSaveMessage('');
    setCalcError('');
  };

  const eliminarPlan = async (id) => {
    try {
      await localApi.deletePlan(id);
      setPlanes((current) => current.filter((p) => p.id !== id));
      if (editingPlanId === id) cancelarEdicion();
    } catch {
      // Sin manejo especial: el usuario puede reintentar.
    }
  };

  const planesFiltrados = planes.filter((p) => {
    const { mes: mesPlan, semana: semanaPlan } = parseSemana(p.semana);
    return (!filtroAnio || obtenerAnio(p) === filtroAnio)
      && (!filtroMes || mesPlan === filtroMes)
      && (!filtroSemana || semanaPlan === filtroSemana)
      && (!filtroMaquina || p.maquina === filtroMaquina);
  });
  const aniosDisponibles = Array.from(new Set(planes.map((p) => obtenerAnio(p)).filter(Boolean))).sort();

  // Vista previa del PDF antes de descargarlo: arma el documento y lo
  // muestra en un iframe dentro de un modal -- recien ahi, si el usuario
  // confirma, se descarga. Antes de armarlo, trae el catalogo real
  // (Productos e insumos) de cada maquina involucrada para completar
  // preforma/gramaje en planes viejos que se guardaron antes de que se
  // empezara a registrar ese dato por botella.
  const abrirVistaPreviaPdf = async () => {
    if (!planesFiltrados.length) return;
    setGenerandoPdf(true);
    setPdfError('');
    try {
      const maquinas = new Set();
      planesFiltrados.forEach((p) => {
        if (p.datos?.esPar) { maquinas.add('SEM 78'); maquinas.add('SEM 63'); } else if (p.maquina) maquinas.add(p.maquina);
      });
      const entradas = await Promise.all(Array.from(maquinas).map(async (m) => {
        const catalogo = await localApi.getBotellasCatalogo(m).catch(() => []);
        const mapa = new Map();
        catalogo.forEach((item) => { if (!mapa.has(item.codBotella)) mapa.set(item.codBotella, item); });
        return [m, mapa];
      }));
      const catalogPorMaquina = Object.fromEntries(entradas);

      const { doc, filename } = construirPdfPlanes(
        planesFiltrados,
        { anio: filtroAnio, mes: filtroMes, semana: filtroSemana, maquina: filtroMaquina },
        catalogPorMaquina,
      );
      const url = doc.output('bloburl');
      setPdfPreview({ doc, url, filename });
    } catch (error) {
      setPdfError(error?.message || 'No se pudo generar la vista previa del PDF.');
    } finally {
      setGenerandoPdf(false);
    }
  };
  const cerrarVistaPreviaPdf = () => {
    if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
    setPdfPreview(null);
  };
  const descargarPdfPreview = () => {
    pdfPreview?.doc.save(pdfPreview.filename);
  };

  const grandTotal = resultado ? resultado.diasTotales.reduce((a, b) => a + b, 0) : 0;
  const horasCambioMolde = resultado
    ? resultado.resultado.filter((e) => e.cambioMolde).reduce((sum, e) => sum + e.horas, 0)
    : 0;
  const horasMantenimiento = resultado
    ? resultado.resultado.filter((e) => e.mantenimiento).reduce((sum, e) => sum + e.horas, 0)
    : 0;

  const botellas78Combo = botellasCombo.filter((b) => b.submaq !== '63');
  const botellas63Combo = botellasCombo.filter((b) => b.submaq === '63');

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
        Calculador de reparto semanal portado de DIGITALIZACION, incluida la maquina combinada
        SEM 63/78 (kanban por dia, pool de horas compartido entre las dos sub-maquinas) y
        Seguimiento (Planeacion Dinamica: compara lo real contra lo planificado y reparte de
        nuevo lo que falta). El orden de produccion de SEM 63/78 es el orden exacto de la lista
        de abajo -- cualquier combinacion entre botellas de SEM 78 y SEM 63.
      </div>

      <div className="planificacion-subtabs">
        <button
          type="button"
          className={`secondary-action ${subView === 'nueva' ? 'active-option' : ''}`}
          onClick={() => setSubView('nueva')}
        >
          Nueva planificacion
        </button>
        <button
          type="button"
          className={`secondary-action ${subView === 'general' ? 'active-option' : ''}`}
          onClick={() => setSubView('general')}
        >
          Vista general
        </button>
        <button
          type="button"
          className={`secondary-action ${subView === 'seguimiento' ? 'active-option' : ''}`}
          onClick={() => setSubView('seguimiento')}
        >
          Seguimiento
        </button>
      </div>

      {subView === 'nueva' && editingPlanId && (
        <div className="etiquetas-intro-banner">
          Editando un plan guardado — al presionar "Actualizar plan" se reemplaza ese plan (no
          crea uno nuevo).
          <button type="button" className="secondary-action" style={{ marginLeft: 12 }} onClick={cancelarEdicion}>
            Cancelar edicion
          </button>
        </div>
      )}

      {subView === 'nueva' && (
        <div className="planificacion-layout">
          <div className="panel planificacion-config">
            <div className="section-heading">
              <div><span>Planificacion</span><h2>Configuracion</h2></div>
            </div>

            <div className="form-grid planificacion-config-grid">
              <label className="field">
                <span>Año</span>
                <input
                  type="number" min="2020" max="2100"
                  value={config.anio}
                  onChange={(e) => updateConfig('anio', Number(e.target.value) || new Date().getFullYear())}
                />
              </label>
              <label className="field">
                <span>Mes</span>
                <select value={config.mes} onChange={(e) => updateConfig('mes', e.target.value)}>
                  {MESES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Semana</span>
                <select value={config.semana} onChange={(e) => updateConfig('semana', e.target.value)}>
                  {SEMANAS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Maquina</span>
                <select value={config.maquina} onChange={(e) => updateConfig('maquina', e.target.value)}>
                  <option value="">Seleccionar maquina</option>
                  {machines.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Fecha del domingo</span>
                <input
                  type="date"
                  value={config.fechaDomingo}
                  onChange={(e) => updateConfig('fechaDomingo', e.target.value)}
                />
              </label>
            </div>

            {isCombo ? (
              <>
                <div className="sec-title">
                  Orden de produccion (SEM 78 + SEM 63 juntas)
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: -4, marginBottom: 8 }}>
                  Una sola cola de produccion: reordena con ↑/↓ para armar cualquier combinacion
                  (ej. A, X, Y, B, C...). El badge de color indica de que sub-maquina es cada una --
                  toca el badge para cambiarla de sub-maquina sin perder su lugar en la fila.
                </p>
                <ListaBotellas
                  botellas={botellasCombo}
                  onRemove={hCombo.remove} onMove={hCombo.move} onUpdateField={hCombo.updateField}
                  onToggleSubmaq={toggleSubmaqCombo}
                />

                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <span className="planificacion-combo-badge" style={{ background: COLOR_78, marginBottom: 6, display: 'inline-flex' }}>SEM 78</span>
                    <BuscadorBotella
                      maquina={config.maquina} catalogo={catalogo78}
                      query={productQuery78} setQuery={setProductQuery78}
                      isOpen={isDropdown78Open} setIsOpen={setIsDropdown78Open}
                      fieldRef={productField78Ref} onAdd={(item) => addBotellaCombo(item, '78')}
                      placeholder="Buscar botella SEM 78..."
                    />
                  </div>
                  <div>
                    <span className="planificacion-combo-badge" style={{ background: COLOR_63, marginBottom: 6, display: 'inline-flex' }}>SEM 63</span>
                    <BuscadorBotella
                      maquina={config.maquina} catalogo={catalogo63}
                      query={productQuery63} setQuery={setProductQuery63}
                      isOpen={isDropdown63Open} setIsOpen={setIsDropdown63Open}
                      fieldRef={productField63Ref} onAdd={(item) => addBotellaCombo(item, '63')}
                      placeholder="Buscar botella SEM 63..."
                    />
                  </div>
                </div>

                <div className="sec-title" style={{ marginTop: 18 }}>Cambio de molde</div>
                <div className="form-grid planificacion-config-grid">
                  <label className="field">
                    <span>Horas entre botellas (por sub-maquina)</span>
                    <input type="number" min="0" step="0.5" value={cmHoras} onChange={(e) => setCmHoras(Number(e.target.value) || 0)} />
                  </label>
                </div>

                <div className="sec-title">Horas por dia (pool compartido)</div>
                <div className="planificacion-horas-grid">
                  {DIAS.map((dia, i) => (
                    <div key={dia} className="planificacion-horas-row">
                      <span>{DIAS_ABR[i]}</span>
                      <label>
                        <span>Manana</span>
                        <input type="number" min="0" max="24" step="0.5" value={horasPorDia[dia].manana} onChange={(e) => updateHoras(dia, 'manana', e.target.value)} />
                      </label>
                      <label>
                        <span>Noche</span>
                        <input type="number" min="0" max="24" step="0.5" value={horasPorDia[dia].noche} onChange={(e) => updateHoras(dia, 'noche', e.target.value)} />
                      </label>
                    </div>
                  ))}
                </div>

                <div className="save-row">
                  <button type="button" className="primary-action" onClick={calcular}>Calcular distribucion</button>
                  {calcError && <span className="etiquetas-form-error">{calcError}</span>}
                </div>
              </>
            ) : (
              <>
                <div className="sec-title">Botellas a producir</div>
                <ListaBotellas botellas={botellasPlan} onRemove={h.remove} onMove={h.move} onUpdateField={h.updateField} />
                <BuscadorBotella
                  maquina={config.maquina} catalogo={catalogo}
                  query={productQuery} setQuery={setProductQuery}
                  isOpen={isDropdownOpen} setIsOpen={setIsDropdownOpen}
                  fieldRef={productFieldRef} onAdd={addBotella}
                />

                <div className="sec-title">Cambio de molde</div>
                <div className="form-grid planificacion-config-grid">
                  <label className="field">
                    <span>Horas entre botellas</span>
                    <input type="number" min="0" step="0.5" value={cmHoras} onChange={(e) => setCmHoras(Number(e.target.value) || 0)} />
                  </label>
                  <label className="field planificacion-checkbox-field">
                    <span>&nbsp;</span>
                    <span className="planificacion-checkbox">
                      <input type="checkbox" checked={cmInicio} onChange={(e) => setCmInicio(e.target.checked)} />
                      Inicio de semana con cambio de molde
                    </span>
                  </label>
                </div>

                <div className="sec-title">Mantenimiento</div>
                {mantenimientos.length > 0 && (
                  <ul className="planificacion-mant-list">
                    {mantenimientos.map((m, i) => (
                      <li key={i}>
                        <span>{m.dia === 'all' ? 'Toda la semana' : m.dia} - {TURNOS_MANT.find((t) => t.value === m.turno)?.label} - {m.horas > 0 ? `${m.horas}h` : 'Turno completo'}</span>
                        <button type="button" className="etiquetas-delete-button" onClick={() => removeMantenimiento(i)}>Quitar</button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="planificacion-mant-form">
                  <select value={mantForm.dia} onChange={(e) => setMantForm((c) => ({ ...c, dia: e.target.value }))}>
                    <option value="all">Toda la semana</option>
                    {DIAS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select value={mantForm.turno} onChange={(e) => setMantForm((c) => ({ ...c, turno: e.target.value }))}>
                    {TURNOS_MANT.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input
                    type="number" min="0" step="0.5" title="0 = bloquea el turno completo"
                    value={mantForm.horas}
                    onChange={(e) => setMantForm((c) => ({ ...c, horas: Number(e.target.value) || 0 }))}
                  />
                  <button type="button" className="secondary-action" onClick={addMantenimiento}>+ Mant.</button>
                </div>

                <div className="sec-title">Horas por dia</div>
                <div className="planificacion-horas-grid">
                  {DIAS.map((dia, i) => (
                    <div key={dia} className="planificacion-horas-row">
                      <span>{DIAS_ABR[i]}</span>
                      <label>
                        <span>Manana</span>
                        <input type="number" min="0" max="24" step="0.5" value={horasPorDia[dia].manana} onChange={(e) => updateHoras(dia, 'manana', e.target.value)} />
                      </label>
                      <label>
                        <span>Noche</span>
                        <input type="number" min="0" max="24" step="0.5" value={horasPorDia[dia].noche} onChange={(e) => updateHoras(dia, 'noche', e.target.value)} />
                      </label>
                    </div>
                  ))}
                </div>

                <div className="save-row">
                  <button type="button" className="primary-action" onClick={calcular}>Calcular distribucion</button>
                  {calcError && <span className="etiquetas-form-error">{calcError}</span>}
                </div>
              </>
            )}
          </div>

          <div className="panel planificacion-result">
            <div className="section-heading">
              <div><span>Planificacion</span><h2>Resultado</h2></div>
            </div>

            {isCombo ? (
              !resultadoCombinado ? (
                <p className="etiquetas-empty">Arma el orden de produccion y las horas, luego presiona Calcular distribucion.</p>
              ) : (
                <>
                  <div className="planificacion-result-header">
                    <strong>{config.maquina}</strong>
                    <span className="planificacion-badge">{config.mes} {config.semana}</span>
                    <span className="planificacion-badge planificacion-badge-accent">
                      {(resultadoCombinado.diasTotales78.reduce((a, b) => a + b, 0) + resultadoCombinado.diasTotales63.reduce((a, b) => a + b, 0)).toLocaleString()} u
                    </span>
                  </div>

                  <PoolCompartido horasPorDia={horasPorDia} res78={resultadoCombinado.res78} res63={resultadoCombinado.res63} />

                  <KanbanMaquina
                    label="SEM 78" color={COLOR_78} bloques={resultadoCombinado.res78}
                    total={resultadoCombinado.diasTotales78.reduce((a, b) => a + b, 0)}
                    cmHoras={cmHoras} cmOverrides={cmOverrides} onSetCm={setCmOverrideBloque}
                  />
                  <KanbanMaquina
                    label="SEM 63" color={COLOR_63} bloques={resultadoCombinado.res63}
                    total={resultadoCombinado.diasTotales63.reduce((a, b) => a + b, 0)}
                    cmHoras={cmHoras} cmOverrides={cmOverrides} onSetCm={setCmOverrideBloque}
                  />

                  <div className="sec-title">Resumen SEM 78</div>
                  <TablaResultado
                    botellas={botellas78Combo} diasTotales={resultadoCombinado.diasTotales78}
                    botellasPorDia={resultadoCombinado.botellasPorDia78} faltantes={resultadoCombinado.faltantes78}
                  />
                  <div className="sec-title">Resumen SEM 63</div>
                  <TablaResultado
                    botellas={botellas63Combo} diasTotales={resultadoCombinado.diasTotales63}
                    botellasPorDia={resultadoCombinado.botellasPorDia63} faltantes={resultadoCombinado.faltantes63}
                  />

                  <div className="save-row">
                    <button type="button" className="primary-action" onClick={guardarPlan} disabled={isSaving}>
                      {isSaving ? 'Guardando...' : (editingPlanId ? 'Actualizar plan' : 'Guardar plan')}
                    </button>
                    {saveMessage && <span>{saveMessage}</span>}
                  </div>
                </>
              )
            ) : !resultado ? (
              <p className="etiquetas-empty">Configura las botellas y horas, luego presiona Calcular distribucion.</p>
            ) : (
              <>
                <div className="planificacion-result-header">
                  <strong>{config.maquina}</strong>
                  <span className="planificacion-badge">{config.mes} {config.semana}</span>
                  <span className="planificacion-badge planificacion-badge-accent">{grandTotal.toLocaleString()} u</span>
                  {horasCambioMolde > 0 && <span className="planificacion-badge">Cambio molde: {horasCambioMolde.toFixed(1)} h</span>}
                  {horasMantenimiento > 0 && <span className="planificacion-badge">Mantenimiento: {horasMantenimiento.toFixed(1)} h</span>}
                </div>

                <KanbanMaquina
                  label={config.maquina} color={COLOR_78} bloques={resultado.resultado}
                  total={grandTotal} cmHoras={cmHoras} cmOverrides={cmOverridesIndividual} onSetCm={setCmOverrideBloqueIndividual}
                />

                <div className="sec-title">Resumen</div>
                <TablaResultado
                  botellas={botellasPlan} diasTotales={resultado.diasTotales}
                  botellasPorDia={resultado.botellasPorDia} faltantes={resultado.faltantes}
                />

                <div className="save-row">
                  <button type="button" className="primary-action" onClick={guardarPlan} disabled={isSaving}>
                    {isSaving ? 'Guardando...' : (editingPlanId ? 'Actualizar plan' : 'Guardar plan')}
                  </button>
                  {saveMessage && <span>{saveMessage}</span>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {subView === 'general' && (
        <div className="panel planificacion-result">
          <div className="section-heading">
            <div><span>Planificacion</span><h2>Vista general ({planesFiltrados.length})</h2></div>
          </div>

          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <label className="field">
              <span>Año</span>
              <select value={filtroAnio} onChange={(e) => setFiltroAnio(e.target.value)}>
                <option value="">Todos</option>
                {aniosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Mes</span>
              <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)}>
                <option value="">Todos</option>
                {MESES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Semana</span>
              <select value={filtroSemana} onChange={(e) => setFiltroSemana(e.target.value)}>
                <option value="">Todas</option>
                {SEMANAS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Maquina</span>
              <select value={filtroMaquina} onChange={(e) => setFiltroMaquina(e.target.value)}>
                <option value="">Todas</option>
                {machines.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
              </select>
            </label>
          </div>

          <div className="save-row">
            <button
              type="button" className="secondary-action pdf-export-action"
              disabled={planesFiltrados.length === 0 || generandoPdf}
              onClick={abrirVistaPreviaPdf}
            >
              {generandoPdf ? 'Generando...' : 'Vista previa / Exportar a PDF'}
            </button>
            {pdfError && <span className="etiquetas-form-error">{pdfError}</span>}
          </div>

          {!planesLoaded ? (
            <p className="etiquetas-empty">Cargando...</p>
          ) : planesFiltrados.length === 0 ? (
            <p className="etiquetas-empty">Sin planificaciones guardadas todavia.</p>
          ) : (
            <div className="etiquetas-table-wrap">
              <table className="etiquetas-table">
                <thead>
                  <tr>
                    <th>Maquina</th>
                    <th>Año</th>
                    <th>Semana</th>
                    <th>Fecha</th>
                    <th>Botellas</th>
                    <th>Total</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {planesFiltrados.map((p) => {
                    const { bots, total } = resumenPlan(p);
                    return (
                      <tr key={p.id}>
                        <td>{p.maquina}</td>
                        <td>{obtenerAnio(p) || '-'}</td>
                        <td>{p.semana}</td>
                        <td>{p.fecha || '-'}</td>
                        <td>{bots.slice(0, 3).map((b) => b.cod).join(', ')}{bots.length > 3 ? ` +${bots.length - 3}` : ''}</td>
                        <td>{total.toLocaleString()}</td>
                        <td>
                          <div className="planificacion-row-actions">
                            <button type="button" className="secondary-action" onClick={() => cargarPlanParaEditar(p)}>Editar</button>
                            <button type="button" className="etiquetas-delete-button" onClick={() => eliminarPlan(p.id)}>Eliminar</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subView === 'seguimiento' && (
        <SeguimientoVista
          planes={planes} planesLoaded={planesLoaded}
          reportesDiarios={reportesDiarios} reportesLoaded={reportesLoaded}
          paros={paros} adiciones={adiciones} reasignaciones={reasignaciones}
          machines={machines}
          onAddParo={agregarParo} onDeleteParo={quitarParo}
          onAddAdicion={agregarAdicion} onDeleteAdicion={quitarAdicion}
          onReasignar={reasignarBotella} onDeleteReasignacion={quitarReasignacion}
        />
      )}

      {pdfPreview && (
        <div
          className="planificacion-pdf-modal-backdrop"
          onMouseDown={(e) => { if (e.target === e.currentTarget) cerrarVistaPreviaPdf(); }}
        >
          <div className="planificacion-pdf-modal">
            <header>
              <h2>Vista previa — {pdfPreview.filename}</h2>
              <div className="planificacion-pdf-modal-actions">
                <button type="button" className="secondary-action pdf-export-action" onClick={descargarPdfPreview}>
                  Descargar PDF
                </button>
                <button type="button" className="secondary-action" onClick={cerrarVistaPreviaPdf}>Cerrar</button>
              </div>
            </header>
            <iframe src={pdfPreview.url} title="Vista previa del PDF" />
          </div>
        </div>
      )}
    </section>
  );
}
