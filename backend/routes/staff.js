'use strict';
const express = require('express');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { HttpError, toPositiveInt, handleError, withTransaction } = require('../lib/common');
const { listTransactions } = require('../lib/transactions');
const { listRedemptions } = require('../lib/redemptions');

const router = express.Router();
router.use(authMiddleware, requireRole('staff'));

const MAX_KG = 500;
const MAX_ITEMS = 5;

// weight must be a positive number <= 500 with at most 2 decimals. Returns the weight in
// hundredths of a kg ("cs"), so all later maths is exact integer arithmetic.
function toHundredths(v) {
  if (typeof v === 'string' && !/^\d+(\.\d{1,2})?$/.test(v.trim())) return null;
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_KG) return null;
  const cs = Math.round(n * 100);
  return Math.abs(n * 100 - cs) < 1e-6 ? cs : null; // rejects 1.005 etc.
}

const MEMBER_SQL = `
  SELECT u.user_id, u.fname, u.mname, u.lname, u.email, u.is_active, u.green_points,
         u.total_co2_saved, u.point_id, dp.name AS point_name
    FROM Users u
    LEFT JOIN DropOffPoints dp ON dp.point_id = u.point_id
   WHERE u.role = 'user'`;
const shapeMember = (m) => ({ ...m, is_active: Boolean(m.is_active) });

// GET /api/staff/members — members for the "choose a member" list (capped)
router.get('/members', async (_req, res) => {
  try {
    const [rows] = await pool.query(`${MEMBER_SQL} ORDER BY u.user_id ASC LIMIT 1000`);
    return res.status(200).json({ data: rows.map(shapeMember) });
  } catch (err) {
    return handleError(res, err, 'GET /staff/members');
  }
});

