import { Router } from 'express';
import { dbAll, dbGet, dbRun } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

function botellaRow(row) {
  return {
    id: row.id,
    maquina: row.maquina,
    codBotella: row.cod_bot,
    codPreforma: row.cod_pref || '',
    gramaje: row.gramaje,
    volumen: row.volumen,
    cliente: row.cliente || '',
    descripcion: row.descripcion || '',
    color: row.color || '',
    velocidad: row.velocidad || '',
    uBolsa: row.u_bolsa || '',
    rosca: row.rosca || '',
    moldes: row.moldes || '',
  };
}

function preformaRow(row) {
  return { id: row.id, codigo: row.codigo, descripcion: row.descripcion, unidCaja: row.unid_caja, gramaje: row.gramaje };
}

// ── Botellas (catalogo, paginado y filtrable -- puede llegar a ~780 filas) ──
router.get('/admin/botellas', async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const maquina = String(req.query.maquina ?? '').trim();
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const clauses = [];
  const params = [];
  if (maquina) { clauses.push('maquina = ?'); params.push(maquina); }
  if (q) {
    clauses.push('(lower(cod_bot) LIKE ? OR lower(descripcion) LIKE ? OR lower(cod_pref) LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const total = (await dbGet(`SELECT COUNT(*) AS n FROM botellas ${where}`, params)).n;
  const rows = await dbAll(
    `SELECT * FROM botellas ${where} ORDER BY maquina, cod_bot LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const porMaquinaRaw = await dbAll('SELECT maquina, COUNT(*) AS n FROM botellas GROUP BY maquina ORDER BY maquina');
  // COUNT(*) vuelve como bigint -> node-postgres lo devuelve como string para
  // no perder precision; se convierte a Number para que el frontend pueda
  // sumarlo (porMaquina.reduce((s,m)=>s+m.n,0)) sin concatenar strings.
  const porMaquina = porMaquinaRaw.map((r) => ({ maquina: r.maquina, n: Number(r.n) }));

  res.json({ total: Number(total), rows: rows.map(botellaRow), porMaquina });
});

router.post('/admin/botellas', async (req, res) => {
  const b = req.body ?? {};
  const codBotella = String(b.codBotella ?? '').trim();
  const maquina = String(b.maquina ?? '').trim();
  if (!codBotella || !maquina) return res.status(400).json({ error: 'Maquina y codigo de botella son obligatorios.' });
  const nextId = (await dbGet('SELECT COALESCE(MIN(id), 0) - 1 AS id FROM botellas WHERE id < 0')).id;
  await dbRun(
    `INSERT INTO botellas (id, maquina, cod_bot, cod_pref, gramaje, volumen, cliente, descripcion, color, velocidad, u_bolsa, rosca, moldes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nextId, maquina, codBotella, b.codPreforma || null, b.gramaje ?? null, b.volumen ?? null,
      b.cliente || null, b.descripcion || null, b.color || null, b.velocidad || null, b.uBolsa || null, b.rosca || null, b.moldes || null,
    ],
  );
  res.status(201).json(botellaRow(await dbGet('SELECT * FROM botellas WHERE id = ?', [nextId])));
});

router.put('/admin/botellas/:id', async (req, res) => {
  const id = Number(req.params.id);
  const current = await dbGet('SELECT * FROM botellas WHERE id = ?', [id]);
  if (!current) return res.status(404).json({ error: 'No encontrada.' });
  const b = req.body ?? {};
  await dbRun(
    `UPDATE botellas SET maquina=?, cod_bot=?, cod_pref=?, gramaje=?, volumen=?, cliente=?, descripcion=?, color=?, velocidad=?, u_bolsa=?, rosca=?, moldes=?
     WHERE id = ?`,
    [
      b.maquina ?? current.maquina, b.codBotella ?? current.cod_bot, b.codPreforma ?? current.cod_pref,
      b.gramaje ?? current.gramaje, b.volumen ?? current.volumen, b.cliente ?? current.cliente,
      b.descripcion ?? current.descripcion, b.color ?? current.color, b.velocidad ?? current.velocidad,
      b.uBolsa ?? current.u_bolsa, b.rosca ?? current.rosca, b.moldes ?? current.moldes, id,
    ],
  );
  res.json(botellaRow(await dbGet('SELECT * FROM botellas WHERE id = ?', [id])));
});

router.delete('/admin/botellas/:id', async (req, res) => {
  await dbRun('DELETE FROM botellas WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ── Preformas ────────────────────────────────────────────────────────────
router.get('/admin/preformas', async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const where = q ? 'WHERE lower(codigo) LIKE ? OR lower(descripcion) LIKE ?' : '';
  const params = q ? [`%${q}%`, `%${q}%`] : [];
  const rows = await dbAll(`SELECT * FROM preformas ${where} ORDER BY codigo`, params);
  res.json(rows.map(preformaRow));
});

router.post('/admin/preformas', async (req, res) => {
  const p = req.body ?? {};
  const codigo = String(p.codigo ?? '').trim();
  if (!codigo) return res.status(400).json({ error: 'El codigo es obligatorio.' });
  const existing = await dbGet('SELECT id FROM preformas WHERE codigo = ?', [codigo]);
  if (existing) return res.status(409).json({ error: `Ya existe la preforma "${codigo}".` });
  const nextId = (await dbGet('SELECT COALESCE(MIN(id), 0) - 1 AS id FROM preformas WHERE id < 0')).id;
  await dbRun(
    'INSERT INTO preformas (id, codigo, descripcion, unid_caja, gramaje) VALUES (?, ?, ?, ?, ?)',
    [nextId, codigo, p.descripcion || '', Number(p.unidCaja) || 0, p.gramaje ?? null],
  );
  res.status(201).json(preformaRow(await dbGet('SELECT * FROM preformas WHERE id = ?', [nextId])));
});

router.put('/admin/preformas/:id', async (req, res) => {
  const id = Number(req.params.id);
  const current = await dbGet('SELECT * FROM preformas WHERE id = ?', [id]);
  if (!current) return res.status(404).json({ error: 'No encontrada.' });
  const p = req.body ?? {};
  await dbRun(
    'UPDATE preformas SET codigo=?, descripcion=?, unid_caja=?, gramaje=? WHERE id = ?',
    [
      p.codigo ?? current.codigo, p.descripcion ?? current.descripcion,
      p.unidCaja !== undefined ? Number(p.unidCaja) || 0 : current.unid_caja,
      p.gramaje ?? current.gramaje, id,
    ],
  );
  res.json(preformaRow(await dbGet('SELECT * FROM preformas WHERE id = ?', [id])));
});

router.delete('/admin/preformas/:id', async (req, res) => {
  await dbRun('DELETE FROM preformas WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

export default router;
