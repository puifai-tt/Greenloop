# GreenLoop

GreenLoop is a recycling rewards web app. Members earn **Green Points** by recycling at drop-off points and redeem those points for rewards. Staff record recycling and hand rewards over at pickup. Admins manage rewards, drop-off points, recycle types and see system-wide statistics.

| Part | Folder | Tech |
|---|---|---|
| Frontend | `Greenloop_Final/` | React 18 + Vite |
| Backend (REST API) | `backend/` | Node.js, Express, JWT, bcrypt |
| Database | `backend/sql/` | MySQL |

## Features

**Member**
- Sign up and log in
- See points, CO₂ saved and recycling history
- Browse the recycling guide and drop-off points
- Redeem rewards, track redemptions (collect within the deadline)

**Staff**
- Record recycling for a member (points are calculated on the server)
- Reward pickup queue: mark as collected, or cancel with a points refund and stock restored

**Admin**
- Reward inventory: add, edit, change stock, activate or deactivate, delete
- Drop-off points and recycle types (points per kg)
- Members and staff overview, reports and analytics
- Dashboard statistics from the database, plus one-click release of overdue pickups

## Project structure

```
GreenLoop_connected/
├── backend/
│   ├── server.js            # Express app (port 4000)
│   ├── config/db.js         # MySQL connection pool
│   ├── middleware/          # auth (JWT) and role checks
│   ├── routes/              # auth, me, catalog, staff, rewards, admin
│   ├── lib/                 # shared helpers
│   ├── sql/                 # schema.sql, seed.sql, migrations
│   ├── test/                # API tests (see warning below)
│   └── .env                 # your local settings (not committed)
└── Greenloop_Final/
    ├── src/                 # App.jsx, api.js, main.jsx, index.css
    ├── vite.config.js       # proxies /api to the backend
    └── package.json
```

## Requirements

- Node.js 18 or newer
- MySQL 8 (MySQL Workbench is handy for running the SQL scripts)

## Getting started

### 1. Database

In MySQL Workbench:

1. Create the database and select it:
   ```sql
   CREATE DATABASE IF NOT EXISTS greenloop;
   USE greenloop;
   ```
2. Run the scripts from `backend/sql/` in this order (File → Open SQL Script → Execute):
   - New database: `schema.sql`
   - Existing database built from the original design: `migration.sql`, then `migration_frontend.sql`
   - Optional demo data and demo logins: `seed.sql` (safe to re-run)
3. Create a dedicated MySQL user for the app (use your own password):
   ```sql
   CREATE USER 'greenloop'@'localhost' IDENTIFIED BY 'choose_a_password';
   GRANT ALL PRIVILEGES ON greenloop.* TO 'greenloop'@'localhost';
   FLUSH PRIVILEGES;
   ```

### 2. Backend

```bash
cd backend
cp .env.example .env      # then edit .env with your DB password and a random JWT_SECRET
npm install
npm run dev               # API on http://localhost:4000
```

Check it is alive: <http://localhost:4000/api/health> should return `{"ok":true}`.

### 3. Frontend

In a second terminal:

```bash
cd Greenloop_Final
npm install
npm run dev               # UI on http://localhost:5173
```

In development Vite forwards every `/api` request to `http://localhost:4000`, so no extra frontend configuration is needed.

## Environment variables (`backend/.env`)

| Variable | Meaning |
|---|---|
| `PORT` | API port, default `4000` |
| `CORS_ORIGIN` | Frontend origin, default `http://localhost:5173` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection |
| `JWT_SECRET` | At least 32 random characters |
| `JWT_EXPIRES_IN` | Login lifetime, default `8h` |
| `REDEEM_EXPIRE_DAYS` | Days a member has to collect a reward, default `30` |
| `TRUST_PROXY` | Set to `1` when running behind nginx or a load balancer |

Never commit `.env`. It is listed in `.gitignore`.

## Demo accounts

Available after running `seed.sql`:

| Role | Email | Password |
|---|---|---|
| Member | `user@greenloop.demo` | `user123` |
| Staff | `staff@greenloop.demo` | `staff123` |
| Admin | `admin@greenloop.demo` | `admin123` |

Change or remove these accounts before any real deployment.

## API overview

All routes live under `/api`. Most need a `Authorization: Bearer <token>` header from `POST /api/auth/login`.

| Area | Routes |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login` |
| Member | `GET /me`, `GET /me/transactions`, `GET /rewards`, `POST /rewards/redeem`, `GET /rewards/history` |
| Catalog | `GET /recycle-types`, `GET /drop-off-points` |
| Staff | `GET /staff/members`, `POST /staff/transactions`, `GET /staff/transactions`, `GET /staff/redemptions` |
| Pickup | `PATCH /rewards/redeem/:id/status` (hand over), `PATCH /rewards/redeem/:id/cancel` (refund and restock) |
| Admin | `/admin/rewards`, `/admin/members`, `/admin/staff`, `/admin/transactions`, `/admin/redemptions`, `/admin/drop-off-points`, `/admin/recycle-types/:id`, `/admin/stats`, `POST /admin/redemptions/expire-overdue` |

A full table is in [`backend/README.md`](backend/README.md).

## Checking that everything is connected

`greenloop-check.sh` prints the folder structure and tests the frontend, backend and database connection. With both servers running, from the project root:

```bash
bash backend/greenloop-check.sh
```

Add `SKIP_REGISTER=1` in front to avoid creating a test user.

## Tests

```bash
cd backend
node test/api.test.js
node test/frontend-api.test.js
```

> **Warning:** both test files `TRUNCATE` tables. Only run them against a throwaway database, never one that holds data you want to keep.

## Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| `npm error Missing script: "dev"` | You are in the wrong folder. Run it inside `backend` or `Greenloop_Final`. |
| Sign up shows "Internal server error" | Read the backend terminal. The line starting `[POST /auth/register]` shows the real error. |
| `Access denied for user 'greenloop'@'localhost'` | The MySQL user does not exist or its password does not match `DB_PASSWORD`. Create or reset it (see Database step 3) and restart the backend. |
| `Couldn't connect to server` on port 4000 | The backend is not running. Start it with `npm run dev` in `backend`. |
| Changed `.env` but nothing changed | Stop the backend with `Ctrl+C` and start it again. `.env` is only read at startup. |
| Page loads but every action fails | Backend is down or `/api` is not reaching it. Run the check script. |

## Deployment notes

- Build the frontend with `npm run build` in `Greenloop_Final`.
- Set `VITE_API_URL` to the full URL of the deployed API before building, and add the site's origin to `CORS_ORIGIN` in the backend `.env`.
- Use a long random `JWT_SECRET`, a strong database password and HTTPS.
- Set `TRUST_PROXY=1` if the API runs behind a reverse proxy.
