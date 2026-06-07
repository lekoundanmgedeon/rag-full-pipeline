// src/config/database.js
import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
  connectionString:        process.env.DATABASE_URL,
  max:                     parseInt(process.env.DB_POOL_MAX || '20'),
  idleTimeoutMillis:       10_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => console.error('PG pool error:', err.message));

export async function checkDbConnection() {
  const client = await pool.connect();
  const { rows } = await client.query('SELECT version()');
  client.release();
  return rows[0].version;
}

export default pool;
