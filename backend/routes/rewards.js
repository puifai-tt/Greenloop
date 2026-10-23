'use strict';
const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db'); // mysql2/promise pool
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { HttpError, toPositiveInt, handleError, withTransaction } = require('../lib/common');
const { cancelPendingRedemption } = require('../lib/redemptions');

const router = express.Router();

// How long a member has to collect a reward. The UI promises "within one month", so default 30.
const REDEEM_EXPIRE_DAYS = Number(process.env.REDEEM_EXPIRE_DAYS) > 0 ? Number(process.env.REDEEM_EXPIRE_DAYS) : 30;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars, no look-alikes (0/O, 1/I)
const STATUSES = ['pending', 'completed', 'cancelled'];

function generateRedeemCode() {
  const bytes = crypto.randomBytes(6);
  let code = '';
  // 256 % 32 === 0, so this mapping has no modulo bias
  for (let i = 0; i < 6; i++) code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return `RD-${code}`;
}

// ---------------------------------------------------------------
// GET /api/rewards — list active rewards
// ---------------------------------------------------------------
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT reward_id, name, description, image_url, category, emoji, points_required, stock,
              (stock > 0) AS in_stock
         FROM RewardItems
        WHERE is_active = TRUE
        ORDER BY points_required ASC, reward_id ASC`
    );
    return res.status(200).json({
      data: rows.map((r) => ({ ...r, in_stock: Boolean(r.in_stock) })),
    });
  } catch (err) {
    return handleError(res, err, 'GET /rewards');
  }
});

// ---------------------------------------------------------------
// POST /api/rewards/redeem — all-or-nothing DB transaction
//   1) lock reward row  2) check active + stock  3) deduct points (atomic, never < 0)
//   4) decrement stock  5) insert redemption (status 'pending', redeem_code)
// ---------------------------------------------------------------
router.post('/redeem', authMiddleware, requireRole('user'), async (req, res) => {
  const rewardId = toPositiveInt(req.body && req.body.reward_id);
  if (!rewardId) {
    return res.status(400).json({ message: 'reward_id is required and must be a positive integer' });
  }
  const userId = req.user.id;

  try {
    const data = await withTransaction(async (conn) => {
      // Fixed lock order (reward -> user) prevents deadlocks between concurrent redemptions.
      const [rewardRows] = await conn.query(
        `SELECT reward_id, name, points_required, stock, is_active
           FROM RewardItems WHERE reward_id = ? FOR UPDATE`,
        [rewardId]
      );
      const reward = rewardRows[0];
      if (!reward || !reward.is_active) throw new HttpError(404, 'Reward not found or inactive');
      if (reward.stock <= 0) throw new HttpError(409, 'Reward is out of stock');

      // Deduct points atomically: "green_points >= cost" keeps balances non-negative under races.
      const [pointRes] = await conn.query(
        `UPDATE Users
            SET green_points = green_points - ?
          WHERE user_id = ? AND is_active = TRUE AND green_points >= ?`,
        [reward.points_required, userId, reward.points_required]
      );
      if (pointRes.affectedRows === 0) {
        const [u] = await conn.query('SELECT is_active FROM Users WHERE user_id = ?', [userId]);
        if (!u[0] || !u[0].is_active) throw new HttpError(403, 'User account is inactive');
        throw new HttpError(400, 'Insufficient green points');
      }

      // Row is already locked; "stock > 0" is a last-line safeguard.
      const [stockRes] = await conn.query(
        'UPDATE RewardItems SET stock = stock - 1 WHERE reward_id = ? AND stock > 0',
        [rewardId]
      );
      if (stockRes.affectedRows === 0) throw new HttpError(409, 'Reward is out of stock');

      // Insert the redemption; retry on the (very unlikely) redeem_code collision.
      // The uq_redeem_code duplicate error does not abort the transaction in InnoDB
      // (statement-level rollback only), so retrying inside it is safe.
      let redemptionId = null;
      let redeemCode = null;
      for (let attempt = 0; attempt < 5 && !redemptionId; attempt++) {
        redeemCode = generateRedeemCode();
        try {
          const [ins] = await conn.query(
            `INSERT INTO RewardRedemptions
               (user_id, reward_id, points_used, redemption_at, expires_at, status, redeem_code)
             VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), 'pending', ?)`,
            [userId, rewardId, reward.points_required, REDEEM_EXPIRE_DAYS, redeemCode]
          );
          redemptionId = ins.insertId;
        } catch (e) {
          if (e.code !== 'ER_DUP_ENTRY') throw e;
        }
      }
      if (!redemptionId) throw new Error('Could not generate a unique redeem code');

      const [[after]] = await conn.query('SELECT green_points FROM Users WHERE user_id = ?', [userId]);
      return {
        redemption_id: redemptionId,
        redeem_code: redeemCode,
        reward_id: rewardId,
        reward_name: reward.name,
        points_used: reward.points_required,
        remaining_points: after.green_points,
        status: 'pending',
      };
    });

    return res.status(201).json({ message: 'Redeemed successfully', data });
  } catch (err) {
    return handleError(res, err, 'POST /rewards/redeem');
  }
});

// ---------------------------------------------------------------
// GET /api/rewards/history — redemption history of the logged-in user
//   ?status=pending|completed|cancelled (optional)
// ---------------------------------------------------------------
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const params = [req.user.id];
    let statusClause = '';
    const { status } = req.query;
    if (status !== undefined) {
      if (typeof status !== 'string' || !STATUSES.includes(status)) {
        return res.status(400).json({ message: 'Invalid status filter' });
      }
      statusClause = 'AND rr.status = ?';
      params.push(status);
    }

    const [rows] = await pool.query(
      `SELECT rr.redemption_id, rr.redeem_code, rr.reward_id, ri.name AS reward_name,
              ri.image_url, ri.emoji, rr.points_used, rr.status, rr.redemption_at,
              rr.expires_at, rr.handed_over_at,
              (rr.status = 'pending' AND rr.expires_at IS NOT NULL AND rr.expires_at < NOW()) AS is_expired
         FROM RewardRedemptions rr
         JOIN RewardItems ri ON ri.reward_id = rr.reward_id
        WHERE rr.user_id = ? ${statusClause}
        ORDER BY rr.redemption_at DESC, rr.redemption_id DESC`,
      params
    );
    return res.status(200).json({
      data: rows.map((r) => ({ ...r, is_expired: Boolean(r.is_expired) })),
    });
  } catch (err) {
    return handleError(res, err, 'GET /rewards/history');
  }
});

// ---------------------------------------------------------------
// PATCH /api/rewards/redeem/:id/status — Staff/Admin confirms hand-over (pending -> completed)
// ---------------------------------------------------------------
router.patch(
  '/redeem/:id/status',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const id = toPositiveInt(req.params.id);
      if (!id) return res.status(400).json({ message: 'Invalid redemption id' });

      const target = (req.body && req.body.status) || 'completed';
      if (target !== 'completed') {
        return res.status(400).json({ message: "Only status 'completed' is allowed (use /cancel to cancel)" });
      }

      // One atomic statement: status AND expiry are checked in the WHERE clause,
      // so two staff members (or a clock tick) can never slip past a stale SELECT.
      const [upd] = await pool.query(
        `UPDATE RewardRedemptions
            SET status = 'completed', staff_id = ?, handed_over_at = NOW()
          WHERE redemption_id = ? AND status = 'pending'
            AND (expires_at IS NULL OR expires_at >= NOW())`,
        [req.user.id, id]
      );

      if (upd.affectedRows === 0) {
        // Nothing changed -> find out why so the message is accurate
        const [rows] = await pool.query(
          'SELECT status FROM RewardRedemptions WHERE redemption_id = ?',
          [id]
        );
        if (!rows[0]) return res.status(404).json({ message: 'Redemption not found' });
        if (rows[0].status !== 'pending') {
          return res.status(409).json({ message: `Redemption is already ${rows[0].status}` });
        }
        return res.status(410).json({ message: 'Redemption has expired' });
      }

      return res.status(200).json({
        message: 'Reward handed over',
        data: { redemption_id: id, status: 'completed', staff_id: req.user.id },
      });
    } catch (err) {
      return handleError(res, err, 'PATCH /rewards/redeem/:id/status');
    }
  }
);

// ---------------------------------------------------------------
// PATCH /api/rewards/redeem/:id/cancel — Staff/Admin cancels a pending redemption
//   Refunds the points and returns the stock, atomically.
//   (Works for expired ones too — this is how an expired pickup is released.)
// ---------------------------------------------------------------
router.patch(
  '/redeem/:id/cancel',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const id = toPositiveInt(req.params.id);
      if (!id) return res.status(400).json({ message: 'Invalid redemption id' });

      const result = await withTransaction((conn) =>
        cancelPendingRedemption(conn, id, { actorId: req.user.id })
      );
      return res.status(200).json({
        message: 'Redemption cancelled, points refunded and stock restored',
        data: { ...result, status: 'cancelled' },
      });
    } catch (err) {
      return handleError(res, err, 'PATCH /rewards/redeem/:id/cancel');
    }
  }
);

module.exports = router;
