'use strict';
const express = require('express');
const pool = require('../config/db'); // mysql2/promise pool
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { HttpError, toPositiveInt, handleError, withTransaction } = require('../lib/common');
const { cancelPendingRedemption, listRedemptions } = require('../lib/redemptions');
const { listTransactions } = require('../lib/transactions');
const { listDropOffPoints } = require('./catalog');

const router = express.Router();

// Every endpoint in this file requires a logged-in ADMIN (checked against the DB on each request)
router.use(authMiddleware, requireRole('admin'));

const INT_MAX = 2147483647; // MySQL INT

const isIntInRange = (v, min) => Number.isInteger(v) && v >= min && v <= INT_MAX;
// Only http(s) URLs or site-relative paths: blocks javascript:/data: URLs that could become XSS in <img>/<a>
// Optional free-text reward fields -> [column, max length]. Empty string is stored as NULL.
const REWARD_TEXT_FIELDS = [['category', 50], ['emoji', 16], ['sku', 40], ['supplier', 100], ['storage_location', 100]];
function readRewardTextFields(body, { partial }) {
  const cols = [];
  const vals = [];
  for (const [col, max] of REWARD_TEXT_FIELDS) {
    const v = body[col];
    if (v === undefined) continue;          // PUT: untouched.  POST: simply not provided.
    if (v !== null && typeof v !== 'string') return { error: `${col} must be a string or null` };
    const t = v === null ? null : v.trim();
    if (t !== null && t.length > max) return { error: `${col} must be at most ${max} characters` };
    cols.push(col);
    vals.push(t === '' ? null : t);
  }
  if (body.low_stock !== undefined) {
    if (!isIntInRange(body.low_stock, 0)) return { error: 'low_stock must be an integer >= 0' };
    cols.push('low_stock');
    vals.push(body.low_stock);
  }
  return { cols, vals };
}
const isSafeImageUrl = (v) =>
  typeof v === 'string' && v.length <= 255 && (/^https?:\/\/\S+$/i.test(v) || /^\/(?!\/)\S*$/.test(v));

// ---------------------------------------------------------------
// GET /api/admin/stats
// ---------------------------------------------------------------
router.get('/stats', async (req, res) => {
  try {
    const [[totals]] = await pool.query(
      `SELECT COALESCE(SUM(weight_kg), 0) AS total_weight_kg,
              COALESCE(SUM(co2_saved), 0) AS total_co2_saved
         FROM TransactionsItems`
    );
    const [[points]] = await pool.query(
      `SELECT COALESCE(SUM(green_points), 0) AS total_remaining_points
         FROM Users WHERE role = 'user'`
    );
    const [[redemptions]] = await pool.query(
      `SELECT COALESCE(SUM(status = 'pending'), 0) AS pending_redemptions,
              COALESCE(SUM(status = 'pending' AND expires_at IS NOT NULL AND expires_at < NOW()), 0) AS overdue_redemptions
         FROM RewardRedemptions`
    );
    return res.status(200).json({
      data: {
        total_weight_kg: Number(totals.total_weight_kg),
        total_co2_saved: Number(totals.total_co2_saved),
        total_remaining_points: Number(points.total_remaining_points),
        pending_redemptions: Number(redemptions.pending_redemptions),
        overdue_redemptions: Number(redemptions.overdue_redemptions),
      },
    });
  } catch (err) {
    return handleError(res, err, 'GET /admin/stats');
  }
});

