const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { setSession, clearSession, requireAuth } = require('../auth');
const { clean, userFields, password } = require('../validate');

const router = express.Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
});
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

router.post('/register', limiter, async (req, res, next) => {
  try {
    const { nombre, mail, user } = userFields(req.body);
    const pass = password(req.body.password);
    const hash = await bcrypt.hash(pass, 10);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre_completo, email, username, password_hash)
       VALUES ($1,$2,$3,$4) RETURNING id, nombre_completo, email, username`,
      [nombre, mail, user, hash]
    );
    setSession(res, rows[0].id);
    res.status(201).json({ user: rows[0] });
  } catch (e) {
    next(e);
  }
});

router.post('/login', limiter, async (req, res, next) => {
  try {
    const login = clean(req.body.username).replace(/^@/, '').toLowerCase();
    const pass = typeof req.body.password === 'string' ? req.body.password : '';
    const { rows } = await pool.query(
      `SELECT id, nombre_completo, email, username, password_hash FROM usuarios
       WHERE LOWER(username) = $1 OR LOWER(email) = $1`,
      [login]
    );
    const u = rows[0];
    const ok = await bcrypt.compare(pass, u ? u.password_hash : DUMMY_HASH);
    if (!u || !ok) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    setSession(res, u.id);
    delete u.password_hash;
    res.json({ user: u });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre_completo, email, username FROM usuarios WHERE id = $1',
      [req.userId]
    );
    if (!rows[0]) return res.status(401).json({ error: 'Sesión no válida' });
    res.json({ user: rows[0] });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
