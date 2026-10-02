const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { userFields, password, bad } = require('../validate');

const router = express.Router();

router.put('/', async (req, res, next) => {
  try {
    const { nombre, mail, user } = userFields(req.body);
    const { rows } = await pool.query(
      `UPDATE usuarios SET nombre_completo=$1, email=$2, username=$3 WHERE id=$4
       RETURNING id, nombre_completo, email, username`,
      [nombre, mail, user, req.userId]
    );
    res.json({ user: rows[0] });
  } catch (e) {
    next(e);
  }
});

router.put('/password', async (req, res, next) => {
  try {
    const { actual, nueva } = req.body;
    const nuevaOk = password(nueva);
    const { rows } = await pool.query('SELECT password_hash FROM usuarios WHERE id=$1', [req.userId]);
    if (!rows[0] || !(await bcrypt.compare(String(actual || ''), rows[0].password_hash))) {
      throw bad('La contraseña actual es incorrecta');
    }
    await pool.query('UPDATE usuarios SET password_hash=$1 WHERE id=$2', [
      await bcrypt.hash(nuevaOk, 10),
      req.userId,
    ]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// "Eliminar mi información": procedimiento almacenado (la cuenta permanece activa)
router.delete('/data', async (req, res, next) => {
  try {
    await pool.query('CALL sp_eliminar_informacion_medica($1)', [req.userId]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
