import { Router } from 'express';
import { dbAll, dbGet, dbRun } from '../db.js';
import { requireAuth } from '../auth.js';
import { aplicarConsumosPreforma, revertirConsumosPreforma, getConsumosDeReporte } from '../cajasPreforma.js';
import { aplicarSaldoReporte, revertirSaldoReporte, getSaldoUsadoDeReporte } from '../saldoBotellas.js';

const router = Router();
router.use(requireAuth);

async function reporteRow(row) {
  let paradasProgramadas = [];
  let paradasNoProgramadas = [];
  try { paradasProgramadas = JSON.parse(row.paradas_programadas); } catch { paradasProgramadas = []; }
  try { paradasNoProgramadas = JSON.parse(row.paradas_no_programadas); } catch { paradasNoProgramadas = []; }
  const consumos = await getConsumosDeReporte(row.id);
  // Las preformas observadas quedan mezcladas con el consumo normal en
  // cajas_preforma_mov (estado='observado') -- se separan aca para el
  // formato que espera el frontend.
  const consumosNormales = consumos.filter((c) => c.estado !== 'observado');
  const observados = consumos.filter((c) => c.estado === 'observado');
  const saldoUsado = await getSaldoUsadoDeReporte(row.id);
  return {
    id: row.id,
    ordenOp: row.orden_op,
    fecha: row.fecha,
    turno: row.turno,
    operador: row.operador,
    ayudante: row.ayudante,
    maquina: row.maquina,
    codBotella: row.cod_botella,
    etiqIni: row.etiq_ini,
    etiqFin: row.etiq_fin,
    numBolsas: row.num_bolsas,
    cantPorBolsa: row.cant_por_bolsa,
    botBuenas: row.bot_buenas,
    mermaBot: row.merma_bot,
    mermaPref: row.merma_pref,
    mermaTotal: row.merma_total,
    totalProduccion: row.total_produccion,
    horaInicio: row.hora_inicio,
    horaFin: row.hora_fin,
    minutosDisponibles: row.minutos_disponibles,
    paradasProgramadas,
    paradasNoProgramadas,
    tiempoCambioMolde: row.tiempo_cambio_molde,
    cmIni: row.cm_ini,
    cmFin: row.cm_fin,
    observaciones: row.observaciones,
    estadoValidacion: row.estado_validacion || 'pendiente',
    validadoPor: row.validado_por,
    validadoEn: row.validado_en,
    rechazadoPor: row.rechazado_por,
    rechazadoEn: row.rechazado_en,
    motivoRechazo: row.motivo_rechazo,
    consumosPreforma: consumosNormales.map((c) => ({
      id: c.id,
      cajaId: c.caja_id,
      cantidad: c.cantidad,
      codPreforma: c.cod_preforma,
      numCaja: c.num_caja,
      op: c.op,
      resina: c.resina,
      estado: c.estado,
      cantidadIrregular: c.cantidad_irregular,
      saldoAnterior: c.saldo_anterior,
      saldoActual: c.saldo_anterior - c.cantidad,
    })),
    defectosPreforma: observados.map((d) => ({
      id: d.id,
      cajaId: d.caja_id,
      numCaja: d.num_caja,
      op: d.op,
      cantidad: d.cantidad,
      descripcion: d.descripcion,
    })),
    finProduccionSaldo: !!row.fin_produccion_saldo,
    finProduccionPedidoEspecial: !!row.fin_produccion_pedido_especial,
    saldoGenerado: row.saldo_generado,
    cantidadExtraPedido: row.cantidad_extra_pedido_especial,
    saldoUsado: saldoUsado.map((s) => ({ id: s.id, saldoId: s.saldo_id, codBotella: s.cod_botella, cantidad: s.cantidad })),
    createdAt: row.created_at,
  };
}

