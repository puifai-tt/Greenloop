'use strict';
const pool = require('../config/db');
const { HttpError } = require('./common');

// Cancels ONE pending redemption inside the caller's transaction and gives everything back:
// status -> 'cancelled', points -> user, stock +1.
// Row-lock order: redemption -> reward -> user (the redeem flow never holds a redemption row
// while waiting on reward/user, so no lock cycle is possible).
//   onlyIfExpired: used by the overdue sweep so a still-valid redemption is never cancelled.
async function cancelPendingRedemption(conn, redemptionId, { actorId = null, onlyIfExpired = false } = {}) {
  const [rows] = await conn.query(
    `SELECT redemption_id, user_id, reward_id, points_used, status,
            (expires_at IS NOT NULL AND expires_at < NOW()) AS is_expired
       FROM RewardRedemptions
      WHERE redemption_id = ? FOR UPDATE`,
    [redemptionId]
  );
  const r = rows[0];
  if (!r) throw new HttpError(404, 'Redemption not found');
  if (r.status !== 'pending') throw new HttpError(409, `Redemption is already ${r.status}`);
  if (onlyIfExpired && !r.is_expired) throw new HttpError(409, 'Redemption has not expired');

  const [upd] = await conn.query(
    `UPDATE RewardRedemptions SET status = 'cancelled', staff_id = ?
      WHERE redemption_id = ? AND status = 'pending'`,
    [actorId, redemptionId]
  );
  if (upd.affectedRows === 0) throw new HttpError(409, 'Redemption status has already changed');

  await conn.query('UPDATE RewardItems SET stock = stock + 1 WHERE reward_id = ?', [r.reward_id]);
  await conn.query('UPDATE Users SET green_points = green_points + ? WHERE user_id = ?', [r.points_used, r.user_id]);

  return { redemption_id: r.redemption_id, user_id: r.user_id, reward_id: r.reward_id, refunded_points: r.points_used };
}

// Redemption queue / report rows, newest first (used by the staff pickup screen and admin reports).
// pickup_point_name = the branch of the staff member who handed the reward over (NULL until then).
async function listRedemptions(db = pool, { limit = 500 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 500, 1), 2000);
  const [rows] = await db.query(
    `SELECT rr.redemption_id, rr.redeem_code, rr.user_id, rr.reward_id,
            ri.name AS reward_name, ri.emoji, rr.points_used, rr.status, rr.staff_id,
            rr.redemption_at, rr.expires_at, rr.handed_over_at,
            sdp.name AS pickup_point_name,
            (rr.status = 'pending' AND rr.expires_at IS NOT NULL AND rr.expires_at < NOW()) AS is_expired
       FROM RewardRedemptions rr
       JOIN RewardItems ri ON ri.reward_id = rr.reward_id
       LEFT JOIN Users s ON s.user_id = rr.staff_id
       LEFT JOIN DropOffPoints sdp ON sdp.point_id = s.point_id
      ORDER BY rr.redemption_at DESC, rr.redemption_id DESC
      LIMIT ?`,
    [cap]
  );
  return rows.map((r) => ({ ...r, is_expired: Boolean(r.is_expired) }));
}

module.exports = { cancelPendingRedemption, listRedemptions };
