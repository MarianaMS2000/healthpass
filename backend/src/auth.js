const jwt = require('jsonwebtoken');

const isProd = process.env.NODE_ENV === 'production';
const SECRET = process.env.JWT_SECRET || (isProd ? null : 'dev-secret-cambiar');
if (!SECRET) {
  console.error('Falta la variable JWT_SECRET en producción');
  process.exit(1);
}
const COOKIE = 'hp_token';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function setSession(res, userId) {
  const token = jwt.sign({ sub: userId }, SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: MAX_AGE,
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: isProd });
}

function requireAuth(req, res, next) {
  try {
    const payload = jwt.verify(req.cookies[COOKIE] || '', SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Sesión no válida. Inicia sesión.' });
  }
}

module.exports = { setSession, clearSession, requireAuth };