// GET /api/staff/members/:id — look one member up by id (used when the list is capped)
router.get('/members/:id', async (req, res) => {
  try {
    const id = toPositiveInt(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid user id' });
    const [rows] = await pool.query(`${MEMBER_SQL} AND u.user_id = ?`, [id]);
    if (!rows[0]) return res.status(404).json({ message: 'User not found' });
    return res.status(200).json({ data: shapeMember(rows[0]) });
  } catch (err) {
    return handleError(res, err, 'GET /staff/members/:id');
  }
});

// GET /api/staff/transactions — transactions recorded at THIS staff member's branch
router.get('/transactions', async (req, res) => {
  try {
    if (!req.user.pointId) return res.status(200).json({ data: [] });
    const data = await listTransactions(pool, { pointId: req.user.pointId, limit: 500 });
    return res.status(200).json({ data });
  } catch (err) {
    return handleError(res, err, 'GET /staff/transactions');
  }
});

// GET /api/staff/redemptions — reward pickup queue (rewards can be collected at any branch)
router.get('/redemptions', async (_req, res) => {
  try {
    return res.status(200).json({ data: await listRedemptions(pool, { limit: 500 }) });
  } catch (err) {
    return handleError(res, err, 'GET /staff/redemptions');
  }
});

// ---------------------------------------------------------------
// POST /api/staff/transactions  { user_id, items: [{ type_id, weight_kg }, ...] }
//   Points and CO2 are computed HERE from the DB rates — the client never supplies them.
//   All-or-nothing: transaction row + items + member balance update commit together.
// ---------------------------------------------------------------
router.post('/transactions', async (req, res) => {
  const body = req.body || {};
  const memberId = toPositiveInt(body.user_id);
  if (!memberId) return res.status(400).json({ message: 'user_id is required and must be a positive integer' });

  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > MAX_ITEMS) {
    return res.status(400).json({ message: `items must contain 1 to ${MAX_ITEMS} materials` });
  }
  const lines = [];
  for (const it of body.items) {
    const typeId = toPositiveInt(it && it.type_id);
    const cs = toHundredths(it && it.weight_kg);
    if (!typeId) return res.status(400).json({ message: 'Each item needs a valid type_id' });
    if (!cs) {
      return res.status(400).json({ message: `Each weight must be greater than 0, at most ${MAX_KG} kg, with up to 2 decimals` });
    }
    lines.push({ typeId, cs });
  }
  if (new Set(lines.map((l) => l.typeId)).size !== lines.length) {
    return res.status(400).json({ message: 'Each material type can only appear once per transaction' });
  }
  const pointId = req.user.pointId;
  if (!pointId) {
    return res.status(409).json({ message: 'Your staff account is not assigned to a drop-off point' });
  }

  try {
    const newId = await withTransaction(async (conn) => {
      // Lock the member first so two staff members crediting the same person can't interleave.
      const [mRows] = await conn.query(
        'SELECT user_id, role, is_active FROM Users WHERE user_id = ? FOR UPDATE', [memberId]
      );
      const member = mRows[0];
      if (!member || member.role !== 'user') throw new HttpError(404, 'Member not found');
      if (!member.is_active) throw new HttpError(409, 'Member account is inactive');

      const [pRows] = await conn.query('SELECT is_active FROM DropOffPoints WHERE point_id = ?', [pointId]);
      if (!pRows[0] || !pRows[0].is_active) throw new HttpError(409, 'Your drop-off point is currently closed');

      const [types] = await conn.query(
        `SELECT rt.type_id, rt.name, rt.points_per_kg, rt.co2_factor_kg, rt.is_active,
                (bat.type_id IS NOT NULL) AS accepted
           FROM RecycleTypes rt
           LEFT JOIN BranchAcceptedTypes bat ON bat.type_id = rt.type_id AND bat.point_id = ?
          WHERE rt.type_id IN (?)`,
        [pointId, lines.map((l) => l.typeId)]
      );
      const typeById = new Map(types.map((t) => [t.type_id, t]));

      let totalPoints = 0;
      let totalCo2Hundredths = 0;
      const priced = lines.map((l) => {
        const t = typeById.get(l.typeId);
        if (!t || !t.is_active) throw new HttpError(400, 'Unknown or inactive material type');
        if (!t.accepted) throw new HttpError(409, `${t.name} is not accepted at this drop-off point`);
        // integer maths: weight (1/100 kg) * rate (1/100 pt per kg); round half up
        const points = Math.floor((l.cs * Math.round(t.points_per_kg * 100) + 5000) / 10000);
        const co2h = Math.floor((l.cs * Math.round(t.co2_factor_kg * 100) + 50) / 100); // hundredths of a kg
        totalPoints += points;
        totalCo2Hundredths += co2h;
        return { ...l, points, co2h };
      });

      const [ins] = await conn.query(
        'INSERT INTO Transactions (user_id, point_id, staff_id, trans_date) VALUES (?, ?, ?, NOW())',
        [memberId, pointId, req.user.id]
      );
      for (const p of priced) {
        await conn.query(
          `INSERT INTO TransactionsItems (transaction_id, type_id, weight_kg, co2_saved, points_earned)
           VALUES (?, ?, ?, ?, ?)`,
          [ins.insertId, p.typeId, p.cs / 100, p.co2h / 100, p.points]
        );
      }
      await conn.query(
        'UPDATE Users SET green_points = green_points + ?, total_co2_saved = total_co2_saved + ? WHERE user_id = ?',
        [totalPoints, totalCo2Hundredths / 100, memberId]
      );
      return ins.insertId;
    });

    const [transaction] = await listTransactions(pool, { transactionId: newId, limit: 1 });
    const [[balance]] = await pool.query(
      'SELECT user_id, green_points, total_co2_saved FROM Users WHERE user_id = ?', [memberId]
    );
    return res.status(201).json({ message: 'Transaction recorded', data: { transaction, member: balance } });
  } catch (err) {
    return handleError(res, err, 'POST /staff/transactions');
  }
});

module.exports = router;
