'use strict';
const pool = require('../config/db');

// Recycling transactions with their line items attached, newest first.
//   filters: { userId, pointId, transactionId, limit }
// Totals are computed here so every screen shows the same numbers.
async function listTransactions(db = pool, { userId, pointId, transactionId, limit = 500 } = {}) {
  const where = [];
  const params = [];
  if (userId) { where.push('t.user_id = ?'); params.push(userId); }
  if (pointId) { where.push('t.point_id = ?'); params.push(pointId); }
  if (transactionId) { where.push('t.transaction_id = ?'); params.push(transactionId); }
  const cap = Math.min(Math.max(Number(limit) || 500, 1), 2000);

  const [txs] = await db.query(
    `SELECT t.transaction_id, t.user_id, t.point_id, dp.name AS point_name, t.staff_id, t.trans_date
       FROM Transactions t
       JOIN DropOffPoints dp ON dp.point_id = t.point_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY t.trans_date DESC, t.transaction_id DESC
      LIMIT ?`,
    [...params, cap]
  );
  if (txs.length === 0) return [];

  const [items] = await db.query(
    `SELECT ti.transaction_id, ti.item_id, ti.type_id, rt.name AS type_name,
            ti.weight_kg, ti.co2_saved, ti.points_earned
       FROM TransactionsItems ti
       JOIN RecycleTypes rt ON rt.type_id = ti.type_id
      WHERE ti.transaction_id IN (?)
      ORDER BY ti.item_id ASC`,
    [txs.map((t) => t.transaction_id)]
  );
  const byTx = new Map();
  for (const it of items) {
    if (!byTx.has(it.transaction_id)) byTx.set(it.transaction_id, []);
    byTx.get(it.transaction_id).push(it);
  }
  return txs.map((t) => {
    const its = byTx.get(t.transaction_id) || [];
    return {
      ...t,
      items: its,
      total_weight_kg: Number(its.reduce((s, i) => s + Number(i.weight_kg), 0).toFixed(2)),
      total_co2_saved: Number(its.reduce((s, i) => s + Number(i.co2_saved), 0).toFixed(2)),
      total_points: its.reduce((s, i) => s + Number(i.points_earned), 0),
    };
  });
}

module.exports = { listTransactions };
