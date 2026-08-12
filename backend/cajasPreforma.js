// Aplicar/revertir consumo de cajas de preforma contra un reporte diario.
// Traduccion de cajas_pref_aplicar_reporte() / cajas_pref_revertir_reporte()
// en DIGITALIZACION/core.py, mas la logica de cascada de recalcCajas() en
// DIGITALIZACION/static/js/reporte.js (estado ninguno/faltante/sobrante/
// cambio_caja, alta de cajas nuevas directo desde el reporte, y Preformas
// Observadas). No incluye el estado 'calidad' (bloqueo por control de
// calidad) -- no se pidio en esta fase.
//
// Preformas observadas: van SEPARADAS del consumo normal de la caja, no
// sumadas. Si la cascada calculo que esta caja aporta 500 unidades a la
// produccion, y de esas 100 salieron observadas (defectuosas), la caja
// igual pierde 500 preformas en total -- pero se registran como DOS
// movimientos: uno de consumo normal (400, lo que realmente se convirtio en
// produccion -- ese es el "Total usado" que se ve en Consumo de preformas)
// y uno de observado (100, con su descripcion), visible aparte en el
// historial de esa caja en Almacen Produccion (Cajas de preforma).

import { dbAll, withTransaction } from './db.js';

// consumos: [{ cajaId (null si es caja nueva), codPreforma, numCaja, op,
//   resina, saldoAnterior (cantidad inicial si es caja nueva), cantidad
//   (consumo normal de esa caja, ya neto de las observadas), estado,
//   cantidadIrregular, defectos: [{cantidad, descripcion}] }]
export async function aplicarConsumosPreforma(reporteId, consumos, fecha) {
  await withTransaction(async ({ get, run }) => {
    for (const item of consumos ?? []) {
      let cajaId = Number(item.cajaId) || 0;
      const cantidad = Number(item.cantidad) || 0;
      const estado = ['ninguno', 'faltante', 'sobrante', 'cambio_caja'].includes(item.estado) ? item.estado : 'ninguno';
      const cantidadIrregular = Number(item.cantidadIrregular) || 0;
      const defectos = Array.isArray(item.defectos) ? item.defectos : [];

      // Caja nueva: no vino con id porque N. caja + OP no coincidieron con
      // ninguna caja activa de esa preforma. Se crea aca mismo, con el saldo
      // anterior indicado como cantidad inicial.
      if (cajaId <= 0) {
        const codPreforma = String(item.codPreforma ?? '').trim();
        const numCaja = String(item.numCaja ?? '').trim();
        const saldoInicial = Number(item.saldoAnterior) || 0;
        if (!codPreforma || !numCaja || saldoInicial <= 0) continue;
        const info = await run(
          `INSERT INTO cajas_preforma (cod_preforma, num_caja, op, resina, cantidad_inicial, cantidad_actual, fecha_ingreso, estado)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'activa') RETURNING id`,
          [codPreforma, numCaja, String(item.op ?? ''), String(item.resina ?? ''), saldoInicial, saldoInicial, fecha || null],
        );
        cajaId = info.rows[0].id;
      }

      const caja = await get('SELECT * FROM cajas_preforma WHERE id = ?', [cajaId]);
      if (!caja) continue;

      // Descuenta "cantidad" (consumo normal, si > 0) y registra su movimiento.
      // El estado de la caja tiene que reflejar 'faltante'/'sobrante' cuando
      // el consumo se marco asi (mientras le quede saldo -- si se vacia,
      // 'vaciada' manda igual, ver descontarCaja). 'ninguno'/'cambio_caja' no
      // son un estado propio de la caja -- quedan en 'activa'.
      if (cantidad > 0) {
        const estadoCaja = estado === 'faltante' || estado === 'sobrante' ? estado : 'activa';
        await descontarCaja(get, run, cajaId, cantidad, fecha, async (nuevoSaldoAnterior) => {
          await run(
            `INSERT INTO cajas_preforma_mov (caja_id, reporte_id, cantidad, fecha, estado, cantidad_irregular, saldo_anterior)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [cajaId, reporteId, cantidad, fecha || null, estado, cantidadIrregular, nuevoSaldoAnterior],
          );
        }, estadoCaja);
      }

      // Descuenta cada preforma observada, aparte, con su propia descripcion.
      // No pasa estadoCaja -- no debe pisar el 'faltante'/'sobrante' que haya
      // dejado el consumo normal de arriba (mismo reporte, misma caja).
      for (const defecto of defectos) {
        const cantidadObs = Number(defecto.cantidad) || 0;
        if (cantidadObs <= 0) continue;
        await descontarCaja(get, run, cajaId, cantidadObs, fecha, async (nuevoSaldoAnterior) => {
          await run(
            `INSERT INTO cajas_preforma_mov (caja_id, reporte_id, cantidad, fecha, estado, cantidad_irregular, saldo_anterior, descripcion)
             VALUES (?, ?, ?, ?, 'observado', 0, ?, ?)`,
            [cajaId, reporteId, cantidadObs, fecha || null, nuevoSaldoAnterior, String(defecto.descripcion ?? '').trim()],
          );
        });
      }
    }
  });
}

// Descuenta "cantidad" de la caja (actualiza cantidad_actual/estado) y
// llama a insertarMov(saldoAnteriorDeEsteDescuento) para registrar el
// movimiento correspondiente -- factoreado porque el consumo normal y cada
// preforma observada son descuentos independientes contra la misma caja,
// cada uno con su propio "saldo anterior" (el saldo justo antes de ESE
// descuento puntual, no el de la caja al principio del reporte).
//
// estadoCaja: estado a dejarle a la caja si le queda saldo (activa/faltante/
// sobrante). Si no se pasa (descuento de una preforma observada), no se toca
// el estado -- no debe pisar el 'faltante'/'sobrante' que haya dejado el
// consumo normal del mismo reporte.
async function descontarCaja(get, run, cajaId, cantidad, fecha, insertarMov, estadoCaja = null) {
  const caja = await get('SELECT * FROM cajas_preforma WHERE id = ?', [cajaId]);
  if (!caja) return;
  const saldoAnterior = caja.cantidad_actual;
  const nuevaCantidad = saldoAnterior - cantidad;
  if (nuevaCantidad <= 0) {
    await run(
      "UPDATE cajas_preforma SET cantidad_actual = ?, estado = 'vaciada', fecha_vaciada = COALESCE(?, CURRENT_DATE), updated_at = to_char(now(), 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?",
      [nuevaCantidad, fecha || null, cajaId],
    );
  } else if (estadoCaja) {
    await run(
      "UPDATE cajas_preforma SET cantidad_actual = ?, estado = ?, fecha_vaciada = NULL, updated_at = to_char(now(), 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?",
      [nuevaCantidad, estadoCaja, cajaId],
    );
  } else {
    await run(
      "UPDATE cajas_preforma SET cantidad_actual = ?, updated_at = to_char(now(), 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?",
      [nuevaCantidad, cajaId],
    );
  }
  await insertarMov(saldoAnterior);
}

export async function revertirConsumosPreforma(reporteId) {
  return withTransaction(async ({ all, get, run }) => {
    const movs = await all('SELECT caja_id, cantidad FROM cajas_preforma_mov WHERE reporte_id = ?', [reporteId]);
    for (const { caja_id: cajaId, cantidad } of movs) {
      const caja = await get('SELECT * FROM cajas_preforma WHERE id = ?', [cajaId]);
      if (!caja) continue;
      const nuevaCantidad = caja.cantidad_actual + cantidad;
      const vuelveActiva = ['vaciada', 'sobrante', 'faltante'].includes(caja.estado) && nuevaCantidad > 0;
      await run(
        `UPDATE cajas_preforma SET cantidad_actual = ?, estado = ?, fecha_vaciada = ?, updated_at = to_char(now(), 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?`,
        [nuevaCantidad, vuelveActiva ? 'activa' : caja.estado, vuelveActiva ? null : caja.fecha_vaciada, cajaId],
      );
    }
    await run('DELETE FROM cajas_preforma_mov WHERE reporte_id = ?', [reporteId]);
    return movs.length;
  });
}

// LEFT JOIN: si la caja de origen fue borrada del catalogo despues, el
// consumo sigue apareciendo en el historial del reporte (con datos vacios).
export async function getConsumosDeReporte(reporteId) {
  return dbAll(
    `SELECT m.id, m.caja_id, m.cantidad, m.estado, m.cantidad_irregular, m.saldo_anterior, m.descripcion,
            COALESCE(c.cod_preforma, '') AS cod_preforma, COALESCE(c.num_caja, '') AS num_caja,
            COALESCE(c.op, '') AS op, COALESCE(c.resina, '') AS resina
     FROM cajas_preforma_mov m
     LEFT JOIN cajas_preforma c ON c.id = m.caja_id
     WHERE m.reporte_id = ?
     ORDER BY m.id ASC`,
    [reporteId],
  );
}
