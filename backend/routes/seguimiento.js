import { Router } from 'express';
import { dbAll, dbGet, dbRun } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

// ── Paros de mantenimiento ───────────────────────────────────────────────
function paroRow(row) {
  return {
    id: row.id, semana: row.semana, maquina: row.maquina,
    diaIdx: row.dia_idx, diaNombre: row.dia_nombre,
    horas: Number(row.horas) || 0, motivo: row.motivo,
    createdAt: row.created_at,
  };
}

router.get('/paros', async (req, res) => {
  const rows = await dbAll('SELECT * FROM planificacion_paros ORDER BY dia_idx, id');
  res.json(rows.map(paroRow));
});

router.post('/paros', async (req, res) => {
  const b = req.body ?? {};
  const semana = String(b.semana ?? '').trim();
  const maquina = String(b.maquina ?? '').trim();
  const diaIdx = Number(b.diaIdx);
  const horas = Number(b.horas);
  if (!semana || !maquina || !Number.isInteger(diaIdx) || !(horas > 0)) {
    return res.status(400).json({ error: 'Semana, maquina, dia y horas son requeridos.' });
  }
  const info = await dbRun(
    `INSERT INTO planificacion_paros (semana, maquina, dia_idx, dia_nombre, horas, motivo)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    [semana, maquina, diaIdx, String(b.diaNombre ?? ''), horas, String(b.motivo ?? '')],
  );
  const row = await dbGet('SELECT * FROM planificacion_paros WHERE id = ?', [info.rows[0].id]);
  res.status(201).json(paroRow(row));
});

router.delete('/paros/:id', async (req, res) => {
  await dbRun('DELETE FROM planificacion_paros WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ── Adiciones de botella ─────────────────────────────────────────────────
function adicionRow(row) {
  return {
    id: row.id, semana: row.semana, maquina: row.maquina,
    codBot: row.cod_bot, descripcion: row.descripcion,
    cantidad: Number(row.cantidad) || 0, vel: Number(row.vel) || 0,
    despuesDe: row.despues_de, notas: row.notas, submaq: row.submaq || '',
    createdAt: row.created_at,
  };
}

router.get('/adiciones', async (req, res) => {
  const rows = await dbAll('SELECT * FROM planificacion_adiciones ORDER BY id');
  res.json(rows.map(adicionRow));
});

router.post('/adiciones', async (req, res) => {
  const b = req.body ?? {};
  const semana = String(b.semana ?? '').trim();
  const maquina = String(b.maquina ?? '').trim();
  const codBot = String(b.codBot ?? '').trim();
  const cantidad = Number(b.cantidad);
  const vel = Number(b.vel);
  if (!semana || !maquina || !codBot || !(cantidad > 0) || !(vel > 0)) {
    return res.status(400).json({ error: 'Semana, maquina, botella, cantidad y velocidad son requeridos.' });
  }
  const info = await dbRun(
    `INSERT INTO planificacion_adiciones (semana, maquina, cod_bot, descripcion, cantidad, vel, despues_de, notas, submaq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [semana, maquina, codBot, String(b.descripcion ?? ''), cantidad, vel, String(b.despuesDe ?? ''), String(b.notas ?? ''), String(b.submaq ?? '')],
  );
  const row = await dbGet('SELECT * FROM planificacion_adiciones WHERE id = ?', [info.rows[0].id]);
  res.status(201).json(adicionRow(row));
});

router.delete('/adiciones/:id', async (req, res) => {
  await dbRun('DELETE FROM planificacion_adiciones WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ── Reasignaciones a otra maquina ────────────────────────────────────────
function reasignacionRow(row) {
  return {
    id: row.id, semana: row.semana,
    maqOrigen: row.maq_origen, maqDestino: row.maq_destino,
    codBot: row.cod_bot, descripcion: row.descripcion,
    cantidad: Number(row.cantidad) || 0, vel: Number(row.vel) || 0,
    motivo: row.motivo, createdAt: row.created_at,
  };
}

router.get('/reasignaciones', async (req, res) => {
  const rows = await dbAll('SELECT * FROM planificacion_reasignaciones ORDER BY id');
  res.json(rows.map(reasignacionRow));
});

router.post('/reasignaciones', async (req, res) => {
  const b = req.body ?? {};
  const semana = String(b.semana ?? '').trim();
  const maqOrigen = String(b.maqOrigen ?? '').trim();
  const maqDestino = String(b.maqDestino ?? '').trim();
  const codBot = String(b.codBot ?? '').trim();
  if (!semana || !maqOrigen || !maqDestino || !codBot) {
    return res.status(400).json({ error: 'Semana, maquina origen, maquina destino y botella son requeridos.' });
  }
  const info = await dbRun(
    `INSERT INTO planificacion_reasignaciones (semana, maq_origen, maq_destino, cod_bot, descripcion, cantidad, vel, motivo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [semana, maqOrigen, maqDestino, codBot, String(b.descripcion ?? ''), Number(b.cantidad) || 0, Number(b.vel) || 0, String(b.motivo ?? '')],
  );
  const row = await dbGet('SELECT * FROM planificacion_reasignaciones WHERE id = ?', [info.rows[0].id]);
  res.status(201).json(reasignacionRow(row));
});

router.delete('/reasignaciones/:id', async (req, res) => {
  await dbRun('DELETE FROM planificacion_reasignaciones WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

export default router;
