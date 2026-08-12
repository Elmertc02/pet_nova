// Importa un dump de PostgreSQL de DIGITALIZACION (pg_dump --format=plain) a la
// base SQLite local. Parsea los bloques "COPY <tabla> (...) FROM stdin; ... \." a
// mano (formato tab-separated de Postgres, \N = NULL) -- no depende de un cliente
// Postgres, solo lee texto.
//
// Uso:
//   node server/scripts/import-digitalizacion-dump.js <archivo.sql> [<archivo2.sql> ...]
//   npm run db:import-digitalizacion -- server/migrations/source-dumps/BOTELLAS_local.sql
//
// Se puede correr varias veces (idempotente vía INSERT OR REPLACE); a medida que
// lleguen mas dumps (los "restantes" que se mencionaron), se importan igual.

import { readFileSync } from 'node:fs';
import db from '../db.js';
import { LETRA_MAQUINA } from '../db.js';

function parsePgValue(raw) {
  if (raw === '\\N') return null;
  return raw
    .replace(/\\t/g, '\t')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\\\/g, '\\');
}

// Extrae { table, columns, rows } para cada bloque "COPY public.<table> (<cols>)
// FROM stdin;\n<...tab-separated rows...>\n\."
function extractCopyBlocks(sqlText) {
  const blocks = [];
  const copyRegex = /COPY public\.(\w+) \(([^)]+)\) FROM stdin;\n([\s\S]*?)\\\.\n/g;
  let match;
  while ((match = copyRegex.exec(sqlText))) {
    const [, table, columnsRaw, body] = match;
    const columns = columnsRaw.split(',').map((c) => c.trim());
    const rows = body
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => line.split('\t').map(parsePgValue));
    blocks.push({ table, columns, rows });
  }
  return blocks;
}

function importMaquinas(rows, columns) {
  const idx = (name) => columns.indexOf(name);
  const upsert = db.prepare(`
    INSERT INTO machines (nombre, letra, tipo, activa, orden)
    VALUES (@nombre, @letra, @tipo, @activa, @orden)
    ON CONFLICT(nombre) DO UPDATE SET
      tipo = excluded.tipo, activa = excluded.activa, orden = excluded.orden,
      letra = CASE WHEN excluded.letra != '' THEN excluded.letra ELSE machines.letra END
  `);
  const run = db.transaction((items) => {
    for (const item of items) upsert.run(item);
  });
  run(rows.map((row) => {
    const nombre = row[idx('nombre')];
    return {
      nombre,
      letra: LETRA_MAQUINA[nombre] || '',
      tipo: row[idx('tipo')] || 'ambos',
      activa: row[idx('activa')] === 't' ? 1 : 0,
      orden: Number(row[idx('orden')]) || 0,
    };
  }));
  return rows.length;
}

function importPreformas(rows, columns) {
  const idx = (name) => columns.indexOf(name);
  const upsert = db.prepare(`
    INSERT INTO preformas (id, codigo, descripcion, unid_caja, gramaje)
    VALUES (@id, @codigo, @descripcion, @unid_caja, @gramaje)
    ON CONFLICT(codigo) DO UPDATE SET
      descripcion = excluded.descripcion, unid_caja = excluded.unid_caja, gramaje = excluded.gramaje
  `);
  const run = db.transaction((items) => {
    for (const item of items) upsert.run(item);
  });
  run(rows.map((row) => ({
    id: Number(row[idx('id')]),
    codigo: row[idx('codigo')],
    descripcion: row[idx('descripcion')] || '',
    unid_caja: Number(row[idx('unid_caja')]) || 0,
    gramaje: row[idx('gramaje')] !== null ? Number(row[idx('gramaje')]) : null,
  })));
  return rows.length;
}

function importBotellas(rows, columns) {
  const idx = (name) => columns.indexOf(name);
  const upsert = db.prepare(`
    INSERT INTO botellas
      (id, maquina, cod_bot, cod_pref, gramaje, volumen, cliente, descripcion, color, u_bolsa, u_pallet, velocidad, rosca, moldes)
    VALUES
      (@id, @maquina, @cod_bot, @cod_pref, @gramaje, @volumen, @cliente, @descripcion, @color, @u_bolsa, @u_pallet, @velocidad, @rosca, @moldes)
    ON CONFLICT(id) DO UPDATE SET
      maquina=excluded.maquina, cod_bot=excluded.cod_bot, cod_pref=excluded.cod_pref,
      gramaje=excluded.gramaje, volumen=excluded.volumen, cliente=excluded.cliente,
      descripcion=excluded.descripcion, color=excluded.color, u_bolsa=excluded.u_bolsa,
      u_pallet=excluded.u_pallet, velocidad=excluded.velocidad, rosca=excluded.rosca, moldes=excluded.moldes
  `);
  const run = db.transaction((items) => {
    for (const item of items) upsert.run(item);
  });
  const asNum = (v) => (v !== null && v !== '' ? Number(v) : null);
  run(rows.map((row) => ({
    id: Number(row[idx('id')]),
    maquina: row[idx('maquina')] || '',
    cod_bot: row[idx('cod_bot')] || '',
    cod_pref: row[idx('cod_pref')],
    gramaje: asNum(row[idx('gramaje')]),
    volumen: asNum(row[idx('volumen')]),
    cliente: row[idx('cliente')],
    descripcion: row[idx('descripcion')],
    color: row[idx('color')],
    u_bolsa: row[idx('u_bolsa')],
    u_pallet: row[idx('u_pallet')],
    velocidad: row[idx('velocidad')],
    rosca: row[idx('rosca')],
    moldes: row[idx('moldes')],
  })));
  return rows.length;
}

function importAuthUsuarios(rows, columns) {
  const idx = (name) => columns.indexOf(name);
  const upsert = db.prepare(`
    INSERT INTO dig_usuarios (id, nombre, username, rol, activo, creado_en)
    VALUES (@id, @nombre, @username, @rol, @activo, @creado_en)
    ON CONFLICT(username) DO UPDATE SET
      nombre=excluded.nombre, rol=excluded.rol, activo=excluded.activo, creado_en=excluded.creado_en
  `);
  const run = db.transaction((items) => {
    for (const item of items) upsert.run(item);
  });
  run(rows.map((row) => ({
    id: Number(row[idx('id')]),
    nombre: row[idx('nombre')] || '',
    username: row[idx('username')],
    rol: row[idx('rol')] || 'visor',
    activo: row[idx('activo')] === 't' ? 1 : 0,
    creado_en: row[idx('creado_en')],
  })));
  return rows.length;
}

const IMPORTERS = {
  maquinas: importMaquinas,
  maquinas_web: () => 0, // duplica "maquinas", se ignora
  preformas: importPreformas,
  botellas: importBotellas,
  auth_usuarios: importAuthUsuarios,
};

function importFile(path) {
  const sqlText = readFileSync(path, 'utf8');
  const blocks = extractCopyBlocks(sqlText);
  console.log(`\n${path}`);
  for (const block of blocks) {
    const importer = IMPORTERS[block.table];
    if (!importer) {
      console.log(`  - ${block.table}: sin importador todavia (${block.rows.length} filas) -- se ignora por ahora`);
      continue;
    }
    if (block.rows.length === 0) {
      console.log(`  - ${block.table}: sin datos en el dump`);
      continue;
    }
    const count = importer(block.rows, block.columns);
    console.log(`  - ${block.table}: ${count} filas importadas`);
  }
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Uso: node server/scripts/import-digitalizacion-dump.js <archivo.sql> [...]');
  process.exit(1);
}

for (const file of files) {
  importFile(file);
}

console.log('\nListo.');
