# GreenLoop API (backend)

## Setup (MySQL Workbench)
1. Workbench → connect → create a database (e.g. `greenloop`) and make it the default schema (`USE greenloop;`).
2. Load the tables — run these scripts in this order (File → Open SQL Script → Execute):
   - **New database:** `sql/schema.sql`
   - **Existing database built from the PDF:** `sql/migration.sql`, then `sql/migration_frontend.sql`
     (both are safe to re-run; `migration_frontend.sql` adds the columns the React screens need).
3. Optional demo data + demo logins: `sql/seed.sql` (safe to re-run; it never overwrites rows that already exist).
4. `cp .env.example .env` and fill in `DB_*` and a random `JWT_SECRET` (32+ characters).
5. `npm install` then `npm run dev` (API on http://localhost:4000). Check http://localhost:4000/api/health.
6. Start the frontend (`../Greenloop_Final`).

Tests: `node test/api.test.js` and `node test/frontend-api.test.js`
(**WARNING:** both TRUNCATE tables — only run them against a throwaway database).

## Settings (.env)
| Variable | Meaning |
|---|---|
| `DB_HOST/PORT/USER/PASSWORD/NAME` | your MySQL connection |
| `JWT_SECRET` | at least 32 random characters |
| `CORS_ORIGIN` | the frontend's origin (default `http://localhost:5173`) |
| `JWT_EXPIRES_IN` | login lifetime, default `8h` |
| `REDEEM_EXPIRE_DAYS` | days a member has to collect a reward, default `30` |
| `TRUST_PROXY` | set to `1` when running behind nginx / a load balancer |

## Endpoints
| Method | Path | Who |
|---|---|---|
| POST | /api/auth/login | public (rate-limited) |
| GET | /api/me, /api/me/transactions | any logged-in |
| GET | /api/recycle-types, /api/drop-off-points | any logged-in |
| GET | /api/rewards | any logged-in |
| POST | /api/rewards/redeem | member |
| GET | /api/rewards/history | any logged-in (own rows) |
| PATCH | /api/rewards/redeem/:id/status | staff, admin (hand-over) |
| PATCH | /api/rewards/redeem/:id/cancel | staff, admin (refund + restock) |
| GET | /api/staff/members, /api/staff/members/:id | staff |
| POST | /api/staff/transactions | staff (records recycling; points computed server-side) |
| GET | /api/staff/transactions, /api/staff/redemptions | staff (own branch / pickup queue) |
| GET/POST | /api/admin/rewards | admin |
| PUT/DELETE | /api/admin/rewards/:id | admin (PUT accepts `stock_delta` for atomic +/-) |
| GET | /api/admin/members, /staff, /transactions, /redemptions | admin |
| POST | /api/admin/drop-off-points | admin |
| PATCH | /api/admin/drop-off-points/:id/toggle | admin |
| PUT | /api/admin/recycle-types/:id | admin |
| POST | /api/admin/redemptions/expire-overdue | admin |
| GET | /api/admin/stats, /api/admin/users/:id | admin |

## Layout
server.js · config/db.js · middleware/{auth,requireRole}.js · lib/{common,serialize,transactions,redemptions,rateLimit}.js ·
routes/{auth,me,catalog,staff,rewards,admin}.js · sql/{schema,migration,migration_frontend,seed}.sql
