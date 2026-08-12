import { Router } from 'express';
import { dbGet } from '../db.js';
import { verifyPassword, createSession, destroySession, requireAuth } from '../auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  const cleanUsername = String(username ?? '').trim().toLowerCase();
  if (!cleanUsername || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios.' });
  }

  const user = await dbGet('SELECT * FROM users WHERE username = ?', [cleanUsername]);
  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  const session = await createSession(user.id);
  return res.json({
    token: session.token,
    expiresAt: session.expiresAt,
    user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role },
  });
});

router.post('/logout', requireAuth, async (req, res) => {
  await destroySession(req.sessionToken);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
