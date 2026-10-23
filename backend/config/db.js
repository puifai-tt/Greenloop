'use strict';
const mysql = require('mysql2/promise');

const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
for (const k of required) {
  if (!process.env[k]) throw new Error(`Missing env var ${k} (see .env.example)`);
}

// mysql2/promise pool. Always InnoDB tables (needed for transactions / row locks).
module.exports = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,
  charset: 'utf8mb4',
  decimalNumbers: true,   // DECIMAL columns come back as numbers, not strings
});