// ---------------------------------------------------------------
// GET /api/admin/rewards — ALL rewards incl. inactive (GET /api/rewards hides inactive ones,
// so without this an admin could never find a reward again after deactivating it)
// ---------------------------------------------------------------
router.get('/rewards', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT reward_id, name, description, image_url, points_required, stock, is_active
         FROM RewardItems
        ORDER BY is_active DESC, reward_id DESC`
    );
    return res.status(200).json({ data: rows.map((r) => ({ ...r, is_active: Boolean(r.is_active) })) });
  } catch (err) {
    return handleError(res, err, 'GET /admin/rewards');
  }
});

// ---------------------------------------------------------------
// POST /api/admin/rewards
// ---------------------------------------------------------------
router.post('/rewards', async (req, res) => {
  try {
    const { name, points_required, stock, image_url, description } = req.body || {};

    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
      return res.status(400).json({ message: 'name is required (max 100 chars)' });
    }
    if (!isIntInRange(points_required, 1)) {
      return res.status(400).json({ message: 'points_required must be a positive integer' });
    }
    if (!isIntInRange(stock, 0)) {
      return res.status(400).json({ message: 'stock must be an integer >= 0' });
    }
    if (image_url != null && !isSafeImageUrl(image_url)) {
      return res.status(400).json({ message: 'image_url must be an http(s) URL or a /relative path (max 255 chars)' });
    }
    if (description != null && (typeof description !== 'string' || description.length > 5000)) {
      return res.status(400).json({ message: 'description must be a string (max 5000 chars)' });
    }

    const extra = readRewardTextFields(req.body || {}, { partial: false });
    if (extra.error) return res.status(400).json({ message: extra.error });

    const [result] = await pool.query(
      `INSERT INTO RewardItems (name, description, image_url, points_required, stock, is_active${extra.cols.map((c) => `, ${c}`).join('')})
       VALUES (?, ?, ?, ?, ?, TRUE${extra.cols.map(() => ', ?').join('')})`,
      [name.trim(), description ?? null, image_url ?? null, points_required, stock, ...extra.vals]
    );
    if (!extra.cols.includes('sku') || extra.vals[extra.cols.indexOf('sku')] === null) {
      // "Auto-generated if blank" in the UI. Ignore the (very unlikely) clash with a hand-typed SKU.
      try {
        await pool.query('UPDATE RewardItems SET sku = ? WHERE reward_id = ?',
          [`GL-RW-${String(result.insertId).padStart(3, '0')}`, result.insertId]);
      } catch (e) { if (e.code !== 'ER_DUP_ENTRY') throw e; }
    }
    const [rows] = await pool.query('SELECT * FROM RewardItems WHERE reward_id = ?', [result.insertId]);
    return res.status(201).json({ message: 'Reward created', data: { ...rows[0], is_active: Boolean(rows[0].is_active) } });
  } catch (err) {
    return handleError(res, err, 'POST /admin/rewards');
  }
});

// ---------------------------------------------------------------
// PUT /api/admin/rewards/:id — partial update (only the provided fields change)
//   Column names below are fixed literals (never user input); every value is bound with "?".
//   Past redemptions keep their own points_used snapshot, so changing the price is safe.
// ---------------------------------------------------------------
router.put('/rewards/:id', async (req, res) => {
  try {
    const id = toPositiveInt(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid reward id' });

    const body = req.body || {};
    const sets = [];
    const params = [];

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) {
        return res.status(400).json({ message: 'name must be a non-empty string (max 100 chars)' });
      }
      sets.push('name = ?'); params.push(body.name.trim());
    }
    if (body.points_required !== undefined) {
      if (!isIntInRange(body.points_required, 1)) {
        return res.status(400).json({ message: 'points_required must be a positive integer' });
      }
      sets.push('points_required = ?'); params.push(body.points_required);
    }
    if (body.stock !== undefined && body.stock_delta !== undefined) {
      return res.status(400).json({ message: 'Send either stock or stock_delta, not both' });
    }
    if (body.stock !== undefined) {
      if (!isIntInRange(body.stock, 0)) {
        return res.status(400).json({ message: 'stock must be an integer >= 0' });
      }
      sets.push('stock = ?'); params.push(body.stock);
    }
    // Relative change, applied atomically in SQL — safe even if someone redeems at the same moment.
    if (body.stock_delta !== undefined) {
      if (!Number.isInteger(body.stock_delta) || Math.abs(body.stock_delta) > 1000000) {
        return res.status(400).json({ message: 'stock_delta must be an integer between -1000000 and 1000000' });
      }
      sets.push('stock = GREATEST(0, stock + ?)'); params.push(body.stock_delta);
    }
    const extra = readRewardTextFields(body, { partial: true });
    if (extra.error) return res.status(400).json({ message: extra.error });
    extra.cols.forEach((c, i) => { sets.push(`${c} = ?`); params.push(extra.vals[i]); });
    if (body.is_active !== undefined) {
      if (typeof body.is_active !== 'boolean') {
        return res.status(400).json({ message: 'is_active must be a boolean' });
      }
      sets.push('is_active = ?'); params.push(body.is_active);
    }
    if (body.image_url !== undefined) {
      if (body.image_url !== null && !isSafeImageUrl(body.image_url)) {
        return res.status(400).json({ message: 'image_url must be an http(s) URL, a /relative path, or null' });
      }
      sets.push('image_url = ?'); params.push(body.image_url);
    }
    if (body.description !== undefined) {
      if (body.description !== null && (typeof body.description !== 'string' || body.description.length > 5000)) {
        return res.status(400).json({ message: 'description must be a string (max 5000 chars) or null' });
      }
      sets.push('description = ?'); params.push(body.description);
    }

    if (sets.length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    // Single UPDATE; affectedRows tells us if the row exists (changedRows can be 0 on a no-op edit,
    // so use a follow-up SELECT for the 404 check instead of trusting affectedRows alone).
    await pool.query(`UPDATE RewardItems SET ${sets.join(', ')} WHERE reward_id = ?`, [...params, id]);
    const [rows] = await pool.query('SELECT * FROM RewardItems WHERE reward_id = ?', [id]);
    if (!rows[0]) return res.status(404).json({ message: 'Reward not found' });
    return res.status(200).json({ message: 'Reward updated', data: { ...rows[0], is_active: Boolean(rows[0].is_active) } });
  } catch (err) {
    return handleError(res, err, 'PUT /admin/rewards/:id');
  }
});

// ---------------------------------------------------------------
// POST /api/admin/redemptions/expire-overdue
//   Cancels every pending redemption whose pickup deadline has passed, refunding points and
//   returning stock. Each redemption is its own transaction, so one failure never blocks the rest.
//   Call it from the admin dashboard, or from a cron job / scheduler.
// ---------------------------------------------------------------
router.post('/redemptions/expire-overdue', async (req, res) => {
  try {
    const [overdue] = await pool.query(
      `SELECT redemption_id FROM RewardRedemptions
        WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < NOW()
        ORDER BY redemption_id ASC
        LIMIT 500`
    );

    let cancelled = 0;
    let refundedPoints = 0;
    let skipped = 0;
    for (const { redemption_id } of overdue) {
      try {
        const r = await withTransaction((conn) =>
          cancelPendingRedemption(conn, redemption_id, { actorId: req.user.id, onlyIfExpired: true })
        );
        cancelled += 1;
        refundedPoints += r.refunded_points;
      } catch (e) {
        if (e && e.status) { skipped += 1; continue; } // changed by someone else meanwhile (HttpError)
        throw e;
      }
    }
    return res.status(200).json({
      message: 'Overdue redemptions processed',
      data: { cancelled, skipped, refunded_points: refundedPoints },
    });
  } catch (err) {
    return handleError(res, err, 'POST /admin/redemptions/expire-overdue');
  }
});

// ---------------------------------------------------------------
// DELETE /api/admin/rewards/:id — only possible while nothing references the reward.
//   Rewards with redemption history must be deactivated instead (history keeps its meaning).
// ---------------------------------------------------------------
router.delete('/rewards/:id', async (req, res) => {
  try {
    const id = toPositiveInt(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid reward id' });
    const [del] = await pool.query('DELETE FROM RewardItems WHERE reward_id = ?', [id]);
    if (del.affectedRows === 0) return res.status(404).json({ message: 'Reward not found' });
    return res.status(200).json({ message: 'Reward deleted' });
  } catch (err) {
    if (err && err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ message: 'This reward has redemption history, so it can’t be deleted. Deactivate it instead.' });
    }
    return handleError(res, err, 'DELETE /admin/rewards/:id');
  }
});

// ---------------------------------------------------------------
// Lists for the admin screens
// ---------------------------------------------------------------
const USER_LIST_SQL = `
  SELECT u.user_id, u.fname, u.mname, u.lname, u.email, u.role, u.is_active, u.green_points,
         u.total_co2_saved, u.created_at, u.point_id, dp.name AS point_name
    FROM Users u
    LEFT JOIN DropOffPoints dp ON dp.point_id = u.point_id
   WHERE u.role = ?
   ORDER BY u.user_id ASC
   LIMIT 2000`;

router.get('/members', async (_req, res) => {
  try {
    const [rows] = await pool.query(USER_LIST_SQL, ['user']);
    return res.status(200).json({ data: rows.map((u) => ({ ...u, is_active: Boolean(u.is_active) })) });
  } catch (err) {
    return handleError(res, err, 'GET /admin/members');
  }
});

router.get('/staff', async (_req, res) => {
  try {
    const [rows] = await pool.query(USER_LIST_SQL, ['staff']);
    return res.status(200).json({ data: rows.map((u) => ({ ...u, is_active: Boolean(u.is_active) })) });
  } catch (err) {
    return handleError(res, err, 'GET /admin/staff');
  }
});

router.get('/transactions', async (_req, res) => {
  try {
    return res.status(200).json({ data: await listTransactions(pool, { limit: 1000 }) });
  } catch (err) {
    return handleError(res, err, 'GET /admin/transactions');
  }
});

router.get('/redemptions', async (_req, res) => {
  try {
    return res.status(200).json({ data: await listRedemptions(pool, { limit: 1000 }) });
  } catch (err) {
    return handleError(res, err, 'GET /admin/redemptions');
  }
});

// ---------------------------------------------------------------
// POST /api/admin/drop-off-points  { name, address, hours?, phone?, notes?, accepted_type_ids? }
// ---------------------------------------------------------------
router.post('/drop-off-points', async (req, res) => {
  try {
    const b = req.body || {};
    const optText = (v, max) => v == null || v === '' ? null : (typeof v === 'string' && v.trim().length <= max ? v.trim() : false);

    if (typeof b.name !== 'string' || !b.name.trim() || b.name.trim().length > 100) {
      return res.status(400).json({ message: 'name is required (max 100 chars)' });
    }
    if (typeof b.address !== 'string' || !b.address.trim() || b.address.trim().length > 100) {
      return res.status(400).json({ message: 'address is required (max 100 chars)' });
    }
    const hours = optText(b.hours, 50), phone = optText(b.phone, 30), notes = optText(b.notes, 255);
    if (hours === false || phone === false || notes === false) {
      return res.status(400).json({ message: 'hours (50), phone (30) and notes (255) must be short strings' });
    }
    const typeIds = b.accepted_type_ids === undefined ? [] : b.accepted_type_ids;
    if (!Array.isArray(typeIds) || typeIds.length > 50 || !typeIds.every((t) => Number.isInteger(t) && t > 0) ||
        new Set(typeIds).size !== typeIds.length) {
      return res.status(400).json({ message: 'accepted_type_ids must be an array of unique positive integers' });
    }

    const newId = await withTransaction(async (conn) => {
      if (typeIds.length) {
        const [found] = await conn.query('SELECT type_id FROM RecycleTypes WHERE type_id IN (?)', [typeIds]);
        if (found.length !== typeIds.length) throw new HttpError(400, 'One or more accepted types do not exist');
      }
      const [ins] = await conn.query(
        `INSERT INTO DropOffPoints (name, street, hours, phone, notes, is_active)
         VALUES (?, ?, ?, ?, ?, TRUE)`,
        [b.name.trim(), b.address.trim(), hours, phone, notes]
      );
      if (typeIds.length) {
        await conn.query('INSERT INTO BranchAcceptedTypes (point_id, type_id) VALUES ?', [typeIds.map((t) => [ins.insertId, t])]);
      }
      return ins.insertId;
    });

    const created = (await listDropOffPoints()).find((p) => p.point_id === newId);
    return res.status(201).json({ message: 'Drop-off point created', data: created });
  } catch (err) {
    return handleError(res, err, 'POST /admin/drop-off-points');
  }
});

// ---------------------------------------------------------------
// PUT /api/admin/recycle-types/:id  { points_per_kg?, co2_factor_kg? }
//   Past transactions keep the points/CO2 they were recorded with (stored per line item).
// ---------------------------------------------------------------
router.put('/recycle-types/:id', async (req, res) => {
  try {
    const id = toPositiveInt(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid type id' });
    const body = req.body || {};
    const rate = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 9999.99 &&
      Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

    const sets = [], params = [];
    if (body.points_per_kg !== undefined) {
      if (!rate(body.points_per_kg)) return res.status(400).json({ message: 'points_per_kg must be a number from 0 to 9999.99 (2 decimals max)' });
      sets.push('points_per_kg = ?'); params.push(body.points_per_kg);
    }
    if (body.co2_factor_kg !== undefined) {
      if (!rate(body.co2_factor_kg)) return res.status(400).json({ message: 'co2_factor_kg must be a number from 0 to 9999.99 (2 decimals max)' });
      sets.push('co2_factor_kg = ?'); params.push(body.co2_factor_kg);
    }
    if (sets.length === 0) return res.status(400).json({ message: 'No valid fields to update' });

    await pool.query(`UPDATE RecycleTypes SET ${sets.join(', ')} WHERE type_id = ?`, [...params, id]);
    const [rows] = await pool.query(
      'SELECT type_id, name, points_per_kg, co2_factor_kg, emoji, color, note, is_active FROM RecycleTypes WHERE type_id = ?', [id]);
    if (!rows[0]) return res.status(404).json({ message: 'Recycle type not found' });
    return res.status(200).json({ message: 'Recycle type updated', data: { ...rows[0], is_active: Boolean(rows[0].is_active) } });
  } catch (err) {
    return handleError(res, err, 'PUT /admin/recycle-types/:id');
  }
});

// ---------------------------------------------------------------
// PATCH /api/admin/drop-off-points/:id/toggle
// ---------------------------------------------------------------
router.patch('/drop-off-points/:id/toggle', async (req, res) => {
  try {
    const id = toPositiveInt(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid point id' });

    const [upd] = await pool.query(
      'UPDATE DropOffPoints SET is_active = NOT is_active WHERE point_id = ?',
      [id]
    );
    if (upd.affectedRows === 0) return res.status(404).json({ message: 'Drop-off point not found' });

    const [rows] = await pool.query(
      'SELECT point_id, name, is_active FROM DropOffPoints WHERE point_id = ?',
      [id]
    );
    return res.status(200).json({
      message: 'Drop-off point toggled',
      data: { ...rows[0], is_active: Boolean(rows[0].is_active) },
    });
  } catch (err) {
    return handleError(res, err, 'PATCH /admin/drop-off-points/:id/toggle');
  }
});

// ---------------------------------------------------------------
// GET /api/admin/users/:id — profile + points + recycling history + redemption history
//   ?limit=50 (max 200) caps the number of rows in each history list
// ---------------------------------------------------------------
router.get('/users/:id', async (req, res) => {
  try {
    const id = toPositiveInt(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid user id' });

    const limit = Math.min(toPositiveInt(req.query.limit) || 50, 200);

    // password_hash is intentionally never selected
    const [users] = await pool.query(
      `SELECT u.user_id, u.fname, u.mname, u.lname, u.email, u.role, u.point_id,
              dp.name AS point_name, u.green_points, u.total_co2_saved, u.is_active
         FROM Users u
         LEFT JOIN DropOffPoints dp ON dp.point_id = u.point_id
        WHERE u.user_id = ?`,
      [id]
    );
    if (!users[0]) return res.status(404).json({ message: 'User not found' });
    const profile = { ...users[0], is_active: Boolean(users[0].is_active) };

    const [transactions] = await pool.query(
      `SELECT t.transaction_id, t.point_id, dp.name AS point_name, t.staff_id, t.trans_date
         FROM Transactions t
         JOIN DropOffPoints dp ON dp.point_id = t.point_id
        WHERE t.user_id = ?
        ORDER BY t.trans_date DESC, t.transaction_id DESC
        LIMIT ?`,
      [id, limit]
    );

    if (transactions.length > 0) {
      // mysql2 query() expands an array for "IN (?)" into a comma list of bound values
      const [items] = await pool.query(
        `SELECT ti.transaction_id, ti.item_id, ti.type_id, rt.name AS type_name,
                ti.weight_kg, ti.co2_saved, ti.points_earned
           FROM TransactionsItems ti
           JOIN RecycleTypes rt ON rt.type_id = ti.type_id
          WHERE ti.transaction_id IN (?)
          ORDER BY ti.item_id ASC`,
        [transactions.map((t) => t.transaction_id)]
      );
      const byTx = new Map();
      for (const it of items) {
        if (!byTx.has(it.transaction_id)) byTx.set(it.transaction_id, []);
        byTx.get(it.transaction_id).push(it);
      }
      for (const t of transactions) t.items = byTx.get(t.transaction_id) || [];
    }

    const [redemptions] = await pool.query(
      `SELECT rr.redemption_id, rr.redeem_code, rr.reward_id, ri.name AS reward_name,
              rr.points_used, rr.status, rr.staff_id, rr.redemption_at,
              rr.expires_at, rr.handed_over_at
         FROM RewardRedemptions rr
         JOIN RewardItems ri ON ri.reward_id = rr.reward_id
        WHERE rr.user_id = ?
        ORDER BY rr.redemption_at DESC, rr.redemption_id DESC
        LIMIT ?`,
      [id, limit]
    );

    return res.status(200).json({ data: { profile, transactions, redemptions } });
  } catch (err) {
    return handleError(res, err, 'GET /admin/users/:id');
  }
});

module.exports = router;
