// Motor de reparto automatico de Planificacion Mensual: dado un Estimado
// Mensual por botella y la capacidad (horas disponibles) de cada maquina
// por semana, decide cuanto producir de cada botella en cada semana.
//
// Reglas:
// - Para el calculo automatico se usan como mucho MAX_MAQUINAS_AUTOMATICO
//   maquinas por botella (el limite real de hoy), aunque el usuario haya
//   tildado mas como candidatas -- se toman las de mayor velocidad entre
//   las tildadas, para que el reparto sea lo mas eficiente posible dentro
//   de ese limite.
// - Reparto greedy semana por semana: en cada semana, cada botella (en el
//   orden de la lista -- ese orden es la prioridad) intenta cubrir lo que
//   le falta con sus maquinas elegidas, en el orden que corresponda segun
//   la capacidad que les quede esa semana. Si dos botellas compiten por la
//   misma maquina, la que esta mas arriba en la lista se sirve primero.
// - Si al final del mes una botella no llego al Estimado Mensual, queda
//   marcada como no cumplida (no es un error, es informativo).

export const MAX_SEMANAS_MENSUAL = 5;
export const MAX_MAQUINAS_AUTOMATICO = 2;

// Cuantas semanas (Domingo-Sabado) toca un mes -- mismo criterio que la
// grilla de un calendario. Capado en MAX_SEMANAS_MENSUAL.
export function semanasDelMes(anio, mesIdx) {
  const primerDiaSemana = new Date(anio, mesIdx, 1).getDay();
  const diasEnMes = new Date(anio, mesIdx + 1, 0).getDate();
  return Math.min(MAX_SEMANAS_MENSUAL, Math.ceil((primerDiaSemana + diasEnMes) / 7));
}

// De las maquinas candidatas (elegidas a mano, sin tope), recorta a como
// mucho MAX_MAQUINAS_AUTOMATICO -- las de mayor velocidad.
export function maquinasParaAutomatico(candidatas) {
  return [...(candidatas || [])]
    .sort((a, b) => b.velocidad - a.velocidad)
    .slice(0, MAX_MAQUINAS_AUTOMATICO);
}

// items: [{ codBot, estimadoMensual, maquinas: [{maquina, velocidad, claveCapacidad?}, ...] }]
//   (maquinas ya recortada con maquinasParaAutomatico -- el motor no vuelve
//   a recortar, solo reparte con lo que le dan). "claveCapacidad" es
//   opcional -- se usa para maquinas que comparten un mismo pool de horas
//   con otra (ej. SEM 63 y SEM 78 trabajan secuencialmente, nunca las dos a
//   la vez: las dos apuntan a la clave "SEM 63/78" en vez de a su propio
//   nombre). Si no viene, se usa el nombre de la maquina tal cual.
// capacidad: { [claveCapacidad]: [horas semana1, horas semana2, ...] }
// numSemanas: cuantas semanas tiene el mes
export function calcularReparto({ items, capacidad, numSemanas }) {
  const capacidadRestante = {};
  for (const clave of Object.keys(capacidad || {})) {
    const horas = capacidad[clave] || [];
    capacidadRestante[clave] = Array.from({ length: numSemanas }, (_, i) => Number(horas[i]) || 0);
  }

  const resultado = (items || []).map((item) => ({
    codBot: item.codBot,
    requerido: Number(item.estimadoMensual) || 0,
    porSemana: Array.from({ length: numSemanas }, () => 0),
  }));

  for (let semana = 0; semana < numSemanas; semana++) {
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const fila = resultado[idx];
      let producidoHastaAhora = fila.porSemana.reduce((s, n) => s + n, 0);
      let faltante = fila.requerido - producidoHastaAhora;
      if (faltante <= 0) continue;
      for (const m of item.maquinas || []) {
        if (faltante <= 0) break;
        const clave = m.claveCapacidad || m.maquina;
        const horasDisp = capacidadRestante[clave]?.[semana] ?? 0;
        if (horasDisp <= 0 || m.velocidad <= 0) continue;
        const posible = horasDisp * m.velocidad;
        const producir = Math.min(faltante, posible);
        if (producir <= 0) continue;
        const horasUsadas = producir / m.velocidad;
        capacidadRestante[clave][semana] -= horasUsadas;
        fila.porSemana[semana] += producir;
        faltante -= producir;
      }
    }
  }

  for (const fila of resultado) {
    fila.totalProducido = fila.porSemana.reduce((s, n) => s + n, 0);
    fila.faltante = Math.max(0, fila.requerido - fila.totalProducido);
    fila.cumplido = fila.requerido <= 0 || fila.faltante <= 0;
  }

  return resultado;
}
