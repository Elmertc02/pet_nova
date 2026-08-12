import { Router } from 'express';
import { dbAll, dbGet, dbRun } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

function machineRow(row) {
  return { id: row.id, nombre: row.nombre, letra: row.letra, tipo: row.tipo, activa: !!row.activa, orden: row.orden };
}

function personalRow(row) {
  return { id: row.id, nombre: row.nombre, rol: row.rol, activo: !!row.activo };
}

// ── Maquinas (administracion completa, sin filtrar por tipo/activa) ────────
router.get('/admin/machines', async (req, res) => {
  const rows = await dbAll('SELECT * FROM machines ORDER BY orden, nombre');
  res.json(rows.map(machineRow));
});

router.post('/admin/machines', async (req, res) => {
  const nombre = String(req.body?.nombre ?? '').trim();
  const letra = String(req.body?.letra ?? '').trim().toUpperCase().slice(0, 3);
  const tipo = ['planificacion', 'reporte_diario', 'ambos'].includes(req.body?.tipo) ? req.body.tipo : 'ambos';
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  const existing = await dbGet('SELECT id FROM machines WHERE lower(nombre) = lower(?)', [nombre]);
  if (existing) return res.status(409).json({ error: `Ya existe una maquina llamada "${nombre}".` });
  const maxOrden = (await dbGet('SELECT COALESCE(MAX(orden), 0) AS o FROM machines')).o;
  const info = await dbRun(
    'INSERT INTO machines (nombre, letra, tipo, activa, orden) VALUES (?, ?, ?, 1, ?) RETURNING id',
    [nombre, letra, tipo, maxOrden + 1],
  );
  res.status(201).json(machineRow(await dbGet('SELECT * FROM machines WHERE id = ?', [info.rows[0].id])));
});

router.put('/admin/machines/:id', async (req, res) => {
  const id = Number(req.params.id);
  const current = await dbGet('SELECT * FROM machines WHERE id = ?', [id]);
  if (!current) return res.status(404).json({ error: 'Maquina no encontrada.' });
  const nombre = String(req.body?.nombre ?? current.nombre).trim();
  const letra = String(req.body?.letra ?? current.letra).trim().toUpperCase().slice(0, 3);
  const tipo = ['planificacion', 'reporte_diario', 'ambos'].includes(req.body?.tipo) ? req.body.tipo : current.tipo;
  const activa = req.body?.activa !== undefined ? (req.body.activa ? 1 : 0) : current.activa;
  const orden = req.body?.orden !== undefined ? Number(req.body.orden) || 0 : current.orden;
  await dbRun('UPDATE machines SET nombre = ?, letra = ?, tipo = ?, activa = ?, orden = ? WHERE id = ?', [nombre, letra, tipo, activa, orden, id]);
  res.json(machineRow(await dbGet('SELECT * FROM machines WHERE id = ?', [id])));
});

router.delete('/admin/machines/:id', async (req, res) => {
  await dbRun('DELETE FROM machines WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ── Personal ─────────────────────────────────────────────────────────────
router.get('/personal', async (req, res) => {
  const rows = await dbAll('SELECT * FROM personal ORDER BY nombre');
  res.json(rows.map(personalRow));
});

router.post('/personal', async (req, res) => {
  const nombre = String(req.body?.nombre ?? '').trim();
  const rol = String(req.body?.rol ?? 'operador').trim() || 'operador';
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  const existing = await dbGet('SELECT id FROM personal WHERE lower(nombre) = lower(?)', [nombre]);
  if (existing) return res.status(409).json({ error: `Ya existe "${nombre}" en personal.` });
  const info = await dbRun('INSERT INTO personal (nombre, rol, activo) VALUES (?, ?, 1) RETURNING id', [nombre, rol]);
  res.status(201).json(personalRow(await dbGet('SELECT * FROM personal WHERE id = ?', [info.rows[0].id])));
});

router.put('/personal/:id', async (req, res) => {
  const id = Number(req.params.id);
  const current = await dbGet('SELECT * FROM personal WHERE id = ?', [id]);
  if (!current) return res.status(404).json({ error: 'No encontrado.' });
  const nombre = String(req.body?.nombre ?? current.nombre).trim();
  const rol = String(req.body?.rol ?? current.rol).trim();
  const activo = req.body?.activo !== undefined ? (req.body.activo ? 1 : 0) : current.activo;
  await dbRun('UPDATE personal SET nombre = ?, rol = ?, activo = ? WHERE id = ?', [nombre, rol, activo, id]);
  res.json(personalRow(await dbGet('SELECT * FROM personal WHERE id = ?', [id])));
});

router.delete('/personal/:id', async (req, res) => {
  await dbRun('DELETE FROM personal WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

export default router;
