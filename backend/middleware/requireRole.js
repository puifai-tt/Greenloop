'use strict';

const VALID_ROLES = new Set(['user', 'staff', 'admin']);

// Usage (always AFTER authMiddleware):
//   router.use(authMiddleware, requireRole('admin'));
//   router.patch('/x', authMiddleware, requireRole('staff', 'admin'), handler);
//
// Misconfiguration (no roles, or a typo like 'amdin') throws at startup instead of
// silently locking everyone out — or letting the wrong people in.
module.exports = function requireRole(...roles) {
  const allowed = roles.flat();
  if (allowed.length === 0) {
    throw new Error('requireRole() needs at least one role');
  }
  for (const r of allowed) {
    if (!VALID_ROLES.has(r)) throw new Error(`requireRole(): unknown role "${r}"`);
  }
  const allowedSet = new Set(allowed);

  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!allowedSet.has(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    return next();
  };
};
