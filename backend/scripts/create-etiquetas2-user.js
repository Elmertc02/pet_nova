#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PGHOST = process.env.PGHOST || 'localhost';
const PGPORT = Number(process.env.PGPORT || 5432);
const PGDATABASE = process.env.PGDATABASE || 'etiquetas2';
const PGSUPERUSER = process.env.PGUSER || 'postgres';
const PGSUPERPASSWORD = process.env.PGPASSWORD || '';

const TARGET_USER = process.env.TARGET_DB_USER || 'etiquetas2_app';
const TARGET_DB = process.env.TARGET_DB_NAME || PGDATABASE;
const TARGET_PASS = process.env.TARGET_DB_PASSWORD || crypto.randomBytes(12).toString('hex');

async function run() {
  const client = new Client({ host: PGHOST, port: PGPORT, user: PGSUPERUSER, password: PGSUPERPASSWORD, database: 'postgres' });
  await client.connect();
  try {
    // Check role
    const roleRes = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [TARGET_USER]);
    // Postgres does not allow parameter placeholders for CREATE/ALTER ROLE password
    const escPass = TARGET_PASS.replace(/'/g, "''");
    if (roleRes.rowCount === 0) {
      console.log(`Creando usuario ${TARGET_USER}...`);
      await client.query(`CREATE ROLE ${TARGET_USER} WITH LOGIN PASSWORD '${escPass}'`);
      console.log('Usuario creado.');
    } else {
      console.log(`Usuario ${TARGET_USER} ya existe — actualizando contraseña...`);
      await client.query(`ALTER ROLE ${TARGET_USER} WITH PASSWORD '${escPass}'`);
      console.log('Contraseña actualizada.');
    }

    // Check database
    const dbRes = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [TARGET_DB]);
    if (dbRes.rowCount === 0) {
      console.log(`Creando base de datos ${TARGET_DB}...`);
      await client.query(`CREATE DATABASE ${TARGET_DB} OWNER ${TARGET_USER}`);
      console.log('Base de datos creada.');
    } else {
      console.log(`Base de datos ${TARGET_DB} ya existe.`);
      // Ensure owner is the target user
      console.log(`Asegurando propietario ${TARGET_USER} en ${TARGET_DB}...`);
      await client.query(`ALTER DATABASE ${TARGET_DB} OWNER TO ${TARGET_USER}`);
      console.log('Propietario asegurado.');
    }

    // Grant privileges (just in case)
    console.log('Concediendo privilegios en la base de datos...');
    // No-op placeholder: privileges are handled by owner assignment above.

    console.log('\nResumen:');
    console.log(`  DB: ${TARGET_DB}`);
    console.log(`  USER: ${TARGET_USER}`);
    console.log(`  PASSWORD: ${TARGET_PASS}`);
    console.log('\nGuarda la contraseña en un lugar seguro.');
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exitCode = 2;
  } finally {
    await client.end();
  }
}

run();
