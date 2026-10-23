'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { handleError } = require('../lib/common');
const { loadProfile } = require('../lib/serialize');
const { createFailureLimiter } = require('../lib/rateLimit');

const router = express.Router();
const limiter = createFailureLimiter({ max: Number(process.env.LOGIN_MAX_FAILURES || 10) });

// Compared against when the e-mail is unknown, so "no such user" and "wrong password"
// take the same time and can't be told apart.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// POST /api/auth/login  { email, password }  ->  { token, user }
router.post('/login', async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password || email.length > 150 || password.length > 200) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const key = `${req.ip}|${email}`;
    if (limiter.isBlocked(key)) {
      res.set('Retry-After', String(limiter.retryAfterSec(key)));
      return res.status(429).json({ message: 'Too many failed attempts. Please try again later.' });
    }

    const [rows] = await pool.query(
      'SELECT user_id, password_hash, is_active FROM Users WHERE email = ?',
      [email]
    );
    const row = rows[0];
    const passwordOk = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);
    if (!row || !passwordOk) {
      limiter.fail(key);
      return res.status(401).json({ message: 'Email or password is incorrect' });
    }
    if (!row.is_active) {
      return res.status(403).json({ message: 'This account is inactive. Please contact an administrator.' });
    }

    limiter.reset(key);
    const token = jwt.sign({ id: row.user_id }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });
    return res.status(200).json({ token, user: await loadProfile(row.user_id) });
  } catch (err) {
    return handleError(res, err, 'POST /auth/login');
  }
});

// POST /api/auth/register  { fname, lname, email, password }  ->  201 { message }
// Public sign-up: always creates a normal member (role 'user'). The password is stored
// as a bcrypt hash, exactly like the seeded accounts. The frontend signs in afterwards.
router.post('/register', async (req, res) => {
  try {
    const str = (v) => (typeof v === 'string' ? v.trim() : '');
    const fname = str(req.body?.fname);
    const lname = str(req.body?.lname);
    const email = str(req.body?.email).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!fname || !lname) {
      return res.status(400).json({ message: 'Please enter your first and last name.' });
    }
    if (fname.length > 50 || lname.length > 50) {
      return res.status(400).json({ message: 'Names can be at most 50 characters.' });
    }
    if (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }
    if (password.length < 8 || password.length > 200) {
      return res.status(400).json({ message: 'Password must be 8 to 200 characters.' });
    }

    const [existing] = await pool.query('SELECT user_id FROM Users WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(409).json({ message: 'That email is already registered. Try signing in instead.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO Users (fname, lname, email, password_hash, role, is_active, green_points)
       VALUES (?, ?, ?, ?, 'user', TRUE, 0)`,
      [fname, lname, email, passwordHash]
    );
    return res.status(201).json({ message: 'Account created.' });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That email is already registered. Try signing in instead.' });
    }
    return handleError(res, err, 'POST /auth/register');
  }
});

module.exports = router;