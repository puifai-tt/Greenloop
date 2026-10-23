'use strict';
const express = require('express');
const authMiddleware = require('../middleware/auth');
const { handleError } = require('../lib/common');
const { loadProfile } = require('../lib/serialize');
const { listTransactions } = require('../lib/transactions');

const router = express.Router();
router.use(authMiddleware);

// GET /api/me — the logged-in user's profile + live points balance
router.get('/', async (req, res) => {
  try {
    const profile = await loadProfile(req.user.id);
    if (!profile) return res.status(404).json({ message: 'User not found' });
    return res.status(200).json({ data: profile });
  } catch (err) {
    return handleError(res, err, 'GET /me');
  }
});

// GET /api/me/transactions — the logged-in user's own recycling history
router.get('/transactions', async (req, res) => {
  try {
    const data = await listTransactions(undefined, { userId: req.user.id, limit: 500 });
    return res.status(200).json({ data });
  } catch (err) {
    return handleError(res, err, 'GET /me/transactions');
  }
});

module.exports = router;
