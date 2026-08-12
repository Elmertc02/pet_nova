// Base de datos local para el modo "local" de PETnova -- PostgreSQL (antes
// era SQLite / better-sqlite3; ver la migracion en
// C:\Users\LENOVO\.claude\plans\virtual-sauteeing-kurzweil.md). Cubre
// autenticacion propia (users/sessions), Etiquetas (machines/botellas/
// etiquetas_entries), Planificacion (planes), Reportes diarios, Almacen
// Produccion (cajas de preforma) y Equipo Operativo/Productos e Insumos
// (personal, preformas).

// dotenv/config por si solo carga ".env" relativo al directorio de trabajo
// (process.cwd()) -- eso rompe si algun dia esto se arranca desde otra
// carpeta (ej. "node backend/index.js" desde la raiz del repo). Se resuelve
// la ruta a mano, relativa a este archivo, para que backend/.env se
// encuentre siempre sin importar desde donde se invoque.
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || 'etiquetas2',
  user: process.env.PGUSER || 'etiquetas2_app',
  password: process.env.PGPASSWORD || '',
});

// Todas las queries del proyecto usan placeholders posicionales "?" (estilo
// better-sqlite3/SQLite) -- se convierten automaticamente a "$1..$n" (estilo
// Postgres) aca, para no tener que reescribir el texto de cada query a mano.
// Ninguna query del proyecto tiene un "?" literal en el texto.
function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function run(executor, sql, params = []) {
  return executor.query(toPgPlaceholders(sql), params);
}

// Helpers "estilo better-sqlite3" para minimizar cambios en las rutas: get()
// devuelve una fila o null, all() devuelve todas las filas, dbRun() devuelve
// el resultado crudo (para leer result.rows[0].id de un INSERT ... RETURNING id).
export async function dbGet(sql, params = []) {
  const { rows } = await run(pool, sql, params);
  return rows[0] || null;
}
export async function dbAll(sql, params = []) {
  const { rows } = await run(pool, sql, params);
  return rows;
}
export async function dbRun(sql, params = []) {
  return run(pool, sql, params);
}

// Version de los helpers atada a un client especifico (para usar dentro de
// withTransaction, donde todas las queries de la transaccion tienen que ir
// por la misma conexion).
export function scopedQueries(client) {
  return {
    get: async (sql, params = []) => (await run(client, sql, params)).rows[0] || null,
    all: async (sql, params = []) => (await run(client, sql, params)).rows,
    run: async (sql, params = []) => run(client, sql, params),
  };
}

