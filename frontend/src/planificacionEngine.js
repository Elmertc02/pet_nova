// Motor de calculo puro (sin DOM) para el reparto semanal de produccion.
// Traduccion directa de `calcular()` en DIGITALIZACION/static/js/planificacion.js
// (lineas 366-557) para el caso de una maquina normal, y de `calcPar()`
// (lineas 738-947) para la maquina combinada "SEM 63/78" (pool de horas
// compartido entre las dos sub-maquinas).

export const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
export const DIAS_ABR = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
export const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];
export const SEMANAS = ['SEMANA 1', 'SEMANA 2', 'SEMANA 3', 'SEMANA 4', 'SEMANA 5'];

// Formatea minutos absolutos (pueden pasar de 1440 = 24h) como "HH:MM" del
// dia que corresponda, dando la vuelta a las 24:00.
function formatoHora(totalMinAbs) {
  // Redondea al minuto -- los minutos absolutos vienen de horas de
  // produccion (cantidad / velocidad) que casi siempre tienen decimales
  // largos en punto flotante (ej. 1.9333333...), asi que sin redondear acá
  // el "HH:MM" sale con basura de coma flotante.
  const total = Math.round(totalMinAbs);
  const m = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Minuto del dia (0-1439) en que arranca el turno de un bloque -- punto de
// partida del horario aproximado, no un calculo de reloj exacto:
//  - NOCHE: siempre 23:30.
//  - MANANA: si el dia anterior tiene horas de NOCHE configuradas (la
//    maquina viene trabajando toda la noche), 06:30 -- justo donde
//    terminaria ese turno noche -- en vez del horario habitual. Si no,
//    segun el total de horas configuradas para el turno MANANA ESE DIA (no
//    las del bloque puntual -- asi todos los bloques de un mismo turno
//    comparten el mismo punto de partida y se encadenan uno detras de
//    otro en vez de reiniciar cada uno desde un ancla distinta):
//      hasta 4h: 10:00 / mas de 4h y hasta 8h: 07:30 / mas de 8h: 06:00
function anchorMinutosTurno(turno, horasTurnoTotal, diaIdx, horasPorDia) {
  if (turno === 'NOCHE') return 23 * 60 + 30;
  const diaAnterior = diaIdx > 0 ? DIAS[diaIdx - 1] : null;
  const vieneDeNoche = diaAnterior && Number(horasPorDia[diaAnterior]?.noche) > 0;
  if (vieneDeNoche) return 6 * 60 + 30;
  if (horasTurnoTotal <= 4) return 10 * 60;
  if (horasTurnoTotal <= 8) return 7 * 60 + 30;
  return 6 * 60;
}

// Texto de horario aproximado de un bloque, ENCADENADO con los bloques
// anteriores del mismo dia+turno: no arranca de cero cada vez, arranca
// justo donde termino el bloque previo de ese slot (`consumidoAntes` horas
// ya usadas ahi) -- asi un cambio de molde y la botella que sigue (o dos
// pedazos de un mismo cambio de molde partido entre turnos) quedan con
// horarios realmente consecutivos. Formato compacto ("23:30-01:24+1") para
// que entre en las columnas angostas del kanban/PDF.
function horarioTexto(turno, diaIdx, horasTurnoTotal, consumidoAntes, horasBloque, horasPorDia) {
  const anchor = anchorMinutosTurno(turno, horasTurnoTotal, diaIdx, horasPorDia);
  const inicioAbs = Math.round(anchor + consumidoAntes * 60);
  const finAbs = Math.round(inicioAbs + horasBloque * 60);
  const diasFin = Math.floor(finAbs / 1440);
  return `${formatoHora(inicioAbs)}-${formatoHora(finAbs)}${diasFin > 0 ? `+${diasFin}` : ''}`;
}

// Completa horaTexto en bloques que no lo tengan -- planes guardados antes
// de que se empezara a calcular esto no lo tienen en su JSON guardado.
// Reconstruye el mismo encadenado que calcularDistribucion/
// calcularDistribucionCombinada ya hacen al calcular, pero a partir del
// arreglo de bloques ya resuelto (que ya esta en el orden fisico correcto),
// en vez de tener que recalcular todo el plan desde cero.
export function asegurarHorarios(bloques, horasPorDia = {}) {
  if (!bloques?.length) return bloques ?? [];
  if (bloques.every((e) => e.horaTexto || e.diaIdx < 0)) return bloques;

  const horasTurnoTotal = {};
  DIAS.forEach((dia, diaIdx) => {
    horasTurnoTotal[`${diaIdx}-MANANA`] = Number(horasPorDia[dia]?.manana) || 0;
    horasTurnoTotal[`${diaIdx}-NOCHE`] = Number(horasPorDia[dia]?.noche) || 0;
  });

  const consumido = {};
  return bloques.map((e) => {
    if (e.diaIdx < 0) return e;
    const key = `${e.diaIdx}-${e.turno}`;
    const antes = consumido[key] || 0;
    if (e.horaTexto) { consumido[key] = antes + e.horas; return e; }
    const total = horasTurnoTotal[key] || 0;
    consumido[key] = antes + e.horas;
    return { ...e, horaTexto: horarioTexto(e.turno, e.diaIdx, total, antes, e.horas, horasPorDia) };
  });
}

// Arma los "slots" de la semana (un slot por dia+turno con horas > 0) a
// partir de horasPorDia -- usado tanto por el reparto de una maquina como
// por el combinado (SEM 63/78).
function buildSlots(horasPorDia) {
  const slots = [];
  DIAS.forEach((dia, idx) => {
    const hm = Number(horasPorDia[dia]?.manana) || 0;
    const hn = Number(horasPorDia[dia]?.noche) || 0;
    if (hm > 0) slots.push({ diaIdx: idx, dia, turno: 'MANANA', horas: hm });
    if (hn > 0) slots.push({ diaIdx: idx, dia, turno: 'NOCHE', horas: hn });
  });
  return slots;
}

// Expande la lista de mantenimientos ({dia:'all'|<DIAS>, turno, horas}) a
// entradas concretas por slot (diaIdx, turno, horas a consumir de ese slot).
// horas > 0 consume esa cantidad (topeada al slot); horas <= 0 bloquea el turno
// completo (mismo criterio que "Turno completo" en el formulario original).
function expandirMantenimientos(mantenimientos, slots) {
  const entries = [];
  for (const mant of mantenimientos) {
    const diasIdx = mant.dia === 'all'
      ? DIAS.map((d, i) => ({ d, i }))
      : DIAS.map((d, i) => ({ d, i })).filter((x) => x.d === mant.dia);
    const turnos = mant.turno === 'AMBOS' ? ['MANANA', 'NOCHE'] : [mant.turno];
    for (const { d, i: diaIdx } of diasIdx) {
      for (const turno of turnos) {
        const slot = slots.find((s) => s.diaIdx === diaIdx && s.turno === turno);
        if (!slot) continue;
        const h = mant.horas > 0 ? Math.min(mant.horas, slot.horas) : slot.horas;
        if (h > 0.001) entries.push({ diaIdx, dia: d, turno, horas: h });
      }
    }
  }
  return entries;
}

// horasPorDia: { [dia in DIAS]: { manana: number, noche: number } }
// botellas: [{ id, cod, desc, vel, cant }] en el orden en que se deben producir
// mantenimientos: [{ dia: 'all'|<DIAS>, turno: 'MANANA'|'NOCHE'|'AMBOS', horas }]
// cmHoras: horas de cambio de molde entre botellas (y al inicio si cmInicio) por
// defecto -- se puede anular por botella puntual con cmOverrides.
// cmOverrides: { [id de la botella]: horas } -- horas de cambio de molde
// especificas para el cambio que antecede a esa botella (algunos moldes
// tardan mas o menos que otros), en vez de cmHoras global.
export function calcularDistribucion({
  botellas, mantenimientos = [], horasPorDia = {}, cmHoras = 2, cmInicio = false, cmOverrides = {},
}) {
  const slots = buildSlots(horasPorDia);
  if (!slots.length) {
    return { error: 'Ingresa horas en al menos un dia.' };
  }

  const resultado = [];
  // horasOriginal queda fijo (copia de las horas totales del slot) para
  // poder calcular "cuanto se consumio antes" en cualquier momento y asi
  // encadenar el horario aproximado de los bloques de un mismo slot.
  const slotsLoc = slots.map((s) => ({ ...s, horasOriginal: s.horas }));

  // Salta slots ya agotados (horas <= 0) hasta encontrar uno con lugar.
  function avanzarSlotConHueco(desde) {
    let i = desde;
    while (i < slotsLoc.length && slotsLoc[i].horas <= 0.001) i += 1;
    return i;
  }

  const mantExpandidos = expandirMantenimientos(mantenimientos, slotsLoc);
  for (const me of mantExpandidos) {
    const si2 = slotsLoc.findIndex((s) => s.diaIdx === me.diaIdx && s.turno === me.turno);
    if (si2 === -1) continue;
    const s = slotsLoc[si2];
    const consumidoAntes = s.horasOriginal - s.horas;
    resultado.push({
      botIdx: -1, bot: { cod: 'MANT', desc: 'Mantenimiento' },
      diaIdx: me.diaIdx, dia: me.dia, turno: me.turno,
      horas: me.horas, botellas: 0, mantenimiento: true, cambioMolde: false, faltante: false,
      horaTexto: horarioTexto(s.turno, s.diaIdx, s.horasOriginal, consumidoAntes, me.horas, horasPorDia),
    });
    s.horas -= me.horas;
  }

  let si = avanzarSlotConHueco(0);

  const cmInicioHoras = botellas[0]?.id !== undefined && cmOverrides[botellas[0].id] !== undefined
    ? cmOverrides[botellas[0].id] : cmHoras;
  if (cmInicio && cmInicioHoras > 0) {
    let rem = cmInicioHoras;
    while (rem > 0.001 && si < slotsLoc.length) {
      const s = slotsLoc[si];
      const consume = Math.min(rem, s.horas);
      const consumidoAntes = s.horasOriginal - s.horas;
      resultado.push({
        id: botellas[0]?.id, botIdx: -1, bot: { cod: 'CM_INICIO', desc: 'Cambio molde inicio' },
        diaIdx: s.diaIdx, dia: s.dia, turno: s.turno,
        horas: consume, botellas: 0, cambioMolde: true, cmInicio: true, faltante: false,
        horaTexto: horarioTexto(s.turno, s.diaIdx, s.horasOriginal, consumidoAntes, consume, horasPorDia),
      });
      s.horas -= consume;
      rem -= consume;
      if (s.horas <= 0.001) si = avanzarSlotConHueco(si + 1);
    }
  }

  botellas.forEach((bot, bi) => {
    const cmHorasBi = bot.id !== undefined && cmOverrides[bot.id] !== undefined ? cmOverrides[bot.id] : cmHoras;
    if (bi > 0 && cmHorasBi > 0) {
      let cmRest = cmHorasBi;
      while (cmRest > 0.001 && si < slotsLoc.length) {
        const s = slotsLoc[si];
        const consume = Math.min(cmRest, s.horas);
        const consumidoAntes = s.horasOriginal - s.horas;
        resultado.push({
          id: bot.id, botIdx: bi, bot: { cod: bot.cod, desc: bot.desc }, diaIdx: s.diaIdx,
          dia: s.dia, turno: s.turno, horas: consume, botellas: 0, cambioMolde: true,
          horaTexto: horarioTexto(s.turno, s.diaIdx, s.horasOriginal, consumidoAntes, consume, horasPorDia),
        });
        s.horas -= consume;
        cmRest -= consume;
        if (s.horas <= 0.001) si = avanzarSlotConHueco(si + 1);
      }
    }

    if (!bot.vel || bot.vel <= 0) {
      resultado.push({
        botIdx: bi, bot: { cod: bot.cod, desc: bot.desc }, diaIdx: -1, dia: '-',
        turno: '-', horas: 0, botellas: bot.cant, faltante: true, cambioMolde: false,
      });
      return;
    }

    let rest = bot.cant;
    while (rest > 0 && si < slotsLoc.length) {
      const s = slotsLoc[si];
      const cap = Math.floor(bot.vel * s.horas);
      if (cap <= 0) { si = avanzarSlotConHueco(si + 1); continue; }
      const prod = Math.min(rest, cap);
      const hu = prod / bot.vel;
      const consumidoAntes = s.horasOriginal - s.horas;
      resultado.push({
        botIdx: bi, bot: { cod: bot.cod, desc: bot.desc, vel: bot.vel }, diaIdx: s.diaIdx,
        dia: s.dia, turno: s.turno, horas: hu, botellas: prod, faltante: false, cambioMolde: false,
        horaTexto: horarioTexto(s.turno, s.diaIdx, s.horasOriginal, consumidoAntes, hu, horasPorDia),
      });
      s.horas -= hu;
      rest -= prod;
      if (s.horas <= 0.001) si = avanzarSlotConHueco(si + 1);
    }
    if (rest > 0) {
      resultado.push({
        botIdx: bi, bot: { cod: bot.cod, desc: bot.desc }, diaIdx: -1, dia: '-',
        turno: '-', horas: 0, botellas: rest, faltante: true, cambioMolde: false,
      });
    }
  });

  const diasTotales = [0, 0, 0, 0, 0, 0, 0];
  const botellasPorDia = {};
  resultado.forEach((e) => {
    if (e.cambioMolde || e.faltante || e.diaIdx < 0) return;
    diasTotales[e.diaIdx] += e.botellas;
    if (!botellasPorDia[e.bot.cod]) botellasPorDia[e.bot.cod] = {};
    botellasPorDia[e.bot.cod][e.dia] = (botellasPorDia[e.bot.cod][e.dia] || 0) + e.botellas;
  });

  const faltantes = resultado.filter((e) => e.faltante && e.diaIdx < 0);

  return { resultado, diasTotales, botellasPorDia, faltantes, slots };
}

// ── SEM 63/78 (maquina combinada): pool de horas compartido ─────────────────
// Traduccion simplificada de calcPar() en DIGITALIZACION/static/js/planificacion.js
// (lineas 738-947) -- sin el calculo de hora de reloj exacta (horaIni/horaFin,
// que no usa ninguna vista de esta app) y sin la simulacion de "arranques
// alternados" del original: aca el orden de produccion es DIRECTO, el que
// el usuario armo en la lista unica (botellasCombo) -- las dos sub-maquinas
// comparten una sola maquina fisica (un solo pool de horas), asi que el
// orden de esa lista ES el orden real en que se producen, sin importar de
// que sub-maquina sea cada una (permite cualquier combinacion: A(78),
// X(63), Y(63), B(78), C(78), etc.).
//
// El pool se consume por slot (dia+turno, igual que calcularDistribucion),
// no por dia entero: si un cambio de molde (o una produccion) no termina
// dentro del turno MANANA, sigue consumiendo del turno NOCHE del mismo dia
// con el tiempo que le queda -- no arranca de nuevo -- y el bloque generado
// para esa porcion queda etiquetado con el turno que realmente se esta
// usando en ese momento (para que el kanban y el horario aproximado sean
// correctos incluso cuando un cambio/produccion cruza de MANANA a NOCHE).
//
// botellasCombo: [{ id, cod, desc, vel, cant, submaq: '78'|'63' }], en el
// orden exacto de produccion.
// cmOverrides: { [id]: horas } -- horas de cambio de molde especificas para
// el bloque que antecede a la botella con ese id, en vez de cmHoras global.
export function calcularDistribucionCombinada({
  botellasCombo = [], horasPorDia = {}, cmHoras = 2, cmOverrides = {},
}) {
  const slots = buildSlots(horasPorDia);
  if (!slots.length) return { error: 'Ingresa horas en al menos un dia.' };
  if (!botellasCombo.length) return { error: 'Agrega al menos una botella a SEM 78 o SEM 63.' };

  const slotsLoc = slots.map((s) => ({ ...s, horasOriginal: s.horas }));

  // Salta slots ya agotados (horas <= 0) hasta encontrar uno con lugar, o
  // se queda sin pool (devuelve el largo del arreglo).
  function avanzarSlotConHueco(desde) {
    let i = desde;
    while (i < slotsLoc.length && slotsLoc[i].horas <= 0.001) i += 1;
    return i;
  }

  const res78 = [];
  const res63 = [];
  const huboAnterior = { 78: false, 63: false };
  let si = avanzarSlotConHueco(0);

  for (const bot of botellasCombo) {
    const pref = bot.submaq === '63' ? '63' : '78';
    const res = pref === '78' ? res78 : res63;
    const vel = bot.vel || 0;

    // Cambio de molde entre bloques de la misma sub-maquina (usa el override
    // de este bloque si el usuario lo edito a mano, si no el valor global) --
    // consume del slot actual y, si no le alcanza, sigue con el resto en el
    // siguiente slot (mismo criterio que calcularDistribucion).
    if (huboAnterior[pref]) {
      const cmHorasBi = cmOverrides[bot.id] !== undefined ? cmOverrides[bot.id] : cmHoras;
      let cmRest = cmHorasBi;
      while (cmRest > 0.001 && si < slotsLoc.length) {
        const s = slotsLoc[si];
        const consume = Math.min(cmRest, s.horas);
        const consumidoAntes = s.horasOriginal - s.horas;
        res.push({
          id: bot.id, bot: { cod: bot.cod, desc: bot.desc }, diaIdx: s.diaIdx,
          dia: s.dia, turno: s.turno, horas: consume,
          botellas: 0, cambioMolde: true, faltante: false,
          horaTexto: horarioTexto(s.turno, s.diaIdx, s.horasOriginal, consumidoAntes, consume, horasPorDia),
        });
        s.horas -= consume;
        cmRest -= consume;
        if (s.horas <= 0.001) si = avanzarSlotConHueco(si + 1);
      }
    }

    if (vel <= 0) {
      res.push({
        id: bot.id, bot: { cod: bot.cod, desc: bot.desc }, diaIdx: -1, dia: '-',
        turno: '-', horas: 0, botellas: bot.cant, faltante: true, cambioMolde: false,
      });
      huboAnterior[pref] = true;
      continue;
    }

    let rest = bot.cant;
    while (rest > 0 && si < slotsLoc.length) {
      const s = slotsLoc[si];
      const cap = Math.floor(vel * s.horas);
      if (cap <= 0) { si = avanzarSlotConHueco(si + 1); continue; }
      const prod = Math.min(rest, cap);
      const hu = prod / vel;
      const consumidoAntes = s.horasOriginal - s.horas;
      res.push({
        id: bot.id, bot: { cod: bot.cod, desc: bot.desc, vel: bot.vel }, diaIdx: s.diaIdx,
        dia: s.dia, turno: s.turno, horas: hu, botellas: prod, faltante: false, cambioMolde: false,
        horaTexto: horarioTexto(s.turno, s.diaIdx, s.horasOriginal, consumidoAntes, hu, horasPorDia),
      });
      s.horas -= hu;
      rest -= prod;
      if (s.horas <= 0.001) si = avanzarSlotConHueco(si + 1);
    }

    if (rest > 0) {
      res.push({
        id: bot.id, bot: { cod: bot.cod, desc: bot.desc }, diaIdx: -1, dia: '-',
        turno: '-', horas: 0, botellas: rest, faltante: true, cambioMolde: false,
      });
    }
    huboAnterior[pref] = true;
  }

  function totales(res) {
    const diasTotales = [0, 0, 0, 0, 0, 0, 0];
    const botellasPorDia = {};
    res.forEach((e) => {
      if (e.cambioMolde || e.faltante || e.diaIdx < 0) return;
      diasTotales[e.diaIdx] += e.botellas;
      if (!botellasPorDia[e.bot.cod]) botellasPorDia[e.bot.cod] = {};
      botellasPorDia[e.bot.cod][e.dia] = (botellasPorDia[e.bot.cod][e.dia] || 0) + e.botellas;
    });
    return { diasTotales, botellasPorDia, faltantes: res.filter((e) => e.faltante && e.diaIdx < 0) };
  }

  const t78 = totales(res78);
  const t63 = totales(res63);

  return {
    res78,
    res63,
    diasTotales78: t78.diasTotales,
    botellasPorDia78: t78.botellasPorDia,
    faltantes78: t78.faltantes,
    diasTotales63: t63.diasTotales,
    botellasPorDia63: t63.botellasPorDia,
    faltantes63: t63.faltantes,
    slots,
  };
}

// ── Seguimiento (Planeacion Dinamica de DIGITALIZACION) ─────────────────────
// Para un plan vigente (su semana incluye la fecha de hoy): compara lo
// producido real (Reportes) contra lo planificado dia a dia, calcula
// cuantos dias de adelanto/atraso lleva cada botella, y vuelve a repartir
// lo que falta producir entre los dias que quedan de la semana.
//
// A diferencia de DIGITALIZACION (que reimplementa el algoritmo de reparto
// a mano en `_recalcular_grupo`), aca alcanza con armar la lista de "lo
// que falta" (restante en vez de cant, botella en curso primero, adiciones
// insertadas en su posicion) y volver a llamar a calcularDistribucion con
// horasPorDia recortado a los dias que quedan -- el motor ya hace el resto
// (y el hecho de que la primera botella de la lista nunca paga cambio de
// molde reproduce exactamente el "prev_cod_inicial" de DIGITALIZACION sin
// tener que tratarlo aparte).
//
// Para SEM 63/78 se llama una vez por sub-maquina (con su propia lista de
// botellas/resultado/botellasPorDia/adiciones), igual que hacen
// calcularDistribucion/calcularDistribucionCombinada por separado.
//
// botellas: [{ id, cod, desc, vel }] del plan original para esta
//   (sub)maquina (sin cant -- se usa el total ya planificado, ver abajo).
// resultadoOriginal: el array `resultado`/`resultado78`/`resultado63`
//   guardado en el plan (para saber el orden real de produccion y cual
//   botella estaba en curso justo antes de hoy).
// botellasPorDia: el `botellasPorDia`/`botellasPorDia78`/`botellasPorDia63`
//   guardado en el plan ({ [cod]: { [dia]: cantidad } }).
// reportesPorDia: { [diaIdx]: { [cod]: cantidadReal } } ya filtrado por
//   maquina (o sub-maquina) y por la semana de este plan.
// paros: [{ diaIdx, horas }] de esta semana+maquina.
// adiciones: [{ id, codBot, descripcion, cantidad, vel, despuesDe }] de
//   esta semana+maquina, en el orden en que se cargaron.
// diaIdxHoy: 0 (Domingo) .. 6 (Sabado).
export function calcularSeguimiento({
  botellas, resultadoOriginal = [], botellasPorDia = {}, horasPorDia = {},
  cmHoras = 2, cmOverrides = {}, reportesPorDia = {}, paros = [], adiciones = [], diaIdxHoy,
}) {
  const hoy = Math.max(0, Math.min(6, diaIdxHoy));

  // 1) Planificado/producido acumulado a hoy, por botella del plan original.
  const infoPorCod = new Map();
  botellas.forEach((b) => {
    const diasOrig = botellasPorDia[b.cod] || {};
    const total = DIAS.reduce((sum, d) => sum + (diasOrig[d] || 0), 0);
    if (total <= 0) return;
    let producidoAcum = 0;
    let planificadoAcum = 0;
    const diasPasado = [];
    for (let idx = 0; idx < hoy; idx += 1) {
      const dname = DIAS[idx];
      const real = reportesPorDia[idx]?.[b.cod] || 0;
      producidoAcum += real;
      planificadoAcum += diasOrig[dname] || 0;
      diasPasado.push({ dia: dname, diaIdx: idx, planOriginal: diasOrig[dname] || 0, real });
    }
    const restante = Math.max(0, total - producidoAcum);
    const ritmo = total / 7;
    const desfaseDias = ritmo > 0 ? (producidoAcum - planificadoAcum) / ritmo : 0;
    infoPorCod.set(b.cod, {
      id: b.id, cod: b.cod, desc: b.desc, vel: b.vel,
      total, producidoAcum, planificadoAcum, restante, desfaseDias, diasPasado, esAdicion: false,
    });
  });

  // Horas promedio configuradas por dia (para poder convertir "dias al
  // ritmo real" en horas aproximadas) -- promedio de toda la semana, no
  // solo de los dias que quedan.
  const horasPromedioDia = DIAS.reduce(
    (sum, d) => sum + (Number(horasPorDia[d]?.manana) || 0) + (Number(horasPorDia[d]?.noche) || 0), 0,
  ) / 7;

  // 2) Botella "en curso": la ultima con bloque real (no cambio de molde,
  // no mantenimiento, no faltante) en un dia anterior a hoy, en el orden
  // real de produccion (resultadoOriginal).
  let codEnCurso = null;
  const ordenOriginal = [];
  const vistos = new Set();
  resultadoOriginal.forEach((e) => {
    if (e.cambioMolde || e.mantenimiento || e.faltante) return;
    const cod = e.bot?.cod;
    if (!cod) return;
    if (!vistos.has(cod)) { vistos.add(cod); ordenOriginal.push(cod); }
    if (e.diaIdx >= 0 && e.diaIdx < hoy) codEnCurso = cod;
  });
  infoPorCod.forEach((info, cod) => { if (!vistos.has(cod)) ordenOriginal.push(cod); });

  // 3) Lista de "lo que falta", en el orden real de produccion, con la
  // botella en curso primero.
  const restanteList = ordenOriginal
    .map((cod) => infoPorCod.get(cod))
    .filter((info) => info && info.restante > 0);
  if (codEnCurso) {
    const idx = restanteList.findIndex((info) => info.cod === codEnCurso);
    if (idx > 0) restanteList.unshift(restanteList.splice(idx, 1)[0]);
  }

  // Adiciones: se insertan en la posicion pedida (despuesDe = cod de otra
  // botella, o '' = al inicio), con id propio (para cmOverrides) y
  // restante = la cantidad completa (recien se agregan, no tienen historial).
  adiciones.forEach((adic) => {
    if (!adic.codBot || !(adic.cantidad > 0) || !(adic.vel > 0)) return;
    const info = {
      id: `adic-${adic.id}`, cod: adic.codBot, desc: adic.descripcion || adic.codBot,
      vel: adic.vel, total: adic.cantidad, producidoAcum: 0, restante: adic.cantidad,
      desfaseDias: 0, diasPasado: [], esAdicion: true, adicionId: adic.id,
    };
    const ref = adic.despuesDe || '';
    if (!ref) { restanteList.unshift(info); return; }
    const pos = restanteList.findIndex((x) => x.cod === ref);
    restanteList.splice(pos === -1 ? restanteList.length : pos + 1, 0, info);
  });

  // 4) horasPorDia recortado: nada antes de hoy: a los dias que quedan se
  // les resta lo que se llevan los paros de ese dia (primero de MANANA,
  // si sobra de NOCHE -- mismo orden que agota DIGITALIZACION).
  const horasPorDiaRestante = {};
  DIAS.forEach((d, idx) => {
    if (idx < hoy) { horasPorDiaRestante[d] = { manana: 0, noche: 0 }; return; }
    let horasParo = paros.filter((p) => p.diaIdx === idx).reduce((a, p) => a + (Number(p.horas) || 0), 0);
    let manana = Number(horasPorDia[d]?.manana) || 0;
    let noche = Number(horasPorDia[d]?.noche) || 0;
    if (horasParo > 0) {
      const quitarManana = Math.min(horasParo, manana);
      manana -= quitarManana;
      horasParo -= quitarManana;
      noche -= Math.min(horasParo, noche);
    }
    horasPorDiaRestante[d] = { manana, noche };
  });

  // 5) Re-ejecuta el motor de reparto con "lo que falta" + los dias que
  // quedan -- misma regla que la planificacion estatica (secuencial, segun
  // velocidad y horas disponibles, cambio de molde entre botellas).
  const noProducibles = [];
  const diasFuturoPorCod = new Map();
  if (restanteList.length) {
    const botellasRestante = restanteList.map((info) => ({
      id: info.id, cod: info.cod, desc: info.desc, vel: info.vel, cant: info.restante,
    }));
    const salida = calcularDistribucion({
      botellas: botellasRestante, mantenimientos: [], horasPorDia: horasPorDiaRestante,
      cmHoras, cmInicio: false, cmOverrides,
    });
    if (!salida.error) {
      restanteList.forEach((info) => {
        const porDia = salida.botellasPorDia[info.cod] || {};
        diasFuturoPorCod.set(info.cod, DIAS
          .map((d, idx) => ({ dia: d, diaIdx: idx, cantidad: porDia[d] || 0 }))
          .filter((x) => x.diaIdx >= hoy));
      });
      salida.faltantes.forEach((f) => {
        const info = restanteList.find((x) => x.cod === f.bot.cod);
        noProducibles.push({
          cod: f.bot.cod, desc: info?.desc || f.bot.desc, restante: f.botellas,
          vel: info?.vel || 0, esAdicion: info?.esAdicion || false, adicionId: info?.adicionId,
        });
      });
    }
  }

  const diasFuturoVacio = DIAS.map((d, idx) => ({ dia: d, diaIdx: idx, cantidad: 0 })).filter((x) => x.diaIdx >= hoy);
  const botellasResultado = [...infoPorCod.values(), ...restanteList.filter((i) => i.esAdicion)].map((info) => {
    // % de cumplimiento: de lo que ya deberia estar hecho a hoy (segun el
    // plan), cuanto se hizo realmente. null = todavia no arranco su turno
    // (nada planificado antes de hoy), no "0%" (que se leeria como atraso).
    const pctCumplimiento = info.planificadoAcum > 0
      ? Math.round((info.producidoAcum / info.planificadoAcum) * 100) : null;

    // Ritmo real (unidades/dia) observado hasta hoy, y cuantos dias/horas
    // mas se llevaria terminar lo que falta SI SIGUE a ese ritmo real (no
    // al ideal de la velocidad configurada) -- para saber si conviene
    // reforzar antes de que se atrase mas.
    const ritmoRealDiario = hoy > 0 ? info.producidoAcum / hoy : 0;
    let diasEstimadosAlRitmoReal = null;
    let horasEstimadasAlRitmoReal = null;
    let alcanzaEstaSemana = true;
    if (info.restante <= 0) {
      diasEstimadosAlRitmoReal = 0;
      horasEstimadasAlRitmoReal = 0;
    } else if (ritmoRealDiario > 0) {
      diasEstimadosAlRitmoReal = Math.round((info.restante / ritmoRealDiario) * 10) / 10;
      horasEstimadasAlRitmoReal = Math.round(diasEstimadosAlRitmoReal * horasPromedioDia * 10) / 10;
      alcanzaEstaSemana = hoy + diasEstimadosAlRitmoReal <= 7;
    } else {
      alcanzaEstaSemana = false; // nada de ritmo real todavia y falta producir -- sin datos para prometer nada
    }

    return {
      id: info.id, cod: info.cod, desc: info.desc, vel: info.vel,
      total: info.total, producidoAcumulado: info.producidoAcum, restante: info.restante,
      desfaseDias: Math.round(info.desfaseDias * 10) / 10,
      pctCumplimiento, ritmoRealDiario: Math.round(ritmoRealDiario * 10) / 10,
      diasEstimadosAlRitmoReal, horasEstimadasAlRitmoReal, alcanzaEstaSemana,
      diasPasado: info.diasPasado,
      diasFuturo: diasFuturoPorCod.get(info.cod) || diasFuturoVacio,
      esAdicion: info.esAdicion, adicionId: info.adicionId,
    };
  });

  return { botellas: botellasResultado, noProducibles, diaIdxHoy: hoy };
}

// ── Historial (real vs planificado, sin redistribuir) ───────────────────────
// Para revisar CUALQUIER semana (vigente o ya terminada): compara, dia por
// dia, lo planificado contra lo realmente reportado -- sin volver a
// repartir nada (a diferencia de calcularSeguimiento, que es para la
// semana en curso). Se puede llamar con calcularHistorialSemana varias
// veces (una por plan/maquina) y sumar sus totales para armar un
// historial de "todas las maquinas" de un mes/año.
//
// botellas/botellasPorDia: igual que calcularSeguimiento.
// reportesPorDia: { [diaIdx]: { [cod]: cantidadReal } } de TODA la semana
//   (no solo hasta hoy -- para una semana vieja ya esta completa).
export function calcularHistorialSemana({ botellas, botellasPorDia = {}, reportesPorDia = {} }) {
  const filas = [];
  let totalPlan = 0;
  let totalReal = 0;
  botellas.forEach((b) => {
    const diasOrig = botellasPorDia[b.cod] || {};
    const total = DIAS.reduce((sum, d) => sum + (diasOrig[d] || 0), 0);
    const dias = DIAS.map((d, idx) => {
      const plan = diasOrig[d] || 0;
      const real = reportesPorDia[idx]?.[b.cod] || 0;
      totalPlan += plan;
      totalReal += real;
      return { dia: d, diaIdx: idx, plan, real };
    });
    const realTotal = dias.reduce((sum, d) => sum + d.real, 0);
    if (total <= 0 && realTotal <= 0) return;
    filas.push({
      cod: b.cod, desc: b.desc, total, realTotal,
      pct: total > 0 ? Math.round((realTotal / total) * 100) : null,
      dias,
    });
  });
  return { botellas: filas, totalPlan, totalReal };
}
