const express = require('express');
const { pool } = require('../db');
const { clean, bad } = require('../validate');

const router = express.Router();

function fields(b) {
  const nombre = clean(b.nombre).slice(0, 120);
  const relacion = clean(b.relacion).slice(0, 60);
  const telefono = clean(b.telefono).slice(0, 30);
  if (!nombre || !relacion || !telefono) throw bad('Nombre, relación y teléfono son obligatorios');
  if (!/^[0-9+()\s-]{7,30}$/.test(telefono)) throw bad('Teléfono inválido (solo números, +, espacios, guiones y paréntesis)');
  return [nombre, relacion, telefono];
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, relacion, telefono, es_principal FROM contactos_emergencia WHERE usuario_id=$1 ORDER BY es_principal DESC, id',
      [req.userId]
    );
    res.json({ contactos: rows });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'INSERT INTO contactos_emergencia (usuario_id, nombre, relacion, telefono, es_principal) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [req.userId, ...fields(req.body), req.body.es_principal === true]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw bad('Id inválido');
    const { rowCount } = await pool.query(
      'UPDATE contactos_emergencia SET nombre=$1, relacion=$2, telefono=$3, es_principal=$6 WHERE id=$4 AND usuario_id=$5',
      [...fields(req.body), id, req.userId, req.body.es_principal === true]
    );
    if (!rowCount) return res.status(404).json({ error: 'Contacto no encontrado' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw bad('Id inválido');
    await pool.query('DELETE FROM contactos_emergencia WHERE id=$1 AND usuario_id=$2', [id, req.userId]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
