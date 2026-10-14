// Drops and recreates the database, applies schema.sql, then loads demo data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const { database, ...conn } = config.db;

const c = await mysql.createConnection({ ...conn, multipleStatements: true });
console.log(`Resetting database "${database}" on ${conn.host}:${conn.port} ...`);
await c.query(`DROP DATABASE IF EXISTS \`${database}\``);
await c.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await c.query(`USE \`${database}\``);
await c.query(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
await c.end();
console.log('Schema created.');

if (!process.argv.includes('--no-seed')) {
  const { seed } = await import('./seed.js');
  await seed();
}
process.exit(0);
