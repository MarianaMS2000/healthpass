const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');

// Las fechas (DATE) se devuelven como texto "YYYY-MM-DD" (evita desfases de zona horaria)
types.setTypeParser(1082, (v) => v);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Espera a que la base esté lista y ejecuta init.sql (idempotente) en cada arranque
async function migrate() {
  const dbDir = path.join(__dirname, '..', '..', 'database');
  for (let i = 1; i <= 20; i++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (e) {
      if (i === 20) throw e;
      console.log(`Esperando a la base de datos (${i}/20)...`);
      await sleep(2000);
    }
  }
  await pool.query(fs.readFileSync(path.join(dbDir, 'init.sql'), 'utf8'));
  console.log('Base de datos lista (init.sql aplicado)');
  if (process.env.SEED_DEMO === 'true') {
    await pool.query(fs.readFileSync(path.join(dbDir, 'seed_demo.sql'), 'utf8'));
    console.log('Usuario demo disponible: carlosherrera / Demo1234!');
  }
}

// Ejecuta varias consultas como una sola transacción (todo o nada)
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, migrate, tx };
