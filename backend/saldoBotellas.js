// Saldo de botellas: cuando un reporte diario marca "Fin de produccion con
// saldo", la cantidad de botellas producidas de mas se guarda como un lote
// en saldo_botellas (Almacen Produccion). Otros reportes futuros de esa
// misma botella pueden consumir ese saldo con "Usar saldo de botella" --
// eso resta del Total Produccion que hay que cubrir con preformas nuevas
// (mismo criterio que "Saldos anteriores usados" en DIGITALIZACION).
//
// saldo_botellas_mov guarda ambos sentidos con un campo "tipo":
//   'generacion' -> suma a cantidad_actual del lote (lo creo el reporte X)
//   'consumo'    -> resta de cantidad_actual del lote (lo uso el reporte Y)
// Revertir un reporte simplemente invierte todos sus movimientos, sin
// borrar nunca la fila de saldo_botellas (para no romper el historial de
// otros reportes que hayan consumido de ese mismo lote).

import { dbAll, withTransaction } from './db.js';

export async function aplicarSaldoReporte(reporteId, { saldoGenerado, codBotella, maquina, fecha, consumosSaldo }) {
  await withTransaction(async ({ get, run }) => {
    const generado = Number(saldoGenerado) || 0;
    if (generado > 0 && codBotella) {
      const info = await run(
        `INSERT INTO saldo_botellas (cod_botella, maquina, cantidad_actual, estado, fecha)
         VALUES (?, ?, ?, 'activo', ?) RETURNING id`,
        [codBotella, maquina || '', generado, fecha || null],
      );
      const saldoId = info.rows[0].id;
      await run(
        `INSERT INTO saldo_botellas_mov (saldo_id, reporte_id, tipo, cantidad, fecha) VALUES (?, ?, 'generacion', ?, ?)`,
        [saldoId, reporteId, generado, fecha || null],
      );
    }

    for (const item of consumosSaldo ?? []) {
      const saldoId = Number(item.saldoId) || 0;
      const cantidad = Number(item.cantidad) || 0;
      if (saldoId <= 0 || cantidad <= 0) continue;
      const saldo = await get('SELECT * FROM saldo_botellas WHERE id = ?', [saldoId]);
      if (!saldo) continue;
      const nuevaCantidad = saldo.cantidad_actual - cantidad;
      await run(
        `UPDATE saldo_botellas SET cantidad_actual = ?, estado = ?, updated_at = to_char(now(), 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?`,
        [nuevaCantidad, nuevaCantidad <= 0 ? 'agotado' : 'activo', saldoId],
      );
      await run(
        `INSERT INTO saldo_botellas_mov (saldo_id, reporte_id, tipo, cantidad, fecha) VALUES (?, ?, 'consumo', ?, ?)`,
        [saldoId, reporteId, cantidad, fecha || null],
      );
    }
  });
}

export async function revertirSaldoReporte(reporteId) {
  return withTransaction(async ({ all, get, run }) => {
    const movs = await all('SELECT * FROM saldo_botellas_mov WHERE reporte_id = ?', [reporteId]);
    for (const mov of movs) {
      const saldo = await get('SELECT * FROM saldo_botellas WHERE id = ?', [mov.saldo_id]);
      if (!saldo) continue;
      const delta = mov.tipo === 'generacion' ? -mov.cantidad : mov.cantidad;
      const nuevaCantidad = saldo.cantidad_actual + delta;
      await run(
        `UPDATE saldo_botellas SET cantidad_actual = ?, estado = ?, updated_at = to_char(now(), 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?`,
        [nuevaCantidad, nuevaCantidad > 0 ? 'activo' : 'agotado', mov.saldo_id],
      );
    }
    await run('DELETE FROM saldo_botellas_mov WHERE reporte_id = ?', [reporteId]);
    return movs.length;
  });
}

// Consumos de saldo hechos POR este reporte (tipo='consumo'), para mostrar
// en el detalle del reporte guardado.
export async function getSaldoUsadoDeReporte(reporteId) {
  return dbAll(
    `SELECT m.id, m.saldo_id, m.cantidad, COALESCE(s.cod_botella, '') AS cod_botella
     FROM saldo_botellas_mov m
     LEFT JOIN saldo_botellas s ON s.id = m.saldo_id
     WHERE m.reporte_id = ? AND m.tipo = 'consumo'
     ORDER BY m.id ASC`,
    [reporteId],
  );
}
