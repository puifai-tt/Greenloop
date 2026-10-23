'use strict';
const pool = require('../config/db');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function toPositiveInt(v) {
  if (typeof v === 'string' && !/^\d+$/.test(v)) return null; // reject "1e3", "12abc", " 5"
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function handleError(res, err, label) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message });
  }
  // Last-line DB safeguards (CHECK constraints) -> client-friendly answers
  if (err && err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    return res.status(409).json({ message: 'Operation conflicts with a data constraint (points/stock)' });
  }
  if (err && err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'A record with that value already exists' });
  }
  console.error(`[${label}]`, err);
  return res.status(500).json({ message: 'Internal server error' });
}

// Runs fn(conn) inside a transaction; commits on success, rolls back + rethrows on any error.
// getConnection() is inside the try so a pool failure is also handled by the caller's catch.
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { HttpError, toPositiveInt, handleError, withTransaction };
