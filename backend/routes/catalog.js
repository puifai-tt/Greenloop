'use strict';
const express = require('express');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');
const { handleError } = require('../lib/common');

const router = express.Router();

// GET /api/recycle-types — active material types with their point / CO2 rates
router.get('/recycle-types', authMiddleware, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT type_id, name, points_per_kg, co2_factor_kg, emoji, color, note
         FROM RecycleTypes WHERE is_active = TRUE ORDER BY type_id ASC`
    );
    return res.status(200).json({ data: rows });
  } catch (err) {
    return handleError(res, err, 'GET /recycle-types');
  }
});

// Shared with the admin router so both return identical shapes.
async function listDropOffPoints() {
  const [points] = await pool.query(
    `SELECT point_id, name, house_no, street, subdistrict, district, province, postal_code,
            latitude, longitude, hours, phone, notes, is_active
       FROM DropOffPoints ORDER BY point_id ASC`
  );
  const [accepted] = await pool.query(
    `SELECT bat.point_id, rt.type_id, rt.name
       FROM BranchAcceptedTypes bat
       JOIN RecycleTypes rt ON rt.type_id = bat.type_id AND rt.is_active = TRUE
      ORDER BY rt.type_id ASC`
  );
  const byPoint = new Map();
  for (const a of accepted) {
    if (!byPoint.has(a.point_id)) byPoint.set(a.point_id, []);
    byPoint.get(a.point_id).push(a);
  }
  return points.map((p) => {
    const acc = byPoint.get(p.point_id) || [];
    return {
      ...p,
      address: [p.house_no, p.street, p.subdistrict, p.district, p.province, p.postal_code]
        .filter(Boolean).join(', '),
      is_active: Boolean(p.is_active),
      accepted_type_ids: acc.map((a) => a.type_id),
      accepted_types: acc.map((a) => a.name),
    };
  });
}

// GET /api/drop-off-points — every point (inactive ones too: the UI shows them greyed out)
router.get('/drop-off-points', authMiddleware, async (_req, res) => {
  try {
    return res.status(200).json({ data: await listDropOffPoints() });
  } catch (err) {
    return handleError(res, err, 'GET /drop-off-points');
  }
});

module.exports = router;
module.exports.listDropOffPoints = listDropOffPoints;
