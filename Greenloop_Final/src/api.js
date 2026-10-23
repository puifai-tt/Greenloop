// All communication with the GreenLoop backend lives here, plus the "mappers" that turn
// database rows (snake_case) into the shapes the UI components already use.

const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const TOKEN_KEY = 'gl_token';

export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function request(method, path, body) {
  const token = getToken();
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Can’t reach the GreenLoop server. Check that the backend is running.', 0);
  }
  let json = null;
  try { json = await res.json(); } catch { /* empty / non-JSON body */ }
  if (!res.ok) {
    // A 401 on a protected call means the session ended; the login call itself handles its own 401.
    if (res.status === 401 && path !== '/auth/login') onUnauthorized();
    throw new ApiError(json?.message || `Request failed (${res.status})`, res.status);
  }
  return json;
}
const get = (p) => request('GET', p);
const data = async (promise) => (await promise).data;

// ---------------------------------------------------------------- endpoints
export const login = async (email, password) => {
  const r = await request('POST', '/auth/login', { email, password });
  setToken(r.token);
  return r.user;
};
// Creates a member account (role is always 'user' on the server). The caller signs in afterwards.
export const register = ({ fname, lname, email, password }) =>
  request('POST', '/auth/register', { fname, lname, email, password });
export const logout = () => setToken(null);
export const me = () => data(get('/me'));
export const myTransactions = () => data(get('/me/transactions'));
export const recycleTypes = () => data(get('/recycle-types'));
export const dropOffPoints = () => data(get('/drop-off-points'));

export const rewards = () => data(get('/rewards'));
export const redeem = (rewardId) => data(request('POST', '/rewards/redeem', { reward_id: rewardId }));
export const myRedemptions = () => data(get('/rewards/history'));
export const completeRedemption = (id) => request('PATCH', `/rewards/redeem/${id}/status`, { status: 'completed' });

export const staffMembers = () => data(get('/staff/members'));
export const staffMember = (id) => data(get(`/staff/members/${id}`));
export const staffTransactions = () => data(get('/staff/transactions'));
export const staffRedemptions = () => data(get('/staff/redemptions'));
export const recordTransaction = (userId, items) =>
  data(request('POST', '/staff/transactions', { user_id: userId, items }));

export const adminRewards = () => data(get('/admin/rewards'));
export const adminCreateReward = (body) => data(request('POST', '/admin/rewards', body));
export const adminUpdateReward = (id, body) => data(request('PUT', `/admin/rewards/${id}`, body));
export const adminDeleteReward = (id) => request('DELETE', `/admin/rewards/${id}`);
export const adminMembers = () => data(get('/admin/members'));
export const adminStaff = () => data(get('/admin/staff'));
export const adminTransactions = () => data(get('/admin/transactions'));
export const adminRedemptions = () => data(get('/admin/redemptions'));
export const adminCreatePoint = (body) => data(request('POST', '/admin/drop-off-points', body));
export const adminTogglePoint = (id) => data(request('PATCH', `/admin/drop-off-points/${id}/toggle`));
export const adminUpdateRecycleType = (id, body) => data(request('PUT', `/admin/recycle-types/${id}`, body));

// Cancel a pending redemption (staff/admin): refunds the points and returns the stock.
export const cancelRedemption = (id) => request('PATCH', `/rewards/redeem/${id}/cancel`);
// System-wide totals for the admin dashboard.
export const adminStats = () => data(get('/admin/stats'));
// Cancels every pending redemption whose pickup deadline has passed -> { cancelled, skipped, refunded_points }.
export const adminExpireOverdue = () => data(request('POST', '/admin/redemptions/expire-overdue'));

// ---------------------------------------------------------------- id formats
// The UI shows "GL-U-001284" / "DP-001"; the database stores plain integers.
export const fmtUserId = (id) => `GL-U-${String(id).padStart(6, '0')}`;
export const parseUserId = (s) => { const m = /^GL-U-(\d{1,9})$/i.exec(String(s || '').trim()); return m ? Number(m[1]) : null; };
export const fmtPointId = (id) => `DP-${String(id).padStart(3, '0')}`;
export const parsePointId = (s) => { const m = /^DP-(\d+)$/i.exec(String(s || '')); return m ? Number(m[1]) : null; };

