require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { pool, migrate } = require('./db');
const { requireAuth } = require('./auth');

const app = express();
app.set('trust proxy', 1); // Railway está detrás de un proxy HTTPS

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// ---------- API ----------
const api = express.Router();
api.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  // Defensa CSRF: las peticiones que modifican datos deben traer este encabezado
  if (req.method !== 'GET' && req.get('X-Requested-With') !== 'HealthPass') {
    return res.status(403).json({ error: 'Petición no permitida' });
  }
  next();
});

api.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

api.use('/auth', require('./routes/auth'));

// Vista pública (enlace compartido): sin sesión, con límite de intentos
const publicLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
api.get('/public/emergency/:token', publicLimiter, async (req, res, next) => {
  try {
    const t = String(req.params.token || '');
    if (!/^[a-f0-9]{20,64}$/.test(t)) return res.status(404).json({ error: 'Enlace no válido o vencido' });
    const { rows } = await pool.query('SELECT fn_vista_emergencia_por_token($1) AS v', [t]);
    if (!rows[0].v) return res.status(404).json({ error: 'Enlace no válido o vencido' });
    res.json(rows[0].v);
  } catch (e) {
    next(e);
  }
});

// Todo lo siguiente requiere sesión
api.use(requireAuth);
api.use('/me', require('./routes/me'));
api.use('/medical', require('./routes/medical'));
api.use('/contacts', require('./routes/contacts'));
api.use('/', require('./routes/privacy'));

api.get('/dashboard', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT fn_resumen_dashboard($1) AS d', [req.userId]);
    res.json(rows[0].d);
  } catch (e) {
    next(e);
  }
});

api.get('/emergency', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT fn_vista_emergencia($1) AS v', [req.userId]);
    res.json(rows[0].v);
  } catch (e) {
    next(e);
  }
});

api.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use('/api', api);

// ---------- Frontend estático ----------
const FRONT = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(FRONT, { extensions: ['html'] }));

// ---------- Errores ----------
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  // Errores de la base de datos
  if (err.code === 'HP001') return res.status(400).json({ error: err.message }); // reglas de triggers/procedimientos
  if (err.code === '23505') {
    const msg = /email/.test(err.constraint || '') ? 'Ese correo ya está registrado' : 'Ese nombre de usuario ya está en uso';
    return res.status(409).json({ error: msg });
  }
  if (err.code === '23514') return res.status(400).json({ error: 'Alguno de los datos no es válido' });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
migrate()
  .then(() => app.listen(PORT, () => console.log(`HealthPass escuchando en el puerto ${PORT}`)))
  .catch((e) => {
    console.error('No se pudo iniciar:', e.message);
    process.exit(1);
  });
