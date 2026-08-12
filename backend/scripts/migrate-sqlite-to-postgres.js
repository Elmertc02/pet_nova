// Copia todos los datos de la base SQLite local (server/data/petnova.local.db)
// a la base PostgreSQL nueva, preservando ids exactos -- ver la migracion en
// C:\Users\LENOVO\.claude\plans\virtual-sauteeing-kurzweil.md.
//
// "sessions" se excluye a proposito (son solo tokens de login, no hace falta
// preservarlas -- los usuarios simplemente inician sesion de nuevo).
//
// Uso:
//   npm run db:migrate-to-postgres

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { pool, withTransaction } from '../db.js'; // importarlo ya crea/asegura el schema en Postgres

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQLITE_PATH = path.join(__dirname, '..', 'data', 'petnova.local.db');

if (!existsSync(SQLITE_PATH)) {
  console.log(`No hay base SQLite en ${SQLITE_PATH} -- nada que migrar.`);
  await pool.end();
  process.exit(0);
}

const sqlite = new Database(SQLITE_PATH, { readonly: true });

// Orden seguro por FKs (cada tabla despues de las que referencia).
// hasSequence: true si la tabla usa "id SERIAL" en Postgres (hay que
// resincronizar la secuencia despues de insertar ids explicitos). botellas/
// preformas/dig_usuarios usan "id INTEGER PRIMARY KEY" sin secuencia -- la
// app les asigna id a mano (ver COALESCE(MIN(id),0)-1 en las rutas), no
// necesitan resync.
const TABLES = [
  { name: 'users', hasSequence: true },
  { name: 'machines', hasSequence: true },
  { name: 'botellas', hasSequence: false },
  { name: 'preformas', hasSequence: false },
  { name: 'dig_usuarios', hasSequence: false },
  { name: 'personal', hasSequence: true },
  { name: 'planes', hasSequence: true },
  { name: 'etiquetas_entries', hasSequence: true },
  { name: 'reportes_diarios', hasSequence: true },
  { name: 'cajas_preforma', hasSequence: true },
  { name: 'cajas_preforma_mov', hasSequence: true },
];

const resumen = [];

await withTransaction(async ({ run }) => {
  // Limpia lo que haya en Postgres antes de copiar (ej. las maquinas de
  // fallback que server/db.js siembra solas si la tabla estaba vacia) --
  // asi la migracion es segura de re-correr y no choca con UNIQUE(nombre).
  await run(`TRUNCATE TABLE
    cajas_preforma_mov, cajas_preforma, reportes_diarios, etiquetas_entries,
    planes, personal, dig_usuarios, preformas, botellas, machines, sessions, users
    RESTART IDENTITY CASCADE`);

  for (const { name, hasSequence } of TABLES) {
    const cols = sqlite.prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name);
    const rows = sqlite.prepare(`SELECT * FROM ${name}`).all();
    const placeholders = cols.map(() => '?').join(', ');
    const insertSql = `INSERT INTO ${name} (${cols.join(', ')}) VALUES (${placeholders})`;
    for (const row of rows) {
      await run(insertSql, cols.map((c) => row[c]));
    }
    if (hasSequence && rows.length > 0) {
      await run(
        `SELECT setval(pg_get_serial_sequence('${name}', 'id'), (SELECT COALESCE(MAX(id), 1) FROM ${name}))`,
      );
    }
    resumen.push({ tabla: name, filas: rows.length });
  }
});

console.log('Migracion SQLite -> PostgreSQL completa:');
for (const r of resumen) console.log(`  ${r.tabla}: ${r.filas} filas`);
console.log('\n(sessions no se migro -- los usuarios inician sesion de nuevo)');

sqlite.close();
await pool.end();
