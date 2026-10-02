const express = require('express');
const { pool } = require('../db');
const { bad } = require('../validate');

const router = express.Router();
const CLAVES = ['sangre', 'alergias', 'medicamentos', 'antecedentes', 'cirugias', 'contacto'];

async function enlaceActivo(userId) {
  const { rows } = await pool.query(
    `SELECT token, expira_en FROM enlaces_compartidos
      WHERE usuario_id=$1 AND NOT revocado AND expira_en > NOW() ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

router.get('/privacy', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM privacidad WHERE usuario_id=$1', [req.userId]);
    const out = {};
    CLAVES.forEach((k) => (out[k] = rows[0][`ver_${k}`]));
    res.json({ visibilidad: out, enlace: await enlaceActivo(req.userId) });
  } catch (e) {
    next(e);
  }
});

router.put('/privacy', async (req, res, next) => {
  try {
    const clave = req.body.clave;
    if (!CLAVES.includes(clave) || typeof req.body.visible !== 'boolean') throw bad('Datos inválidos');
    // clave validada contra lista blanca, por eso es seguro armar el nombre de columna
    await pool.query(`UPDATE privacidad SET ver_${clave}=$1 WHERE usuario_id=$2`, [req.body.visible, req.userId]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/share', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM fn_generar_enlace($1, 72)', [req.userId]);
    res.status(201).json({ token: rows[0].out_token, expira_en: rows[0].out_expira });
  } catch (e) {
    next(e);
  }
});

router.delete('/share', async (req, res, next) => {
  try {
    await pool.query('SELECT fn_revocar_enlace($1)', [req.userId]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