// ── Cruce Etiquetas -> Reporte diario ───────────────────────────────────────
// Un codigo de OP en Etiquetas se arma como "<numero><letra de maquina>"
// (ej. orden "088" en la maquina con letra "T" = "088T"). Acá se parsea ese
// codigo y se busca en etiquetas_entries la coincidencia mas reciente.
router.get('/etiquetas-lookup', async (req, res) => {
  const opCode = String(req.query.op ?? '').trim();
  if (!opCode) {
    return res.status(400).json({ error: 'Formato de OP invalido. Ejemplo: 088T.' });
  }
  // Primero prueba un match literal -- por si en Etiquetas se cargo el codigo
  // completo con la letra de maquina incluida (ej. "088T"), en vez de solo el
  // numero como indica la convencion normal.
  let row = await dbGet(
    `SELECT * FROM etiquetas_entries WHERE lower(orden_op) = lower(?)
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    [opCode],
  );
  // Si no hay match literal, separa "<numero><letra de maquina>" (la
  // convencion normal: en Etiquetas se carga solo el numero).
  if (!row) {
    const match = /^(\d+)\s*-?\s*([A-Za-z]+)$/.exec(opCode);
    if (!match) {
      return res.status(404).json({ error: `No hay ningun registro en Etiquetas para la OP "${opCode}".` });
    }
    const [, numero, letra] = match;
    row = await dbGet(
      `SELECT * FROM etiquetas_entries
       WHERE orden_op = ? AND lower(maquina_letra) = lower(?)
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [numero, letra],
    );
  }
  if (!row) {
    return res.status(404).json({ error: `No hay ningun registro en Etiquetas para la OP "${opCode}".` });
  }
  res.json({
    maquinaNombre: row.maquina_nombre,
    maquinaLetra: row.maquina_letra,
    codBotella: row.cod_botella,
    codPreforma: row.cod_preforma,
    fecha: row.fecha,
    turno: row.turno,
  });
});

// ── Reportes diarios ─────────────────────────────────────────────────────────
router.get('/reportes-diarios', async (req, res) => {
  const rows = await dbAll('SELECT * FROM reportes_diarios ORDER BY created_at DESC, id DESC');
  res.json(await Promise.all(rows.map(reporteRow)));
});

router.post('/reportes-diarios', async (req, res) => {
  const b = req.body ?? {};
  const ordenOp = String(b.ordenOp ?? '').trim();
  const fecha = String(b.fecha ?? '').trim();
  const operador = String(b.operador ?? '').trim();
  const maquina = String(b.maquina ?? '').trim();
  const codBotella = String(b.codBotella ?? '').trim();
  if (!ordenOp || !fecha || !operador || !maquina || !codBotella) {
    return res.status(400).json({ error: 'Faltan campos obligatorios (OP, fecha, operador, maquina, codigo de botella).' });
  }

  // Orden fijo: tiene que coincidir exactamente con los "?" del INSERT/UPDATE
  // de abajo (pg no soporta parametros con nombre @x como better-sqlite3).
  const values = [
    ordenOp,
    fecha,
    String(b.turno ?? ''),
    operador,
    String(b.ayudante ?? ''),
    maquina,
    codBotella,
    Number(b.etiqIni) || 0,
    Number(b.etiqFin) || 0,
    Number(b.numBolsas) || 0,
    Number(b.cantPorBolsa) || 0,
    Number(b.botBuenas) || 0,
    Number(b.mermaBot) || 0,
    Number(b.mermaPref) || 0,
    Number(b.mermaTotal) || 0,
    Number(b.totalProduccion) || 0,
    String(b.horaInicio ?? ''),
    String(b.horaFin ?? ''),
    Number(b.minutosDisponibles) || 0,
    JSON.stringify(Array.isArray(b.paradasProgramadas) ? b.paradasProgramadas : []),
    JSON.stringify(Array.isArray(b.paradasNoProgramadas) ? b.paradasNoProgramadas : []),
    Number(b.tiempoCambioMolde) || 0,
    String(b.cmIni ?? ''),
    String(b.cmFin ?? ''),
    String(b.observaciones ?? ''),
    b.finProduccionSaldo ? 1 : 0,
    b.finProduccionPedidoEspecial ? 1 : 0,
    Number(b.saldoGenerado) || 0,
    Number(b.cantidadExtraPedido) || 0,
  ];

  const consumos = Array.isArray(b.consumosPreforma) ? b.consumosPreforma : [];
  const consumosSaldo = Array.isArray(b.consumosSaldo) ? b.consumosSaldo : [];
  const saldoInfo = { saldoGenerado: b.saldoGenerado, codBotella, maquina, fecha, consumosSaldo };

  if (b.id) {
    const id = Number(b.id);
    await dbRun(
      `UPDATE reportes_diarios SET orden_op=?, fecha=?, turno=?, operador=?,
        ayudante=?, maquina=?, cod_botella=?, etiq_ini=?, etiq_fin=?,
        num_bolsas=?, cant_por_bolsa=?, bot_buenas=?,
        merma_bot=?, merma_pref=?, merma_total=?, total_produccion=?,
        hora_inicio=?, hora_fin=?, minutos_disponibles=?,
        paradas_programadas=?, paradas_no_programadas=?,
        tiempo_cambio_molde=?, cm_ini=?, cm_fin=?, observaciones=?,
        fin_produccion_saldo=?, fin_produccion_pedido_especial=?, saldo_generado=?,
        cantidad_extra_pedido_especial=?
       WHERE id=?`,
      [...values, id],
    );
    // Revertir los consumos previos y aplicar los nuevos tal cual vienen del
    // formulario (mismo criterio que editar un reporte en DIGITALIZACION).
    await revertirConsumosPreforma(id);
    await aplicarConsumosPreforma(id, consumos, fecha);
    await revertirSaldoReporte(id);
    await aplicarSaldoReporte(id, saldoInfo);
    return res.json(await reporteRow(await dbGet('SELECT * FROM reportes_diarios WHERE id = ?', [id])));
  }

  const info = await dbRun(
    `INSERT INTO reportes_diarios
      (orden_op, fecha, turno, operador, ayudante, maquina, cod_botella, etiq_ini, etiq_fin, num_bolsas,
       cant_por_bolsa, bot_buenas, merma_bot, merma_pref, merma_total, total_produccion,
       hora_inicio, hora_fin, minutos_disponibles, paradas_programadas, paradas_no_programadas, tiempo_cambio_molde,
       cm_ini, cm_fin, observaciones,
       fin_produccion_saldo, fin_produccion_pedido_especial, saldo_generado,
       cantidad_extra_pedido_especial, estado_validacion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')
     RETURNING id`,
    values,
  );
  const newId = info.rows[0].id;
  await aplicarConsumosPreforma(newId, consumos, fecha);
  await aplicarSaldoReporte(newId, saldoInfo);
  res.status(201).json(await reporteRow(await dbGet('SELECT * FROM reportes_diarios WHERE id = ?', [newId])));
});

