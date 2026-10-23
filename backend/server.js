'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRouter = require('./routes/auth');
const meRouter = require('./routes/me');
const catalogRouter = require('./routes/catalog');
const staffRouter = require('./routes/staff');
const rewardsRouter = require('./routes/rewards');
const adminRouter = require('./routes/admin');

const app = express();
app.disable('x-powered-by');
// Needed so req.ip is the real client when running behind nginx / a load balancer (set TRUST_PROXY=1).
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api', catalogRouter);          // /recycle-types, /drop-off-points
app.use('/api/staff', staffRouter);
app.use('/api/rewards', rewardsRouter);
app.use('/api/admin', adminRouter);

app.use((_req, res) => res.status(404).json({ message: 'Not found' }));
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON body' });
  console.error('[unhandled]', err);
  res.status(500).json({ message: 'Internal server error' });
});

const port = Number(process.env.PORT || 4000);
if (require.main === module) {
  app.listen(port, () => console.log(`GreenLoop API listening on :${port}`));
}
module.exports = app;
