'use strict';
// Run: node test/api.test.js   (needs a MySQL/MariaDB with schema.sql loaded + the env vars below)
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'gl';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'glpass';
process.env.DB_NAME = process.env.DB_NAME || 'greenloop';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);

const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const app = require('../server');

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); }
};

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  const call = async (method, path, token, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null; try { json = await res.json(); } catch (_) {}
    return { status: res.status, body: json };
  };
  const q = async (sql, p) => (await pool.query(sql, p))[0];

  // ---------- seed ----------
  await q('SET FOREIGN_KEY_CHECKS=0');
  for (const t of ['RewardRedemptions','TransactionsItems','Transactions','RewardItems','Users','DropOffPoints','RecycleTypes']) await q(`TRUNCATE TABLE ${t}`);
  await q('SET FOREIGN_KEY_CHECKS=1');
  await q(`INSERT INTO DropOffPoints (name,is_active) VALUES ('Bangkhen',TRUE)`);
  const mk = async (fname, role, pts) => (await q(
    `INSERT INTO Users (fname,lname,email,password_hash,role,point_id,green_points) VALUES (?,?,?,?,?,1,?)`,
    [fname, 'T', `${fname}@t.io`, 'x', role, pts])).insertId;
  const A = await mk('a', 'user', 1000), B = await mk('b', 'user', 100), C = await mk('c', 'user', 150);
  const S = await mk('s', 'staff', 0), ADM = await mk('adm', 'admin', 0);
  const mkReward = async (name, pts, stock, active = true) => (await q(
    `INSERT INTO RewardItems (name,points_required,stock,is_active) VALUES (?,?,?,?)`, [name, pts, stock, active])).insertId;
  const R_last = await mkReward('LastOne', 100, 1);
  const R_many = await mkReward('Many', 100, 5);
  const R_off = await mkReward('Off', 10, 5, false);
  const pts = async (id) => (await q('SELECT green_points p FROM Users WHERE user_id=?', [id]))[0].p;
  const stock = async (id) => (await q('SELECT stock s FROM RewardItems WHERE reward_id=?', [id]))[0].s;
  const [tA, tB, tC, tS, tAdm] = [A, B, C, S, ADM].map(tok);

  console.log('AUTH / ROLES');
  ok((await call('GET', '/api/rewards')).status === 401, 'no token -> 401');
  ok((await call('GET', '/api/rewards', 'garbage')).status === 401, 'bad token -> 401');
  ok((await call('GET', '/api/admin/stats', tA)).status === 403, 'user -> admin route 403');
  ok((await call('GET', '/api/admin/stats', tS)).status === 403, 'staff -> admin route 403');
  ok((await call('GET', '/api/admin/stats', tAdm)).status === 200, 'admin -> admin route 200');
  ok((await call('POST', '/api/rewards/redeem', tS, { reward_id: R_many })).status === 403, 'staff cannot redeem (403)');
  ok((await call('PATCH', `/api/rewards/redeem/1/status`, tA)).status === 403, 'user cannot hand over (403)');

  console.log('LIST');
  const list = await call('GET', '/api/rewards', tA);
  ok(list.status === 200 && !list.body.data.some((r) => r.reward_id === R_off), 'inactive reward hidden from users');
  const adminList = await call('GET', '/api/admin/rewards', tAdm);
  ok(adminList.body.data.some((r) => r.reward_id === R_off), 'admin list includes inactive reward');

  console.log('REDEEM — validation & errors');
  ok((await call('POST', '/api/rewards/redeem', tA, {})).status === 400, 'missing reward_id -> 400');
  ok((await call('POST', '/api/rewards/redeem', tA, { reward_id: '1 OR 1=1' })).status === 400, 'SQLi in reward_id -> 400');
  ok((await call('POST', '/api/rewards/redeem', tA, { reward_id: R_off })).status === 404, 'inactive reward -> 404');
  ok((await call('POST', '/api/rewards/redeem', tB, { reward_id: 999999 })).status === 404, 'unknown reward -> 404');
  const poor = await mkReward('Pricey', 5000, 3);
  const r0 = await call('POST', '/api/rewards/redeem', tA, { reward_id: poor });
  ok(r0.status === 400 && (await pts(A)) === 1000 && (await stock(poor)) === 3, 'insufficient points -> 400, nothing changed', r0.body);

  console.log('REDEEM — race: last item, two users at once');
  const [x, y] = await Promise.all([
    call('POST', '/api/rewards/redeem', tA, { reward_id: R_last }),
    call('POST', '/api/rewards/redeem', tB, { reward_id: R_last }),
  ]);
  const codes = [x.status, y.status].sort();
  ok(codes[0] === 201 && codes[1] === 409, 'exactly one 201 and one 409', codes);
  ok((await stock(R_last)) === 0, 'stock is exactly 0 (never negative)');
  const spent = 1000 - (await pts(A)) + (100 - (await pts(B)));
  ok(spent === 100, 'only ONE user was charged', spent);
  ok((await q('SELECT COUNT(*) c FROM RewardRedemptions WHERE reward_id=?', [R_last]))[0].c === 1, 'exactly one redemption row');

  console.log('REDEEM — race: same user double-click with only enough points for one');
  const [d1, d2] = await Promise.all([
    call('POST', '/api/rewards/redeem', tC, { reward_id: R_many }),
    call('POST', '/api/rewards/redeem', tC, { reward_id: R_many }),
  ]);
  ok([d1.status, d2.status].sort().join() === '201,400', 'one succeeds, one "insufficient"', [d1.status, d2.status]);
  ok((await pts(C)) === 50 && (await stock(R_many)) === 4, 'points 150->50 (not negative), stock 5->4');

  console.log('REDEEM — happy path payload');
  const good = await call('POST', '/api/rewards/redeem', tA, { reward_id: R_many });
  ok(good.status === 201 && /^RD-[A-Z2-9]{6}$/.test(good.body.data.redeem_code) && good.body.data.status === 'pending', 'returns code + pending', good.body);
  const redId = good.body.data.redemption_id;

  console.log('HISTORY');
  const h = await call('GET', '/api/rewards/history', tA);
  ok(h.status === 200 && h.body.data.length === 2, 'history shows own redemptions', h.body.data && h.body.data.length);
  ok((await call('GET', "/api/rewards/history?status=pending' OR '1'='1", tA)).status === 400, 'SQLi in status filter -> 400');
  ok((await call('GET', '/api/rewards/history?status=completed', tA)).body.data.length === 0, 'status filter works');

  console.log('HAND-OVER');
  ok((await call('PATCH', `/api/rewards/redeem/${redId}/status`, tS, { status: 'cancelled' })).status === 400, 'only "completed" allowed on /status');
  const done = await call('PATCH', `/api/rewards/redeem/${redId}/status`, tS);
  ok(done.status === 200, 'staff completes pending', done.body);
  const row = (await q('SELECT status, staff_id, handed_over_at FROM RewardRedemptions WHERE redemption_id=?', [redId]))[0];
  ok(row.status === 'completed' && row.staff_id === S && row.handed_over_at, 'staff_id + handed_over_at recorded');
  ok((await call('PATCH', `/api/rewards/redeem/${redId}/status`, tS)).status === 409, 'second confirm -> 409');
  ok((await call('PATCH', `/api/rewards/redeem/${redId}/cancel`, tS)).status === 409, 'cannot cancel a completed redemption');
  ok((await call('PATCH', `/api/rewards/redeem/999999/status`, tS)).status === 404, 'unknown id -> 404');
  ok((await call('PATCH', `/api/rewards/redeem/abc/status`, tS)).status === 400, 'bad id -> 400');

  console.log('EXPIRY / CANCEL / SWEEP');
  const before = { p: await pts(A), s: await stock(R_many) };
  const r2 = await call('POST', '/api/rewards/redeem', tA, { reward_id: R_many });
  await q(`UPDATE RewardRedemptions SET expires_at = NOW() - INTERVAL 1 DAY WHERE redemption_id=?`, [r2.body.data.redemption_id]);
  ok((await call('PATCH', `/api/rewards/redeem/${r2.body.data.redemption_id}/status`, tS)).status === 410, 'expired hand-over -> 410');
  const hist = await call('GET', '/api/rewards/history?status=pending', tA);
  ok(hist.body.data[0].is_expired === true, 'history flags is_expired');
  const stats = await call('GET', '/api/admin/stats', tAdm);
  ok(stats.body.data.overdue_redemptions === 1, 'stats counts 1 overdue', stats.body);
  const sweep = await call('POST', '/api/admin/redemptions/expire-overdue', tAdm);
  ok(sweep.status === 200 && sweep.body.data.cancelled === 1 && sweep.body.data.refunded_points === 100, 'sweep cancels + refunds', sweep.body);
  ok((await pts(A)) === before.p && (await stock(R_many)) === before.s, 'points and stock fully restored after sweep');
  const r3 = await call('POST', '/api/rewards/redeem', tA, { reward_id: R_many });
  const cn = await call('PATCH', `/api/rewards/redeem/${r3.body.data.redemption_id}/cancel`, tS);
  ok(cn.status === 200 && (await pts(A)) === before.p, 'staff cancel refunds a still-valid pending', cn.body);
  ok((await call('PATCH', `/api/rewards/redeem/${r3.body.data.redemption_id}/cancel`, tS)).status === 409, 'double cancel -> 409 (no double refund)');
  ok((await pts(A)) === before.p, 'no double refund');

  console.log('LIVE ROLE / ACTIVE CHECK');
  await q('UPDATE Users SET role="user" WHERE user_id=?', [ADM]);
  ok((await call('GET', '/api/admin/stats', tAdm)).status === 403, 'demoted admin loses access immediately (old token)');
  await q('UPDATE Users SET role="admin" WHERE user_id=?', [ADM]);
  await q('UPDATE Users SET is_active=FALSE WHERE user_id=?', [B]);
  ok((await call('GET', '/api/rewards', tB)).status === 401, 'deactivated user token -> 401');

  console.log('ADMIN REWARD CRUD');
  const mkR = await call('POST', '/api/admin/rewards', tAdm, { name: ' Tumbler ', points_required: 350, stock: 5, image_url: 'https://x.io/a.png' });
  ok(mkR.status === 201 && mkR.body.data.name === 'Tumbler' && mkR.body.data.is_active === true, 'create reward');
  ok((await call('POST', '/api/admin/rewards', tAdm, { name: 'x', points_required: 0, stock: 1 })).status === 400, 'points 0 rejected');
  ok((await call('POST', '/api/admin/rewards', tAdm, { name: 'x', points_required: 1.5, stock: 1 })).status === 400, 'float points rejected');
  ok((await call('POST', '/api/admin/rewards', tAdm, { name: 'x', points_required: 5, stock: -1 })).status === 400, 'negative stock rejected');
  ok((await call('POST', '/api/admin/rewards', tAdm, { name: 'x', points_required: 5, stock: 1, image_url: 'javascript:alert(1)' })).status === 400, 'javascript: image_url rejected');
  const id = mkR.body.data.reward_id;
  const up = await call('PUT', `/api/admin/rewards/${id}`, tAdm, { stock: 9, is_active: false });
  ok(up.status === 200 && up.body.data.stock === 9 && up.body.data.is_active === false, 'partial update');
  ok((await call('PUT', `/api/admin/rewards/${id}`, tAdm, { name: "x'; DROP TABLE Users;--" })).status === 200 && (await q('SELECT COUNT(*) c FROM Users'))[0].c === 5, 'SQLi payload stored as plain text, Users table intact');
  ok((await call('PUT', `/api/admin/rewards/999999`, tAdm, { stock: 1 })).status === 404, 'PUT unknown -> 404');
  ok((await call('PUT', `/api/admin/rewards/${id}`, tAdm, {})).status === 400, 'PUT empty -> 400');
  ok((await call('PUT', `/api/admin/rewards/${id}`, tAdm, { stock: 9 })).status === 200, 'PUT no-op change still 200 (not a false 404)');

  console.log('ADMIN OTHER');
  const tg = await call('PATCH', '/api/admin/drop-off-points/1/toggle', tAdm);
  ok(tg.status === 200 && tg.body.data.is_active === false, 'toggle branch');
  ok((await call('PATCH', '/api/admin/drop-off-points/999/toggle', tAdm)).status === 404, 'toggle unknown -> 404');
  const u = await call('GET', `/api/admin/users/${A}`, tAdm);
  ok(u.status === 200 && !('password_hash' in u.body.data.profile) && u.body.data.redemptions.length >= 3, 'user detail, no password_hash');
  ok((await call('GET', '/api/admin/users/1;DROP TABLE Users', tAdm)).status === 400, 'SQLi in :id -> 400');
  ok((await call('GET', `/api/admin/users/${A}?limit=1`, tAdm)).body.data.redemptions.length === 1, 'limit param respected');

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  server.close(); await pool.end();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
