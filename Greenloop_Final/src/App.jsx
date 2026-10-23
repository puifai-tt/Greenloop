import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  Leaf, LayoutDashboard, MapPin, Recycle, Gift, History, Bell, UserRound,
  LogOut, Menu, X, ArrowUpRight, ArrowDownLeft, Search, Plus, Check,
  Package, Users, BarChart3, Settings, ChevronRight, Clock, Weight,
  Sprout, CircleHelp, ShieldCheck, Truck, CalendarDays, Trash2, CheckCircle2, CircleAlert, UserPlus
} from "lucide-react";
import * as api from "./api.js";
import { fmtPointId, localToday } from "./api.js";

// Handlers that talk to the backend, shared with the page components without threading props everywhere.
const ActionsCtx = createContext({});

// The material list lives in the database; App keeps this module-level reference in sync with it.
let recycleTypes = [];

function money(n) { return Number(n).toLocaleString("en-US"); }
function shortDate(date) {
  return new Date(date + "T12:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function App() {
  const [account, setAccount] = useState(null);
  const [booting, setBooting] = useState(() => Boolean(api.getToken()));
  const [loadError, setLoadError] = useState("");
  const [recycleTypeList, setRecycleTypeList] = useState([]);
  recycleTypes = recycleTypeList;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [authView, setAuthView] = useState("login");
  const [page, setPage] = useState("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [rewards, setRewards] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [members, setMembers] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedReward, setSelectedReward] = useState(null);
  const [staffTab, setStaffTab] = useState("record");
  const [newRewardName, setNewRewardName] = useState("");
  const [newRewardPoints, setNewRewardPoints] = useState("200");
  const [newRewardStock, setNewRewardStock] = useState("10");
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchAddress, setNewBranchAddress] = useState("");
  const redeemingRef = useRef(false);
  const points = account?.points ?? 0;
  const co2 = account?.co2 ?? 0;

  const toastTimer = useRef(null);
  const show = (message, error = false) => {
    setToast({ message, error });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), error ? 4200 : 2800);
  };
  const notify = (message) => show(message);
  const notifyError = (message) => show(message, true);

  // ---- loading data from the API (what each role needs) ----
  async function loadWorkspace(acct) {
    const [types, pts] = await Promise.all([api.recycleTypes(), api.dropOffPoints()]);
    setRecycleTypeList(types.map(api.mapType));
    setBranches(pts.map(api.mapBranch));
    if (acct.role === "user") {
      const [rw, rd, tx] = await Promise.all([api.rewards(), api.myRedemptions(), api.myTransactions()]);
      setRewards(rw.map(api.mapReward));
      setRedemptions(rd.map(api.mapRedemption));
      setTransactions(tx.map(api.mapTransaction));
    } else if (acct.role === "staff") {
      const [mem, tx, rd] = await Promise.all([api.staffMembers(), api.staffTransactions(), api.staffRedemptions()]);
      setMembers(mem.map(api.mapMember));
      setTransactions(tx.map(api.mapTransaction));
      setRedemptions(rd.map(api.mapRedemption));
    } else {
      const [rw, mem, st, tx, rd] = await Promise.all([api.adminRewards(), api.adminMembers(), api.adminStaff(), api.adminTransactions(), api.adminRedemptions()]);
      setRewards(rw.map(api.mapReward));
      setMembers(mem.map(api.mapMember));
      setStaffMembers(st.map(api.mapStaff));
      setTransactions(tx.map(api.mapTransaction));
      setRedemptions(rd.map(api.mapRedemption));
      try { setAdminStats(await api.adminStats()); } catch { /* the dashboard falls back to locally computed totals */ }
    }
  }
  // Re-fetch everything after a change so every screen agrees with the database. Never throws.
  async function reload() {
    if (!account) return;
    try {
      if (account.role === "user") {
        const fresh = api.mapAccount(await api.me());
        setAccount(prev => (prev ? { ...prev, ...fresh } : prev));
      }
      await loadWorkspace(account);
    } catch { /* keep showing what we have; a 401 is handled globally */ }
  }
  function resetSession() {
    setAccount(null); setPage("dashboard"); setEmail(""); setPassword(""); setLoginError(""); setAuthView("login");
    setRewards([]); setTransactions([]); setRedemptions([]); setMembers([]); setStaffMembers([]); setAdminStats(null);
    setStaffTab("record"); setSearch(""); setSelectedReward(null);
  }

  // Session expired / token rejected anywhere -> back to the login screen.
  useEffect(() => {
    api.setUnauthorizedHandler(() => { api.logout(); resetSession(); show("Your session has ended. Please sign in again.", true); });
  }, []);

  // Restore a previous session from the saved token.
  useEffect(() => {
    if (!api.getToken()) { setBooting(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const u = api.mapAccount(await api.me());
        await loadWorkspace(u);
        if (!cancelled) setAccount(u);
      } catch (e) {
        if (!cancelled && e.status !== 401) setLoadError(e.message);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Staff typed a User ID that isn't in the loaded list -> ask the server for that member.
  useEffect(() => {
    if (account?.role !== "staff") return;
    const id = api.parseUserId(staffTab);
    if (!id || members.some(m => m.dbId === id)) return;
    let cancelled = false;
    api.staffMember(id)
      .then(m => { if (!cancelled) setMembers(list => list.some(x => x.dbId === id) ? list : [...list, api.mapMember(m)]); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [staffTab, account, members]);

  async function login(event) {
    event.preventDefault();
    if (loggingIn) return;
    setLoggingIn(true); setLoginError("");
    try {
      const u = api.mapAccount(await api.login(email.trim(), password));
      await loadWorkspace(u);
      setAccount(u); setPage("dashboard");
    } catch (e) {
      api.logout();
      setLoginError(e.message);
    } finally {
      setLoggingIn(false);
    }
  }
  // Create the account in the database, then sign straight in with the same credentials.
  async function signUp(form) {
    await api.register(form);
    const u = api.mapAccount(await api.login(form.email, form.password));
    await loadWorkspace(u);
    setAccount(u); setPage("dashboard"); setAuthView("login");
  }
  function logout() {
    api.logout();
    resetSession();
  }

  // ---- member: redeem a reward ----
  async function redeem(reward) {
    if (redeemingRef.current) return;
    if (!reward.active || reward.stock < 1) return notifyError("This reward is currently unavailable.");
    if (points < reward.points) return notifyError("You don't have enough points yet.");
    redeemingRef.current = true;
    try {
      const res = await api.redeem(reward.id);
      setSelectedReward(null);
      notify(`Reward redeemed! Your code is ${res.redeem_code}. Pick it up at any active GreenLoop branch.`);
      await reload();
      setPage("redemptions");
    } catch (e) {
      notifyError(e.message);
      setSelectedReward(null);
      await reload(); // stock / balance may have changed under us
    } finally {
      redeemingRef.current = false;
    }
  }

  // ---- staff: record a recycling visit (points are calculated by the server) ----
  async function recordMultiWaste(items, userId) {
    const memberId = api.parseUserId(userId);
    if (!memberId) { notifyError("Enter a valid User ID first."); return false; }
    try {
      const payload = items.map(i => ({ type_id: recycleTypes.find(t => t.name === i.type)?.id, weight_kg: Number(i.weight) }));
      const res = await api.recordTransaction(memberId, payload);
      notify(`Transaction completed — ${res.transaction.total_points} points recorded for ${userId}.`);
      await reload();
      return true;
    } catch (e) {
      notifyError(e.message);
      return false;
    }
  }

  // ---- admin: rewards ----
  async function addReward(event) {
    event.preventDefault();
    if (!newRewardName.trim()) { notifyError("Enter a reward name."); return false; }
    const form = event.currentTarget;
    const presets = {"Bamboo Cutlery Set":{category:"Daily essentials",emoji:"🍴",description:"A reusable bamboo cutlery set."},"Seed Paper Bookmark":{category:"Stationery",emoji:"🌼",description:"A plantable seed-paper bookmark."},"Mini Desk Plant":{category:"Green living",emoji:"🌱",description:"A small desk plant."},"Recycled Pencil Set":{category:"Stationery",emoji:"✏️",description:"A set of recycled-material pencils."},"Foldable Shopping Bag":{category:"Daily essentials",emoji:"🛍️",description:"A compact reusable shopping bag."},"Solar Power Bank":{category:"Eco lifestyle",emoji:"🔋",description:"A premium eco-tech sample reward."}};
    const meta = presets[newRewardName.trim()] || { category: "New reward", emoji: "🎁", description: "A new reward from GreenLoop." };
    // read every form value NOW — the form element is gone after the first await
    const body = {
      name: newRewardName.trim(),
      points_required: Number(newRewardPoints),
      stock: Number(newRewardStock),
      category: form.elements.rewardCategory.value || meta.category,
      emoji: meta.emoji,
      description: form.elements.rewardDescription.value.trim() || meta.description,
      sku: form.elements.rewardSku.value.trim() || undefined,
      supplier: form.elements.rewardSupplier.value.trim() || undefined,
      storage_location: form.elements.rewardLocation.value.trim() || undefined,
      low_stock: Number(form.elements.rewardLowStock.value) || 3,
    };
    try {
      await api.adminCreateReward(body);
      setNewRewardName("");
      notify("New reward added.");
      await refreshAdminRewards();
      return true;
    } catch (e) {
      notifyError(e.message);
      return false;
    }
  }
  async function refreshAdminRewards() {
    try { setRewards((await api.adminRewards()).map(api.mapReward)); } catch { /* keep current list */ }
  }
  async function refreshBranches() {
    try { setBranches((await api.dropOffPoints()).map(api.mapBranch)); } catch { /* keep current list */ }
  }

  // Handlers used deep inside the Staff/Admin pages (via context).
  const actions = {
    async markCollected(r) {
      try {
        await api.completeRedemption(r.dbId);
        notify(`${r.id} marked as collected.`);
      } catch (e) { notifyError(e.message); }
      await reload(); // also picks up "expired" if the deadline passed while the page was open
    },
    async cancelRedemption(r) {
      if (!window.confirm(`Cancel ${r.id} (${r.reward})? The member's ${r.points} points will be refunded and the stock returned.`)) return;
      try {
        await api.cancelRedemption(r.dbId);
        notify(`${r.id} cancelled. Points refunded and stock restored.`);
      } catch (e) { notifyError(e.message); }
      await reload();
    },
    async releaseOverdue() {
      try {
        const res = await api.adminExpireOverdue();
        notify(res.cancelled ? `Released ${res.cancelled} overdue pickup${res.cancelled === 1 ? "" : "s"}; ${res.refunded_points} points refunded.` : "No overdue pickups to release.");
      } catch (e) { notifyError(e.message); }
      await reload();
    },
    async adjustStock(r, delta) {
      try {
        await api.adminUpdateReward(r.id, { stock_delta: delta });
      } catch (e) { notifyError(e.message); }
      await refreshAdminRewards();
    },
    async toggleReward(r) {
      try {
        await api.adminUpdateReward(r.id, { is_active: !r.active });
        notify(r.active ? `${r.name} deactivated.` : `${r.name} activated.`);
      } catch (e) { notifyError(e.message); }
      await refreshAdminRewards();
    },
    async deleteReward(r) {
      try {
        await api.adminDeleteReward(r.id);
        notify("Reward removed.");
      } catch (e) { notifyError(e.message); }
      await refreshAdminRewards();
    },
    async createBranch({ name, address, hours, phone, notes, acceptedTypes }) {
      try {
        const ids = acceptedTypes.map(n => recycleTypes.find(t => t.name === n)?.id).filter(Boolean);
        await api.adminCreatePoint({ name, address, hours: hours || undefined, phone: phone || undefined, notes: notes || undefined, accepted_type_ids: ids });
        notify("Drop-off point created.");
        await refreshBranches();
        return true;
      } catch (e) { notifyError(e.message); return false; }
    },
    async toggleBranch(b) {
      try {
        const res = await api.adminTogglePoint(b.dbId);
        notify(res.is_active ? `${b.name} reopened.` : `${b.name} marked as closed.`);
      } catch (e) { notifyError(e.message); }
      await refreshBranches();
    },
    async saveRecycleRate(typeId, rate) {
      if (!Number.isFinite(rate) || rate < 0) { notifyError("Enter a rate of 0 or more."); return false; }
      try {
        await api.adminUpdateRecycleType(typeId, { points_per_kg: rate });
        setRecycleTypeList((await api.recycleTypes()).map(api.mapType));
        notify("Recycling point rate updated. It applies to new transactions.");
        return true;
      } catch (e) { notifyError(e.message); return false; }
    },
  };

  if (booting) {
    return <div className="boot-screen"><div className="boot-card"><div className="brand-mark"><Leaf size={22}/></div><strong>GreenLoop</strong><span>Loading your workspace…</span></div></div>;
  }
  if (loadError && !account) {
    return <div className="boot-screen"><div className="boot-card"><div className="brand-mark"><CircleAlert size={22}/></div><strong>We couldn't load GreenLoop</strong><span>{loadError}</span><button className="primary-button" onClick={() => window.location.reload()}>Try again</button><button className="outline-button" onClick={() => { api.logout(); window.location.reload(); }}>Sign out</button></div></div>;
  }

  if (!account) {
    if (authView === "signup") return <SignUp onSubmit={signUp} onBack={() => setAuthView("login")} />;
    return <Login email={email} setEmail={setEmail} password={password} setPassword={setPassword} error={loginError} onSubmit={login} onSignUp={() => { setLoginError(""); setAuthView("signup"); }} />;
  }

  const userName = account.name;
  const menu = account.role === "user" ? [
    ["dashboard", "Overview", LayoutDashboard], ["guide", "Recycling guide", CircleHelp], ["map", "Drop-off points", MapPin],
    ["rewards", "Rewards", Gift], ["redemptions", "My redemptions", Package],
    ["history", "Activity history", History], ["profile", "My profile", UserRound]
  ] : account.role === "staff" ? [
    ["dashboard", "Branch overview", LayoutDashboard], ["record", "Record recycling", Recycle],
    ["transactions", "Today's activity", History], ["pickup", "Reward pickup", Package]
  ] : [
    ["dashboard", "Overview", LayoutDashboard], ["members", "Members & activity", Users], ["rewards", "Reward inventory", Gift],
    ["waste", "Recycle types", Recycle], ["branches", "Drop-off points", MapPin],
    ["reports", "Reports & analytics", BarChart3]
  ];

  return (
    <ActionsCtx.Provider value={actions}>
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand"><div className="brand-mark"><Leaf size={22} /></div><div><strong>GreenLoop</strong><span>Small actions, greener future</span></div><button className="icon-button close-menu" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={18}/></button></div>
        <div className="workspace-label">{account.role === "user" ? "YOUR SPACE" : account.role === "staff" ? "STAFF WORKSPACE" : "ADMIN CONSOLE"}</div>
        <nav className="nav-list">
          {menu.map(([id, label, Icon]) => <button key={id} className={`nav-item ${page === id ? "active" : ""}`} onClick={() => { setPage(id); setMobileOpen(false); }}><Icon size={18}/><span>{label}</span>{id === "redemptions" && redemptions.some(r => r.status === "Ready for pickup") && account.role === "user" ? <i className="nav-dot"/> : null}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><CircleHelp size={18}/></div><strong>Need a hand?</strong><p>Every small action makes a difference.</p><button onClick={() => notify("Contact support: hello@greenloop.demo")}>Get support <ArrowUpRight size={14}/></button></div>
          <button className="profile-mini" onClick={() => account.role === "user" ? setPage("profile") : notify(`${userName} · ${account.role}`)}><div className="avatar">{userName.split(" ").map(s=>s[0]).join("").slice(0,2)}</div><div className="profile-mini-text"><strong>{userName}</strong><span>{account.role === "user" ? "Green member" : account.role === "staff" ? (account.branch || "No branch assigned") : "Administrator"}</span></div><LogOut size={16} className="logout-icon" onClick={(e) => { e.stopPropagation(); logout(); }}/></button>
        </div>
      </aside>
      {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <main className="main-area">
        <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={20}/></button><div className="breadcrumb">Workspace <ChevronRight size={14}/> <strong>{menu.find(m => m[0] === page)?.[1] || "Overview"}</strong></div><div className="topbar-actions"><span className="today-label"><CalendarDays size={15}/> {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>{account.role !== "staff" && <button className="icon-button notification-button" onClick={() => account.role === "user" ? setPage("notifications") : notify("No new system alerts.")} aria-label="Notifications"><Bell size={18}/>{account.role === "user" && <i/>}</button>}<div className="avatar top-avatar">{userName.split(" ").map(s=>s[0]).join("").slice(0,2)}</div></div></header>
        <div className="page-content">
          {account.role === "user" && <UserPages page={page} setPage={setPage} points={points} co2={co2} transactions={transactions} rewards={rewards} redemptions={redemptions} redeem={redeem} selectedReward={selectedReward} setSelectedReward={setSelectedReward} search={search} setSearch={setSearch} account={account} branches={branches} notify={notify}/>}
          {account.role === "staff" && <StaffPages page={page} setPage={setPage} transactions={transactions} redemptions={redemptions} members={members} recordMultiWaste={recordMultiWaste} staffTab={staffTab} setStaffTab={setStaffTab} branchName={account.branch} branchId={account.branchId} notify={notify}/>}
          {account.role === "admin" && <AdminPages page={page} setPage={setPage} recycleTypeList={recycleTypeList} redemptions={redemptions} rewards={rewards} newRewardName={newRewardName} setNewRewardName={setNewRewardName} newRewardPoints={newRewardPoints} setNewRewardPoints={setNewRewardPoints} newRewardStock={newRewardStock} setNewRewardStock={setNewRewardStock} addReward={addReward} transactions={transactions} members={members} staffMembers={staffMembers} branches={branches} newBranchName={newBranchName} setNewBranchName={setNewBranchName} newBranchAddress={newBranchAddress} setNewBranchAddress={setNewBranchAddress} notify={notify} stats={adminStats}/>}
        </div>
        <footer className="footer"><span>© 2026 GreenLoop</span><span><span className="status-dot"/> Making sustainability a little easier, every day.</span></footer>
      </main>
      {toast && <div className={`toast ${toast.error ? "toast-error" : ""}`} role="status">{toast.error ? <CircleAlert size={18}/> : <CheckCircle2 size={18}/>}{toast.message}</div>}
    </div>
    </ActionsCtx.Provider>
  );
}

function LoginArt() {
  return <div className="login-art"><div className="login-art-content"><div className="brand brand-light"><div className="brand-mark"><Leaf size={23}/></div><div><strong>GreenLoop</strong><span>Small actions, greener future</span></div></div><div className="art-copy"><div className="eyebrow light-eyebrow"><Sprout size={15}/> YOUR EVERYDAY ECO COMPANION</div><h1>A little greener.<br/><em>A lot better.</em></h1><p>Turn your recycling habits into meaningful rewards. Every bottle, can and piece of paper can make a difference.</p><div className="art-stats"><div><strong>♻️</strong><span>Recycle</span></div><div><strong>🌱</strong><span>Earn points</span></div><div><strong>🎁</strong><span>Get rewards</span></div></div></div><div className="art-leaf leaf-one">✳</div><div className="art-leaf leaf-two">✿</div><div className="art-footer">A cleaner community starts with you.</div></div></div>;
}
function Login({ email, setEmail, password, setPassword, error, onSubmit, onSignUp }) {
  return <div className="login-page"><LoginArt/><div className="login-panel"><div className="login-form-wrap"><div className="mobile-login-brand brand"><div className="brand-mark"><Leaf size={22}/></div><div><strong>GreenLoop</strong><span>Small actions, greener future</span></div></div><div className="login-heading"><div className="eyebrow">WELCOME TO GREENLOOP</div><h2>Let's make a difference.</h2><p>Sign in to continue to your workspace.</p></div><form onSubmit={onSubmit} className="login-form"><label htmlFor="email">Email address</label><input id="email" type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/><label htmlFor="password">Password</label><input id="password" type="password" placeholder="Enter your password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/>{error && <div className="form-error">{error}</div>}<button className="primary-button login-submit" type="submit">Sign in <ChevronRight size={17}/></button></form><div className="login-divider"><span>New to GreenLoop?</span></div><button className="outline-button login-signup" type="button" onClick={onSignUp}><UserPlus size={16}/> Sign up</button><div className="demo-box"><div className="demo-heading"><ShieldCheck size={17}/><strong>Demo access</strong><span>For prototype only</span></div><p>Use one of these accounts to preview each role.</p><div className="demo-account"><span className="role-chip user-chip">USER</span><code>user@greenloop.demo</code><button onClick={()=>{setEmail("user@greenloop.demo");setPassword("user123");}}>Use</button></div><div className="demo-account"><span className="role-chip staff-chip">STAFF</span><code>staff@greenloop.demo</code><button onClick={()=>{setEmail("staff@greenloop.demo");setPassword("staff123");}}>Use</button></div><div className="demo-account"><span className="role-chip admin-chip">ADMIN</span><code>admin@greenloop.demo</code><button onClick={()=>{setEmail("admin@greenloop.demo");setPassword("admin123");}}>Use</button></div><div className="demo-password">Passwords: <code>user123</code> / <code>staff123</code> / <code>admin123</code></div></div><p className="login-legal">Prototype only · Demo data is stored in this browser.</p></div></div></div>;
}

function SignUp({ onSubmit, onBack }) {
  const [form, setForm] = useState({ fname: "", lname: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const fname = form.fname.trim(), lname = form.lname.trim(), email = form.email.trim();
    if (!fname || !lname) return setError("Please enter your first and last name.");
    if (form.password.length < 8) return setError("Password must be at least 8 characters.");
    if (form.password !== form.confirm) return setError("The two passwords don't match.");
    setBusy(true); setError("");
    try {
      await onSubmit({ fname, lname, email, password: form.password });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return <div className="login-page"><LoginArt/><div className="login-panel"><div className="login-form-wrap"><div className="mobile-login-brand brand"><div className="brand-mark"><Leaf size={22}/></div><div><strong>GreenLoop</strong><span>Small actions, greener future</span></div></div><div className="login-heading"><div className="eyebrow">JOIN GREENLOOP</div><h2>Create your account.</h2><p>Sign up to start earning points for every item you recycle.</p></div><form onSubmit={submit} className="login-form"><div className="signup-name-row"><div><label htmlFor="su-fname">First name</label><input id="su-fname" type="text" placeholder="Somchai" value={form.fname} onChange={set("fname")} required maxLength={50} autoComplete="given-name"/></div><div><label htmlFor="su-lname">Last name</label><input id="su-lname" type="text" placeholder="Jaidee" value={form.lname} onChange={set("lname")} required maxLength={50} autoComplete="family-name"/></div></div><label htmlFor="su-email">Email address</label><input id="su-email" type="email" placeholder="you@example.com" value={form.email} onChange={set("email")} required autoComplete="username"/><label htmlFor="su-password">Password</label><input id="su-password" type="password" placeholder="At least 8 characters" value={form.password} onChange={set("password")} required minLength={8} autoComplete="new-password"/><label htmlFor="su-confirm">Confirm password</label><input id="su-confirm" type="password" placeholder="Re-enter your password" value={form.confirm} onChange={set("confirm")} required autoComplete="new-password"/>{error && <div className="form-error signup-error">{error}</div>}<button className="primary-button login-submit" type="submit" disabled={busy}>{busy ? "Creating account…" : "Create account"} <ChevronRight size={17}/></button></form><div className="login-divider"><span>Already have an account?</span></div><button className="outline-button login-signup" type="button" onClick={onBack} disabled={busy}>Back to sign in</button><p className="login-legal">Your password is stored securely as a one-way hash.</p></div></div></div>;
}

function PageHeader({ eyebrow, title, subtitle, action }) {
  return <div className="page-header"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}
function periodLabel(date, period) {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(date || "Unknown date");
  if (period === "day") return d.toLocaleDateString("en-GB", {day:"2-digit",month:"short"});
  if (period === "month") return d.toLocaleDateString("en-GB", {month:"short",year:"2-digit"});
  if (period === "year") return String(d.getFullYear());
  const start = new Date(d); start.setDate(d.getDate() - ((d.getDay()+6)%7));
  return `Week of ${start.toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}`;
}
function PeriodToggle({value,onChange}) { return <div className="chart-period-toggle" role="group" aria-label="Chart time period">{[["day","Day"],["week","Week"],["month","Month"],["year","Year"]].map(([v,label])=><button type="button" key={v} className={value===v?"selected":""} onClick={()=>onChange(v)}>{label}</button>)}</div>; }
function MaterialBars({transactions}) {
  const [period,setPeriod]=useState("month"); const [hovered,setHovered]=useState(null);
  const now=new Date(); now.setHours(0,0,0,0);
  const filtered=transactions.filter(t=>{
    const d=new Date(`${t.date}T12:00:00`); if(Number.isNaN(d.getTime())) return false;
    if(period==="day") return d.toDateString()===now.toDateString();
    if(period==="week"){const start=new Date(now);start.setDate(now.getDate()-((now.getDay()+6)%7));return d>=start&&d<=now;}
    if(period==="month") return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();
    return d.getFullYear()===now.getFullYear();
  });
  const rows=recycleTypes.map(type=>{
    const matching=[]; let weight=0,points=0,co2=0;
    filtered.forEach(t=>{
      const items=t.materials?.length?t.materials:[{type:recycleTypes.find(rt=>String(t.items||"").includes(rt.name))?.name||"Plastic bottles",weight:Number(t.weight)||0}];
      items.filter(i=>i.type===type.name).forEach(i=>{const kg=Number(i.weight)||0;weight+=kg;points+=kg*type.points;co2+=kg*type.co2;matching.push({id:t.id,date:t.date,userId:t.userId||"GL-U-001284",point:t.point,weight:kg});});
    });
    return {...type,weight,points:Math.round(points),co2:Number(co2.toFixed(2)),records:matching.length,matching};
  });
  const max=Math.max(1,...rows.map(r=>r.weight));
  const labels={day:"Today",week:"This week",month:"This month",year:"This year"};
  return <div className="chart-widget material-breakdown-chart"><div className="chart-toolbar"><span>Weight by material · {labels[period]} · kg</span><PeriodToggle value={period} onChange={setPeriod}/></div><div className="material-chart-summary"><div><span>Total recycled</span><strong>{rows.reduce((s,r)=>s+r.weight,0).toFixed(2)} <small>kg</small></strong></div><div><span>Material types</span><strong>{rows.filter(r=>r.weight>0).length}<small> / 5</small></strong></div><div><span>Points earned</span><strong>{money(rows.reduce((s,r)=>s+r.points,0))}<small> pts</small></strong></div></div><div className="material-bars detailed-bars material-type-bars">{rows.map(r=><div className={`bar-row material-type-row ${hovered===r.name?"material-type-hovered":""}`} key={r.name} tabIndex="0" onMouseEnter={()=>setHovered(r.name)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(r.name)} onBlur={()=>setHovered(null)}><div className="material-type-label"><span className="material-type-icon" style={{background:r.color}}>{r.emoji}</span><div><strong>{r.name}</strong><small>{r.records} record{r.records===1?"":"s"}</small></div><b>{r.weight.toFixed(2)} kg</b></div><div className="bar-track material-type-track"><div className="bar-fill" style={{width:`${r.weight/max*100}%`,background:`linear-gradient(90deg, ${r.color}, #3a8b58)`}}/></div>{hovered===r.name&&<div className="chart-tooltip material-type-tooltip"><strong>{r.emoji} {r.name}</strong><span>Total weight: {r.weight.toFixed(2)} kg</span><span>Transactions: {r.records}</span><span>Points issued: {money(r.points)} pts</span><span>Estimated CO₂ avoided: {r.co2.toFixed(2)} kg</span>{r.matching.slice(0,5).map(t=><span key={`${t.id}-${t.date}`}>{t.date} · {t.userId} · {t.weight.toFixed(2)} kg</span>)}{r.matching.length>5&&<span>+ {r.matching.length-5} more records</span>}{!r.records&&<span>No records in this period yet</span>}</div>}</div>)}</div><div className="chart-footnote">Hover or focus each material bar to inspect its weight, points, CO₂ estimate and sample contributing records. Sample data is for demonstration.</div></div>;
}
function ImpactBars({transactions}) {
  const [period,setPeriod]=useState("month");const [hovered,setHovered]=useState(null);
  const groups=transactions.reduce((acc,t)=>{const key=periodLabel(t.date,period);if(!acc[key])acc[key]={label:key,sortKey:t.date,co2:0,weight:0,points:0,records:0,items:[]};const g=acc[key];g.sortKey=t.date<g.sortKey?t.date:g.sortKey;g.co2+=Number(t.co2)||0;g.weight+=Number(t.weight)||0;g.points+=Number(t.points)||0;g.records++;g.items.push(t);return acc;},{});
  const rows=Object.values(groups).sort((a,b)=>a.sortKey.localeCompare(b.sortKey)).slice(-10);const max=Math.max(.1,...rows.map(g=>g.co2));
  return <div className="chart-widget"><div className="chart-toolbar"><span>Estimated CO₂ avoided · kg</span><PeriodToggle value={period} onChange={setPeriod}/></div>{rows.length?<div className="impact-bars detailed-impact">{rows.map(g=><div className={`impact-bar-item ${hovered===g.label?"bar-hovered":""}`} key={g.label} onMouseEnter={()=>setHovered(g.label)} onMouseLeave={()=>setHovered(null)} tabIndex="0" title={`${g.label}: ${g.co2.toFixed(2)} kg CO₂, ${g.weight.toFixed(2)} kg recycled, ${g.records} records`}><div className="impact-bar" style={{height:`${Math.max(8,g.co2/max*100)}%`}}/><span>{g.label}</span><small>{g.co2.toFixed(2)}</small>{hovered===g.label&&<div className="chart-tooltip impact-tooltip"><strong>{g.label}</strong><span>CO₂ avoided: {g.co2.toFixed(2)} kg</span><span>Waste collected: {g.weight.toFixed(2)} kg</span><span>Transactions: {g.records}</span><span>Points issued: {money(g.points)}</span>{g.items.slice(0,3).map(t=><span key={t.id}>{t.id} · {t.date} · {Number(t.co2||0).toFixed(2)} kg CO₂</span>)}</div>}</div>)}</div>:<p className="muted">No impact data yet.</p>}<div className="chart-footnote">Hover or focus a column for the exact totals and included records.</div></div>;
}

function StatCard({ label, value, unit, trend, icon: Icon, tone = "green" }) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={20}/></div><div className="stat-label">{label}</div><div className="stat-value">{value}<small>{unit}</small></div>{trend && <div className="stat-trend"><ArrowUpRight size={14}/>{trend}</div>}</div>;
}
function SectionTitle({ title, link, onClick }) { return <div className="section-title"><h3>{title}</h3>{link && <button className="text-link" onClick={onClick}>{link}<ChevronRight size={15}/></button>}</div>; }
function UserPages({ page, setPage, points, co2, transactions, rewards, redemptions, redeem, selectedReward, setSelectedReward, search, setSearch, account, branches, notify }) {
  const [mapFilter, setMapFilter] = useState("All points");
  const [selectedPoint, setSelectedPoint] = useState("DP-001");
  const [pointDetailsOpen, setPointDetailsOpen] = useState(true);
  const defaultMapPoints = [{id:"DP-001",x:24,y:28,name:"Green Loop Bangkhen",address:"Near the main campus entrance",hours:"08:30–18:00",phone:"02-555-0101",acceptedTypes:recycleTypes.map(t=>t.name),notes:"Main campus drop-off point",active:true},{id:"DP-002",x:62,y:42,name:"Green Loop Kaset",address:"Community learning centre",hours:"09:00–17:00",phone:"02-555-0102",acceptedTypes:recycleTypes.slice(0,4).map(t=>t.name),notes:"E-waste is not accepted here",active:true},{id:"DP-003",x:44,y:68,name:"Green Loop Ladprao",address:"Ladprao community hub",hours:"Temporarily unavailable",phone:"02-555-0103",acceptedTypes:recycleTypes.slice(0,4).map(t=>t.name),notes:"Temporarily closed for maintenance",active:false},{id:"DP-004",x:78,y:76,name:"Green Loop Ratchayothin",address:"Ratchayothin green space",hours:"09:00–18:00",phone:"02-555-0104",acceptedTypes:recycleTypes.map(t=>t.name),notes:"Community collection point",active:true}];
  const mapPoints = (branches?.length ? branches : defaultMapPoints).map((b,i)=>({...defaultMapPoints.find(d=>d.id===b.id),...b,x:defaultMapPoints[i%defaultMapPoints.length].x,y:defaultMapPoints[i%defaultMapPoints.length].y}));
  const selectedMapPoint = mapPoints.find(p=>p.id===selectedPoint) || mapPoints[0];
  const activeRewards = rewards.filter(r => r.active).sort((a,b)=>a.points-b.points);
  const filteredRewards = activeRewards.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || r.category.toLowerCase().includes(search.toLowerCase()));
  const completedWeight = transactions.reduce((sum, t) => sum + Number(t.weight), 0);
  if (page === "dashboard") return <><PageHeader eyebrow="YOUR GREEN JOURNEY" title={`Hello, ${account.name.split(" ")[0]} 🌿`} subtitle="Every little action adds up. Here's how you're doing." action={<button className="primary-button" onClick={()=>setPage("map")}><MapPin size={16}/> Find a drop-off point</button>}/><div className="welcome-banner"><div className="welcome-copy"><div className="banner-kicker">YOUR IMPACT IS GROWING</div><h2>You're helping make<br/>the world a little greener.</h2><p>Keep recycling to unlock more rewards and build a healthier planet.</p><button className="banner-button" onClick={()=>setPage("rewards")}>Explore rewards <ArrowUpRight size={15}/></button></div><div className="banner-illustration"><div className="sun-shape"/><div className="hill hill-back"/><div className="hill hill-front"/><div className="plant-emoji">🌱</div><div className="floating-leaf">✦</div></div></div><div className="stats-grid"><StatCard label="Available points" value={money(points)} unit=" pts" trend="Ready to use" icon={Sprout}/><StatCard label="CO₂ saved" value={co2.toFixed(2)} unit=" kg" trend="Your positive impact" icon={Leaf} tone="mint"/><StatCard label="Recycling visits" value={transactions.length} unit="" trend="Keep it going" icon={Recycle} tone="yellow"/><StatCard label="Total recycled" value={completedWeight.toFixed(1)} unit=" kg" trend="Across all visits" icon={Weight} tone="blue"/></div><div className="user-shortcuts"><button className="user-shortcut guide-shortcut" onClick={()=>setPage("guide")}><span className="shortcut-art">♻️</span><span><strong>Recycling guide</strong><small>Learn how to prepare all 5 material types</small></span><ChevronRight size={18}/></button><button className="user-shortcut dropoff-shortcut" onClick={()=>setPage("map")}><span className="shortcut-art">📍</span><span><strong>Drop-off points</strong><small>Find an active location near you</small></span><ChevronRight size={18}/></button></div><div className="analytics-grid"><section className="panel chart-panel"><SectionTitle title="What you recycled"/><p className="muted small-muted">Total weight by material type</p><MaterialBars transactions={transactions}/></section><section className="panel chart-panel"><SectionTitle title="Your impact over time"/><p className="muted small-muted">Estimated CO₂ avoided over time</p><ImpactBars transactions={transactions}/></section></div><div className="content-grid"><section className="panel"><SectionTitle title="Recent activity" link="View all" onClick={()=>setPage("history")}/><TransactionList transactions={transactions.slice(0,3)}/></section><section className="panel impact-panel"><SectionTitle title="Your impact, in perspective"/><div className="impact-visual"><div className="impact-circle"><Leaf size={27}/><strong>{co2.toFixed(1)}</strong><span>kg CO₂ saved</span></div></div><p className="muted centered">Your recycling helps conserve resources and reduce waste sent to landfill.</p><button className="outline-button full-width" onClick={()=>setPage("history")}>See your activity <ArrowUpRight size={15}/></button></section></div><section className="panel rewards-preview"><SectionTitle title="Rewards you might like" link="Browse all rewards" onClick={()=>setPage("rewards")}/><RewardGrid rewards={activeRewards.slice(0,3)} points={points} setSelectedReward={setSelectedReward}/></section>{selectedReward && <RewardModal reward={selectedReward} points={points} onClose={()=>setSelectedReward(null)} onRedeem={()=>redeem(selectedReward)}/>}</>;
  if (page === "map") return <><PageHeader eyebrow="FIND YOUR NEAREST LOOP" title="Drop-off points" subtitle="Choose any active GreenLoop point that's convenient for you."/><div className="map-layout"><section className="mock-map"><div className="map-grid"/><div className="map-river"/><div className="map-park park-a"/><div className="map-park park-b"/><div className="map-road road-a"/><div className="map-road road-b"/><div className="map-road road-c"/><div className="map-label label-a">PHahonyothin Rd.</div><div className="map-label label-b">University area</div><div className="map-label label-c">Community park</div>{mapPoints.map(p=><button key={p.id} className={`map-pin ${p.active?"":"inactive-pin"} ${selectedPoint===p.id?"map-pin-selected":""}`} style={{left:`${p.x}%`,top:`${p.y}%`}} title={p.name} onClick={()=>{setSelectedPoint(p.id);setPointDetailsOpen(true)}} aria-label={`Select ${p.name}`}><MapPin size={18}/></button>)}{selectedMapPoint && pointDetailsOpen && <div className="map-selected-card detail-rich"><button className="point-detail-close" onClick={()=>setPointDetailsOpen(false)} aria-label="Close details"><X size={15}/></button><span className="eyebrow">DROP-OFF POINT DETAILS</span><strong>{selectedMapPoint.name}</strong><span>{selectedMapPoint.address}</span><div className="point-detail-line"><Clock size={14}/><div><small>Opening hours</small><b>{selectedMapPoint.hours||"Hours not provided"}</b></div></div><div className="point-detail-line"><Clock size={14}/><div><small>Contact number</small><b>{selectedMapPoint.phone||"Contact number not provided"}</b></div></div><div className="point-detail-line"><Recycle size={14}/><div><small>Accepted materials</small><b>{(selectedMapPoint.acceptedTypes||recycleTypes.slice(0,4).map(t=>t.name)).join(", ")}</b></div></div>{selectedMapPoint.notes&&<p className="point-notes">{selectedMapPoint.notes}</p>}<span className={`status-pill ${selectedMapPoint.active?"status-active":"status-inactive"}`}>{selectedMapPoint.active?"Open for drop-off":"Currently inactive"}</span></div>}<div className="map-legend"><span><i className="legend-active"/> Active point</span><span><i className="legend-inactive"/> Inactive point</span></div><div className="map-stamp">ILLUSTRATIVE MAP · NOT TO SCALE</div></section><section className="point-list-panel"><div className="point-list-header"><h3>All locations</h3><select value={mapFilter} onChange={e=>setMapFilter(e.target.value)}><option>All points</option><option>Active only</option><option>Inactive only</option></select></div>{mapPoints.filter(p=>mapFilter==="All points"||(mapFilter==="Active only"?p.active:!p.active)).map(p=><div className={`point-card ${selectedPoint===p.id?"point-card-selected":""}`} key={p.id} onClick={()=>{setSelectedPoint(p.id);setPointDetailsOpen(true)}} role="button" tabIndex="0"><div className={`point-icon ${p.active?"":"point-muted"}`}><MapPin size={19}/></div><div className="point-info"><strong>{p.name}</strong><span>{p.address}</span><small><Clock size={12}/>{p.hours}</small></div><span className={`status-pill ${p.active?"status-active":"status-inactive"}`}>{p.active?"Active":"Inactive"}</span></div>)}</section></div><div className="note-strip"><CircleHelp size={17}/><span>The map is illustrative and not to scale. Names, opening hours and accepted materials come from GreenLoop.</span></div></>;
  if (page === "rewards") return <><PageHeader eyebrow="A LITTLE THANK-YOU" title="Rewards store" subtitle="Turn your recycling points into something lovely." action={<div className="points-pill"><Sprout size={17}/><strong>{money(points)}</strong> pts available</div>}/><div className="store-toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search rewards..."/></div><span>{filteredRewards.length} rewards available</span></div>{filteredRewards.length ? <RewardGrid rewards={filteredRewards} points={points} setSelectedReward={setSelectedReward}/> : <EmptyState icon={Gift} title="No rewards found" text="Try another search or check back later."/>}{selectedReward && <RewardModal reward={selectedReward} points={points} onClose={()=>setSelectedReward(null)} onRedeem={()=>redeem(selectedReward)}/>}<div className="note-strip"><Bell size={17}/><span>After redeeming, collect your reward at any active GreenLoop branch within one month. Points are not returned if the pickup period expires.</span></div></>;
  if (page === "redemptions") return <><PageHeader eyebrow="YOUR REWARD JOURNEY" title="My redemptions" subtitle="Keep track of rewards you've claimed and remember to collect them."/><div className="reminder-banner"><div className="reminder-icon"><Bell size={20}/></div><div><strong>A little reminder</strong><p>Rewards must be collected within one month of redemption. Please show your redemption ID to staff when you pick up your item.</p></div></div><section className="panel"><SectionTitle title="Redemption history"/>{redemptions.length ? <div className="redemption-list">{redemptions.map(r=><div className="redemption-row" key={r.id}><div className="reward-emoji small-emoji">{r.emoji}</div><div className="redemption-info"><strong>{r.reward}</strong><span>{r.id} · Redeemed {shortDate(r.date)}</span><small><MapPin size={12}/>{r.pickup}</small></div><div className="redemption-right"><span className={`status-pill ${r.status==="Collected"?"status-collected":r.status==="Ready for pickup"?"status-active":"status-inactive"}`}>{r.status}</span><strong>{money(r.points)} pts</strong></div></div>)}</div>:<EmptyState icon={Package} title="No redemptions yet" text="Your claimed rewards will show up here."/>}</section></>;
  if (page === "history") return <><PageHeader eyebrow="EVERY STEP COUNTS" title="Activity history" subtitle="A record of your recycling visits and the impact you've made."/><div className="stats-grid compact-stats"><StatCard label="Total visits" value={transactions.length} icon={Recycle}/><StatCard label="Points earned" value={money(transactions.reduce((s,t)=>s+t.points,0))} unit=" pts" icon={Sprout} tone="mint"/><StatCard label="CO₂ saved" value={co2.toFixed(2)} unit=" kg" icon={Leaf} tone="yellow"/></div><section className="panel"><SectionTitle title="Recycling transactions"/><TransactionList transactions={transactions} showPoint/></section></>;
  if (page === "guide") return <><PageHeader eyebrow="RECYCLE WITH CONFIDENCE" title="Recycling guide" subtitle="A practical step-by-step guide to preparing common materials before drop-off."/><div className="guide-intro panel"><div className="guide-icon-large">♻️</div><div><h3>Before you bring your recyclables</h3><p>Keep materials clean, dry and separated. Local branch rules can vary, so check accepted materials at your chosen drop-off point.</p></div></div><div className="guide-grid">{[{emoji:"🧴",title:"Plastic bottles",steps:["Empty all liquid and give the bottle a quick rinse.","Remove leftover food or drink; let it dry.","Flatten bottles where practical and keep caps separate if the branch asks.","Do not include chemical containers or heavily contaminated plastic."]},{emoji:"📦",title:"Paper & cardboard",steps:["Keep paper dry and free from grease or food.","Flatten boxes to save space.","Remove plastic wrap, foam and tape where easy to do.","Do not mix wet tissues or oily pizza boxes with clean paper."]},{emoji:"🥫",title:"Aluminium cans",steps:["Empty the can and rinse if sticky.","Allow it to dry before storing.","Avoid sharp edges and do not crush if the branch requests intact cans.","Do not put batteries or pressurised containers in this category."]},{emoji:"🍾",title:"Glass bottles",steps:["Empty and rinse the bottle.","Keep broken glass separate and tell staff before handing it over.","Do not mix ceramics, mirrors or window glass unless accepted.","Carry glass carefully in a sturdy container."]},{emoji:"🔋",title:"Small e-waste",steps:["Check the selected branch accepts small e-waste before travelling.","Keep batteries and electronics separate from ordinary recyclables.","Cover exposed battery terminals if possible and prevent short circuits.","Do not bring swollen, leaking or damaged batteries; ask staff for safe guidance."]}].map(g=><section className="panel guide-card" key={g.title}><div className="guide-card-heading"><span>{g.emoji}</span><div><h3>{g.title}</h3><p>Accepted only when branch rules allow</p></div></div><ol>{g.steps.map((step,i)=><li key={i}>{step}</li>)}</ol></section>)}</div><div className="note-strip"><CircleHelp size={16}/><span>Safety first: never bring leaking, hazardous, medical, chemical or unknown materials into ordinary recycling bins. Ask branch staff if unsure.</span></div></>;
  if (page === "notifications") return <><PageHeader eyebrow="STAY IN THE LOOP" title="Notifications" subtitle="Updates about your points, recycling activity and rewards."/><section className="panel notification-list"><div className="notification-entry"><div className="notification-entry-icon"><Recycle size={18}/></div><div><strong>Recycling transaction confirmed</strong><p>Your recent recycling activity has been recorded. Check Activity history for the weight and points summary.</p><small>Today · Demo notification</small></div><span className="status-pill status-active">New</span></div><div className="notification-entry"><div className="notification-entry-icon"><Gift size={18}/></div><div><strong>Remember to collect your reward</strong><p>Pick up redeemed rewards within 1 month of redemption. Expired pickup rights do not return the points.</p><small>Reminder · Important</small></div><span className="status-pill status-active">Reminder</span></div><div className="notification-entry"><div className="notification-entry-icon"><Sprout size={18}/></div><div><strong>Your points balance</strong><p>You currently have {money(points)} points available to redeem.</p><small>Account update</small></div></div></section><div className="note-strip"><Bell size={16}/><span>These are illustrative prototype notifications. Live notifications require backend events and timestamps.</span></div></>;
  if (page === "profile") return <><PageHeader eyebrow="YOUR ACCOUNT" title="My profile" subtitle="Your GreenLoop membership details."/><section className="panel profile-panel"><div className="profile-large"><div className="avatar avatar-large">{account.name.split(" ").map(s=>s[0]).join("").slice(0,2)}</div><div><h3>{account.name}</h3><span className="member-label"><CheckCircle2 size={14}/> GreenLoop member</span></div></div><div className="profile-fields"><div><span>USER ID</span><strong className="member-id">{account.userId}</strong></div><div><span>Full name</span><strong>{account.name}</strong></div><div><span>Email address</span><strong>{account.email}</strong></div><div><span>Member since</span><strong>{account.joined?shortDate(account.joined):"—"}</strong></div><div><span>Membership</span><strong>Green member</strong></div><div><span>Available points</span><strong>{money(points)} pts</strong></div></div><div className="note-strip"><ShieldCheck size={17}/><span>Your profile is loaded from the GreenLoop database. Ask an administrator if any of your details need to change.</span></div></section></>;
  return <EmptyState icon={LayoutDashboard} title="Page not found" text="Choose a page from the navigation."/>; 
}

function TransactionList({ transactions, showPoint = false }) {
  if (!transactions.length) return <EmptyState icon={Recycle} title="No activity yet" text="Your recycling activity will appear here." />;
  return <div className="transaction-list">{transactions.map(t=><div className="transaction-row" key={t.id}><div className="transaction-symbol"><Recycle size={18}/></div><div className="transaction-info"><strong>{t.items}</strong><span>{t.id}{t.userId ? ` · User ${t.userId}` : ""} · {shortDate(t.date)}{showPoint ? ` · ${t.point}` : ""}</span></div><div className="transaction-weight">{Number(t.weight).toFixed(1)} kg</div><div className="transaction-points"><strong>+{t.points}</strong><span>points</span></div><span className="status-pill status-collected">{t.status}</span></div>)}</div>;
}
function RewardGrid({ rewards, points, setSelectedReward }) {
  return <div className="reward-grid">{rewards.map(r=><article className="reward-card" key={r.id}><div className={`reward-art reward-art-${r.id%4}`}><span className="reward-emoji">{r.emoji}</span><span className="reward-category">{r.category}</span></div><div className="reward-card-body"><h3>{r.name}</h3><p>{r.description}</p><div className="reward-card-bottom"><div><strong>{money(r.points)}</strong><span> pts</span><small>{r.stock} left</small></div><button className="primary-button small-button" disabled={points < r.points || r.stock < 1} title={points<r.points?`Need ${r.points-points} more points`:r.stock<1?"Out of stock":"Redeem this reward"} onClick={()=>setSelectedReward(r)}>{r.stock<1?"Out of stock":points < r.points ? "Need more pts" : "Redeem"}</button></div></div></article>)}</div>;
}
function RewardModal({ reward, points, onClose, onRedeem }) {
  return <div className="modal-backdrop" onClick={onClose}><div className="modal-card" onClick={e=>e.stopPropagation()}><button className="modal-close icon-button" onClick={onClose}><X size={18}/></button><div className="modal-art">{reward.emoji}</div><div className="eyebrow">REWARD DETAILS</div><h2>{reward.name}</h2><p>{reward.description}</p><div className="modal-meta"><span>Cost</span><strong>{money(reward.points)} pts</strong></div><div className="modal-meta"><span>Your balance</span><strong>{money(points)} pts</strong></div><div className="modal-note"><Clock size={15}/> Collect within one month at any active branch.</div><button className="primary-button full-width" disabled={points<reward.points||reward.stock<1} onClick={onRedeem}>{points<reward.points?"Not enough points":reward.stock<1?"Out of stock":"Confirm redemption"} <ChevronRight size={16}/></button></div></div>;
}
function EmptyState({ icon: Icon, title, text }) { return <div className="empty-state"><div><Icon size={23}/></div><strong>{title}</strong><p>{text}</p></div>; }

function StaffPages({ page, setPage, transactions, redemptions, members, recordMultiWaste, staffTab, setStaffTab, branchName: assignedBranch, branchId, notify }) {
  const A = useContext(ActionsCtx);
  const branchName = assignedBranch || "";
  const branchTransactions = transactions; // the server already returns only this branch
  const today = localToday();
  const todays = branchTransactions.filter(t => t.date === today);
  const verifiedMember = members.find(m => m.userId === staffTab);
  const topUsers = members.map(m => ({...m, totalKg: branchTransactions.filter(t=>t.userId===m.userId).reduce((sum,t)=>sum+Number(t.weight||0),0), visits: branchTransactions.filter(t=>t.userId===m.userId).length})).sort((a,b)=>b.totalKg-a.totalKg).slice(0,5);
  const [pickupSearch, setPickupSearch] = useState("");
  if (page === "dashboard") return <><PageHeader eyebrow={(branchName || "NO BRANCH ASSIGNED").toUpperCase()} title="Branch overview" subtitle="Branch-level operations, recycling totals and member engagement." action={<span className="status-pill status-active"><i className="status-dot"/> Branch active</span>}/><div className="branch-banner"><div className="branch-banner-icon"><MapPin size={23}/></div><div><span>YOUR ASSIGNED LOCATION</span><h2>{branchName}</h2><p>Staff accounts are assigned to one branch by the administrator.</p></div><div className="branch-banner-tag"><ShieldCheck size={16}/> Assigned branch</div></div><div className="stats-grid"><StatCard label="Today's visits" value={todays.length} trend={`${new Set(todays.map(t=>t.userId).filter(Boolean)).size} unique members`} icon={Recycle}/><StatCard label="Today's recycled" value={todays.reduce((s,t)=>s+Number(t.weight||0),0).toFixed(2)} unit=" kg" icon={Weight} tone="mint"/><StatCard label="Points issued today" value={money(todays.reduce((s,t)=>s+Number(t.points||0),0))} unit=" pts" icon={Sprout} tone="yellow"/><StatCard label="Carbon impact" value={todays.reduce((s,t)=>s+Number(t.co2||0),0).toFixed(2)} unit=" kg CO₂" icon={Leaf} tone="blue"/></div><div className="analytics-grid"><section className="panel chart-panel"><SectionTitle title="Branch recycling mix"/><p className="muted small-muted">Collected weight by material across this branch</p><MaterialBars transactions={branchTransactions}/></section><section className="panel chart-panel"><SectionTitle title="Carbon impact"/><p className="muted small-muted">Estimated CO₂ avoided by reporting period</p><ImpactBars transactions={branchTransactions}/><div className="staff-rank-inline"><SectionTitle title="Top recycling members"/><p className="muted small-muted">Ranked by total kilograms recorded at this branch.</p><div className="rank-list">{topUsers.map((m,i)=><div className="rank-row" key={m.userId}><span className={`rank-number rank-${i+1}`}>{i+1}</span><div className="avatar">{m.name.split(" ").map(x=>x[0]).join("").slice(0,2)}</div><div className="rank-user"><strong>{m.name}</strong><small>{m.userId} · {m.visits} visit{m.visits===1?"":"s"}</small></div><strong className="rank-weight">{m.totalKg.toFixed(2)} kg</strong></div>)}</div></div></section></div><div className="content-grid"><section className="panel"><SectionTitle title="Recent branch activity" link="View activity" onClick={()=>setPage("transactions")}/><TransactionList transactions={branchTransactions.slice(0,5)} showPoint/></section><section className="panel quick-panel"><SectionTitle title="Quick actions"/><button className="quick-action" onClick={()=>setPage("record")}><div className="quick-icon"><Recycle size={18}/></div><span><strong>Record recycling</strong><small>Weigh and register waste</small></span><ChevronRight size={17}/></button><button className="quick-action" onClick={()=>setPage("pickup")}><div className="quick-icon purple"><Package size={18}/></div><span><strong>Reward pickup</strong><small>Check deadline and confirm handover</small></span><ChevronRight size={17}/></button><button className="quick-action" onClick={()=>setPage("transactions")}><div className="quick-icon"><History size={18}/></div><span><strong>Today's activity</strong><small>Review branch records</small></span><ChevronRight size={17}/></button></section></div></>;
  if (page === "record") return <><PageHeader eyebrow="DROP-OFF WORKFLOW" title="Receive waste" subtitle="Find the member by User ID, select each material once, then review and confirm the transaction."/><div className="staff-workflow"><section className="panel record-panel"><div className="form-section-title"><div className="step-number">1</div><div><h3>User verification</h3><p>Search the member before recording any waste.</p></div></div><div className="record-form"><label htmlFor="user-id">User ID</label><div className="user-lookup"><input id="user-id" value={staffTab==="record"?"":staffTab} onChange={e=>setStaffTab(e.target.value.trim())} placeholder="e.g. GL-U-001284" required/><select aria-label="Choose a sample member" value={verifiedMember?.userId||""} onChange={e=>setStaffTab(e.target.value)}><option value="">Choose sample member…</option>{members.map(m=><option key={m.userId} value={m.userId}>{m.userId} · {m.name}</option>)}</select></div><div className="verified-user"><div className="avatar">{verifiedMember?verifiedMember.name.split(" ").map(x=>x[0]).join("").slice(0,2):"?"}</div><div><strong>{verifiedMember?verifiedMember.name:staffTab.startsWith("GL-U-")?"User not found":"Search required"}</strong><span>{verifiedMember?`${verifiedMember.userId} · ${verifiedMember.status} account · ${money(verifiedMember.points)} pts`:staffTab.startsWith("GL-U-")?"No account matches this User ID":"Enter a User ID and search"}</span></div><span className={`status-pill ${verifiedMember?.status==="Active"?"status-active":"status-inactive"}`}>{verifiedMember?.status==="Active"?"Verified":verifiedMember?"Inactive":staffTab.startsWith("GL-U-")?"Not found":"Not verified"}</span></div><label>Assigned drop-off point</label><div className="locked-field"><MapPin size={17}/><span>{branchId ? fmtPointId(branchId) : "—"} · {branchName || "No branch assigned"}</span><ShieldCheck size={16}/></div><div className="form-section-title sub-step"><div className="step-number">2</div><div><h3>Materials and weights</h3><p>Select different material types; duplicate types are not allowed.</p></div></div><MaterialEntryForm onSubmit={recordMultiWaste} userId={staffTab} userVerified={verifiedMember?.status==="Active"}/></div></section><section className="panel workflow-help"><div className="help-illustration">♻️</div><h3>Before you confirm</h3><ul><li>Verify the exact User ID and account status.</li><li>Record each material type only once.</li><li>Weight must be greater than 0 kg, with up to 2 decimals.</li><li>Review total weight, points and estimated CO₂ before confirming.</li></ul></section></div></>;
  if (page === "transactions") return <><PageHeader eyebrow="BRANCH OPERATIONS" title="Today's activity" subtitle="Recycling transactions recorded at your assigned branch."/><section className="panel"><SectionTitle title="Branch records"/><TransactionList transactions={branchTransactions} showPoint/></section></>;
  if (page === "pickup") return <><PageHeader eyebrow="REWARD HANDOVER" title="Reward pickup" subtitle="Review redemption status and deadline before handing a reward to a member."/><div className="pickup-search"><Search size={18}/><input value={pickupSearch} placeholder="Search redemption ID, member ID or reward" onChange={e=>setPickupSearch(e.target.value)}/></div><section className="panel"><SectionTitle title="Redemption queue"/>{redemptions.filter(r=>`${r.id} ${r.userId||""} ${r.reward}`.toLowerCase().includes(pickupSearch.toLowerCase())).length ? redemptions.filter(r=>`${r.id} ${r.userId||""} ${r.reward}`.toLowerCase().includes(pickupSearch.toLowerCase())).map(r=>{const deadline=r.deadline||new Date(new Date(`${r.date}T12:00:00`).setMonth(new Date(`${r.date}T12:00:00`).getMonth()+1)).toISOString().slice(0,10);const expired=r.status==="Expired";return <div className="redemption-row pickup-detail-row" key={r.id}><div className="reward-emoji small-emoji">{r.emoji||"🎁"}</div><div className="redemption-info"><strong>{r.reward}</strong><span>{r.id} · {r.userId||"Member ID not attached"} · {shortDate(r.date)}</span><small>{r.pickup||"Any active GreenLoop branch"}</small><small className={expired?"deadline-expired":"deadline-text"}>Pickup deadline: {shortDate(deadline)}</small></div><div className="redemption-right"><span className={`status-pill ${r.status==="Collected"?"status-collected":(expired||r.status==="Cancelled")?"status-inactive":"status-active"}`}>{expired?"Expired":r.status||"Ready for pickup"}</span>{r.status==="Ready for pickup"&&<button className="text-link" onClick={()=>A.markCollected(r)}>Mark collected <Check size={14}/></button>}{(r.status==="Ready for pickup"||expired)&&<button className="text-link danger-link" onClick={()=>A.cancelRedemption(r)}>Cancel and refund <X size={14}/></button>}{r.status==="Collected"&&<small>Collected: {shortDate(r.collectedAt||r.date)}</small>}</div></div>}) : <EmptyState icon={Package} title="No matching redemptions" text="Try another search or wait for a member to redeem a reward."/>}</section></>;
  return <EmptyState icon={LayoutDashboard} title="Page not found" text="Choose a page from the navigation."/>;
}

function MaterialEntryForm({ onSubmit, userId, userVerified }) {
  const [items,setItems]=useState(()=>[{type:recycleTypes[0]?.name||"",weight:""}]);
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const add=()=>{if(items.length>=5)return;const next=recycleTypes.find(t=>!items.some(i=>i.type===t.name));if(next)setItems([...items,{type:next.name,weight:""}]);};
  const update=(idx,key,val)=>setItems(items.map((it,i)=>i===idx?{...it,[key]:val}:it));
  const totalPoints=items.reduce((sum,it)=>sum+Math.round(Math.max(0,Number(it.weight)||0)*(recycleTypes.find(t=>t.name===it.type)?.points||0)),0);
  const totalCo2=items.reduce((sum,it)=>sum+Math.max(0,Number(it.weight)||0)*(recycleTypes.find(t=>t.name===it.type)?.co2||0),0);
  const valid=items.every(i=>Number(i.weight)>0&&Number(i.weight)<=500&&(!String(i.weight).includes(".")||String(i.weight).split(".")[1].length<=2))&&new Set(items.map(i=>i.type)).size===items.length;
  const submit=(e)=>{e.preventDefault();if(!userVerified){alert("User not found. Verify User ID first.");return;}if(!valid){alert("Enter a valid positive weight (maximum 500 kg per material, up to 2 decimal places) and remove duplicate material types.");return;}setConfirmed(true);};
  return <><div className="material-count-control"><label>Number of material types</label><div className="count-toggle" role="group" aria-label="Choose number of material types">{[1,2,3,4,5].map(n=><button type="button" key={n} className={items.length===n?"selected":""} onClick={()=>setItems(current=>{const next=[...current];while(next.length<n){const available=recycleTypes.find(t=>!next.some(i=>i.type===t.name));if(!available)break;next.push({type:available.name,weight:""});}return next.slice(0,n);})}>{n}</button>)}</div><small className="muted">Choose 1–5; the matching material fields appear automatically.</small></div><div className="material-entry-list">{items.map((item,idx)=><div className="material-entry" key={idx}><div className="material-entry-head"><strong>Material {idx+1}</strong>{items.length>1&&<button type="button" className="table-action danger-action" onClick={()=>setItems(items.filter((_,i)=>i!==idx))}><Trash2 size={14}/> Remove</button>}</div><label>Material type</label><select value={item.type} onChange={e=>update(idx,"type",e.target.value)}>{recycleTypes.filter(t=>t.name===item.type||!items.some((x,i)=>i!==idx&&x.type===t.name)).map(t=><option key={t.name} value={t.name}>{t.name}</option>)}</select><div className="weight-entry-row"><div><label>Measured weight</label><input type="number" min="0.01" max="500" step="0.01" value={item.weight} onChange={e=>update(idx,"weight",e.target.value)} placeholder="0.00" required/></div><div><label>Unit</label><div className="locked-field">kg</div></div></div><small className="muted">Rate: {recycleTypes.find(t=>t.name===item.type)?.points} points/kg</small></div>)}</div><div className="calculation-preview"><div><span>Total weight</span><strong>{items.reduce((s,i)=>s+Math.max(0,Number(i.weight)||0),0).toFixed(2)} kg</strong></div><div><span>Points preview</span><strong>{Math.round(totalPoints).toLocaleString()} pts</strong></div><div><span>Estimated CO₂</span><strong>{totalCo2.toFixed(2)} kg</strong></div></div>{!confirmed?<button type="button" className="primary-button full-width" disabled={!userVerified||!valid} onClick={()=>setConfirmed(true)}><Check size={17}/> Review transaction</button>:<div className="confirm-summary"><h3>Confirm transaction</h3><p>User ID: <strong>{userId}</strong></p>{items.map(i=><div className="summary-row" key={i.type}><span>{i.type} · {Number(i.weight).toFixed(2)} kg</span><strong>{Math.round(Number(i.weight)*recycleTypes.find(t=>t.name===i.type).points)} pts</strong></div>)}<div className="summary-row total-row"><span>Total: {items.reduce((s,i)=>s+Number(i.weight),0).toFixed(2)} kg</span><strong>{Math.round(totalPoints)} pts</strong></div><div className="confirm-actions"><button type="button" className="outline-button" onClick={()=>setConfirmed(false)}>Cancel</button><button type="button" className="primary-button" disabled={busy} onClick={async()=>{if(busy)return;setBusy(true);const ok=await onSubmit(items,userId);setBusy(false);if(ok){setConfirmed(false);setItems([{type:recycleTypes[0]?.name||"",weight:""}]);}}}>{busy?"Saving…":"Confirm transaction"}</button></div><small className="muted">Points and CO₂ are calculated by the server when you confirm.</small></div>}</>;
}

function AdminPages({ page, setPage, recycleTypeList, redemptions, rewards, newRewardName, setNewRewardName, newRewardPoints, setNewRewardPoints, newRewardStock, setNewRewardStock, addReward, transactions, members, staffMembers, branches, newBranchName, setNewBranchName, newBranchAddress, setNewBranchAddress, notify, stats }) {
  const A = useContext(ActionsCtx);
  const [rewardModalOpen,setRewardModalOpen] = useState(false);
  const [branchModalOpen,setBranchModalOpen] = useState(false);
  const [selectedBranchId,setSelectedBranchId] = useState(null);
  const [rewardPreset,setRewardPreset] = useState("");
  const [memberView,setMemberView] = useState("users");
  const [chartType,setChartType] = useState("bar");
  const [adminPeriod,setAdminPeriod] = useState("month");
  const [editingType,setEditingType] = useState(null);
  const [editPoints,setEditPoints] = useState("0");
  const rewardCatalog = [{name:"Bamboo Cutlery Set",category:"Daily essentials",points:300,emoji:"🍴",description:"Reusable bamboo cutlery set."},{name:"Seed Paper Bookmark",category:"Stationery",points:100,emoji:"🌼",description:"Plantable seed-paper bookmark."},{name:"Mini Desk Plant",category:"Green living",points:420,emoji:"🌱",description:"A small desk plant."},{name:"Recycled Pencil Set",category:"Stationery",points:150,emoji:"✏️",description:"Pencils made with recycled material."},{name:"Foldable Shopping Bag",category:"Daily essentials",points:220,emoji:"🛍️",description:"Reusable foldable shopping bag."},{name:"Solar Power Bank",category:"Eco lifestyle",points:900,emoji:"🔋",description:"Solar-assisted power bank."}];
  const totalKg=transactions.reduce((s,t)=>s+Number(t.weight||0),0);
  const totalCo2=transactions.reduce((s,t)=>s+Number(t.co2||0),0);
  const totalPoints=transactions.reduce((s,t)=>s+Number(t.points||0),0);
  const branchesMetrics=branches.map(b=>{const rows=transactions.filter(t=>t.point===b.name);return {...b,records:rows.length,kg:rows.reduce((s,t)=>s+Number(t.weight||0),0),co2:rows.reduce((s,t)=>s+Number(t.co2||0),0),points:rows.reduce((s,t)=>s+Number(t.points||0),0),members:new Set(rows.map(t=>t.userId).filter(Boolean)).size,redemptions:redemptions.filter(r=>r.pickupBranch===b.name||r.pickup===b.name).length};});
  const timeline = (()=>{
    const now=new Date(); now.setHours(12,0,0,0);
    const buckets=[];
    if(adminPeriod==="day"){for(let i=6;i>=0;i--){const d=new Date(now);d.setDate(now.getDate()-i);const date=d.toISOString().slice(0,10);buckets.push({key:date,label:d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"}),start:date,end:date});}}
    else if(adminPeriod==="week"){for(let i=7;i>=0;i--){const d=new Date(now);d.setDate(now.getDate()-i*7-((now.getDay()+6)%7));const start=d.toISOString().slice(0,10);const e=new Date(d);e.setDate(d.getDate()+6);buckets.push({key:start,label:`W${8-i}`,start,end:e.toISOString().slice(0,10)});}}
    else if(adminPeriod==="month"){for(let i=7;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1,12);const e=new Date(d.getFullYear(),d.getMonth()+1,0,12);buckets.push({key:`${d.getFullYear()}-${d.getMonth()}`,label:d.toLocaleDateString("en-GB",{month:"short"}),start:d.toISOString().slice(0,10),end:e.toISOString().slice(0,10)});}}
    else {for(let i=4;i>=0;i--){const y=now.getFullYear()-i;buckets.push({key:String(y),label:String(y),start:`${y}-01-01`,end:`${y}-12-31`});}}
    return buckets.map(b=>{const rows=transactions.filter(t=>t.date>=b.start&&t.date<=b.end);return {...b,kg:rows.reduce((s,t)=>s+Number(t.weight||0),0),co2:rows.reduce((s,t)=>s+Number(t.co2||0),0),records:rows.length};});
  })();
  const createBranch=async(e)=>{e.preventDefault();const form=e.currentTarget;const accepted=[...form.querySelectorAll('input[name="acceptedTypes"]:checked')].map(x=>x.value);const ok=await A.createBranch({name:newBranchName.trim(),address:newBranchAddress.trim(),hours:form.elements.branchHours.value.trim(),phone:form.elements.branchPhone.value.trim(),notes:form.elements.branchNotes.value.trim(),acceptedTypes:accepted});if(ok){setNewBranchName("");setNewBranchAddress("");setBranchModalOpen(false);}};
  const saveRecycleRate=async()=>{const t=recycleTypeList.find(x=>x.name===editingType);if(!t)return;const ok=await A.saveRecycleRate(t.id,Number(editPoints));if(ok)setEditingType(null);};
  if (page === "dashboard") return <><PageHeader eyebrow="SYSTEM-WIDE CONTROL CENTRE" title="GreenLoop overview" subtitle="A system-wide view of all branches, recycling performance, carbon savings, members and reward fulfilment."/><div className="stats-grid admin-stats"><StatCard label="Total recycled" value={(stats?stats.total_weight_kg:totalKg).toFixed(2)} unit=" kg" trend="All recorded branches" icon={Weight}/><StatCard label="Estimated CO₂ saved" value={(stats?stats.total_co2_saved:totalCo2).toFixed(2)} unit=" kg" trend="Across all sample records" icon={Leaf} tone="mint"/><StatCard label="Total transactions" value={transactions.length} trend={`${new Set(transactions.map(t=>t.userId).filter(Boolean)).size} unique members`} icon={Recycle} tone="yellow"/><StatCard label="Points issued" value={money(totalPoints)} unit=" pts" trend={`${redemptions.length} reward redemptions tracked`} icon={Sprout} tone="blue"/></div><div className="admin-overview-grid"><section className="panel"><SectionTitle title="Branch performance at a glance"/><div className="branch-metric-list">{branchesMetrics.map((b,i)=><div className="branch-metric-card" key={b.id}><div className="branch-metric-top"><div className="branch-metric-pin"><MapPin size={20}/></div><div className="branch-metric-name"><strong>{b.name}</strong><small>{b.id} · {b.address}</small></div><span className={`status-pill ${b.active?"status-active":"status-inactive"}`}>{b.active?"Open":"Closed"}</span></div><div className="branch-metric-values"><div><span>Waste collected</span><strong>{b.kg.toFixed(2)} kg</strong></div><div><span>CO₂ saved</span><strong>{b.co2.toFixed(2)} kg</strong></div><div><span>Transactions</span><strong>{b.records}</strong></div><div><span>Members served</span><strong>{b.members}</strong></div></div><button className="text-link" onClick={()=>setSelectedBranchId(b.id)}>View branch summary <ChevronRight size={14}/></button></div>)}</div></section><section className="panel admin-performance-panel"><SectionTitle title="Programme performance trend"/><div className="chart-controls"><PeriodToggle value={adminPeriod} onChange={setAdminPeriod}/><div className="chart-type-toggle" role="group" aria-label="Chart type"><button className={chartType==="bar"?"selected":""} onClick={()=>setChartType("bar")}><BarChart3 size={15}/> Bars</button><button className={chartType==="line"?"selected":""} onClick={()=>setChartType("line")}><ActivityIcon/> Line</button></div></div>{chartType==="bar"?<div className="admin-trend-bars">{timeline.map((d,i)=><div className="admin-trend-bar-wrap" key={d.date} tabIndex="0" title={`${d.date}: ${d.kg.toFixed(2)} kg recycled, ${d.co2.toFixed(2)} kg CO₂ saved, ${d.records} transactions`}><div className="admin-trend-bar" style={{height:`${Math.max(4,d.kg/Math.max(1,...timeline.map(x=>x.kg))*100)}%`}}/><span>{d.label}</span><small>{d.kg.toFixed(1)} kg</small></div>)}</div>:<svg className="admin-line-chart" viewBox="0 0 600 240" role="img" aria-label="Line chart of recycling weight over the last 8 days"><line x1="35" y1="205" x2="580" y2="205"/><line x1="35" y1="30" x2="35" y2="205"/>{[0,1,2,3,4].map(n=><line key={n} className="chart-gridline" x1="35" y1={205-n*43} x2="580" y2={205-n*43}/>)}<polyline points={timeline.map((d,i)=>`${45+i*75},${195-(d.kg/Math.max(1,...timeline.map(x=>x.kg)))*155}`).join(" ")}/>{timeline.map((d,i)=><g key={d.date} tabIndex="0"><title>{`${d.label}: ${d.kg.toFixed(2)} kg recycled, ${d.co2.toFixed(2)} kg CO₂ saved, ${d.records} transactions`}</title><circle cx={45+i*75} cy={195-(d.kg/Math.max(1,...timeline.map(x=>x.kg)))*155} r="4"/><text x={45+i*75} y="226" textAnchor="middle">{d.label}</text></g>)}</svg>}<div className="trend-summary"><span><i className="legend-dot green-dot"/> Total recycled in chart window</span><strong>{timeline.reduce((s,d)=>s+d.kg,0).toFixed(2)} kg</strong><span><i className="legend-dot blue-dot"/> Estimated carbon savings</span><strong>{timeline.reduce((s,d)=>s+d.co2,0).toFixed(2)} kg CO₂</strong></div><p className="muted small-muted">Choose Day, Week, Month or Year to regroup the system-wide recycling and carbon-savings timeline. Sample data is illustrative.</p></section></div><div className="analytics-grid"><section className="panel chart-panel"><SectionTitle title="System recycling mix"/><MaterialBars transactions={transactions}/></section><section className="panel chart-panel"><SectionTitle title="Carbon impact by period"/><ImpactBars transactions={transactions}/></section></div><div className="content-grid"><section className="panel"><SectionTitle title="Latest recycling transactions" link="Open reports" onClick={()=>setPage("reports")}/><TransactionList transactions={transactions.slice(0,5)} showPoint/></section><section className="panel"><SectionTitle title="Reward fulfilment overview"/><div className="admin-redemption-summary"><div><span>Total redemptions</span><strong>{redemptions.length}</strong></div><div><span>Awaiting pickup</span><strong>{redemptions.filter(r=>r.status==="Ready for pickup"||r.status==="Expired").length}</strong></div><div><span>Collected</span><strong>{redemptions.filter(r=>r.status==="Collected").length}</strong></div><div><span>Rewards in stock</span><strong>{rewards.reduce((s,r)=>s+Number(r.stock||0),0)}</strong></div></div>{stats&&<div className="admin-redemption-summary admin-live-stats"><div><span>Pending pickups</span><strong>{stats.pending_redemptions}</strong></div><div><span>Overdue</span><strong>{stats.overdue_redemptions}</strong></div><div><span>Member points held</span><strong>{money(stats.total_remaining_points)}</strong></div></div>}{redemptions.filter(r=>r.status==="Ready for pickup"||r.status==="Expired").length>0&&<div className="admin-pending-list">{redemptions.filter(r=>r.status==="Ready for pickup"||r.status==="Expired").slice(0,5).map(r=><div className="admin-pending-row" key={r.id}><div><strong>{r.reward}</strong><small>{r.id} · {r.userId||"Member"} · {r.status}</small></div><button className="text-link danger-link" onClick={()=>A.cancelRedemption(r)}>Cancel and refund</button></div>)}</div>}<button className="outline-button full-width admin-release-btn" onClick={()=>A.releaseOverdue()} disabled={!stats||!stats.overdue_redemptions}>Release overdue pickups{stats&&stats.overdue_redemptions?` (${stats.overdue_redemptions})`:""}</button><button className="outline-button full-width" onClick={()=>setPage("rewards")}>Manage reward inventory <ChevronRight size={15}/></button></section></div>{selectedBranchId&&(()=>{const b=branchesMetrics.find(x=>x.id===selectedBranchId);const rows=transactions.filter(t=>t.point===b?.name);return <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedBranchId(null)}}><section className="form-modal branch-detail-modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={()=>setSelectedBranchId(null)}><X size={18}/></button><span className="eyebrow">BRANCH PERFORMANCE DETAIL</span><h2>{b?.name}</h2><p className="muted">{b?.address} · {b?.hours}</p><div className="branch-detail-stats"><div><span>Total waste</span><strong>{b?.kg.toFixed(2)} kg</strong></div><div><span>CO₂ saved</span><strong>{b?.co2.toFixed(2)} kg</strong></div><div><span>Transactions</span><strong>{b?.records}</strong></div><div><span>Members served</span><strong>{b?.members}</strong></div><div><span>Points issued</span><strong>{money(b?.points||0)} pts</strong></div><div><span>Redemptions</span><strong>{b?.redemptions}</strong></div></div><h3>Recent branch transactions</h3><TransactionList transactions={rows.slice(0,6)} showPoint/><div className="modal-actions"><button className="primary-button" onClick={()=>setSelectedBranchId(null)}>Close details</button></div></section></div>})()}</>;
  if (page === "members") return <><PageHeader eyebrow="MEMBERS & OPERATIONS" title="Members and activity" subtitle="Switch between member activity and staff accounts to inspect who is using the system and where."/><div className="segmented-tabs"><button className={memberView==="users"?"selected":""} onClick={()=>setMemberView("users")}><Users size={15}/> Users</button><button className={memberView==="staff"?"selected":""} onClick={()=>setMemberView("staff")}><ShieldCheck size={15}/> Staff</button></div>{memberView==="users"?<><div className="stats-grid compact-stats"><StatCard label="Registered users" value={members.length} icon={Users}/><StatCard label="Active users" value={members.filter(m=>m.status==="Active").length} icon={CheckCircle2} tone="mint"/><StatCard label="Users with transactions" value={new Set(transactions.map(t=>t.userId).filter(Boolean)).size} icon={Recycle} tone="yellow"/><StatCard label="Total member points" value={money(members.reduce((s,m)=>s+m.points,0))} unit=" pts" icon={Sprout} tone="blue"/></div><section className="panel"><SectionTitle title="Member activity sample"/><div className="table-scroll"><table><thead><tr><th>Member</th><th>Member ID</th><th>Home branch</th><th>Points</th><th>Transactions</th><th>Total kg</th><th>Status</th></tr></thead><tbody>{members.map(m=>{const rows=transactions.filter(t=>t.userId===m.userId);return <tr key={m.userId}><td><strong>{m.name}</strong><small className="table-subline">{m.email}</small></td><td>{m.userId}</td><td>{m.branch}</td><td>{money(m.points)} pts</td><td>{rows.length}</td><td>{rows.reduce((s,t)=>s+Number(t.weight||0),0).toFixed(2)}</td><td><span className={`status-pill ${m.status==="Active"?"status-active":"status-inactive"}`}>{m.status}</span></td></tr>})}</tbody></table></div></section></>:<section className="panel"><SectionTitle title="Staff accounts"/><div className="branch-directory">{staffMembers.map(m=><div className="branch-directory-row" key={m.email}><div className="avatar">{m.name.split(" ").map(x=>x[0]).join("").slice(0,2)}</div><div className="branch-dir-info"><strong>{m.name}</strong><span>{m.email}</span><small>Assigned branch: {m.branch}</small></div><span className={`status-pill ${m.status==="Active"?"status-active":"status-inactive"}`}>{m.status}</span></div>)}</div><div className="note-strip"><ShieldCheck size={16}/><span>Staff accounts are created by an administrator and each one is assigned to a single branch.</span></div></section>}</>;
  if (page === "rewards") return <><PageHeader eyebrow="REWARD MANAGEMENT" title="Reward inventory" subtitle="Keep the reward catalogue organised, then adjust stock from each item row." action={<button className="primary-button" onClick={()=>{setRewardPreset("");setNewRewardName("");setNewRewardPoints("200");setNewRewardStock("10");setRewardModalOpen(true)}}><Plus size={16}/> Create reward</button>}/><div className="inventory-summary inventory-summary-wide"><div><span>Active rewards</span><strong>{rewards.filter(r=>r.active&&r.stock>0).length}</strong></div><div><span>Low stock</span><strong>{rewards.filter(r=>r.stock<=(r.lowStock??3)).length}</strong></div><div><span>Total stock units</span><strong>{rewards.reduce((s,r)=>s+Number(r.stock||0),0)}</strong></div><div><span>Redemptions</span><strong>{redemptions.length}</strong></div></div><section className="panel inventory-table-panel"><SectionTitle title="Reward catalogue"/><div className="table-scroll"><table><thead><tr><th>Reward details</th><th>Points</th><th>Available stock</th><th>Supplier / storage</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rewards.slice().sort((a,b)=>a.points-b.points).map(r=><tr key={r.id}><td><div className="table-reward"><span>{r.emoji}</span><div><strong>{r.name}</strong><small>{r.category} · {r.sku||`GL-RW-${r.id}`}</small><small>{r.description||"No description"}</small></div></div></td><td>{money(r.points)} pts</td><td><div className="stock-stepper"><button type="button" disabled={r.stock<=0} onClick={()=>A.adjustStock(r,-1)}>−</button><strong>{r.stock}</strong><button type="button" onClick={()=>A.adjustStock(r,1)}>+</button></div>{r.stock<=(r.lowStock??3)&&<small className="low-stock-note">Low stock · threshold {r.lowStock??3}</small>}</td><td>{r.supplier||"Not specified"}<small className="table-subline">{r.location||"Unassigned"}</small></td><td><span className={`status-pill ${r.active&&r.stock>0?"status-active":"status-inactive"}`}>{r.active&&r.stock>0?"Active":"Unavailable"}</span></td><td><button className="table-action" onClick={()=>A.toggleReward(r)}>{r.active?"Deactivate":"Activate"}</button><button className="table-action danger-action" onClick={()=>A.deleteReward(r)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div></section>{rewardModalOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setRewardModalOpen(false)}}><section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="reward-modal-title"><button className="modal-close" onClick={()=>setRewardModalOpen(false)}><X size={18}/></button><span className="eyebrow">CATALOGUE SETUP</span><h2 id="reward-modal-title">Create a new reward</h2><p className="muted">Choose a template to fill common details quickly, then adjust the information.</p><form className="admin-add-form" onSubmit={async e=>{if(await addReward(e))setRewardModalOpen(false)}}><label>Reward template</label><select value={rewardPreset} onChange={e=>{setRewardPreset(e.target.value);const preset=rewardCatalog.find(x=>x.name===e.target.value);if(preset){setNewRewardName(preset.name);setNewRewardPoints(String(preset.points));}}}><option value="">Choose a template…</option>{rewardCatalog.map(r=><option key={r.name} value={r.name}>{r.emoji} {r.name} · {r.points} pts</option>)}</select><label>Reward name</label><input name="rewardName" value={newRewardName} onChange={e=>setNewRewardName(e.target.value)} placeholder="Reward name" required/><div className="form-two-cols"><div><label>Points required</label><input type="number" min="0" value={newRewardPoints} onChange={e=>setNewRewardPoints(e.target.value)} required/></div><div><label>Initial stock</label><input type="number" min="0" value={newRewardStock} onChange={e=>setNewRewardStock(e.target.value)} required/></div></div><div className="form-two-cols"><div><label>Category</label><select name="rewardCategory" defaultValue="Eco lifestyle"><option>Eco lifestyle</option><option>Daily essentials</option><option>Green living</option><option>Stationery</option><option>Food & drink</option><option>New reward</option></select></div><div><label>Low-stock threshold</label><input name="rewardLowStock" type="number" min="0" defaultValue="3"/></div></div><label>Description</label><input name="rewardDescription" placeholder="Description and sustainability benefit"/><div className="form-two-cols"><div><label>SKU / item code</label><input name="rewardSku" placeholder="Auto-generated if blank"/></div><div><label>Supplier</label><input name="rewardSupplier" placeholder="Supplier name"/></div></div><label>Storage location</label><input name="rewardLocation" placeholder="e.g. Cabinet A1"/><div className="modal-actions"><button type="button" className="outline-button" onClick={()=>setRewardModalOpen(false)}>Cancel</button><button className="primary-button" type="submit"><Plus size={16}/> Create reward</button></div></form></section></div>}</>;
  if (page === "waste") return <><PageHeader eyebrow="RECYCLING CONFIGURATION" title="Recycle types" subtitle="Edit the point rate for each material. Rates apply to future calculations in this prototype."/><section className="panel"><SectionTitle title="Waste categories · 5 types"/><div className="waste-type-grid">{recycleTypeList.map(t=><div className="waste-type-card" key={t.name}><div className="waste-type-emoji" style={{background:t.color}}>{t.emoji}</div><h3>{t.name}</h3><div className="waste-rate"><strong>{t.points}</strong><span>points / kg</span></div><div className="waste-co2"><Leaf size={14}/> {t.co2} kg CO₂ / kg</div><button className="outline-button full-width" onClick={()=>{setEditingType(t.name);setEditPoints(String(t.points))}}><Settings size={14}/> Edit point rate</button></div>)}</div><div className="note-strip"><CircleHelp size={16}/><span>Rates are illustrative. Editing a point rate changes the rate used by future calculations; historical transactions retain their recorded values.</span></div></section>{editingType&&<div className="modal-backdrop"><section className="form-modal small-modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={()=>setEditingType(null)}><X size={18}/></button><span className="eyebrow">RATE MANAGEMENT</span><h2>Edit point rate</h2><p>{editingType}</p><label>Points per kilogram</label><input type="number" min="0" value={editPoints} onChange={e=>setEditPoints(e.target.value)}/><div className="modal-actions"><button className="outline-button" onClick={()=>setEditingType(null)}>Cancel</button><button className="primary-button" onClick={saveRecycleRate}>Save rate</button></div></section></div>}</>;
  if (page === "branches") return <><PageHeader eyebrow="LOCATION MANAGEMENT" title="Drop-off points" subtitle="See all branches first, compare their current status, then create a new location." /><section className="panel branch-map-panel"><div className="branch-map-heading"><div><h3>Branch network</h3><p>Illustrative map of all locations. Green pins are open; grey pins are inactive.</p></div><div className="map-legend"><span><i className="legend-active"/> Open</span><span><i className="legend-inactive"/> Closed</span></div></div><div className="admin-branch-map"><div className="map-grid"/><div className="map-river"/><div className="map-park park-a"/><div className="map-park park-b"/><div className="map-road road-a"/><div className="map-road road-b"/><div className="map-road road-c"/>{branches.map((b,i)=><div key={b.id} className={`admin-map-marker ${b.active?"is-open":"is-closed"}`} style={{left:`${[18,42,65,82][i%4]}%`,top:`${[30,62,28,68][i%4]}%`}} title={`${b.name} · ${b.active?"Open":"Closed"}`}><MapPin size={20}/><span>{b.name.replace("Green Loop ","")}</span></div>)}</div></section><section className="panel"><SectionTitle title="Branch directory"/><div className="admin-branch-cards">{branches.map((b,i)=>{const metric=branchesMetrics.find(x=>x.id===b.id);return <article className="admin-branch-card" key={b.id}><div className="admin-branch-card-head"><div className={`branch-metric-pin ${b.active?"":"is-closed"}`}><MapPin size={21}/></div><span className={`status-pill ${b.active?"status-active":"status-inactive"}`}>{b.active?"Open now":"Inactive"}</span></div><h3>{b.name}</h3><p>{b.address}</p><div className="branch-card-detail"><Clock size={14}/>{b.hours||"Hours not set"}</div><div className="branch-card-detail"><PhoneIcon />{b.phone||"No contact number"}</div><div className="branch-card-types"><strong>Accepted materials</strong><span>{(b.acceptedTypes||[]).join(" · ")||"No materials selected"}</span></div><div className="branch-card-metrics"><div><small>Collected</small><strong>{metric?.kg.toFixed(2)||"0.00"} kg</strong></div><div><small>CO₂ saved</small><strong>{metric?.co2.toFixed(2)||"0.00"} kg</strong></div></div><button className="outline-button full-width" onClick={()=>A.toggleBranch(b)}>{b.active?"Mark as closed":"Reopen branch"}</button></article>})}</div></section><div className="branch-create-bottom"><p>Need another collection location? Add its address, opening hours and accepted materials.</p><button className="primary-button" onClick={()=>{setNewBranchName("");setNewBranchAddress("");setBranchModalOpen(true)}}><Plus size={16}/> Create drop-off point</button></div>{branchModalOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setBranchModalOpen(false)}}><section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="branch-modal-title"><button className="modal-close" onClick={()=>setBranchModalOpen(false)}><X size={18}/></button><span className="eyebrow">LOCATION SETUP</span><h2 id="branch-modal-title">Create drop-off point</h2><p className="muted">Add the contact details, opening hours and accepted waste categories.</p><form className="admin-add-form" onSubmit={createBranch}><label>Branch name</label><input value={newBranchName} onChange={e=>setNewBranchName(e.target.value)} placeholder="e.g. Green Loop University" required/><label>Address / landmark</label><input value={newBranchAddress} onChange={e=>setNewBranchAddress(e.target.value)} placeholder="Building, road or nearby landmark" required/><div className="form-two-cols"><div><label>Contact number</label><input name="branchPhone" placeholder="02-555-0105"/></div><div><label>Opening hours</label><input name="branchHours" defaultValue="09:00–17:00" required/></div></div><label>Accepted waste types</label><div className="accepted-type-checks">{recycleTypeList.map(t=><label key={t.name}><input type="checkbox" name="acceptedTypes" value={t.name} defaultChecked={t.name!=="Small e-waste"}/>{t.emoji} {t.name}</label>)}</div><label>Additional notes</label><input name="branchNotes" placeholder="Parking, entry instructions, restrictions…"/><div className="modal-actions"><button type="button" className="outline-button" onClick={()=>setBranchModalOpen(false)}>Cancel</button><button type="submit" className="primary-button"><Plus size={16}/> Create point</button></div></form></section></div>}</>;
  if (page === "staff") return <><PageHeader eyebrow="ACCESS MANAGEMENT" title="Staff accounts" subtitle="Staff access is assigned by an administrator and locked to one branch." action={<button className="primary-button" onClick={()=>notify("Creating authenticated staff accounts requires the backend phase.")}><Plus size={16}/> Add staff</button>}/><section className="panel"><SectionTitle title="Staff directory"/><div className="branch-directory">{staffMembers.map(m=><div className="branch-directory-row" key={m.email}><div className="avatar">{m.name.split(" ").map(x=>x[0]).join("").slice(0,2)}</div><div className="branch-dir-info"><strong>{m.name}</strong><span>{m.email}</span><small>Assigned branch: {m.branch}</small></div><span className={`status-pill ${m.status==="Active"?"status-active":"status-inactive"}`}>{m.status}</span></div>)}</div></section></>;
  if (page === "reports") return <><PageHeader eyebrow="PROGRAMME INSIGHTS" title="Reports & analytics" subtitle="Combined recycling transactions and reward redemptions across the system."/><div className="stats-grid"><StatCard label="Recycling transactions" value={transactions.length} icon={History}/><StatCard label="Total recycled" value={totalKg.toFixed(2)} unit=" kg" icon={Weight} tone="mint"/><StatCard label="Reward redemptions" value={redemptions.length} icon={Gift} tone="yellow"/><StatCard label="Collected rewards" value={redemptions.filter(r=>r.status==="Collected").length} icon={CheckCircle2} tone="blue"/></div><section className="panel"><SectionTitle title="Recycling transactions"/><TransactionList transactions={transactions} showPoint/></section><section className="panel"><SectionTitle title="Reward redemption report"/><div className="table-scroll"><table><thead><tr><th>Redemption ID</th><th>Member ID</th><th>Reward</th><th>Points</th><th>Requested</th><th>Deadline</th><th>Status</th></tr></thead><tbody>{redemptions.map(r=><tr key={r.id}><td>{r.id}</td><td>{r.userId||"—"}</td><td>{r.emoji||"🎁"} {r.reward}</td><td>{money(r.points)} pts</td><td>{shortDate(r.date)}</td><td>{r.deadline?shortDate(r.deadline):shortDate(new Date(new Date(`${r.date}T12:00:00`).setMonth(new Date(`${r.date}T12:00:00`).getMonth()+1)).toISOString().slice(0,10))}</td><td><span className={`status-pill ${r.status==="Collected"?"status-collected":"status-active"}`}>{r.status||"Ready for pickup"}</span></td></tr>)}</tbody></table></div></section><div className="note-strip"><BarChart3 size={16}/><span>Reports combine the local prototype transaction list and redemption list. This is sample data and is not a live shared database.</span></div></>;
  return <EmptyState icon={LayoutDashboard} title="Page not found" text="Choose a page from the navigation."/>;
}
function ActivityIcon(){return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 12 L5 7 L8 9 L14 3"/><path d="M10 3 H14 V7"/></svg>}
function PhoneIcon(){return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 1h3l1 4-2 1c1 2 2 3 4 4l1-2 4 1v3c0 1-1 2-2 2C6 13 2 8 1 3c0-1 1-2 2-2z"/></svg>}