// Reemplaza a db.transaction(fn) de better-sqlite3 (sincrono) por su
// equivalente async con un client dedicado del pool.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(scopedQueries(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Agrega columnas nuevas a una tabla ya existente sin perder datos --
// Postgres soporta "ADD COLUMN IF NOT EXISTS" nativo, no hace falta chequear
// antes como en SQLite.
async function ensureColumns(table, columns) {
  for (const [nombre, definicion] of Object.entries(columns)) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${nombre} ${definicion}`);
  }
}

// Formato de fecha/hora igual al que ya devolvia SQLite (datetime('now')):
// 'YYYY-MM-DD HH:MI:SS', para no romper nada que lo consuma como texto plano
// (ordena bien lexicograficamente, ya no hace falta el wrapper datetime(col)
// en los ORDER BY de las rutas).
const NOW_TEXT = "to_char(now(), 'YYYY-MM-DD HH24:MI:SS')";

await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'lectura' CHECK (role IN ('admin', 'calidad', 'lectura')),
    created_at    TEXT NOT NULL DEFAULT ${NOW_TEXT}
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT ${NOW_TEXT},
    expires_at TEXT NOT NULL
  );

  -- Maquinas reales (importadas de la tabla "maquinas" de DIGITALIZACION).
  -- tipo: 'planificacion' | 'reporte_diario' | 'ambos' -- igual que en core.py.
  CREATE TABLE IF NOT EXISTS machines (
    id     SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    letra  TEXT NOT NULL DEFAULT '',
    tipo   TEXT NOT NULL DEFAULT 'ambos',
    activa INTEGER NOT NULL DEFAULT 1,
    orden  INTEGER NOT NULL DEFAULT 0
  );

  -- Catalogo real de botellas (tabla "botellas" de DIGITALIZACION): una fila por
  -- maquina + codigo de botella, con su preforma correspondiente.
  CREATE TABLE IF NOT EXISTS botellas (
    id          INTEGER PRIMARY KEY,
    maquina     TEXT NOT NULL,
    cod_bot     TEXT NOT NULL,
    cod_pref    TEXT,
    gramaje     REAL,
    volumen     REAL,
    cliente     TEXT,
    descripcion TEXT,
    color       TEXT,
    u_bolsa     TEXT,
    velocidad   TEXT,
    rosca       TEXT,
    moldes      TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_botellas_maquina ON botellas(maquina);
  CREATE INDEX IF NOT EXISTS idx_botellas_cod_bot ON botellas(cod_bot);

  -- Catalogo de preformas (tabla "preformas" de DIGITALIZACION).
  CREATE TABLE IF NOT EXISTS preformas (
    id          INTEGER PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    descripcion TEXT NOT NULL DEFAULT '',
    unid_caja   INTEGER NOT NULL DEFAULT 0,
    gramaje     REAL
  );

  -- Personal (tabla "personal" de DIGITALIZACION): operadores/ayudantes.
  CREATE TABLE IF NOT EXISTS personal (
    id     SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    rol    TEXT NOT NULL DEFAULT 'operador',
    activo INTEGER NOT NULL DEFAULT 1
  );

  -- Reporte diario de produccion -- version reducida (14 columnas pedidas), no el
  -- reporte_diario completo de DIGITALIZACION (60+ columnas, workflow de
  -- aprobacion). orden_op guarda el codigo completo tal cual se escribe/usa en
  -- Etiquetas (ej. "088T" = orden 088 + letra de maquina T) para poder cruzarlo.
  CREATE TABLE IF NOT EXISTS reportes_diarios (
    id                     SERIAL PRIMARY KEY,
    orden_op               TEXT NOT NULL,
    fecha                  TEXT NOT NULL,
    turno                  TEXT NOT NULL DEFAULT '',
    operador               TEXT NOT NULL DEFAULT '',
    ayudante               TEXT NOT NULL DEFAULT '',
    maquina                TEXT NOT NULL DEFAULT '',
    cod_botella            TEXT NOT NULL DEFAULT '',
    bot_buenas             INTEGER NOT NULL DEFAULT 0,
    merma_bot              INTEGER NOT NULL DEFAULT 0,
    merma_pref             INTEGER NOT NULL DEFAULT 0,
    num_bolsas             INTEGER NOT NULL DEFAULT 0,
    hora_inicio            TEXT NOT NULL DEFAULT '',
    hora_fin               TEXT NOT NULL DEFAULT '',
    minutos_disponibles    INTEGER NOT NULL DEFAULT 0,
    paradas_programadas    TEXT NOT NULL DEFAULT '[]',
    paradas_no_programadas TEXT NOT NULL DEFAULT '[]',
    tiempo_cambio_molde    INTEGER NOT NULL DEFAULT 0,
    created_at             TEXT NOT NULL DEFAULT ${NOW_TEXT}
  );

  -- Cajas de preforma (tabla "cajas_preforma" de DIGITALIZACION): inventario de
  -- preforma que llega en cajas. estado: 'activa'|'vaciada'|'faltante'|'sobrante'
  -- (el estado 'calidad' -- bloqueo por control de calidad -- queda para una fase
  -- siguiente, no esta acá todavia).
  CREATE TABLE IF NOT EXISTS cajas_preforma (
    id                SERIAL PRIMARY KEY,
    cod_preforma      TEXT NOT NULL,
    num_caja          TEXT NOT NULL,
    op                TEXT NOT NULL DEFAULT '',
    resina            TEXT NOT NULL DEFAULT '',
    cantidad_inicial  INTEGER NOT NULL DEFAULT 0,
    cantidad_actual   INTEGER NOT NULL DEFAULT 0,
    fecha_ingreso     TEXT NOT NULL,
    fecha_vaciada     TEXT,
    estado            TEXT NOT NULL DEFAULT 'activa',
    observaciones     TEXT NOT NULL DEFAULT '',
    created_at        TEXT NOT NULL DEFAULT ${NOW_TEXT},
    updated_at        TEXT NOT NULL DEFAULT ${NOW_TEXT}
  );
  CREATE INDEX IF NOT EXISTS idx_cajas_pref_cod ON cajas_preforma(cod_preforma);
  CREATE INDEX IF NOT EXISTS idx_cajas_pref_estado ON cajas_preforma(estado);

  -- Movimientos de consumo de una caja contra un reporte diario (tabla
  -- "cajas_preforma_mov" de DIGITALIZACION).
  CREATE TABLE IF NOT EXISTS cajas_preforma_mov (
    id         SERIAL PRIMARY KEY,
    caja_id    INTEGER NOT NULL REFERENCES cajas_preforma(id) ON DELETE CASCADE,
    reporte_id INTEGER NOT NULL,
    cantidad   INTEGER NOT NULL,
    fecha      TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW_TEXT}
  );
  CREATE INDEX IF NOT EXISTS idx_cajas_mov_reporte ON cajas_preforma_mov(reporte_id);
  CREATE INDEX IF NOT EXISTS idx_cajas_mov_caja ON cajas_preforma_mov(caja_id);

  -- Planes de planificacion semanal (tabla "planes" de DIGITALIZACION: id,
  -- semana, maquina, datos jsonb, fecha). "datos" guarda el mismo blob que
  -- arma planificacionEngine.js (botellas, mantenimientos, resultado del
  -- reparto), como texto JSON.
  CREATE TABLE IF NOT EXISTS planes (
    id         SERIAL PRIMARY KEY,
    semana     TEXT NOT NULL,
    maquina    TEXT NOT NULL,
    datos      TEXT NOT NULL DEFAULT '{}',
    fecha      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ${NOW_TEXT}
  );

  -- Saldo de botellas: cuando un reporte marca "Fin de produccion con saldo",
  -- lo que se produjo de mas queda guardado aca (una fila por reporte que lo
  -- genero) para poder usarse como "Usar saldo de botella" en reportes
  -- futuros de esa misma botella, sin tener que producirlas de nuevo.
  CREATE TABLE IF NOT EXISTS saldo_botellas (
    id                SERIAL PRIMARY KEY,
    cod_botella       TEXT NOT NULL,
    maquina           TEXT NOT NULL DEFAULT '',
    cantidad_actual   INTEGER NOT NULL DEFAULT 0,
    estado            TEXT NOT NULL DEFAULT 'activo',
    fecha             TEXT NOT NULL,
    observaciones     TEXT NOT NULL DEFAULT '',
    created_at        TEXT NOT NULL DEFAULT ${NOW_TEXT},
    updated_at        TEXT NOT NULL DEFAULT ${NOW_TEXT}
  );
  CREATE INDEX IF NOT EXISTS idx_saldo_bot_cod ON saldo_botellas(cod_botella);
  CREATE INDEX IF NOT EXISTS idx_saldo_bot_estado ON saldo_botellas(estado);

  -- Movimientos de saldo de botellas: 'generacion' (un reporte genero saldo,
  -- crea/suma cantidad_actual) o 'consumo' (otro reporte uso ese saldo con
  -- "Usar saldo de botella", resta cantidad_actual).
  CREATE TABLE IF NOT EXISTS saldo_botellas_mov (
    id         SERIAL PRIMARY KEY,
    saldo_id   INTEGER NOT NULL REFERENCES saldo_botellas(id) ON DELETE CASCADE,
    reporte_id INTEGER NOT NULL,
    tipo       TEXT NOT NULL,
    cantidad   INTEGER NOT NULL,
    fecha      TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW_TEXT}
  );
  CREATE INDEX IF NOT EXISTS idx_saldo_mov_reporte ON saldo_botellas_mov(reporte_id);
  CREATE INDEX IF NOT EXISTS idx_saldo_mov_saldo ON saldo_botellas_mov(saldo_id);

  CREATE TABLE IF NOT EXISTS etiquetas_entries (
    id             SERIAL PRIMARY KEY,
    orden_op       TEXT NOT NULL,
    maquina_id     INTEGER REFERENCES machines(id) ON DELETE SET NULL,
    maquina_nombre TEXT NOT NULL DEFAULT '',
    maquina_letra  TEXT NOT NULL DEFAULT '',
    fecha          TEXT NOT NULL,
    turno          TEXT NOT NULL DEFAULT '',
    cod_botella    TEXT NOT NULL DEFAULT '',
    cod_preforma   TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL DEFAULT ${NOW_TEXT}
  );

  -- ── Seguimiento (Planeacion Dinamica de DIGITALIZACION) ───────────────────
  -- Paros de mantenimiento anotados a mitad de semana sobre un plan vigente
  -- (le restan horas a los dias que quedan al recalcular Seguimiento).
  CREATE TABLE IF NOT EXISTS planificacion_paros (
    id         SERIAL PRIMARY KEY,
    semana     TEXT NOT NULL,
    maquina    TEXT NOT NULL,
    dia_idx    INTEGER NOT NULL,
    dia_nombre TEXT NOT NULL DEFAULT '',
    horas      REAL NOT NULL DEFAULT 0,
    motivo     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ${NOW_TEXT}
  );

  -- Botellas agregadas a mitad de semana (no estaban en el plan original) --
  -- se insertan en la secuencia de "restante" en la posicion "despues_de".
  CREATE TABLE IF NOT EXISTS planificacion_adiciones (
    id          SERIAL PRIMARY KEY,
    semana      TEXT NOT NULL,
    maquina     TEXT NOT NULL,
    cod_bot     TEXT NOT NULL,
    descripcion TEXT NOT NULL DEFAULT '',
    cantidad    INTEGER NOT NULL DEFAULT 0,
    vel         REAL NOT NULL DEFAULT 0,
    despues_de  TEXT NOT NULL DEFAULT '',
    notas       TEXT NOT NULL DEFAULT '',
    submaq      TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT ${NOW_TEXT}
  );

  -- Reasignacion informativa de una botella que ya no entra en el tiempo
  -- restante de una maquina hacia otra -- no recalcula la maquina origen,
  -- solo queda anotado (mismo criterio que DIGITALIZACION).
  CREATE TABLE IF NOT EXISTS planificacion_reasignaciones (
    id          SERIAL PRIMARY KEY,
    semana      TEXT NOT NULL,
    maq_origen  TEXT NOT NULL,
    maq_destino TEXT NOT NULL,
    cod_bot     TEXT NOT NULL,
    descripcion TEXT NOT NULL DEFAULT '',
    cantidad    INTEGER NOT NULL DEFAULT 0,
    vel         REAL NOT NULL DEFAULT 0,
    motivo      TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT ${NOW_TEXT}
  );
`);

