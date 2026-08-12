// Hash de contraseñas (scrypt nativo de Node, sin dependencias extra) y manejo de
// tokens de sesion opacos para el servidor local.

import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import { dbGet, dbRun } from './db.js';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  const actualHash = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  if (actualHash.length !== expected.length) return false;
  return timingSafeEqual(actualHash, expected);
}

export async function createSession(userId) {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await dbRun('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [token, userId, expiresAt]);
  return { token, expiresAt };
}

export async function destroySession(token) {
  await dbRun('DELETE FROM sessions WHERE token = ?', [token]);
}

export async function getUserBySessionToken(token) {
  if (!token) return null;
  const row = await dbGet(
    `SELECT users.id, users.username, users.display_name, users.role, sessions.expires_at
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = ?`,
    [token],
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await destroySession(token);
    return null;
  }
  return { id: row.id, username: row.username, displayName: row.display_name, role: row.role };
}

export async function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const user = await getUserBySessionToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Sesion invalida o expirada.' });
  }
  req.user = user;
  req.sessionToken = token;
  next();
}
