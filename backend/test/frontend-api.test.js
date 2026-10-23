'use strict';
// Run: node test/frontend-api.test.js   (WARNING: truncates tables — use a throwaway database)
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'gl';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'glpass';
process.env.DB_NAME = process.env.DB_NAME || 'greenloop';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);

const bcrypt = require('bcryptjs');
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
  const call = async (method, path, token, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null; try { json = await res.json(); } catch (_) {}
    return { status: res.status, body: json };
  };
  const q = async (sql, p) => (await pool.query(sql, p))[0];
  const login = async (email, password) => call('POST', '/api/auth/login', null, { email, password });

  // ---------- seed ----------
  await q('SET FOREIGN_KEY_CHECKS=0');
  for (const t of ['RewardRedemptions','TransactionsItems','Transactions','BranchAcceptedTypes','RewardItems','Users','DropOffPoints','RecycleTypes']) await q(`TRUNCATE TABLE ${t}`);
  await q('SET FOREIGN_KEY_CHECKS=1');
  await q(`INSERT INTO DropOffPoints (point_id,name,street,province,hours,phone,notes,is_active) VALUES
    (1,'Bangkhen','Main gate','Bangkok','08:30-18:00','02-555-0101','Main',TRUE),
    (2,'Kaset','Learning centre','Bangkok','09:00-17:00','02-555-0102',NULL,TRUE),
    (3,'Closed','Somewhere','Bangkok',NULL,NULL,NULL,FALSE)`);
  await q(`INSERT INTO RecycleTypes (type_id,name,points_per_kg,co2_factor_kg,emoji,color,is_active) VALUES
    (1,'Plastic',10,0.08,'🧴','#d8efff',TRUE),(2,'Cans',15,0.12,'🥫','#eee',TRUE),
    (3,'E-waste',20,0.18,'🔋','#e9e1fb',TRUE),(4,'Retired',5,0.01,'x','#fff',FALSE)`);
  await q(`INSERT INTO BranchAcceptedTypes (point_id,type_id) VALUES (1,1),(1,2),(1,3),(2,1),(2,2),(3,1),(1,4)`);
  const hash = (p) => bcrypt.hashSync(p, 4);
  const mk = async (id, fname, email, role, pts, point, active = true, pw = 'pw-' + fname) => q(
    `INSERT INTO Users (user_id,fname,lname,email,password_hash,role,point_id,green_points,is_active) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, fname, 'T', email, hash(pw), role, point, pts, active]);
  await mk(1284, 'mild', 'Mild@T.io', 'user', 1000, 1);
  await mk(1285, 'pim', 'pim@t.io', 'user', 0, 2);
  await mk(1293, 'off', 'off@t.io', 'user', 0, 1, false);
  await mk(2, 'narin', 'narin@t.io', 'staff', 0, 1);
  await mk(3, 'mali', 'mali@t.io', 'staff', 0, 2);
  await mk(5, 'nobranch', 'nobranch@t.io', 'staff', 0, null);
  await mk(6, 'closedstaff', 'closedstaff@t.io', 'staff', 0, 3);
  await mk(1, 'adm', 'adm@t.io', 'admin', 0, null);
  await q(`INSERT INTO RewardItems (reward_id,name,points_required,stock,is_active) VALUES (1,'Tote',100,5,TRUE),(2,'Unused',100,5,TRUE)`);
  const pts = async (id) => (await q('SELECT green_points p FROM Users WHERE user_id=?', [id]))[0].p;

  // ---------- AUTH ----------
  console.log('LOGIN');
  const l1 = await login('mild@t.io', 'pw-mild');
  ok(l1.status === 200 && typeof l1.body.token === 'string', 'valid login returns a token', l1.body);
  ok(l1.body.user.role === 'user' && l1.body.user.point_name === 'Bangkhen' && l1.body.user.green_points === 1000, 'login returns profile with branch + points');
  ok(!JSON.stringify(l1.body).includes('password'), 'no password data in login response');
  ok((await login('  MILD@T.IO ', 'pw-mild')).status === 200, 'email is case/space-insensitive');
  const bad = await login('mild@t.io', 'wrong');
  const unknown = await login('nobody@t.io', 'whatever');
  ok(bad.status === 401 && unknown.status === 401 && bad.body.message === unknown.body.message, 'wrong password and unknown email look identical (401)');
  ok((await login('off@t.io', 'pw-off')).status === 403, 'inactive account (right password) -> 403');
  ok((await login('off@t.io', 'wrong')).status === 401, 'inactive account + wrong password -> 401 (no status leak)');
  ok((await call('POST', '/api/auth/login', null, {})).status === 400, 'empty body -> 400');
  ok((await call('POST', '/api/auth/login', null, { email: { $ne: 1 }, password: 'x' })).status === 400, 'non-string email -> 400');
  const me = await call('GET', '/api/me', l1.body.token);
  ok(me.status === 200 && me.body.data.user_id === 1284 && me.body.data.fname === 'mild', 'token works on /api/me');
  ok((await call('GET', '/api/me')).status === 401, '/api/me without token -> 401');
  for (let i = 0; i < 10; i++) await login('brute@t.io', 'x' + i);
  const blocked = await login('brute@t.io', 'x-again');
  ok(blocked.status === 429, 'too many failures -> 429', blocked.status);
  ok((await login('mild@t.io', 'pw-mild')).status === 200, 'other accounts unaffected by the block');

  const tok = async (email, pw) => (await login(email, pw)).body.token;
  const tUser = l1.body.token, tUser2 = await tok('pim@t.io', 'pw-pim');
  const tStaff = await tok('narin@t.io', 'pw-narin'), tStaff2 = await tok('mali@t.io', 'pw-mali');
  const tNoBranch = await tok('nobranch@t.io', 'pw-nobranch'), tClosed = await tok('closedstaff@t.io', 'pw-closedstaff');
  const tAdmin = await tok('adm@t.io', 'pw-adm');

  // ---------- CATALOG ----------
  console.log('CATALOG');
  ok((await call('GET', '/api/recycle-types')).status === 401, 'recycle-types needs login');
  const types = await call('GET', '/api/recycle-types', tUser);
  ok(types.status === 200 && types.body.data.length === 3 && !types.body.data.some((t) => t.name === 'Retired'), 'only active types listed');
  ok(types.body.data[0].points_per_kg === 10 && types.body.data[0].emoji === '🧴', 'rates + emoji returned as numbers/strings');
  const dps = await call('GET', '/api/drop-off-points', tUser);
  const bk = dps.body.data.find((p) => p.point_id === 1);
  ok(dps.status === 200 && dps.body.data.length === 3, 'all points listed incl. inactive');
  ok(bk.address === 'Main gate, Bangkok' && bk.hours === '08:30-18:00' && bk.is_active === true, 'address composed, hours present');
  ok(JSON.stringify(bk.accepted_types) === JSON.stringify(['Plastic', 'Cans', 'E-waste']), 'accepted types attached (retired type hidden)', bk.accepted_types);

  // ---------- RECORD TRANSACTION ----------
  console.log('STAFF — record transaction');
  const rec = (token, body) => call('POST', '/api/staff/transactions', token, body);
  ok((await rec(tUser, { user_id: 1284, items: [{ type_id: 1, weight_kg: 1 }] })).status === 403, 'member cannot record (403)');
  ok((await rec(tAdmin, { user_id: 1284, items: [{ type_id: 1, weight_kg: 1 }] })).status === 403, 'admin cannot record (403)');
  ok((await rec(null, { user_id: 1284, items: [{ type_id: 1, weight_kg: 1 }] })).status === 401, 'no token (401)');

  const t1 = await rec(tStaff, { user_id: 1284, items: [{ type_id: 1, weight_kg: 2.5, points_earned: 99999 }, { type_id: 2, weight_kg: 0.8 }] });
  const d1 = t1.body && t1.body.data;
  ok(t1.status === 201 && d1.transaction.total_points === 37, 'multi-material points = 25 + 12 = 37 (client points ignored)', t1.body);
  ok(d1.transaction.total_weight_kg === 3.3 && d1.transaction.total_co2_saved === 0.3, 'totals: 3.3 kg, 0.20 + 0.10 CO2', d1 && d1.transaction);
  ok(d1.member.green_points === 1037 && (await pts(1284)) === 1037, 'member balance 1000 -> 1037');
  const row = (await q('SELECT staff_id, point_id FROM Transactions WHERE transaction_id=?', [d1.transaction.transaction_id]))[0];
  ok(row.staff_id === 2 && row.point_id === 1, 'staff_id + branch come from the logged-in staff, not the request');
  ok(d1.transaction.items.length === 2 && d1.transaction.items[0].type_name === 'Plastic', 'line items stored with names');

  const half = await rec(tStaff, { user_id: 1284, items: [{ type_id: 1, weight_kg: 0.05 }] });
  ok(half.body.data.transaction.total_points === 1, '0.05 kg x 10 = 0.5 -> rounds half UP to 1');
  const before = await pts(1284);
  const countTx = async () => (await q('SELECT COUNT(*) n FROM Transactions'))[0].n;
  const n0 = await countTx();

  console.log('STAFF — validation (nothing may change on failure)');
  const bads = [
    ['no items', { user_id: 1284, items: [] }, 400],
    ['too many items (6)', { user_id: 1284, items: [1,2,3,1,2,3].map((t, i) => ({ type_id: t + (i > 2 ? 10 : 0), weight_kg: 1 })) }, 400],
    ['duplicate material', { user_id: 1284, items: [{ type_id: 1, weight_kg: 1 }, { type_id: 1, weight_kg: 2 }] }, 400],
    ['weight 0', { user_id: 1284, items: [{ type_id: 1, weight_kg: 0 }] }, 400],
    ['negative weight', { user_id: 1284, items: [{ type_id: 1, weight_kg: -3 }] }, 400],
    ['weight 501', { user_id: 1284, items: [{ type_id: 1, weight_kg: 501 }] }, 400],
    ['3 decimals', { user_id: 1284, items: [{ type_id: 1, weight_kg: 1.005 }] }, 400],
    ['NaN string', { user_id: 1284, items: [{ type_id: 1, weight_kg: 'abc' }] }, 400],
    ['exp notation', { user_id: 1284, items: [{ type_id: 1, weight_kg: '1e2' }] }, 400],
    ['missing user_id', { items: [{ type_id: 1, weight_kg: 1 }] }, 400],
    ['SQLi user_id', { user_id: '1 OR 1=1', items: [{ type_id: 1, weight_kg: 1 }] }, 400],
    ['unknown material', { user_id: 1284, items: [{ type_id: 999, weight_kg: 1 }] }, 400],
    ['inactive material', { user_id: 1284, items: [{ type_id: 4, weight_kg: 1 }] }, 400],
    ['unknown member', { user_id: 99999, items: [{ type_id: 1, weight_kg: 1 }] }, 404],
    ['staff account as member', { user_id: 3, items: [{ type_id: 1, weight_kg: 1 }] }, 404],
    ['inactive member', { user_id: 1293, items: [{ type_id: 1, weight_kg: 1 }] }, 409],
  ];
  for (const [name, body, status] of bads) {
    const r = await rec(tStaff, body);
    ok(r.status === status, `${name} -> ${status}`, r.status + ' ' + JSON.stringify(r.body));
  }
  const eKaset = await rec(tStaff2, { user_id: 1285, items: [{ type_id: 3, weight_kg: 1 }] });
  ok(eKaset.status === 409 && /not accepted/.test(eKaset.body.message), 'material not accepted at this branch -> 409', eKaset.body);
  ok((await rec(tNoBranch, { user_id: 1284, items: [{ type_id: 1, weight_kg: 1 }] })).status === 409, 'staff without a branch -> 409');
  ok((await rec(tClosed, { user_id: 1284, items: [{ type_id: 1, weight_kg: 1 }] })).status === 409, 'staff at a closed branch -> 409');
  ok((await pts(1284)) === before && (await countTx()) === n0, 'balance and transaction count unchanged after all failures');

  console.log('STAFF — concurrency');
  const a0 = await pts(1284);
  const burst = await Promise.all(Array.from({ length: 8 }, () => rec(tStaff, { user_id: 1284, items: [{ type_id: 1, weight_kg: 1 }] })));
  ok(burst.every((r) => r.status === 201), '8 simultaneous recordings all succeed');
  ok((await pts(1284)) === a0 + 80, 'no lost updates: +10 x 8 exactly', await pts(1284));

  console.log('READS');
  const mine = await call('GET', '/api/me/transactions', tUser);
  ok(mine.status === 200 && mine.body.data.length === 10 && mine.body.data[0].items.length >= 1, 'member sees own history with items');
  const o = await rec(tStaff2, { user_id: 1285, items: [{ type_id: 2, weight_kg: 2 }] });
  ok(o.status === 201 && o.body.data.transaction.total_points === 30, 'second branch records 30 pts');
  ok((await call('GET', '/api/me/transactions', tUser)).body.data.every((t) => t.user_id === 1284), '/me/transactions only contains my rows');
  const branch1 = await call('GET', '/api/staff/transactions', tStaff);
  const branch2 = await call('GET', '/api/staff/transactions', tStaff2);
  ok(branch1.body.data.every((t) => t.point_id === 1) && branch2.body.data.every((t) => t.point_id === 2) && branch2.body.data.length === 1, 'staff only see their own branch');
  ok((await call('GET', '/api/staff/transactions', tNoBranch)).body.data.length === 0, 'staff without a branch -> empty list');
  const mem = await call('GET', '/api/staff/members', tStaff);
  ok(mem.status === 200 && mem.body.data.every((m) => !('password_hash' in m)) && !mem.body.data.some((m) => m.user_id === 2), 'staff member list: members only, no password_hash');
  ok((await call('GET', '/api/staff/members/1284', tStaff)).body.data.green_points === a0 + 80, 'staff lookup by id');
  ok((await call('GET', '/api/staff/members/2', tStaff)).status === 404, 'lookup of a staff id -> 404');
  ok((await call('GET', '/api/staff/members/abc', tStaff)).status === 400, 'lookup bad id -> 400');
  ok((await call('GET', '/api/staff/members', tUser)).status === 403, 'member cannot list members');

  console.log('REDEMPTIONS (queue + pickup window)');
  const rd = await call('POST', '/api/rewards/redeem', tUser, { reward_id: 1 });
  ok(rd.status === 201, 'member redeems', rd.body);
  const days = (await q('SELECT TIMESTAMPDIFF(DAY, redemption_at, expires_at) d FROM RewardRedemptions LIMIT 1'))[0].d;
  ok(days === 30, 'pickup window defaults to 30 days (UI says "one month")', days);
  const queue = await call('GET', '/api/staff/redemptions', tStaff2);
  const qr = queue.body.data[0];
  ok(queue.status === 200 && qr.redeem_code === rd.body.data.redeem_code && qr.status === 'pending' && qr.is_expired === false && qr.pickup_point_name === null, 'queue shows pending redemption', qr);
  const hand = await call('PATCH', `/api/rewards/redeem/${qr.redemption_id}/status`, tStaff2);
  const queue2 = await call('GET', '/api/staff/redemptions', tStaff);
  ok(hand.status === 200 && queue2.body.data[0].status === 'completed' && queue2.body.data[0].pickup_point_name === 'Kaset', 'after hand-over: completed + pickup branch recorded');
  ok((await call('GET', '/api/staff/redemptions', tUser)).status === 403, 'member cannot see the queue');

  // ---------- ADMIN ----------
  console.log('ADMIN — lists');
  const am = await call('GET', '/api/admin/members', tAdmin);
  ok(am.status === 200 && am.body.data.every((u) => u.role === 'user') && am.body.data.length === 3 && am.body.data[0].point_name, 'members list: role=user only, with branch');
  const as = await call('GET', '/api/admin/staff', tAdmin);
  ok(as.status === 200 && as.body.data.every((u) => u.role === 'staff') && as.body.data.length === 4, 'staff list: role=staff only');
  ok(as.body.data.every((u) => !('password_hash' in u)), 'no password_hash in staff list');
  const at = await call('GET', '/api/admin/transactions', tAdmin);
  ok(at.status === 200 && at.body.data.length === (await countTx()) && at.body.data[0].items, 'admin sees all transactions with items');
  ok((await call('GET', '/api/admin/redemptions', tAdmin)).body.data.length === 1, 'admin redemptions list');
  for (const p of ['/api/admin/members', '/api/admin/staff', '/api/admin/transactions', '/api/admin/redemptions']) {
    ok((await call('GET', p, tStaff)).status === 403 && (await call('GET', p, tUser)).status === 403, `${p} forbidden for staff/member`);
  }

  console.log('ADMIN — drop-off points');
  const mkPoint = (b) => call('POST', '/api/admin/drop-off-points', tAdmin, b);
  const np = await mkPoint({ name: ' New Point ', address: 'Near the park', hours: '09:00-17:00', phone: '02-000', notes: 'n', accepted_type_ids: [1, 2] });
  ok(np.status === 201 && np.body.data.name === 'New Point' && np.body.data.address === 'Near the park' && np.body.data.is_active === true, 'create point', np.body);
  ok(JSON.stringify(np.body.data.accepted_type_ids) === '[1,2]', 'accepted types saved');
  const pc = async () => (await q('SELECT COUNT(*) n FROM DropOffPoints'))[0].n;
  const p0 = await pc();
  ok((await mkPoint({ address: 'x' })).status === 400, 'missing name -> 400');
  ok((await mkPoint({ name: 'x' })).status === 400, 'missing address -> 400');
  ok((await mkPoint({ name: 'x', address: 'y'.repeat(101) })).status === 400, 'address > 100 -> 400');
  ok((await mkPoint({ name: 'x', address: 'y', accepted_type_ids: [1, 1] })).status === 400, 'duplicate type ids -> 400');
  ok((await mkPoint({ name: 'x', address: 'y', accepted_type_ids: [1, 999] })).status === 400, 'nonexistent type -> 400');
  ok((await pc()) === p0, 'failed creates leave no half-made point (rolled back)');
  ok((await mkPoint({ name: 'Minimal', address: 'z' })).status === 201, 'point with no accepted types is allowed');
  ok((await call('POST', '/api/admin/drop-off-points', tStaff, { name: 'x', address: 'y' })).status === 403, 'staff cannot create points');

  console.log('ADMIN — recycle type rates');
  const putT = (id, b, t = tAdmin) => call('PUT', `/api/admin/recycle-types/${id}`, t, b);
  const pr = await putT(1, { points_per_kg: 12.5 });
  ok(pr.status === 200 && pr.body.data.points_per_kg === 12.5, 'update rate', pr.body);
  const afterRate = await rec(tStaff, { user_id: 1284, items: [{ type_id: 1, weight_kg: 2 }] });
  ok(afterRate.body.data.transaction.total_points === 25, 'new transactions use the new rate (2 kg x 12.5)');
  ok((await call('GET', '/api/me/transactions', tUser)).body.data.some((t) => t.total_points === 37), 'old transactions keep their recorded points');
  ok((await putT(1, { points_per_kg: -1 })).status === 400, 'negative rate -> 400');
  ok((await putT(1, { points_per_kg: 1.234 })).status === 400, '3-decimal rate -> 400');
  ok((await putT(1, { points_per_kg: '10' })).status === 400, 'string rate -> 400');
  ok((await putT(1, { points_per_kg: 10000 })).status === 400, 'rate above max -> 400');
  ok((await putT(1, {})).status === 400, 'empty update -> 400');
  ok((await putT(999, { points_per_kg: 5 })).status === 404, 'unknown type -> 404');
  ok((await putT(1, { points_per_kg: 5 }, tStaff)).status === 403, 'staff cannot change rates');

  console.log('ADMIN — rewards (new fields, stock_delta, delete)');
  const mkR = (b) => call('POST', '/api/admin/rewards', tAdmin, b);
  const nr = await mkR({ name: 'Bottle', points_required: 50, stock: 3, category: 'Eco', emoji: '🍶', supplier: 'S', storage_location: 'A1', low_stock: 2 });
  ok(nr.status === 201 && nr.body.data.category === 'Eco' && nr.body.data.emoji === '🍶' && nr.body.data.low_stock === 2, 'create with new fields', nr.body);
  ok(/^GL-RW-\d{3}$/.test(nr.body.data.sku), 'blank SKU is auto-generated', nr.body.data.sku);
  const dup = await mkR({ name: 'Dup', points_required: 50, stock: 3, sku: nr.body.data.sku });
  ok(dup.status === 409, 'duplicate SKU -> 409', dup.status);
  ok((await mkR({ name: 'Blank sku', points_required: 5, stock: 1, sku: '   ' })).status === 201, 'blank SKU strings do not collide');
  ok((await mkR({ name: 'x', points_required: 5, stock: 1, category: 'c'.repeat(51) })).status === 400, 'overlong category -> 400');
  ok((await mkR({ name: 'x', points_required: 5, stock: 1, low_stock: -1 })).status === 400, 'negative low_stock -> 400');
  const rid = nr.body.data.reward_id;
  const putR = (b, id = rid) => call('PUT', `/api/admin/rewards/${id}`, tAdmin, b);
  ok((await putR({ stock_delta: 2 })).body.data.stock === 5, 'stock_delta +2');
  ok((await putR({ stock_delta: -1 })).body.data.stock === 4, 'stock_delta -1');
  ok((await putR({ stock_delta: -100 })).body.data.stock === 0, 'stock_delta clamps at 0 (never negative)');
  ok((await putR({ stock_delta: 1.5 })).status === 400 && (await putR({ stock_delta: 'x' })).status === 400, 'bad stock_delta -> 400');
  ok((await putR({ stock: 3, stock_delta: 1 })).status === 400, 'stock + stock_delta together -> 400');
  await putR({ stock: 10 });
  const raceBase = (await q('SELECT stock s FROM RewardItems WHERE reward_id=?', [rid]))[0].s;
  await Promise.all([putR({ stock_delta: 1 }), putR({ stock_delta: 1 }), putR({ stock_delta: 1 }), putR({ stock_delta: 1 })]);
  ok((await q('SELECT stock s FROM RewardItems WHERE reward_id=?', [rid]))[0].s === raceBase + 4, 'concurrent stock_delta edits all apply (+4)');
  const ed = await putR({ category: 'Food', supplier: null, emoji: '🍎' });
  ok(ed.body.data.category === 'Food' && ed.body.data.supplier === null && ed.body.data.emoji === '🍎', 'edit new fields / null clears');
  const store = await call('GET', '/api/rewards', tUser);
  ok(store.body.data.some((r) => r.reward_id === rid && r.category === 'Food' && r.emoji === '🍎'), 'member store list includes category + emoji');
  const hist = await call('GET', '/api/rewards/history', tUser);
  ok(hist.body.data[0].emoji === null || typeof hist.body.data[0].emoji === 'string', 'history includes emoji field');
  ok((await call('DELETE', '/api/admin/rewards/2', tAdmin)).status === 200, 'delete a reward with no history');
  ok((await call('GET', '/api/admin/rewards', tAdmin)).body.data.every((r) => r.reward_id !== 2), 'deleted reward is gone');
  const delUsed = await call('DELETE', '/api/admin/rewards/1', tAdmin);
  ok(delUsed.status === 409 && /Deactivate/.test(delUsed.body.message), 'delete reward WITH redemptions -> 409 (use deactivate)', delUsed.body);
  ok((await call('GET', '/api/admin/rewards', tAdmin)).body.data.some((r) => r.reward_id === 1), 'reward with history still exists');
  ok((await call('DELETE', '/api/admin/rewards/999', tAdmin)).status === 404, 'delete unknown -> 404');
  ok((await call('DELETE', '/api/admin/rewards/abc', tAdmin)).status === 400, 'delete bad id -> 400');
  ok((await call('DELETE', '/api/admin/rewards/1', tStaff)).status === 403, 'staff cannot delete rewards');

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  server.close();
  await pool.end();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
