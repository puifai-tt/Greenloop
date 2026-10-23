'use strict';
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set (at least 32 characters)');
}

// Verifies "Authorization: Bearer <jwt>" and then RE-READS the user from the DB,
// so a demoted role or a deactivated account takes effect immediately instead of
// staying valid until the token expires. Sets req.user = { id, role, pointId }.
module.exports = async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (_) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const [rows] = await pool.query(
      'SELECT user_id, role, is_active, point_id FROM Users WHERE user_id = ?',
      [payload.id]
    );
    const u = rows[0];
    if (!u || !u.is_active) {
      return res.status(401).json({ message: 'Account not found or inactive' });
    }

    req.user = { id: u.user_id, role: u.role, pointId: u.point_id };
    return next();
  } catch (err) {
    console.error('[auth]', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
