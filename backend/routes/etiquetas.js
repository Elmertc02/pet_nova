import { Router } from 'express';
import { dbAll, dbGet, dbRun } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

function machineRow(row) {
  return { id: row.id, nombre: row.nombre, letra: row.letra, tipo: row.tipo };
}

function entryRow(row) {
  return {
    id: row.id,
    ordenOp: row.orden_op,
    maquinaId: row.maquina_id,
    maquinaNombre: row.maquina_nombre,
    maquinaLetra: row.maquina_letra,
    fecha: row.fecha,
    turno: row.turno,
    codBotella: row.cod_botella,
    codPreforma: row.cod_preforma,
    createdAt: row.created_at,
  };
}

// ── Maquinas ──────────────────────────────────────────────────────────────
// Por defecto: solo las que sirven para reporte diario / etiquetas (se excluye
// el combo "SEM 63/78", que es unicamente para planificacion semanal).
// Con ?scope=planificacion: al reves -- incluye el combo "SEM 63/78" y excluye
// las entradas "SEM 63"/"SEM 78" individuales (mismo criterio que MAQUINAS en
// DIGITALIZACION para la pantalla de planificacion).
router.get('/machines', async (req, res) => {
  const tipos = req.query.scope === 'planificacion'
    ? ['planificacion', 'ambos']
    : ['reporte_diario', 'ambos'];
  const rows = await dbAll(
    `SELECT * FROM machines WHERE activa = 1 AND tipo IN (?, ?) ORDER BY orden, nombre`,
    tipos,
  );
  res.json(rows.map(machineRow));
});

router.post('/machines', async (req, res) => {
  const nombre = String(req.body?.nombre ?? '').trim();
  const letra = String(req.body?.letra ?? '').trim().toUpperCase().slice(0, 3);
  if (!nombre || !letra) {
    return res.status(400).json({ error: 'La maquina necesita nombre y letra.' });
  }
  const existing = await dbGet('SELECT id FROM machines WHERE lower(nombre) = lower(?)', [nombre]);
  if (existing) {
    return res.status(409).json({ error: `Ya existe una maquina llamada "${nombre}".` });
  }
  const maxOrden = (await dbGet('SELECT COALESCE(MAX(orden), 0) AS o FROM machines')).o;
  await dbRun(
    "INSERT INTO machines (nombre, letra, tipo, activa, orden) VALUES (?, ?, 'reporte_diario', 1, ?)",
    [nombre, letra, maxOrden + 1],
  );
  const rows = await dbAll(
    `SELECT * FROM machines WHERE activa = 1 AND tipo IN ('reporte_diario','ambos') ORDER BY orden, nombre`,
  );
  res.status(201).json(rows.map(machineRow));
});

// ── Productos (catalogo real botella -> preforma, tabla "botellas") ────────
// Si viene `maquina`, filtra por esa maquina primero (igual que hacia
// reporte.js en DIGITALIZACION); si no, busca en todo el catalogo.
router.get('/products', async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const maquina = String(req.query.maquina ?? '').trim();
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  const clauses = [];
  const params = [];
  if (maquina) {
    clauses.push('maquina = ?');
    params.push(maquina);
  }
  if (q) {
    clauses.push('(lower(cod_bot) LIKE ? OR lower(descripcion) LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await dbAll(
    `SELECT DISTINCT cod_bot, cod_pref, descripcion FROM botellas ${where} ORDER BY cod_bot LIMIT ?`,
    [...params, limit],
  );

  res.json(rows.map((row) => ({
    id: row.cod_bot,
    codBotella: row.cod_bot,
    codPreforma: row.cod_pref || '',
    descripcion: row.descripcion || '',
  })));
});