// Inicio/fin de etiqueta -> calculan num_bolsas; cant_por_bolsa -> calcula
// bot_buenas; merma_total y total_produccion se calculan en el cliente y se
// guardan tambien acá (igual que en el reporte_diario real de DIGITALIZACION).
await ensureColumns('reportes_diarios', {
  etiq_ini: 'INTEGER NOT NULL DEFAULT 0',
  etiq_fin: 'INTEGER NOT NULL DEFAULT 0',
  cant_por_bolsa: 'INTEGER NOT NULL DEFAULT 0',
  merma_total: 'INTEGER NOT NULL DEFAULT 0',
  total_produccion: 'INTEGER NOT NULL DEFAULT 0',
  // Fin de produccion con saldo: cuando se termina de producir de mas y ese
  // extra queda guardado como saldo_botellas (ver aplicarSaldoReporte). Fin
  // de produccion pedido especial: solo marca el reporte, sin efecto en el
  // calculo -- es informativo para identificar ese tipo de corrida despues.
  fin_produccion_saldo: 'INTEGER NOT NULL DEFAULT 0',
  fin_produccion_pedido_especial: 'INTEGER NOT NULL DEFAULT 0',
  saldo_generado: 'INTEGER NOT NULL DEFAULT 0',
  // Pedido especial: cantidad extra que no llega a completar una bolsa,
  // pero igual se suma a Botellas buenas (ver botBuenas en ReportesView.jsx).
  cantidad_extra_pedido_especial: 'INTEGER NOT NULL DEFAULT 0',
  // Hora inicio/fin del cambio de molde (ademas de tiempo_cambio_molde, que
  // es el resultado ya calculado) -- se guardan aparte para poder recargar
  // el formulario tal cual quedo la primera vez al editar un reporte.
  cm_ini: "TEXT NOT NULL DEFAULT ''",
  cm_fin: "TEXT NOT NULL DEFAULT ''",
  // Validacion de supervisor (igual que DIGITALIZACION): un reporte nuevo
  // arranca 'pendiente' y no cuenta como historial confirmado hasta que
  // alguien lo valida. Si se rechaza, motivo_rechazo queda documentado y el
  // reporte se puede seguir viendo (con ese motivo) en la lista de
  // rechazados -- no se borra.
  estado_validacion: "TEXT NOT NULL DEFAULT 'pendiente'",
  validado_por: "TEXT NOT NULL DEFAULT ''",
  validado_en: "TEXT NOT NULL DEFAULT ''",
  rechazado_por: "TEXT NOT NULL DEFAULT ''",
  rechazado_en: "TEXT NOT NULL DEFAULT ''",
  motivo_rechazo: "TEXT NOT NULL DEFAULT ''",
  // Observaciones libres del turno (seccion Tiempos del formulario) -- texto
  // suelto, sin efecto en ningun calculo.
  observaciones: "TEXT NOT NULL DEFAULT ''",
});