// ── Validacion de supervisor ────────────────────────────────────────────────
// Un reporte recien creado queda 'pendiente' -- no cuenta como Historial
// confirmado hasta que alguien lo valida aca. Si se rechaza queda con su
// motivo a la vista (no se borra), y puede volver a marcarse como pendiente
// para reprocesarlo si hace falta corregirlo y reenviarlo.
router.post('/reportes-diarios/:id/validar', async (req, res) => {
  const id = Number(req.params.id);
  const existente = await dbGet('SELECT id FROM reportes_diarios WHERE id = ?', [id]);
  if (!existente) return res.status(404).json({ error: 'Reporte no encontrado.' });
  const quien = req.user?.displayName || req.user?.username || '';
  const ahora = new Date().toISOString().slice(0, 16).replace('T', ' ');
  await dbRun(
    `UPDATE reportes_diarios SET estado_validacion='validado', validado_por=?, validado_en=?,
       rechazado_por='', rechazado_en='', motivo_rechazo='' WHERE id=?`,
    [quien, ahora, id],
  );
  res.json(await reporteRow(await dbGet('SELECT * FROM reportes_diarios WHERE id = ?', [id])));
});

router.post('/reportes-diarios/:id/rechazar', async (req, res) => {
  const id = Number(req.params.id);
  const motivo = String(req.body?.motivo ?? '').trim();
  if (!motivo) return res.status(400).json({ error: 'Falta el motivo del rechazo.' });
  const existente = await dbGet('SELECT id FROM reportes_diarios WHERE id = ?', [id]);
  if (!existente) return res.status(404).json({ error: 'Reporte no encontrado.' });
  const quien = req.user?.displayName || req.user?.username || '';
  const ahora = new Date().toISOString().slice(0, 16).replace('T', ' ');
  await dbRun(
    `UPDATE reportes_diarios SET estado_validacion='rechazado', rechazado_por=?, rechazado_en=?, motivo_rechazo=?,
       validado_por='', validado_en='' WHERE id=?`,
    [quien, ahora, motivo, id],
  );
  res.json(await reporteRow(await dbGet('SELECT * FROM reportes_diarios WHERE id = ?', [id])));
});

// Reabrir un reporte rechazado (o ya validado) como pendiente, por si el
// operador lo corrige y hay que revisarlo de nuevo.
router.post('/reportes-diarios/:id/marcar-pendiente', async (req, res) => {
  const id = Number(req.params.id);
  const existente = await dbGet('SELECT id FROM reportes_diarios WHERE id = ?', [id]);
  if (!existente) return res.status(404).json({ error: 'Reporte no encontrado.' });
  await dbRun(
    `UPDATE reportes_diarios SET estado_validacion='pendiente',
       validado_por='', validado_en='', rechazado_por='', rechazado_en='', motivo_rechazo='' WHERE id=?`,
    [id],
  );
  res.json(await reporteRow(await dbGet('SELECT * FROM reportes_diarios WHERE id = ?', [id])));
});

router.delete('/reportes-diarios/:id', async (req, res) => {
  const id = Number(req.params.id);
  await revertirConsumosPreforma(id);
  await revertirSaldoReporte(id);
  await dbRun('DELETE FROM reportes_diarios WHERE id = ?', [id]);
  res.json({ ok: true });
});

export default router;
