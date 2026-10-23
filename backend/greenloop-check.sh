#!/usr/bin/env bash
# GreenLoop: show folder structure + check that frontend, backend and database are connected.
#
# Usage (from the GreenLoop_connected folder):
#   bash greenloop-check.sh
#
# Optional:
#   SKIP_REGISTER=1 bash greenloop-check.sh     # don't create a test user in the database
#   API=http://localhost:4000/api bash greenloop-check.sh

API="${API:-http://localhost:4000/api}"
FRONT="${FRONT:-http://localhost:5173}"
TMP="$(mktemp)"
PASS=0; FAIL=0

green() { printf '\033[32m%s\033[0m' "$1"; }
red()   { printf '\033[31m%s\033[0m' "$1"; }

# ------------------------------------------------------------------ 1. structure
echo "=================== 1. FOLDER STRUCTURE ==================="
find . \( -name node_modules -o -name .git -o -name __MACOSX -o -name dist \) -prune -o \
     -not -name .DS_Store -not -name . -print | sed 's|^\./||' | sort | \
     awk -F/ '{ indent=""; for (i=1;i<NF;i++) indent=indent "    "; print indent "|-- " $NF }'
echo

# ------------------------------------------------------------------ helpers
# check "label" expected_status METHOD path [token] [json body]
check() {
  local label="$1" want="$2" method="$3" path="$4" token="$5" body="$6" code
  local args=(-s -o "$TMP" -w '%{http_code}' -X "$method" "$API$path")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body" ]  && args+=(-H "Content-Type: application/json" -d "$body")
  code="$(curl "${args[@]}" 2>/dev/null)"
  if [ "$code" = "$want" ]; then
    printf '  [%s] %s (HTTP %s)\n' "$(green PASS)" "$label" "$code"; PASS=$((PASS+1))
  else
    printf '  [%s] %s (expected %s, got %s)\n' "$(red FAIL)" "$label" "$want" "${code:-no response}"
    [ -s "$TMP" ] && printf '         server said: %s\n' "$(head -c 300 "$TMP")"
    FAIL=$((FAIL+1))
  fi
}

# login <email> <password>  -> prints token (empty if failed)
get_token() {
  curl -s -X POST "$API/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" 2>/dev/null | \
    sed -n 's/.*"token":"\([^"]*\)".*/\1/p'
}

# ------------------------------------------------------------------ 2. servers
echo "=================== 2. SERVERS ==================="
if curl -s -o /dev/null "$API/health" 2>/dev/null; then
  check "Backend is running  ($API/health)" 200 GET /health
else
  printf '  [%s] Backend is NOT running on %s\n' "$(red FAIL)" "$API"
  echo "         -> cd backend && npm run dev"
  FAIL=$((FAIL+1))
fi

if curl -s -o /dev/null "$FRONT" 2>/dev/null; then
  code="$(curl -s -o "$TMP" -w '%{http_code}' "$FRONT/api/health" 2>/dev/null)"
  if [ "$code" = "200" ]; then
    printf '  [%s] Frontend is running AND its /api proxy reaches the backend\n' "$(green PASS)"; PASS=$((PASS+1))
  else
    printf '  [%s] Frontend is running but /api did not reach the backend (HTTP %s)\n' "$(red FAIL)" "$code"
    echo "         -> is the backend up? is vite.config.js proxy target http://localhost:4000 ?"
    FAIL=$((FAIL+1))
  fi
else
  printf '  [%s] Frontend is NOT running on %s\n' "$(red FAIL)" "$FRONT"
  echo "         -> cd Greenloop_Final && npm run dev"
  FAIL=$((FAIL+1))
fi
echo

# ------------------------------------------------------------------ 3. database + login
echo "=================== 3. DATABASE + LOGIN (demo accounts) ==================="
USER_T="$(get_token user@greenloop.demo user123)"
STAFF_T="$(get_token staff@greenloop.demo staff123)"
ADMIN_T="$(get_token admin@greenloop.demo admin123)"
for r in USER STAFF ADMIN; do
  eval "t=\$${r}_T"
  if [ -n "$t" ]; then printf '  [%s] %s login works (database reachable, password hashes OK)\n' "$(green PASS)" "$r"; PASS=$((PASS+1))
  else printf '  [%s] %s login failed (check DB user/password in backend/.env and that seed.sql was run)\n' "$(red FAIL)" "$r"; FAIL=$((FAIL+1)); fi
done
check "Wrong password is rejected" 401 POST /auth/login "" '{"email":"user@greenloop.demo","password":"wrong"}'
echo

# ------------------------------------------------------------------ 4. register
echo "=================== 4. REGISTER ==================="
if [ -n "$SKIP_REGISTER" ]; then
  echo "  (skipped)"
else
  EMAIL="check$(date +%s)@example.com"
  check "Register new member ($EMAIL)" 201 POST /auth/register "" \
    "{\"fname\":\"Check\",\"lname\":\"Script\",\"email\":\"$EMAIL\",\"password\":\"password123\"}"
  check "Register same email again -> 409" 409 POST /auth/register "" \
    "{\"fname\":\"Check\",\"lname\":\"Script\",\"email\":\"$EMAIL\",\"password\":\"password123\"}"
  check "Register with short password -> 400" 400 POST /auth/register "" \
    '{"fname":"A","lname":"B","email":"short@example.com","password":"123"}'
  NEW_T="$(get_token "$EMAIL" password123)"
  [ -n "$NEW_T" ] && { printf '  [%s] New account can sign in\n' "$(green PASS)"; PASS=$((PASS+1)); } \
                  || { printf '  [%s] New account cannot sign in\n' "$(red FAIL)"; FAIL=$((FAIL+1)); }
  echo "  (this created one test user in your Users table; delete it with:"
  echo "   DELETE FROM greenloop.Users WHERE email LIKE 'check%@example.com';)"
fi
echo

# ------------------------------------------------------------------ 5. every endpoint the frontend calls
echo "=================== 5. ENDPOINTS THE FRONTEND USES ==================="
echo " member:"
check "GET /me"                200 GET /me "$USER_T"
check "GET /me/transactions"   200 GET /me/transactions "$USER_T"
check "GET /recycle-types"     200 GET /recycle-types "$USER_T"
check "GET /drop-off-points"   200 GET /drop-off-points "$USER_T"
check "GET /rewards"           200 GET /rewards "$USER_T"
check "GET /rewards/history"   200 GET /rewards/history "$USER_T"
echo " staff:"
check "GET /staff/members"       200 GET /staff/members "$STAFF_T"
check "GET /staff/transactions"  200 GET /staff/transactions "$STAFF_T"
check "GET /staff/redemptions"   200 GET /staff/redemptions "$STAFF_T"
echo " admin:"
for p in /admin/rewards /admin/members /admin/staff /admin/transactions /admin/redemptions /admin/stats; do
  check "GET $p" 200 GET "$p" "$ADMIN_T"
done
echo " permissions (should be blocked):"
check "Member cannot open /admin/members" 403 GET /admin/members "$USER_T"
check "No token is rejected"              401 GET /me ""
echo

# ------------------------------------------------------------------ summary
rm -f "$TMP"
echo "=================== SUMMARY ==================="
printf '  %s passed, %s failed\n' "$(green $PASS)" "$(red $FAIL)"
[ "$FAIL" -eq 0 ] && echo "  Everything is connected." || echo "  Fix the first FAIL above, then run again."
exit "$FAIL"