// Registra manualmente un par botella/preforma que no estaba en el catalogo
// importado (se guarda con maquina '' = generico, visible en cualquier busqueda
// sin filtro de maquina).
router.post('/products', async (req, res) => {
  const codBotella = String(req.body?.codBotella ?? '').trim();
  const codPreforma = String(req.body?.codPreforma ?? '').trim();
  const descripcion = String(req.body?.descripcion ?? '').trim();
  const maquina = String(req.body?.maquina ?? '').trim();
  if (!codBotella) {
    return res.status(400).json({ error: 'El codigo de botella es obligatorio.' });
  }
  const nextId = (await dbGet("SELECT COALESCE(MIN(id), 0) - 1 AS id FROM botellas WHERE id < 0")).id;
  await dbRun(
    `INSERT INTO botellas (id, maquina, cod_bot, cod_pref, descripcion) VALUES (?, ?, ?, ?, ?)`,
    [nextId, maquina, codBotella, codPreforma, descripcion],
  );
  res.status(201).json({ id: codBotella, codBotella, codPreforma, descripcion });
});

// ── Registros de etiquetas ──────────────────────────────────────────────────
router.get('/entries', async (req, res) => {
  const rows = await dbAll('SELECT * FROM etiquetas_entries ORDER BY created_at DESC, id DESC');
  res.json(rows.map(entryRow));
});

router.post('/entries', async (req, res) => {
  const body = req.body ?? {};
  const ordenOp = String(body.ordenOp ?? '').trim();
  const fecha = String(body.fecha ?? '').trim();
  const turno = String(body.turno ?? '').trim();
  const codBotella = String(body.codBotella ?? '').trim();
  const codPreforma = String(body.codPreforma ?? '').trim();
  const maquinaNombre = String(body.maquinaNombre ?? '').trim();
  const maquinaLetra = String(body.maquinaLetra ?? '').trim();
  const maquinaId = Number.isFinite(Number(body.maquinaId)) ? Number(body.maquinaId) : null;

  if (!ordenOp || !fecha || !turno || !codBotella || !maquinaNombre) {
    return res.status(400).json({ error: 'Faltan campos obligatorios del registro.' });
  }
  // Numero, con como mucho una letra de maquina al final ("088" o "088T") --
  // nunca puede empezar con una letra (evita un tipeo tipo "O" por "0", que
  // antes se colaba como una OP "distinta" sin que el chequeo de abajo lo note).
  if (!/^\d+[A-Za-z]?$/.test(ordenOp)) {
    return res.status(400).json({ error: 'La orden de OP debe ser un numero, con una letra de maquina opcional al final (ej. "088" o "088T").' });
  }

  // No puede haber dos ordenes de OP iguales en el mismo año (si es un año
  // distinto, se permite -- las OP se vuelven a numerar cada año). La letra
  // es parte de la identidad de la OP -- "088T", "088R" y "088S" son ordenes
  // distintas, no duplicados entre si.
  const anio = fecha.slice(0, 4);
  const duplicado = await dbGet(
    `SELECT id FROM etiquetas_entries WHERE lower(orden_op) = lower(?) AND fecha LIKE ?`,
    [ordenOp, `${anio}-%`],
  );
  if (duplicado) {
    return res.status(409).json({ error: `Ya existe un registro con la orden de OP "${ordenOp}" en el año ${anio}.` });
  }

  const info = await dbRun(
    `INSERT INTO etiquetas_entries
      (orden_op, maquina_id, maquina_nombre, maquina_letra, fecha, turno, cod_botella, cod_preforma)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [ordenOp, maquinaId, maquinaNombre, maquinaLetra, fecha, turno, codBotella, codPreforma],
  );

  const row = await dbGet('SELECT * FROM etiquetas_entries WHERE id = ?', [info.rows[0].id]);
  res.status(201).json(entryRow(row));
});

router.delete('/entries/:id', async (req, res) => {
  const id = Number(req.params.id);
  await dbRun('DELETE FROM etiquetas_entries WHERE id = ?', [id]);
  const rows = await dbAll('SELECT * FROM etiquetas_entries ORDER BY created_at DESC, id DESC');
  res.json(rows.map(entryRow));
});

export default router;
