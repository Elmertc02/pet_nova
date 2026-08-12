// Crea (o resetea la contraseña de) el usuario administrador general local.
//
// Uso:
//   npm run db:seed
//   LOCAL_ADMIN_USERNAME=admin LOCAL_ADMIN_PASSWORD=OtraClave123! npm run db:seed
//
// Por defecto crea el usuario "admin" con la contraseña "Petnova#2026!Local".
// Cambiala despues de la primera vez que entres.

import { dbGet, dbRun, pool } from '../db.js';
import { hashPassword } from '../auth.js';

const username = (process.env.LOCAL_ADMIN_USERNAME || 'admin').trim().toLowerCase();
const password = process.env.LOCAL_ADMIN_PASSWORD || 'Petnova#2026!Local';
const displayName = process.env.LOCAL_ADMIN_DISPLAY_NAME || 'Administrador';

const { salt, hash } = hashPassword(password);

const existing = await dbGet('SELECT id FROM users WHERE username = ?', [username]);

if (existing) {
  await dbRun(
    'UPDATE users SET password_hash = ?, password_salt = ?, display_name = ?, role = ? WHERE id = ?',
    [hash, salt, displayName, 'admin', existing.id],
  );
  console.log(`Usuario "${username}" ya existia: contraseña y rol actualizados a admin.`);
} else {
  await dbRun(
    'INSERT INTO users (username, display_name, password_hash, password_salt, role) VALUES (?, ?, ?, ?, ?)',
    [username, displayName, hash, salt, 'admin'],
  );
  console.log(`Usuario admin "${username}" creado.`);
}

console.log(`Usuario: ${username}`);
console.log(`Contraseña: ${password}`);
console.log('Guardala en un lugar seguro y cambiala luego si hace falta.');

await pool.end();
