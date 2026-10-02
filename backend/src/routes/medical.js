const express = require('express');
const { pool, tx } = require('../db');
const { clean, bad, parseDate } = require('../validate');

const router = express.Router();
const CATEGORIAS = { alergias: 'alergia', antecedentes: 'antecedente', medicamentos: 'medicamento', cirugias: 'cirugia' };
const TIPOS_SANGRE = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

router.get('/', async (req, res, next) => {
  try {
    const [perfil, items] = await Promise.all([
      pool.query('SELECT * FROM v_perfil_completo WHERE usuario_id = $1', [req.userId]),
      pool.query('SELECT id, categoria, descripcion FROM items_medicos WHERE usuario_id = $1 ORDER BY id', [req.userId]),
    ]);
    const out = { perfil: perfil.rows[0] };
    for (const [plural, singular] of Object.entries(CATEGORIAS)) {
      out[plural] = items.rows.filter((i) => i.categoria === singular).map(({ id, descripcion }) => ({ id, descripcion }));
    }
    res.json(out);
  } catch (e) {
    next(e);
  }
});

router.put('/personal', async (req, res, next) => {
  try {
    const nombre = clean(req.body.nombre_completo);
    if (nombre.length < 2 || nombre.length > 120) throw bad('Escribe tu nombre completo');
    const fecha = parseDate(req.body.fecha_nacimiento);
    const info = clean(req.body.info_basica).slice(0, 1000);
    await tx(async (db) => {
      await db.query('UPDATE usuarios SET nombre_completo=$1 WHERE id=$2', [nombre, req.userId]);
      await db.query('UPDATE perfiles_medicos SET fecha_nacimiento=$1, info_basica=$2 WHERE usuario_id=$3', [fecha, info, req.userId]);
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.put('/blood', async (req, res, next) => {
  try {
    const t = req.body.tipo_sangre;
    if (!TIPOS_SANGRE.includes(t)) throw bad('Tipo de sangre inválido');
    await pool.query('UPDATE perfiles_medicos SET tipo_sangre=$1 WHERE usuario_id=$2', [t, req.userId]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.put('/insurance', async (req, res, next) => {
  try {
    const f = (v, n) => clean(v).slice(0, n);
    await pool.query(
      'UPDATE perfiles_medicos SET aseguradora=$1, tipo_afiliacion=$2, numero_afiliacion=$3 WHERE usuario_id=$4',
      [f(req.body.aseguradora, 100), f(req.body.tipo_afiliacion, 60), f(req.body.numero_afiliacion, 60), req.userId]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Reemplaza una lista completa mediante el procedimiento sp_reemplazar_items
router.put('/items/:categoria', async (req, res, next) => {
  try {
    const cat = CATEGORIAS[req.params.categoria];
    if (!cat) throw bad('Categoría inválida');
    if (!Array.isArray(req.body.items)) throw bad('Formato inválido');
    const items = req.body.items.map((x) => clean(String(x)).slice(0, 255)).filter(Boolean);
    await pool.query('CALL sp_reemplazar_items($1, $2, $3)', [req.userId, cat, items]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/items/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw bad('Id inválido');
    await pool.query('DELETE FROM items_medicos WHERE id=$1 AND usuario_id=$2', [id, req.userId]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