// Dates arrive as ISO timestamps; the UI works with local "YYYY-MM-DD" strings.
const pad2 = (n) => String(n).padStart(2, '0');
export const toLocalDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
export const localToday = () => toLocalDate(new Date());

const fullName = (u) => [u.fname, u.mname, u.lname].filter(Boolean).join(' ');

// ---------------------------------------------------------------- mappers
export const mapAccount = (u) => ({
  dbId: u.user_id,
  userId: fmtUserId(u.user_id),
  email: u.email,
  role: u.role,
  name: fullName(u),
  points: Number(u.green_points) || 0,
  co2: Number(u.total_co2_saved) || 0,
  branchId: u.point_id,
  branch: u.point_name || '',
  joined: toLocalDate(u.created_at),
});

export const mapReward = (r) => ({
  id: r.reward_id,
  name: r.name,
  category: r.category || 'Eco lifestyle',
  points: r.points_required,
  stock: r.stock,
  emoji: r.emoji || '🎁',
  active: r.is_active !== undefined ? Boolean(r.is_active) : true,
  description: r.description || '',
  sku: r.sku || `GL-RW-${r.reward_id}`,
  supplier: r.supplier || '',
  location: r.storage_location || '',
  lowStock: r.low_stock ?? 3,
});

export const mapType = (t) => ({
  id: t.type_id,
  name: t.name,
  points: Number(t.points_per_kg),
  co2: Number(t.co2_factor_kg),
  emoji: t.emoji || '♻️',
  color: t.color || '#e5e7eb',
  ...(t.note ? { note: t.note } : {}),
});

export const mapBranch = (p) => ({
  id: fmtPointId(p.point_id),
  dbId: p.point_id,
  name: p.name,
  address: p.address || '',
  hours: p.hours || '',
  phone: p.phone || '',
  notes: p.notes || '',
  acceptedTypes: p.accepted_types || [],
  active: Boolean(p.is_active),
});

export const mapTransaction = (t) => {
  const materials = (t.items || []).map((i) => ({ type: i.type_name, weight: Number(i.weight_kg) }));
  return {
    id: `GL-${String(t.transaction_id).padStart(4, '0')}`,
    dbId: t.transaction_id,
    date: toLocalDate(t.trans_date),
    point: t.point_name,
    userId: fmtUserId(t.user_id),
    materials,
    items: materials.map((m) => `${m.type} (${m.weight.toFixed(2)} kg)`).join(', '),
    weight: Number(t.total_weight_kg),
    points: Number(t.total_points),
    co2: Number(t.total_co2_saved),
    status: 'Completed',
  };
};

// Database status -> the wording the UI already uses.
export const mapRedemption = (r) => {
  const status = r.status === 'completed' ? 'Collected'
    : r.status === 'cancelled' ? 'Cancelled'
    : r.is_expired ? 'Expired' : 'Ready for pickup';
  return {
    id: r.redeem_code || `RD-${r.redemption_id}`,
    dbId: r.redemption_id,
    reward: r.reward_name,
    emoji: r.emoji || '🎁',
    points: r.points_used,
    date: toLocalDate(r.redemption_at),
    deadline: toLocalDate(r.expires_at),
    status,
    collectedAt: toLocalDate(r.handed_over_at),
    pickup: r.pickup_point_name || 'Any active GreenLoop branch',
    pickupBranch: r.pickup_point_name || '',
    userId: r.user_id ? fmtUserId(r.user_id) : undefined,
  };
};

export const mapMember = (m) => ({
  dbId: m.user_id,
  userId: fmtUserId(m.user_id),
  name: fullName(m),
  email: m.email,
  status: m.is_active ? 'Active' : 'Inactive',
  joined: toLocalDate(m.created_at),
  points: Number(m.green_points) || 0,
  branch: m.point_name || '',
});

export const mapStaff = (m) => ({
  dbId: m.user_id,
  name: fullName(m),
  email: m.email,
  branch: m.point_name || 'Unassigned',
  status: m.is_active ? 'Active' : 'Inactive',
});