// Consumo de preformas por reporte: estado de la caja en ese consumo
// ('ninguno'|'faltante'|'sobrante'|'cambio_caja'), la cantidad irregular
// declarada (de mas/faltantes, o usadas si es cambio de caja) y el saldo
// que tenia la caja justo antes de este consumo (para mostrar el historial
// sin tener que recalcular la cascada hacia atras).
await ensureColumns('cajas_preforma_mov', {
  estado: "TEXT NOT NULL DEFAULT 'ninguno'",
  cantidad_irregular: 'INTEGER NOT NULL DEFAULT 0',
  saldo_anterior: 'INTEGER NOT NULL DEFAULT 0',
  // Preformas observadas (estado='observado'): motivo del defecto. Estas
  // filas restan aparte de la misma caja (ver cajasPreforma.js), y quedan
  // visibles en el historial de esa caja en Almacen Produccion.
  descripcion: "TEXT NOT NULL DEFAULT ''",
});

// Letras por maquina para el codigo de identificacion (_LETRA_MAQUINA en core.py de
// DIGITALIZACION) -- las mismas que ya se usaban en `const machines` de App.jsx.
export const LETRA_MAQUINA = {
  'SEM 66': 'M',
  'SEM 106': 'T',
  'SEM 50': 'R',
  'SEM 139': 'U',
  'SEM 99': 'P',
  'SEM 48': 'Q',
  'SEM 77': 'S',
  'SEM 63': 'L',
  'SEM 78': 'F',
};

// Fallback minimo por si todavia no se corrio la importacion del dump real
// (npm run db:import-digitalizacion / db:migrate-to-postgres) -- una vez
// importado, esto no vuelve a correr.
const machineCount = (await dbGet('SELECT COUNT(*) AS n FROM machines')).n;
if (Number(machineCount) === 0) {
  await withTransaction(async ({ run: runTx }) => {
    let orden = 0;
    for (const [nombre, letra] of Object.entries(LETRA_MAQUINA)) {
      await runTx(
        "INSERT INTO machines (nombre, letra, tipo, activa, orden) VALUES (?, ?, 'reporte_diario', 1, ?)",
        [nombre, letra, orden++],
      );
    }
  });
}
