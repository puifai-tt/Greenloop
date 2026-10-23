# GreenLoop — frontend (React + Vite)

This app now talks to the GreenLoop API (`../backend`) and your MySQL database. All data — rewards, points,
drop-off points, recycling transactions, members — comes from the database. Nothing is stored in the browser
except the login token.

## Run it (development)

1. Start the backend first (see `../backend/README.md`) so `http://localhost:4000` is up.
2. In this folder:
   ```
   npm install
   npm run dev
   ```
3. Open the URL Vite prints (http://localhost:5173) and sign in.

In development Vite forwards every `/api/...` request to `http://localhost:4000` (see `vite.config.js`),
so no CORS setup is needed. If your API runs on another port: `VITE_PROXY_TARGET=http://localhost:5000 npm run dev`.

## Demo accounts (created by `backend/sql/seed.sql`)

| Role | Email | Password |
|---|---|---|
| Member | `user@greenloop.demo` | `user123` |
| Staff (Bangkhen branch) | `staff@greenloop.demo` | `staff123` |
| Admin | `admin@greenloop.demo` | `admin123` |

These are demo passwords — remove or change those users before any real deployment.

## Production build

```
VITE_API_URL=https://your-api.example.com/api npm run build
```
Serve the `dist/` folder, and add that site's origin to `CORS_ORIGIN` in the backend `.env`.

## Where things live

- `src/api.js` — every call to the backend, plus the mappers from database rows to what the screens display.
- `src/App.jsx` — the screens. Data loading and all actions (redeem, record recycling, admin edits) are at the top of `App()`.
- IDs shown in the UI are formatted from database ids: user `1284` ⇄ `GL-U-001284`, drop-off point `1` ⇄ `DP-001`.
