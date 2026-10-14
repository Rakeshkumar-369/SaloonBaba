import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  connectionLimit: 10,
  waitForConnections: true,
  dateStrings: true,
  decimalNumbers: true,
  namedPlaceholders: false,
  charset: 'utf8mb4',
});

// Keep CURDATE()/NOW() in salon local time, matching Node's TZ.
const offsetMin = -new Date().getTimezoneOffset();
const tzOffset = `${offsetMin >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0')}:${String(Math.abs(offsetMin) % 60).padStart(2, '0')}`;
pool.on('connection', (conn) => {
  conn.query(`SET time_zone = '${tzOffset}'`);
});

/** Run a query and return rows (SELECT) or the result header (INSERT/UPDATE). */
export async function q(sql, params = [], conn = pool) {
  const [rows] = await conn.query(sql, params);
  return rows;
}

/** First row or null. */
export async function one(sql, params = [], conn = pool) {
  const rows = await q(sql, params, conn);
  return rows[0] || null;
}

/** Single scalar value from the first column of the first row. */
export async function val(sql, params = [], conn = pool) {
  const row = await one(sql, params, conn);
  return row ? Object.values(row)[0] : null;
}

/** INSERT a plain object; returns insertId. */
export async function insert(table, data, conn = pool) {
  const [res] = await conn.query(`INSERT INTO \`${table}\` SET ?`, [data]);
  return res.insertId;
}

/** UPDATE by id with a plain object. */
export async function update(table, id, data, conn = pool) {
  if (!Object.keys(data).length) return;
  await conn.query(`UPDATE \`${table}\` SET ? WHERE id = ?`, [data, id]);
}

/** Run fn inside a transaction; fn receives a connection. */
export async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
