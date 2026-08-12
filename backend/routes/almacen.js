import { Router } from 'express';
import { dbAll, dbGet, dbRun } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

function cajaRow(row) {
  return {
    id: row.id,
    codPreforma: row.cod_preforma,
    descripcion: row.descripcion || '',
    numCaja: row.num_caja,
    op: row.op,
    resina: row.resina,
    cantidadInicial: row.cantidad_inicial,
    cantidadActual: row.cantidad_actual,
    fechaIngreso: row.fecha_ingreso,
    fechaVaciada: row.fecha_vaciada,
    estado: row.estado,
    observaciones: row.observaciones,
  };
}

// Trae la descripcion desde el catalogo de preformas (join por codigo), para
// no tener que repetirla a mano en cada caja.
const CAJAS_SELECT = `
  SELECT cp.*, p.descripcion AS descripcion
  FROM cajas_preforma cp
  LEFT JOIN preformas p ON p.codigo = cp.cod_preforma
`;

// ── Cajas de preforma (administracion, Almacen Produccion) ─────────────────
router.get('/admin/cajas-preforma', async (req, res) => {
  const { estado, codPreforma } = req.query;
  const clauses = [];
  const params = [];
  if (estado) { clauses.push('cp.estado = ?'); params.push(estado); }
  if (codPreforma) { clauses.push('cp.cod_preforma = ?'); params.push(codPreforma); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await dbAll(`${CAJAS_SELECT} ${where} ORDER BY cp.created_at DESC, cp.id DESC`, params);
  res.json(rows.map(cajaRow));
});

router.post('/admin/cajas-preforma', async (req, res) => {
  const b = req.body ?? {};
  const codPreforma = String(b.codPreforma ?? '').trim();
  const numCaja = String(b.numCaja ?? '').trim();
  const cantidad = Number(b.cantidadInicial) || 0;
  const fechaIngreso = String(b.fechaIngreso ?? '').trim();
  if (!codPreforma || !numCaja || cantidad <= 0 || !fechaIngreso) {
    return res.status(400).json({ error: 'Codigo de preforma, numero de caja, cantidad y fecha de ingreso son obligatorios.' });
  }
  const info = await dbRun(
    `INSERT INTO cajas_preforma (cod_preforma, num_caja, op, resina, cantidad_inicial, cantidad_actual, fecha_ingreso, estado, observaciones)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'activa', ?) RETURNING id`,
    [codPreforma, numCaja, String(b.op ?? ''), String(b.resina ?? ''), cantidad, cantidad, fechaIngreso, String(b.observaciones ?? '')],
  );
  res.status(201).json(cajaRow(await dbGet(`${CAJAS_SELECT} WHERE cp.id = ?`, [info.rows[0].id])));
});

router.put('/admin/cajas-preforma/:id', async (req, res) => {
  const id = Number(req.params.id);
  const current = await dbGet('SELECT * FROM cajas_preforma WHERE id = ?', [id]);
  if (!current) return res.status(404).json({ error: 'No encontrada.' });
  const b = req.body ?? {};
  // 'cambio_preforma': la caja queda apartada a mano -- no aparece mas en
  // /cajas-preforma-disponibles (no se puede consumir en reportes nuevos)
  // hasta que alguien la vuelva a poner en 'activa' desde aca.
  const estado = ['activa', 'vaciada', 'faltante', 'sobrante', 'cambio_preforma'].includes(b.estado) ? b.estado : current.estado;
  await dbRun(
    `UPDATE cajas_preforma SET cod_preforma=?, num_caja=?, op=?, resina=?, cantidad_actual=?, fecha_ingreso=?,
       fecha_vaciada=?, estado=?, observaciones=?, updated_at=to_char(now(), 'YYYY-MM-DD HH24:MI:SS') WHERE id=?`,
    [
      b.codPreforma ?? current.cod_preforma, b.numCaja ?? current.num_caja, b.op ?? current.op, b.resina ?? current.resina,
      b.cantidadActual !== undefined ? Number(b.cantidadActual) || 0 : current.cantidad_actual,
      b.fechaIngreso ?? current.fecha_ingreso, b.fechaVaciada ?? current.fecha_vaciada, estado,
      b.observaciones ?? current.observaciones, id,
    ],
  );
  res.json(cajaRow(await dbGet(`${CAJAS_SELECT} WHERE cp.id = ?`, [id])));
});

router.delete('/admin/cajas-preforma/:id', async (req, res) => {
  await dbRun('DELETE FROM cajas_preforma WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ── Historial de consumo de una caja: que reportes diarios la usaron ───────
router.get('/admin/cajas-preforma/:id/historial', async (req, res) => {
  const cajaId = Number(req.params.id);
  const rows = await dbAll(
    `SELECT m.id, m.reporte_id, m.cantidad, m.estado, m.cantidad_irregular, m.saldo_anterior, m.descripcion, m.fecha, m.created_at,
            r.orden_op, r.fecha AS reporte_fecha, r.turno AS reporte_turno, r.operador, r.maquina
     FROM cajas_preforma_mov m
     LEFT JOIN reportes_diarios r ON r.id = m.reporte_id
     WHERE m.caja_id = ?
     ORDER BY m.id ASC`,
    [cajaId],
  );
  res.json(rows.map((r) => ({
    id: r.id,
    reporteId: r.reporte_id,
    ordenOp: r.orden_op || '(reporte eliminado)',
    fecha: r.reporte_fecha || r.fecha || '',
    turno: r.reporte_turno || '',
    operador: r.operador || '',
    maquina: r.maquina || '',
    cantidad: r.cantidad,
    estado: r.estado,
    cantidadIrregular: r.cantidad_irregular,
    descripcion: r.descripcion || '',
    saldoAnterior: r.saldo_anterior,
    saldoActual: r.saldo_anterior - r.cantidad,
    createdAt: r.created_at,
  })));
});

// ── Preformas observadas (defectos) de TODAS las cajas -- usado para armar
// la hoja "Observaciones" del export a Excel de Cajas de preforma. ─────────
router.get('/admin/cajas-preforma/observaciones', async (req, res) => {
  const rows = await dbAll(
    `SELECT m.id, m.caja_id, m.cantidad, m.descripcion, m.fecha, m.created_at,
            c.num_caja, c.op, c.cod_preforma, COALESCE(p.descripcion, '') AS preforma_descripcion,
            r.orden_op
     FROM cajas_preforma_mov m
     LEFT JOIN cajas_preforma c ON c.id = m.caja_id
     LEFT JOIN preformas p ON p.codigo = c.cod_preforma
     LEFT JOIN reportes_diarios r ON r.id = m.reporte_id
     WHERE m.estado = 'observado'
     ORDER BY m.id ASC`,
  );
  res.json(rows.map((r) => ({
    id: r.id,
    cajaId: r.caja_id,
    numCaja: r.num_caja || '',
    op: r.op || '',
    codPreforma: r.cod_preforma || '',
    descripcion: r.preforma_descripcion || '',
    cantidad: r.cantidad,
    observacion: r.descripcion || '',
    ordenOp: r.orden_op || '',
    fecha: r.fecha || '',
    createdAt: r.created_at,
  })));
});

// ── Cajas disponibles para consumir en un reporte (activa/sobrante, con saldo) ──
// 'faltante', 'vaciada' y 'cambio_preforma' quedan afuera a proposito -- esta
// ultima es la que se usa para apartar una caja a mano (Almacen Produccion)
// hasta que alguien la vuelva a marcar 'activa'.
router.get('/cajas-preforma-disponibles', async (req, res) => {
  const codPreforma = String(req.query.codPreforma ?? '').trim();
  if (!codPreforma) return res.json([]);
  const rows = await dbAll(
    `${CAJAS_SELECT}
     WHERE cp.cod_preforma = ? AND cp.estado IN ('activa','sobrante') AND cp.cantidad_actual > 0
     ORDER BY cp.fecha_ingreso ASC, cp.id ASC`,
    [codPreforma],
  );
  res.json(rows.map(cajaRow));
});

// ── Saldo de botellas: lo genera "Fin de produccion con saldo" en Reportes,
// se consume desde "Usar saldo de botella" en reportes futuros ────────────
function saldoRow(row) {
  return {
    id: row.id,
    codBotella: row.cod_botella,
    maquina: row.maquina,
    cantidadActual: row.cantidad_actual,
    estado: row.estado,
    fecha: row.fecha,
    observaciones: row.observaciones,
  };
}

router.get('/admin/saldo-botellas', async (req, res) => {
  const { estado, codBotella } = req.query;
  const clauses = [];
  const params = [];
  if (estado) { clauses.push('estado = ?'); params.push(estado); }
  if (codBotella) { clauses.push('cod_botella = ?'); params.push(codBotella); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await dbAll(`SELECT * FROM saldo_botellas ${where} ORDER BY created_at DESC, id DESC`, params);
  res.json(rows.map(saldoRow));
});

router.put('/admin/saldo-botellas/:id', async (req, res) => {
  const id = Number(req.params.id);
  const current = await dbGet('SELECT * FROM saldo_botellas WHERE id = ?', [id]);
  if (!current) return res.status(404).json({ error: 'No encontrado.' });
  const b = req.body ?? {};
  const estado = ['activo', 'agotado'].includes(b.estado) ? b.estado : current.estado;
  await dbRun(
    `UPDATE saldo_botellas SET cantidad_actual=?, estado=?, observaciones=?, updated_at=to_char(now(), 'YYYY-MM-DD HH24:MI:SS') WHERE id=?`,
    [
      b.cantidadActual !== undefined ? Number(b.cantidadActual) || 0 : current.cantidad_actual,
      estado, b.observaciones ?? current.observaciones, id,
    ],
  );
  res.json(saldoRow(await dbGet('SELECT * FROM saldo_botellas WHERE id = ?', [id])));
});

router.delete('/admin/saldo-botellas/:id', async (req, res) => {
  await dbRun('DELETE FROM saldo_botellas WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ── Saldo disponible para usar en un reporte (misma botella, activo, con saldo) ──
router.get('/saldo-botellas-disponibles', async (req, res) => {
  const codBotella = String(req.query.codBotella ?? '').trim();
  if (!codBotella) return res.json([]);
  const rows = await dbAll(
    `SELECT * FROM saldo_botellas WHERE cod_botella = ? AND estado = 'activo' AND cantidad_actual > 0 ORDER BY fecha ASC, id ASC`,
    [codBotella],
  );
  res.json(rows.map(saldoRow));
});

export default router;
