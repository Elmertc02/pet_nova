import { Router } from 'express';
import { dbAll, dbGet, dbRun } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

function planRow(row) {
  let datos = {};
  try { datos = JSON.parse(row.datos); } catch { datos = {}; }
  return { id: row.id, semana: row.semana, maquina: row.maquina, fecha: row.fecha, datos };
}

// ── Planes guardados ("Vista general") ──────────────────────────────────────
router.get('/planes', async (req, res) => {
  const { maquina, semana } = req.query;
  const clauses = [];
  const params = [];
  if (maquina) { clauses.push('maquina = ?'); params.push(maquina); }
  if (semana) { clauses.push('semana = ?'); params.push(semana); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await dbAll(`SELECT * FROM planes ${where} ORDER BY created_at DESC, id DESC`, params);
  res.json(rows.map(planRow));
});

router.post('/planes', async (req, res) => {
  const body = req.body ?? {};
  const semana = String(body.semana ?? '').trim();
  const maquina = String(body.maquina ?? '').trim();
  const fecha = String(body.fecha ?? '').trim();
  const datos = JSON.stringify(body.datos ?? {});
  if (!semana || !maquina) {
    return res.status(400).json({ error: 'Semana y maquina son requeridos.' });
  }

  if (body.id) {
    await dbRun('UPDATE planes SET semana = ?, maquina = ?, datos = ?, fecha = ? WHERE id = ?', [semana, maquina, datos, fecha, Number(body.id)]);
    const row = await dbGet('SELECT * FROM planes WHERE id = ?', [Number(body.id)]);
    return res.json(planRow(row));
  }

  const info = await dbRun('INSERT INTO planes (semana, maquina, datos, fecha) VALUES (?, ?, ?, ?) RETURNING id', [semana, maquina, datos, fecha]);
  const row = await dbGet('SELECT * FROM planes WHERE id = ?', [info.rows[0].id]);
  res.status(201).json(planRow(row));
});

router.delete('/planes/:id', async (req, res) => {
  await dbRun('DELETE FROM planes WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ── Catalogo completo de botellas por maquina (para el autocompletado del
// panel de configuracion -- a diferencia de /api/products no limita a 20). ──
router.get('/botellas-catalogo', async (req, res) => {
  const maquina = String(req.query.maquina ?? '').trim();
  const where = maquina ? 'WHERE maquina = ?' : '';
  const params = maquina ? [maquina] : [];
  const rows = await dbAll(
    `SELECT DISTINCT cod_bot, cod_pref, descripcion, velocidad, moldes, gramaje, cliente, volumen, color, u_bolsa
     FROM botellas ${where} ORDER BY cod_bot`,
    params,
  );
  res.json(rows.map((row) => ({
    codBotella: row.cod_bot,
    codPreforma: row.cod_pref || '',
    descripcion: row.descripcion || '',
    velocidad: Number(row.velocidad) || 0,
    moldes: Number(row.moldes) || 0,
    gramaje: row.gramaje != null ? Number(row.gramaje) : null,
    cliente: row.cliente || '',
    volumen: row.volumen != null ? Number(row.volumen) : null,
    color: row.color || '',
    uBolsa: row.u_bolsa || '',
  })));
});

export default router;
