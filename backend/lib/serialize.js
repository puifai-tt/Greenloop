'use strict';
const pool = require('../config/db');

// The columns every "who is this user" response needs. password_hash is NEVER selected.
const PROFILE_SQL = `
  SELECT u.user_id, u.fname, u.mname, u.lname, u.email, u.role, u.point_id,
         dp.name AS point_name, u.green_points, u.total_co2_saved, u.is_active, u.created_at
    FROM Users u
    LEFT JOIN DropOffPoints dp ON dp.point_id = u.point_id`;

function shapeProfile(u) {
  return { ...u, is_active: Boolean(u.is_active) };
}

async function loadProfile(userId, db = pool) {
  const [rows] = await db.query(`${PROFILE_SQL} WHERE u.user_id = ?`, [userId]);
  return rows[0] ? shapeProfile(rows[0]) : null;
}

module.exports = { PROFILE_SQL, shapeProfile, loadProfile };
