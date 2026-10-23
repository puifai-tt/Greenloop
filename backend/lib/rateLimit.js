'use strict';
// Tiny in-memory failure limiter (single process). Good enough to blunt password guessing;
// put a real limiter (nginx / redis-backed) in front if you run several instances.
function createFailureLimiter({ max = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, 60 * 1000);
  timer.unref(); // never keep the process (or tests) alive

  const live = (key) => {
    const h = hits.get(key);
    if (!h) return null;
    if (h.resetAt <= Date.now()) { hits.delete(key); return null; }
    return h;
  };
  return {
    isBlocked: (key) => (live(key)?.count || 0) >= max,
    retryAfterSec: (key) => Math.max(1, Math.ceil(((live(key)?.resetAt || Date.now()) - Date.now()) / 1000)),
    fail: (key) => {
      const h = live(key);
      if (h) h.count += 1; else hits.set(key, { count: 1, resetAt: Date.now() + windowMs });
    },
    reset: (key) => hits.delete(key),
  };
}
module.exports = { createFailureLimiter };
