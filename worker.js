// ============================================================
// BizManager â€” Cloudflare Worker (Single File)
// Deploy via Cloudflare Worker Web Editor
// KV Namespace binding: DATA_STORE
// ============================================================

const PIN = "1234";
const MASTER_KEY = "4321";
const LICENSE_EXPIRE = "2026-12-31";
const USE_KV_LICENSE = true;

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      return new Response(
        `<html><body style="font-family:sans-serif;padding:40px"><h2>Error</h2><pre>${err.stack || err.toString()}</pre></body></html>`,
        { headers: { "content-type": "text/html;charset=UTF-8" } }
      );
    }
  }
};

// ============================================================
// MAIN ROUTER
// ============================================================
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const cookie = request.headers.get("Cookie") || "";
  const loggedIn = cookie.includes("auth=1");

  // Master access bypass
  const masterAccess = url.searchParams.get("master") === MASTER_KEY;

  // License check
  if (!masterAccess) {
    const today = new Date().toISOString().split("T")[0];
    if (today > LICENSE_EXPIRE) return html(expiredPage());
    if (USE_KV_LICENSE && env.DATA_STORE) {
      const kvLicense = await env.DATA_STORE.get("APP_LICENSE");
      if (kvLicense && today > kvLicense) return html(expiredPage());
    }
  }

  // Login
  if (path === "/login" && method === "POST") {
    const form = await request.formData();
    if (form.get("pin") === PIN) {
      return new Response(null, {
        status: 302,
        headers: {
          "Set-Cookie": "auth=1; Path=/; HttpOnly; SameSite=Strict",
          Location: "/"
        }
      });
    }
    return html(loginPage("Wrong PIN âŒ"));
  }

  if (path === "/logout") {
    return new Response(null, {
      status: 302,
      headers: {
        "Set-Cookie": "auth=; Path=/; HttpOnly; Max-Age=0",
        Location: "/login"
      }
    });
  }

  if (!loggedIn && path !== "/login") return html(loginPage(""));

  // ---- API ROUTES ----
  // License
  if (path === "/api/license-info") {
    const kv = env.DATA_STORE ? await env.DATA_STORE.get("APP_LICENSE") : null;
    const expiry = kv || LICENSE_EXPIRE;
    const days = Math.floor((new Date(expiry) - new Date()) / 86400000);
    return Response.json({ expiry, days, status: days < 0 ? "Expired" : "Active" });
  }
  if (path === "/api/set-license" && method === "POST") {
    if (!masterAccess) return Response.json({ success: false, error: "Unauthorized" });
    const d = await request.json();
    await env.DATA_STORE.put("APP_LICENSE", d.date);
    return Response.json({ success: true });
  }

  // Generic CRUD
  if (path === "/api/list" && method === "POST") {
    const { prefix } = await request.json();
    return Response.json(await kvList(env, prefix));
  }
  if (path === "/api/save" && method === "POST") {
    const { prefix, id, data } = await request.json();
    const key = prefix + (id || Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
    await env.DATA_STORE.put(key, JSON.stringify(data));
    return Response.json({ success: true, key });
  }
  if (path === "/api/delete" && method === "POST") {
    const { key } = await request.json();
    await env.DATA_STORE.delete(key);
    return Response.json({ success: true });
  }
  if (path === "/api/get" && method === "POST") {
    const { key } = await request.json();
    const val = await env.DATA_STORE.get(key);
    return Response.json(val ? JSON.parse(val) : null);
  }

  // ---- PAGE ROUTES ----
  if (path === "/") return html(layout(dashboardPage(), "dashboard"));
  if (path === "/inventory") return html(layout(inventoryPage(), "inventory"));
  if (path === "/parties") return html(layout(partiesPage(), "parties"));
  if (path === "/purchases") return html(layout(purchasesPage(), "purchases"));
  if (path === "/sales") return html(layout(salesPage(), "sales"));
  if (path === "/payments") return html(layout(paymentsPage(), "payments"));
  if (path === "/expenses") return html(layout(expensesPage(), "expenses"));
  if (path === "/ledger") return html(layout(ledgerPage(), "ledger"));
  if (path === "/profit-loss") return html(layout(profitLossPage(), "profitloss"));
  if (path === "/admin") return html(layout(adminPage(), "admin"));

  return html(layout(`<div class="empty">Page not found</div>`, ""));
}

// ============================================================
// KV HELPERS
// ============================================================
async function kvList(env, prefix) {
  if (!env.DATA_STORE) return [];
  const list = await env.DATA_STORE.list({ prefix });
  const values = await Promise.all(list.keys.map(k => env.DATA_STORE.get(k.name)));
  const result = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i]) {
      try { result.push({ _key: list.keys[i].name, ...JSON.parse(values[i]) }); } catch {}
    }
  }
  return result;
}

function html(content) {
  return new Response(content, { headers: { "content-type": "text/html;charset=UTF-8" } });
}

// ============================================================
// CSS
// ============================================================
function getCSS() {
  return `
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #f4f6f9; --card: #ffffff; --text: #1a1d23; --muted: #6b7280;
      --primary: #2563eb; --primary-fg: #ffffff; --accent: #059669;
      --danger: #dc2626; --warning: #d97706; --border: #e2e5ea;
      --sidebar-bg: #1e2330; --sidebar-fg: #94a3b8; --sidebar-active: #2563eb;
      --radius: 10px; --shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; font-size: 14px; }
    a { color: var(--primary); text-decoration: none; }

    /* Layout */
    .app { display: flex; min-height: 100vh; }
    .sidebar { width: 220px; background: var(--sidebar-bg); color: var(--sidebar-fg); padding: 0; position: fixed; top: 0; left: 0; height: 100vh; overflow-y: auto; z-index: 50; transition: transform 0.3s; }
    .sidebar .logo { padding: 20px 16px; font-size: 18px; font-weight: 700; color: #fff; border-bottom: 1px solid rgba(255,255,255,0.08); }
    .sidebar nav { padding: 12px 8px; }
    .sidebar nav a { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 8px; color: var(--sidebar-fg); font-size: 13px; font-weight: 500; margin-bottom: 2px; transition: all 0.15s; }
    .sidebar nav a:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
    .sidebar nav a.active { background: var(--sidebar-active); color: #fff; }
    .main { margin-left: 220px; flex: 1; padding: 24px 32px; min-height: 100vh; }

    /* Mobile */
    .mobile-header { display: none; position: fixed; top: 0; left: 0; right: 0; height: 56px; background: var(--card); border-bottom: 1px solid var(--border); z-index: 40; padding: 0 16px; align-items: center; }
    .hamburger { background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text); }
    .overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 45; }
    @media (max-width: 768px) {
      .sidebar { transform: translateX(-100%); }
      .sidebar.open { transform: translateX(0); }
      .overlay.open { display: block; }
      .mobile-header { display: flex; }
      .main { margin-left: 0; padding: 72px 16px 24px; }
    }

    /* Components */
    .page-title { font-size: 22px; font-weight: 700; margin-bottom: 4px; letter-spacing: -0.3px; }
    .page-sub { font-size: 13px; color: var(--muted); margin-bottom: 24px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); }
    .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; margin-bottom: 28px; }
    .stat { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; box-shadow: var(--shadow); }
    .stat .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); font-weight: 600; margin-bottom: 6px; }
    .stat .value { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }

    /* Table */
    .tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
    .tbl th { text-align: left; padding: 10px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); font-weight: 600; border-bottom: 1px solid var(--border); background: rgba(0,0,0,0.015); }
    .tbl td { padding: 10px 14px; border-bottom: 1px solid var(--border); vertical-align: middle; }
    .tbl tr:hover td { background: rgba(37,99,235,0.02); }
    .tbl .r { text-align: right; font-variant-numeric: tabular-nums; }
    .tbl .bold { font-weight: 600; }

    /* Forms */
    input, select, textarea { width: 100%; padding: 9px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-family: inherit; background: var(--card); color: var(--text); outline: none; transition: border 0.15s; }
    input:focus, select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
    label { display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.3px; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
    .form-group { margin-bottom: 12px; }
    @media (max-width: 500px) { .form-row { grid-template-columns: 1fr; } }

    /* Buttons */
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 18px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; font-family: inherit; }
    .btn:active { transform: scale(0.97); }
    .btn-primary { background: var(--primary); color: var(--primary-fg); }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-success { background: var(--accent); color: #fff; }
    .btn-success:hover { background: #047857; }
    .btn-danger { background: var(--danger); color: #fff; }
    .btn-danger:hover { background: #b91c1c; }
    .btn-outline { background: transparent; color: var(--text); border: 1px solid var(--border); }
    .btn-outline:hover { background: var(--bg); }
    .btn-sm { padding: 6px 12px; font-size: 12px; }

    /* Tabs */
    .tabs { display: flex; gap: 4px; background: var(--bg); border-radius: 8px; padding: 4px; margin-bottom: 20px; width: fit-content; }
    .tab { padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; background: transparent; color: var(--muted); transition: all 0.15s; }
    .tab.active { background: var(--card); color: var(--text); box-shadow: var(--shadow); }

    /* Badges */
    .badge { display: inline-flex; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; }
    .badge-cash { background: rgba(5,150,105,0.1); color: var(--accent); }
    .badge-bank { background: rgba(37,99,235,0.1); color: var(--primary); }
    .text-danger { color: var(--danger); }
    .text-success { color: var(--accent); }
    .text-warning { color: var(--warning); }
    .text-muted { color: var(--muted); }

    /* Method toggle */
    .method-toggle { display: flex; gap: 8px; }
    .method-btn { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); cursor: pointer; font-size: 13px; font-weight: 500; text-align: center; transition: all 0.15s; color: var(--muted); }
    .method-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }

    /* Modal */
    .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 100; align-items: center; justify-content: center; }
    .modal-overlay.open { display: flex; }
    .modal { background: var(--card); border-radius: 12px; padding: 24px; width: 90%; max-width: 600px; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }
    .modal h3 { font-size: 17px; font-weight: 700; margin-bottom: 16px; }

    /* Empty */
    .empty { text-align: center; padding: 48px 20px; color: var(--muted); font-size: 14px; }

    /* P&L */
    .pl-section { padding: 16px 20px; border-bottom: 1px solid var(--border); }
    .pl-section h4 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
    .pl-row { display: flex; justify-content: space-between; font-size: 14px; padding: 3px 0; }
    .pl-total { background: rgba(0,0,0,0.02); font-weight: 700; }

    /* Search */
    .search-wrap { position: relative; max-width: 300px; margin-bottom: 16px; }
    .search-wrap input { padding-left: 34px; }
    .search-wrap .icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--muted); }

    /* Responsive table */
    .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }

    /* Header bar */
    .page-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 20px; }

    /* Ledger header */
    .ledger-info { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border); background: rgba(0,0,0,0.015); border-radius: var(--radius) var(--radius) 0 0; }

    /* Login */
    .login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #1e2330 0%, #2a3042 100%); }
    .login-card { background: var(--card); border-radius: 16px; padding: 40px 32px; width: 90%; max-width: 360px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
    .login-card h2 { font-size: 20px; font-weight: 700; margin: 16px 0 4px; }
    .login-card .sub { color: var(--muted); font-size: 13px; margin-bottom: 24px; }
    .login-card input { margin-bottom: 16px; text-align: center; font-size: 20px; letter-spacing: 8px; }
    .login-card .btn { width: 100%; }
    .login-card .err { color: var(--danger); font-size: 13px; margin-bottom: 12px; }
  </style>`;
}

// ============================================================
// LAYOUT
// ============================================================
function layout(content, active) {
  const nav = [
    { path: "/", icon: "ðŸ“Š", label: "Dashboard", id: "dashboard" },
    { path: "/inventory", icon: "ðŸ“¦", label: "Inventory", id: "inventory" },
    { path: "/parties", icon: "ðŸ‘¥", label: "Customers & Suppliers", id: "parties" },
    { path: "/purchases", icon: "ðŸ›’", label: "Purchases", id: "purchases" },
    { path: "/sales", icon: "ðŸšš", label: "Sales", id: "sales" },
    { path: "/payments", icon: "ðŸ’³", label: "Receipts & Payments", id: "payments" },
    { path: "/expenses", icon: "ðŸ’°", label: "Expenses", id: "expenses" },
    { path: "/ledger", icon: "ðŸ“–", label: "Ledger", id: "ledger" },
    { path: "/profit-loss", icon: "ðŸ“ˆ", label: "Profit & Loss", id: "profitloss" },
    { path: "/admin", icon: "âš™ï¸", label: "Admin", id: "admin" },
  ];

  const navHTML = nav
    .map(n => `<a href="${n.path}" class="${active === n.id ? 'active' : ''}">${n.icon} ${n.label}</a>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BizManager</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  ${getCSS()}
</head>
<body>
  <div class="mobile-header">
    <button class="hamburger" onclick="toggleSidebar()">â˜°</button>
    <span style="font-weight:700;margin-left:12px;">BizManager</span>
  </div>
  <div class="overlay" id="overlay" onclick="toggleSidebar()"></div>
  <div class="app">
    <aside class="sidebar" id="sidebar">
      <div class="logo">ðŸ“¦ BizManager</div>
      <nav>${navHTML}
        <a href="/logout" style="margin-top:20px;opacity:0.6">ðŸšª Logout</a>
      </nav>
    </aside>
    <div class="main">${content}</div>
  </div>
  <script>
    function toggleSidebar() {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('overlay').classList.toggle('open');
    }
    // Close sidebar on nav click (mobile)
    document.querySelectorAll('.sidebar nav a').forEach(a => {
      a.addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('overlay').classList.remove('open');
      });
    });

    // ---- GLOBAL API HELPERS ----
    async function api(path, body) {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return r.json();
    }
    async function loadList(prefix) { return api('/api/list', { prefix }); }
    async function saveItem(prefix, data, id) { return api('/api/save', { prefix, data, id }); }
    async function deleteItem(key) { if(confirm('Delete this item?')) { await api('/api/delete', { key }); location.reload(); } }

    function openModal(id) { document.getElementById(id).classList.add('open'); }
    function closeModal(id) { document.getElementById(id).classList.remove('open'); }
    function fmt(n) { return Number(n||0).toLocaleString(); }
  </script>
</body>
</html>`;
}

// ============================================================
// LOGIN PAGE
// ============================================================
function loginPage(msg) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BizManager Login</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
${getCSS()}
</head><body>
<div class="login-page">
  <form class="login-card" method="POST" action="/login">
    <div style="font-size:40px">ðŸ“¦</div>
    <h2>BizManager</h2>
    <div class="sub">Enter PIN to continue</div>
    ${msg ? `<div class="err">${msg}</div>` : ''}
    <input type="password" name="pin" placeholder="â€¢â€¢â€¢â€¢" maxlength="6" autofocus required>
    <button type="submit" class="btn btn-primary">Login</button>
  </form>
</div>
</body></html>`;
}

function expiredPage() {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>License Expired</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
${getCSS()}
</head><body>
<div class="login-page">
  <div class="login-card">
    <div style="font-size:40px">âš ï¸</div>
    <h2>License Expired</h2>
    <div class="sub">Please renew your license to continue using the software.</div>
  </div>
</div>
</body></html>`;
}

// ============================================================
// DASHBOARD
// ============================================================
function dashboardPage() {
  return `
  <div class="page-header"><div><div class="page-title">Dashboard</div><div class="page-sub">Overview of your business performance</div></div></div>
  <div class="stats" id="stats"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
    <div class="card"><h3 style="font-size:14px;font-weight:600;margin-bottom:12px">Recent Sales</h3><div id="recentSales" class="table-wrap"></div></div>
    <div class="card"><h3 style="font-size:14px;font-weight:600;margin-bottom:12px">Recent Purchases</h3><div id="recentPurchases" class="table-wrap"></div></div>
  </div>
  <script>
  (async () => {
    const [products, sales, purchases, payments, expenses, parties] = await Promise.all([
      loadList('product:'), loadList('sale:'), loadList('purchase:'),
      loadList('payment:'), loadList('expense:'), loadList('party:')
    ]);
    const customers = parties.filter(p=>p.type==='customer');
    const suppliers = parties.filter(p=>p.type==='supplier');
    const totalSales = sales.reduce((s,x)=>s+(x.total||0),0);
    const totalPurchases = purchases.reduce((s,x)=>s+(x.total||0),0);
    const totalExpenses = expenses.reduce((s,x)=>s+(x.amount||0),0);
    const receivables = customers.reduce((s,c)=>s+Math.max(0,c.balance||0),0);
    const payables = suppliers.reduce((s,c)=>s+Math.max(0,c.balance||0),0);
    const lowStock = products.filter(p=>(p.stock||0)<10).length;

    const statData = [
      { label:'Total Sales', value:fmt(totalSales), color:'var(--accent)' },
      { label:'Total Purchases', value:fmt(totalPurchases), color:'var(--primary)' },
      { label:'Total Expenses', value:fmt(totalExpenses), color:'var(--warning)' },
      { label:'Receivables', value:fmt(receivables), color:'var(--accent)' },
      { label:'Payables', value:fmt(payables), color:'var(--danger)' },
      { label:'Products', value:products.length, color:'var(--primary)' },
      { label:'Customers', value:customers.length, color:'var(--accent)' },
      { label:'Low Stock', value:lowStock, color:'var(--danger)' },
    ];
    document.getElementById('stats').innerHTML = statData.map(s=>
      '<div class="stat"><div class="label">'+s.label+'</div><div class="value" style="color:'+s.color+'">'+s.value+'</div></div>'
    ).join('');

    // Recent tables
    const recentS = sales.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,5);
    document.getElementById('recentSales').innerHTML = recentS.length
      ? '<table class="tbl"><tr><th>Date</th><th>Customer</th><th class="r">Total</th></tr>'+recentS.map(s=>'<tr><td>'+s.date+'</td><td>'+s.customerName+'</td><td class="r bold">'+fmt(s.total)+'</td></tr>').join('')+'</table>'
      : '<div class="empty">No sales yet</div>';

    const recentP = purchases.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,5);
    document.getElementById('recentPurchases').innerHTML = recentP.length
      ? '<table class="tbl"><tr><th>Date</th><th>Supplier</th><th class="r">Total</th></tr>'+recentP.map(p=>'<tr><td>'+p.date+'</td><td>'+p.supplierName+'</td><td class="r bold">'+fmt(p.total)+'</td></tr>').join('')+'</table>'
      : '<div class="empty">No purchases yet</div>';
  })();
  </script>`;
}

// ============================================================
// INVENTORY
// ============================================================
function inventoryPage() {
  return `
  <div class="page-header">
    <div><div class="page-title">Inventory</div><div class="page-sub">Manage products and stock</div></div>
    <button class="btn btn-primary" onclick="openModal('addProduct')">âž• Add Product</button>
  </div>
  <div class="search-wrap"><span class="icon">ðŸ”</span><input placeholder="Search products..." oninput="filterProducts(this.value)"></div>
  <div class="card" style="padding:0;overflow:hidden"><div class="table-wrap"><table class="tbl" id="productTable"><thead><tr><th>Name</th><th>SKU</th><th class="r">Purchase</th><th class="r">Sale</th><th class="r">Stock</th><th class="r">Actions</th></tr></thead><tbody id="productBody"></tbody></table></div></div>

  <div class="modal-overlay" id="addProduct"><div class="modal">
    <h3 id="productModalTitle">Add Product</h3>
    <input type="hidden" id="editProductKey">
    <div class="form-group"><label>Product Name</label><input id="pName" placeholder="Product name"></div>
    <div class="form-row"><div><label>SKU</label><input id="pSku" placeholder="SKU"></div><div><label>Unit</label><input id="pUnit" placeholder="pcs, kg..." value="pcs"></div></div>
    <div class="form-row"><div><label>Purchase Price</label><input type="number" id="pBuy" placeholder="0"></div><div><label>Sale Price</label><input type="number" id="pSell" placeholder="0"></div></div>
    <div class="form-group"><label>Opening Stock</label><input type="number" id="pStock" placeholder="0"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-outline" onclick="closeModal('addProduct')">Cancel</button>
      <button class="btn btn-primary" onclick="saveProduct()">Save</button>
    </div>
  </div></div>

  <script>
  let allProducts = [];
  async function loadProducts() {
    allProducts = await loadList('product:');
    renderProducts(allProducts);
  }
  function renderProducts(list) {
    document.getElementById('productBody').innerHTML = list.length === 0
      ? '<tr><td colspan="6" class="empty">No products found. Add your first product.</td></tr>'
      : list.map(p => '<tr><td class="bold">'+p.name+'</td><td class="text-muted">'+p.sku+'</td><td class="r">'+fmt(p.purchasePrice)+'</td><td class="r">'+fmt(p.salePrice)+'</td><td class="r bold '+((p.stock||0)<10?'text-danger':'')+'">'+(p.stock||0)+' '+(p.unit||'')+'</td><td class="r"><button class="btn btn-outline btn-sm" onclick="editProduct(\''+p._key+'\')">âœï¸</button> <button class="btn btn-danger btn-sm" onclick="deleteItem(\''+p._key+'\')">ðŸ—‘ï¸</button></td></tr>').join('');
  }
  function filterProducts(q) {
    const f = allProducts.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || (p.sku||'').toLowerCase().includes(q.toLowerCase()));
    renderProducts(f);
  }
  async function saveProduct() {
    const editKey = document.getElementById('editProductKey').value;
    const data = { name: document.getElementById('pName').value, sku: document.getElementById('pSku').value, unit: document.getElementById('pUnit').value, purchasePrice: +document.getElementById('pBuy').value, salePrice: +document.getElementById('pSell').value, stock: +document.getElementById('pStock').value };
    if (!data.name) return alert('Name required');
    if (editKey) { await api('/api/delete', { key: editKey }); }
    await saveItem('product:', data);
    closeModal('addProduct');
    loadProducts();
    document.getElementById('editProductKey').value = '';
  }
  function editProduct(key) {
    const p = allProducts.find(x => x._key === key);
    if (!p) return;
    document.getElementById('editProductKey').value = key;
    document.getElementById('productModalTitle').textContent = 'Edit Product';
    document.getElementById('pName').value = p.name;
    document.getElementById('pSku').value = p.sku || '';
    document.getElementById('pUnit').value = p.unit || 'pcs';
    document.getElementById('pBuy').value = p.purchasePrice || 0;
    document.getElementById('pSell').value = p.salePrice || 0;
    document.getElementById('pStock').value = p.stock || 0;
    openModal('addProduct');
  }
  loadProducts();
  </script>`;
}

// ============================================================
// PARTIES (Customers & Suppliers)
// ============================================================
function partiesPage() {
  return `
  <div class="page-header">
    <div><div class="page-title">Customers & Suppliers</div><div class="page-sub">Manage business contacts</div></div>
    <button class="btn btn-primary" onclick="openAddParty()">âž• Add</button>
  </div>
  <div class="tabs"><button class="tab active" onclick="switchPartyTab('customer',this)">Customers</button><button class="tab" onclick="switchPartyTab('supplier',this)">Suppliers</button></div>
  <div class="search-wrap"><span class="icon">ðŸ”</span><input placeholder="Search..." oninput="filterParties(this.value)"></div>
  <div class="card" style="padding:0;overflow:hidden"><div class="table-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Phone</th><th>Address</th><th class="r">Balance</th><th class="r">Actions</th></tr></thead><tbody id="partyBody"></tbody></table></div></div>

  <div class="modal-overlay" id="addParty"><div class="modal">
    <h3>Add Contact</h3>
    <div class="form-group"><label>Name</label><input id="partyName" placeholder="Name"></div>
    <div class="form-group"><label>Phone</label><input id="partyPhone" placeholder="Phone"></div>
    <div class="form-group"><label>Address</label><input id="partyAddr" placeholder="Address"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-outline" onclick="closeModal('addParty')">Cancel</button>
      <button class="btn btn-primary" onclick="saveParty()">Save</button>
    </div>
  </div></div>

  <script>
  let allParties = [], partyTab = 'customer';
  async function loadParties() { allParties = await loadList('party:'); renderParties(); }
  function renderParties() {
    const list = allParties.filter(p => p.type === partyTab);
    document.getElementById('partyBody').innerHTML = list.length === 0
      ? '<tr><td colspan="5" class="empty">No '+partyTab+'s found.</td></tr>'
      : list.map(p => '<tr><td class="bold">'+p.name+'</td><td class="text-muted">'+(p.phone||'')+'</td><td class="text-muted">'+(p.address||'')+'</td><td class="r bold '+((p.balance||0)>0?'text-danger':'text-success')+'">'+fmt(p.balance)+'</td><td class="r"><button class="btn btn-outline btn-sm" onclick="editParty(\''+p._key+'\')">âœï¸</button></td></tr>').join('');
  }
  function switchPartyTab(t,el) { partyTab=t; document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); el.classList.add('active'); renderParties(); }
  function filterParties(q) { const f=allParties.filter(p=>p.type===partyTab&&p.name.toLowerCase().includes(q.toLowerCase())); document.getElementById('partyBody').innerHTML=f.length===0?'<tr><td colspan="5" class="empty">No results</td></tr>':f.map(p=>'<tr><td class="bold">'+p.name+'</td><td class="text-muted">'+(p.phone||'')+'</td><td class="text-muted">'+(p.address||'')+'</td><td class="r bold '+((p.balance||0)>0?'text-danger':'text-success')+'">'+fmt(p.balance)+'</td><td class="r"><button class="btn btn-outline btn-sm" onclick="editParty(\''+p._key+'\')">âœï¸</button></td></tr>').join(''); }
  function openAddParty() { document.getElementById('partyName').value=''; document.getElementById('partyPhone').value=''; document.getElementById('partyAddr').value=''; openModal('addParty'); }
  async function saveParty() {
    const data = { name: document.getElementById('partyName').value, phone: document.getElementById('partyPhone').value, address: document.getElementById('partyAddr').value, type: partyTab, balance: 0 };
    if (!data.name) return alert('Name required');
    await saveItem('party:', data);
    closeModal('addParty');
    loadParties();
  }
  async function editParty(key) {
    const p = allParties.find(x=>x._key===key); if(!p) return;
    document.getElementById('partyName').value=p.name;
    document.getElementById('partyPhone').value=p.phone||'';
    document.getElementById('partyAddr').value=p.address||'';
    openModal('addParty');
  }
  loadParties();
  </script>`;
}

// ============================================================
// PURCHASES
// ============================================================
function purchasesPage() {
  return `
  <div class="page-header">
    <div><div class="page-title">Purchases</div><div class="page-sub">Purchase products from suppliers</div></div>
    <button class="btn btn-primary" onclick="openModal('addPurchase')">âž• New Purchase</button>
  </div>
  <div class="card" style="padding:0;overflow:hidden"><div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Supplier</th><th class="r">Items</th><th class="r">Total</th><th class="r">Paid</th><th class="r">Due</th></tr></thead><tbody id="purchaseBody"></tbody></table></div></div>

  <div class="modal-overlay" id="addPurchase"><div class="modal">
    <h3>New Purchase</h3>
    <div class="form-row"><div><label>Date</label><input type="date" id="purDate"></div><div><label>Supplier</label><select id="purSupplier"></select></div></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 8px"><span style="font-weight:600;font-size:13px">Items</span><button class="btn btn-outline btn-sm" onclick="addPurItem()">âž• Add Item</button></div>
    <div id="purItems"></div>
    <div class="form-row" style="margin-top:12px"><div><label>Total</label><div id="purTotal" style="font-size:18px;font-weight:700">0</div></div><div><label>Amount Paid</label><input type="number" id="purPaid" placeholder="0"></div></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-outline" onclick="closeModal('addPurchase')">Cancel</button>
      <button class="btn btn-primary" onclick="savePurchase()">Save Purchase</button>
    </div>
  </div></div>

  <script>
  let purProducts=[], purSuppliers=[], purItemsArr=[];
  async function initPurchases() {
    const [purchases, products, parties] = await Promise.all([loadList('purchase:'), loadList('product:'), loadList('party:')]);
    purProducts = products; purSuppliers = parties.filter(p=>p.type==='supplier');
    document.getElementById('purDate').value = new Date().toISOString().slice(0,10);
    document.getElementById('purSupplier').innerHTML = '<option value="">Select Supplier</option>' + purSuppliers.map(s=>'<option value="'+s._key+'">'+s.name+'</option>').join('');
    const sorted = purchases.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    document.getElementById('purchaseBody').innerHTML = sorted.length===0 ? '<tr><td colspan="6" class="empty">No purchases yet.</td></tr>' : sorted.map(p=>'<tr><td>'+p.date+'</td><td class="bold">'+p.supplierName+'</td><td class="r">'+(p.items||[]).length+'</td><td class="r bold">'+fmt(p.total)+'</td><td class="r">'+fmt(p.paid)+'</td><td class="r bold '+((p.total-p.paid)>0?'text-danger':'text-success')+'">'+fmt(p.total-p.paid)+'</td></tr>').join('');
  }
  function addPurItem() {
    purItemsArr.push({productKey:'',productName:'',qty:1,rate:0,amount:0});
    renderPurItems();
  }
  function renderPurItems() {
    document.getElementById('purItems').innerHTML = purItemsArr.map((item,i) =>
      '<div class="form-row" style="grid-template-columns:1fr 60px 80px 80px 32px;align-items:end;margin-bottom:8px"><div><select onchange="purItemChange('+i+',this.value)"><option value="">Product</option>'+purProducts.map(p=>'<option value="'+p._key+'" '+(p._key===item.productKey?'selected':'')+'>'+p.name+'</option>').join('')+'</select></div><div><input type="number" value="'+(item.qty||'')+'" onchange="purQtyChange('+i+',this.value)" placeholder="Qty"></div><div><input type="number" value="'+(item.rate||'')+'" onchange="purRateChange('+i+',this.value)" placeholder="Rate"></div><div style="font-weight:600;padding:10px 0;text-align:right">'+fmt(item.amount)+'</div><div><button class="btn btn-danger btn-sm" onclick="purRemoveItem('+i+')">âœ•</button></div></div>'
    ).join('');
    document.getElementById('purTotal').textContent = fmt(purItemsArr.reduce((s,i)=>s+i.amount,0));
  }
  function purItemChange(i,key) { const p=purProducts.find(x=>x._key===key); purItemsArr[i].productKey=key; purItemsArr[i].productName=p?p.name:''; purItemsArr[i].rate=p?p.purchasePrice:0; purItemsArr[i].amount=purItemsArr[i].qty*purItemsArr[i].rate; renderPurItems(); }
  function purQtyChange(i,v) { purItemsArr[i].qty=+v; purItemsArr[i].amount=purItemsArr[i].qty*purItemsArr[i].rate; renderPurItems(); }
  function purRateChange(i,v) { purItemsArr[i].rate=+v; purItemsArr[i].amount=purItemsArr[i].qty*purItemsArr[i].rate; renderPurItems(); }
  function purRemoveItem(i) { purItemsArr.splice(i,1); renderPurItems(); }

  async function savePurchase() {
    const supplierKey = document.getElementById('purSupplier').value;
    const supplier = purSuppliers.find(s=>s._key===supplierKey);
    if (!supplierKey || purItemsArr.length===0) return alert('Select supplier and add items');
    const total = purItemsArr.reduce((s,i)=>s+i.amount,0);
    const paid = +document.getElementById('purPaid').value||0;
    await saveItem('purchase:', { date: document.getElementById('purDate').value, supplierId: supplierKey, supplierName: supplier.name, items: purItemsArr, total, paid });

    // Update stock
    for (const item of purItemsArr) {
      if (!item.productKey) continue;
      const prod = purProducts.find(p=>p._key===item.productKey);
      if (prod) { prod.stock = (prod.stock||0) + item.qty; await api('/api/delete',{key:item.productKey}); await saveItem('product:', {...prod, _key:undefined}); }
    }
    // Update supplier balance
    if (supplier) { supplier.balance = (supplier.balance||0) + (total - paid); await api('/api/delete',{key:supplierKey}); await saveItem('party:', {...supplier, _key:undefined}); }

    closeModal('addPurchase');
    purItemsArr=[];
    location.reload();
  }
  initPurchases();
  </script>`;
}

// ============================================================
// SALES
// ============================================================
function salesPage() {
  return `
  <div class="page-header">
    <div><div class="page-title">Sales</div><div class="page-sub">Sell & deliver products to customers</div></div>
    <button class="btn btn-primary" onclick="openModal('addSale')">âž• New Sale</button>
  </div>
  <div class="card" style="padding:0;overflow:hidden"><div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Customer</th><th class="r">Items</th><th class="r">Total</th><th class="r">Received</th><th class="r">Due</th></tr></thead><tbody id="saleBody"></tbody></table></div></div>

  <div class="modal-overlay" id="addSale"><div class="modal">
    <h3>New Sale</h3>
    <div class="form-row"><div><label>Date</label><input type="date" id="saleDate"></div><div><label>Customer</label><select id="saleCustomer"></select></div></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 8px"><span style="font-weight:600;font-size:13px">Items</span><button class="btn btn-outline btn-sm" onclick="addSaleItem()">âž• Add Item</button></div>
    <div id="saleItems"></div>
    <div class="form-row" style="margin-top:12px"><div><label>Total</label><div id="saleTotal" style="font-size:18px;font-weight:700">0</div></div><div><label>Amount Received</label><input type="number" id="saleRcvd" placeholder="0"></div></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-outline" onclick="closeModal('addSale')">Cancel</button>
      <button class="btn btn-primary" onclick="saveSale()">Save Sale</button>
    </div>
  </div></div>

  <script>
  let saleProducts=[], saleCustomers=[], saleItemsArr=[];
  async function initSales() {
    const [sales, products, parties] = await Promise.all([loadList('sale:'), loadList('product:'), loadList('party:')]);
    saleProducts = products; saleCustomers = parties.filter(p=>p.type==='customer');
    document.getElementById('saleDate').value = new Date().toISOString().slice(0,10);
    document.getElementById('saleCustomer').innerHTML = '<option value="">Select Customer</option>' + saleCustomers.map(c=>'<option value="'+c._key+'">'+c.name+'</option>').join('');
    const sorted = sales.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    document.getElementById('saleBody').innerHTML = sorted.length===0 ? '<tr><td colspan="6" class="empty">No sales yet.</td></tr>' : sorted.map(s=>'<tr><td>'+s.date+'</td><td class="bold">'+s.customerName+'</td><td class="r">'+(s.items||[]).length+'</td><td class="r bold">'+fmt(s.total)+'</td><td class="r">'+fmt(s.received)+'</td><td class="r bold '+((s.total-s.received)>0?'text-danger':'text-success')+'">'+fmt(s.total-s.received)+'</td></tr>').join('');
  }
  function addSaleItem() { saleItemsArr.push({productKey:'',productName:'',qty:1,rate:0,amount:0}); renderSaleItems(); }
  function renderSaleItems() {
    document.getElementById('saleItems').innerHTML = saleItemsArr.map((item,i) =>
      '<div class="form-row" style="grid-template-columns:1fr 60px 80px 80px 32px;align-items:end;margin-bottom:8px"><div><select onchange="saleItemChange('+i+',this.value)"><option value="">Product</option>'+saleProducts.map(p=>'<option value="'+p._key+'" '+(p._key===item.productKey?'selected':'')+'>'+p.name+' ('+(p.stock||0)+')</option>').join('')+'</select></div><div><input type="number" value="'+(item.qty||'')+'" onchange="saleQtyChange('+i+',this.value)" placeholder="Qty"></div><div><input type="number" value="'+(item.rate||'')+'" onchange="saleRateChange('+i+',this.value)" placeholder="Rate"></div><div style="font-weight:600;padding:10px 0;text-align:right">'+fmt(item.amount)+'</div><div><button class="btn btn-danger btn-sm" onclick="saleRemoveItem('+i+')">âœ•</button></div></div>'
    ).join('');
    document.getElementById('saleTotal').textContent = fmt(saleItemsArr.reduce((s,i)=>s+i.amount,0));
  }
  function saleItemChange(i,key) { const p=saleProducts.find(x=>x._key===key); saleItemsArr[i].productKey=key; saleItemsArr[i].productName=p?p.name:''; saleItemsArr[i].rate=p?p.salePrice:0; saleItemsArr[i].amount=saleItemsArr[i].qty*saleItemsArr[i].rate; renderSaleItems(); }
  function saleQtyChange(i,v) { saleItemsArr[i].qty=+v; saleItemsArr[i].amount=saleItemsArr[i].qty*saleItemsArr[i].rate; renderSaleItems(); }
  function saleRateChange(i,v) { saleItemsArr[i].rate=+v; saleItemsArr[i].amount=saleItemsArr[i].qty*saleItemsArr[i].rate; renderSaleItems(); }
  function saleRemoveItem(i) { saleItemsArr.splice(i,1); renderSaleItems(); }

  async function saveSale() {
    const customerKey = document.getElementById('saleCustomer').value;
    const customer = saleCustomers.find(c=>c._key===customerKey);
    if (!customerKey || saleItemsArr.length===0) return alert('Select customer and add items');
    const total = saleItemsArr.reduce((s,i)=>s+i.amount,0);
    const received = +document.getElementById('saleRcvd').value||0;
    await saveItem('sale:', { date: document.getElementById('saleDate').value, customerId: customerKey, customerName: customer.name, items: saleItemsArr, total, received });

    for (const item of saleItemsArr) {
      if (!item.productKey) continue;
      const prod = saleProducts.find(p=>p._key===item.productKey);
      if (prod) { prod.stock = (prod.stock||0) - item.qty; await api('/api/delete',{key:item.productKey}); await saveItem('product:', {...prod, _key:undefined}); }
    }
    if (customer) { customer.balance = (customer.balance||0) + (total - received); await api('/api/delete',{key:customerKey}); await saveItem('party:', {...customer, _key:undefined}); }

    closeModal('addSale');
    saleItemsArr=[];
    location.reload();
  }
  initSales();
  </script>`;
}

// ============================================================
// PAYMENTS & RECEIPTS
// ============================================================
function paymentsPage() {
  return `
  <div class="page-header">
    <div><div class="page-title">Receipts & Payments</div><div class="page-sub">Record cash and bank transactions</div></div>
    <button class="btn btn-primary" onclick="openPaymentModal()">âž• New</button>
  </div>
  <div class="tabs"><button class="tab active" onclick="switchPayTab('receipt',this)">Receipts</button><button class="tab" onclick="switchPayTab('payment',this)">Payments</button></div>
  <div class="card" style="padding:0;overflow:hidden"><div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Party</th><th>Method</th><th class="r">Amount</th><th>Description</th></tr></thead><tbody id="payBody"></tbody></table></div></div>

  <div class="modal-overlay" id="addPayment"><div class="modal">
    <h3 id="payModalTitle">New Receipt</h3>
    <div class="form-group"><label>Date</label><input type="date" id="payDate"></div>
    <div class="form-group"><label id="payPartyLabel">Customer</label><select id="payParty"></select></div>
    <div class="form-group"><label>Method</label><div class="method-toggle"><div class="method-btn active" onclick="setPayMethod('cash',this)">ðŸ’µ Cash</div><div class="method-btn" onclick="setPayMethod('bank',this)">ðŸ¦ Bank</div></div></div>
    <input type="hidden" id="payMethod" value="cash">
    <div class="form-group"><label>Amount</label><input type="number" id="payAmt" placeholder="0"></div>
    <div class="form-group"><label>Description</label><input id="payDesc" placeholder="Optional"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-outline" onclick="closeModal('addPayment')">Cancel</button>
      <button class="btn btn-primary" onclick="savePayment()">Save</button>
    </div>
  </div></div>

  <script>
  let allPayments=[], payTab='receipt', payParties=[];
  async function initPayments() {
    const [payments, parties] = await Promise.all([loadList('payment:'), loadList('party:')]);
    allPayments = payments; payParties = parties;
    document.getElementById('payDate').value = new Date().toISOString().slice(0,10);
    renderPayments();
  }
  function renderPayments() {
    const list = allPayments.filter(p=>p.type===payTab).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    document.getElementById('payBody').innerHTML = list.length===0 ? '<tr><td colspan="5" class="empty">No '+payTab+'s recorded.</td></tr>' : list.map(p=>'<tr><td>'+p.date+'</td><td class="bold">'+p.partyName+'</td><td><span class="badge '+(p.method==='cash'?'badge-cash':'badge-bank')+'">'+p.method+'</span></td><td class="r bold">'+fmt(p.amount)+'</td><td class="text-muted">'+(p.description||'')+'</td></tr>').join('');
  }
  function switchPayTab(t,el) { payTab=t; document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); el.classList.add('active'); renderPayments(); }
  function openPaymentModal() {
    document.getElementById('payModalTitle').textContent = payTab==='receipt'?'New Receipt':'New Payment';
    document.getElementById('payPartyLabel').textContent = payTab==='receipt'?'Customer':'Supplier';
    const relevant = payParties.filter(p=>p.type===(payTab==='receipt'?'customer':'supplier'));
    document.getElementById('payParty').innerHTML = '<option value="">Select</option>'+relevant.map(p=>'<option value="'+p._key+'">'+p.name+' (Bal: '+fmt(p.balance)+')</option>').join('');
    openModal('addPayment');
  }
  function setPayMethod(m,el) { document.getElementById('payMethod').value=m; document.querySelectorAll('.method-btn').forEach(x=>x.classList.remove('active')); el.classList.add('active'); }
  async function savePayment() {
    const partyKey = document.getElementById('payParty').value;
    const party = payParties.find(p=>p._key===partyKey);
    const amount = +document.getElementById('payAmt').value;
    if (!partyKey || amount<=0) return alert('Select party and enter amount');
    await saveItem('payment:', { date: document.getElementById('payDate').value, type: payTab, partyId: partyKey, partyName: party.name, partyType: party.type, method: document.getElementById('payMethod').value, amount, description: document.getElementById('payDesc').value });
    // Update party balance
    party.balance = (party.balance||0) - amount;
    await api('/api/delete',{key:partyKey});
    await saveItem('party:', {...party, _key:undefined});
    closeModal('addPayment');
    location.reload();
  }
  initPayments();
  </script>`;
}

// ============================================================
// EXPENSES
// ============================================================
function expensesPage() {
  return `
  <div class="page-header">
    <div><div class="page-title">Expenses</div><div class="page-sub">Track business expenses by category</div></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-outline" onclick="openModal('manageHeads')">âš™ï¸ Manage Heads</button>
      <button class="btn btn-primary" onclick="openExpenseModal()">âž• Add Expense</button>
    </div>
  </div>
  <div class="card" style="padding:0;overflow:hidden"><div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Head</th><th>Sub-Head</th><th>Method</th><th class="r">Amount</th><th>Description</th></tr></thead><tbody id="expBody"></tbody></table></div></div>

  <!-- Manage Heads Modal -->
  <div class="modal-overlay" id="manageHeads"><div class="modal">
    <h3>Expense Heads & Sub-Heads</h3>
    <div class="form-group"><label>Add Head</label><div style="display:flex;gap:8px"><input id="newHead" placeholder="e.g. Office, Travel"><button class="btn btn-primary btn-sm" onclick="addHead()">Add</button></div></div>
    <div id="headsList" style="margin:12px 0"></div>
    <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
    <div class="form-group"><label>Add Sub-Head</label>
      <div style="display:flex;gap:8px"><select id="subHeadParent" style="flex:1"></select><input id="newSubHead" placeholder="Sub-head name" style="flex:1"><button class="btn btn-primary btn-sm" onclick="addSubHead()">Add</button></div>
    </div>
    <div id="subHeadsList" style="margin:12px 0"></div>
    <div style="text-align:right;margin-top:16px"><button class="btn btn-outline" onclick="closeModal('manageHeads')">Close</button></div>
  </div></div>

  <!-- Add Expense Modal -->
  <div class="modal-overlay" id="addExpense"><div class="modal">
    <h3>New Expense</h3>
    <div class="form-group"><label>Date</label><input type="date" id="expDate"></div>
    <div class="form-row"><div><label>Head</label><select id="expHead" onchange="loadSubHeadsFor()"></select></div><div><label>Sub-Head</label><select id="expSubHead"></select></div></div>
    <div class="form-group"><label>Method</label><div class="method-toggle"><div class="method-btn active" onclick="setExpMethod('cash',this)">ðŸ’µ Cash</div><div class="method-btn" onclick="setExpMethod('bank',this)">ðŸ¦ Bank</div></div></div>
    <input type="hidden" id="expMethod" value="cash">
    <div class="form-group"><label>Amount</label><input type="number" id="expAmt" placeholder="0"></div>
    <div class="form-group"><label>Description</label><input id="expDesc" placeholder="Description"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-outline" onclick="closeModal('addExpense')">Cancel</button>
      <button class="btn btn-primary" onclick="saveExpense()">Save</button>
    </div>
  </div></div>

  <script>
  let expHeads=[], expSubHeads=[], allExpenses=[];
  async function initExpenses() {
    [expHeads, expSubHeads, allExpenses] = await Promise.all([loadList('exphead:'), loadList('expsubhead:'), loadList('expense:')]);
    renderExpenses();
    renderHeadsUI();
  }
  function renderExpenses() {
    const sorted = allExpenses.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    document.getElementById('expBody').innerHTML = sorted.length===0 ? '<tr><td colspan="6" class="empty">No expenses recorded.</td></tr>' : sorted.map(e=>'<tr><td>'+e.date+'</td><td class="bold">'+e.headName+'</td><td class="text-muted">'+(e.subHeadName||'â€”')+'</td><td><span class="badge '+(e.method==='cash'?'badge-cash':'badge-bank')+'">'+e.method+'</span></td><td class="r bold">'+fmt(e.amount)+'</td><td class="text-muted">'+(e.description||'')+'</td></tr>').join('');
  }
  function renderHeadsUI() {
    document.getElementById('headsList').innerHTML = expHeads.map(h=>'<span style="display:inline-block;padding:4px 10px;background:var(--bg);border-radius:6px;font-size:12px;font-weight:500;margin:2px">'+h.name+'</span>').join(' ');
    document.getElementById('subHeadParent').innerHTML = '<option value="">Select Head</option>'+expHeads.map(h=>'<option value="'+h._key+'">'+h.name+'</option>').join('');
    const grouped = {};
    expSubHeads.forEach(s => { const head = expHeads.find(h=>h._key===s.headId); const hName = head?head.name:'?'; if(!grouped[hName]) grouped[hName]=[]; grouped[hName].push(s.name); });
    document.getElementById('subHeadsList').innerHTML = Object.entries(grouped).map(([h,subs])=>'<div style="font-size:12px;margin:4px 0"><strong>'+h+':</strong> '+subs.join(', ')+'</div>').join('');
  }
  async function addHead() { const n=document.getElementById('newHead').value; if(!n) return; await saveItem('exphead:',{name:n}); document.getElementById('newHead').value=''; expHeads=await loadList('exphead:'); renderHeadsUI(); }
  async function addSubHead() { const hId=document.getElementById('subHeadParent').value; const n=document.getElementById('newSubHead').value; if(!hId||!n) return; await saveItem('expsubhead:',{headId:hId,name:n}); document.getElementById('newSubHead').value=''; expSubHeads=await loadList('expsubhead:'); renderHeadsUI(); }
  function openExpenseModal() { document.getElementById('expDate').value=new Date().toISOString().slice(0,10); document.getElementById('expHead').innerHTML='<option value="">Select Head</option>'+expHeads.map(h=>'<option value="'+h._key+'">'+h.name+'</option>').join(''); document.getElementById('expSubHead').innerHTML='<option value="">Select Sub-Head</option>'; openModal('addExpense'); }
  function loadSubHeadsFor() { const hId=document.getElementById('expHead').value; const subs=expSubHeads.filter(s=>s.headId===hId); document.getElementById('expSubHead').innerHTML='<option value="">Optional</option>'+subs.map(s=>'<option value="'+s._key+'">'+s.name+'</option>').join(''); }
  function setExpMethod(m,el) { document.getElementById('expMethod').value=m; el.parentElement.querySelectorAll('.method-btn').forEach(x=>x.classList.remove('active')); el.classList.add('active'); }
  async function saveExpense() {
    const headKey=document.getElementById('expHead').value; const head=expHeads.find(h=>h._key===headKey);
    const subKey=document.getElementById('expSubHead').value; const sub=expSubHeads.find(s=>s._key===subKey);
    const amount=+document.getElementById('expAmt').value;
    if(!headKey||amount<=0) return alert('Select head and enter amount');
    await saveItem('expense:', { date:document.getElementById('expDate').value, headId:headKey, headName:head?head.name:'', subHeadId:subKey||'', subHeadName:sub?sub.name:'', amount, description:document.getElementById('expDesc').value, method:document.getElementById('expMethod').value });
    closeModal('addExpense');
    location.reload();
  }
  initExpenses();
  </script>`;
}

// ============================================================
// LEDGER
// ============================================================
function ledgerPage() {
  return `
  <div class="page-header"><div><div class="page-title">Ledger</div><div class="page-sub">View customer or supplier account ledger</div></div></div>
  <div class="form-group" style="max-width:300px"><select id="ledgerParty" onchange="loadLedger()"><option value="">Select Customer / Supplier</option></select></div>
  <div id="ledgerContent"></div>

  <script>
  let ledgerParties=[], ledgerSales=[], ledgerPurchases=[], ledgerPayments=[];
  async function initLedger() {
    [ledgerParties, ledgerSales, ledgerPurchases, ledgerPayments] = await Promise.all([loadList('party:'), loadList('sale:'), loadList('purchase:'), loadList('payment:')]);
    const sel = document.getElementById('ledgerParty');
    const customers = ledgerParties.filter(p=>p.type==='customer');
    const suppliers = ledgerParties.filter(p=>p.type==='supplier');
    sel.innerHTML = '<option value="">Select Customer / Supplier</option>' +
      (customers.length ? '<optgroup label="Customers">'+customers.map(c=>'<option value="'+c._key+'">'+c.name+'</option>').join('')+'</optgroup>' : '') +
      (suppliers.length ? '<optgroup label="Suppliers">'+suppliers.map(s=>'<option value="'+s._key+'">'+s.name+'</option>').join('')+'</optgroup>' : '');
  }
  function loadLedger() {
    const key = document.getElementById('ledgerParty').value;
    const party = ledgerParties.find(p=>p._key===key);
    if (!party) { document.getElementById('ledgerContent').innerHTML=''; return; }
    const entries = [];
    if (party.type==='customer') {
      ledgerSales.filter(s=>s.customerId===key).forEach(s => entries.push({date:s.date, desc:'Sale #'+s._key.slice(-5), debit:s.total, credit:s.received}));
    } else {
      ledgerPurchases.filter(p=>p.supplierId===key).forEach(p => entries.push({date:p.date, desc:'Purchase #'+p._key.slice(-5), debit:p.paid, credit:p.total}));
    }
    ledgerPayments.filter(p=>p.partyId===key).forEach(p => {
      if(party.type==='customer') entries.push({date:p.date, desc:'Receipt ('+p.method+')', debit:0, credit:p.amount});
      else entries.push({date:p.date, desc:'Payment ('+p.method+')', debit:p.amount, credit:0});
    });
    entries.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    let bal=0;
    entries.forEach(e => { bal += e.debit - e.credit; e.balance = bal; });

    document.getElementById('ledgerContent').innerHTML = '<div class="card" style="padding:0;overflow:hidden">' +
      '<div class="ledger-info"><div><div class="bold" style="font-size:15px">'+party.name+'</div><div class="text-muted" style="font-size:12px;text-transform:capitalize">'+party.type+' â€¢ '+(party.phone||'')+'</div></div><div style="text-align:right"><div class="text-muted" style="font-size:11px">Balance</div><div class="bold '+((party.balance||0)>0?'text-danger':'text-success')+'" style="font-size:18px">'+fmt(party.balance)+'</div></div></div>' +
      '<div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Description</th><th class="r">Debit</th><th class="r">Credit</th><th class="r">Balance</th></tr></thead><tbody>' +
      (entries.length===0 ? '<tr><td colspan="5" class="empty">No transactions found.</td></tr>' :
        entries.map(e=>'<tr><td>'+e.date+'</td><td>'+e.desc+'</td><td class="r">'+(e.debit>0?fmt(e.debit):'â€”')+'</td><td class="r">'+(e.credit>0?fmt(e.credit):'â€”')+'</td><td class="r bold '+(e.balance>0?'text-danger':'text-success')+'">'+fmt(e.balance)+'</td></tr>').join('')) +
      '</tbody></table></div></div>';
  }
  initLedger();
  </script>`;
}

// ============================================================
// PROFIT & LOSS
// ============================================================
function profitLossPage() {
  const today = new Date().toISOString().slice(0,10);
  const monthAgo = new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
  return `
  <div class="page-header"><div><div class="page-title">Profit & Loss Statement</div><div class="page-sub">Financial summary for selected period</div></div></div>
  <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:24px">
    <div style="display:flex;align-items:center;gap:6px"><label style="margin:0;min-width:36px">From</label><input type="date" id="plFrom" value="${monthAgo}" style="width:auto" onchange="calcPL()"></div>
    <div style="display:flex;align-items:center;gap:6px"><label style="margin:0;min-width:24px">To</label><input type="date" id="plTo" value="${today}" style="width:auto" onchange="calcPL()"></div>
  </div>
  <div class="card" style="padding:0;max-width:560px" id="plReport"></div>

  <script>
  let plSales=[], plPurchases=[], plExpenses=[];
  async function initPL() {
    [plSales, plPurchases, plExpenses] = await Promise.all([loadList('sale:'), loadList('purchase:'), loadList('expense:')]);
    calcPL();
  }
  function calcPL() {
    const from = document.getElementById('plFrom').value;
    const to = document.getElementById('plTo').value;
    const sales = plSales.filter(s=>s.date>=from&&s.date<=to);
    const purchases = plPurchases.filter(p=>p.date>=from&&p.date<=to);
    const expenses = plExpenses.filter(e=>e.date>=from&&e.date<=to);
    const totalSales = sales.reduce((s,x)=>s+(x.total||0),0);
    const cogs = purchases.reduce((s,x)=>s+(x.total||0),0);
    const gross = totalSales - cogs;
    const totalExp = expenses.reduce((s,x)=>s+(x.amount||0),0);
    const net = gross - totalExp;
    const expByHead = {};
    expenses.forEach(e => { expByHead[e.headName] = (expByHead[e.headName]||0) + (e.amount||0); });

    let expRows = Object.keys(expByHead).length===0 ? '<div class="pl-row text-muted">No expenses in this period.</div>' :
      Object.entries(expByHead).map(([h,a])=>'<div class="pl-row"><span class="text-muted">'+h+'</span><span>'+fmt(a)+'</span></div>').join('') +
      '<div class="pl-row" style="border-top:1px solid var(--border);margin-top:6px;padding-top:6px;font-weight:600"><span>Total Expenses</span><span>'+fmt(totalExp)+'</span></div>';

    document.getElementById('plReport').innerHTML =
      '<div class="pl-section" style="border-bottom:1px solid var(--border);padding:16px 20px"><h4 style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);font-weight:600;margin-bottom:4px">PROFIT & LOSS</h4><div class="text-muted" style="font-size:12px">'+from+' to '+to+'</div></div>' +
      '<div class="pl-section"><h4 style="color:var(--accent)">Revenue</h4><div class="pl-row"><span>Sales ('+sales.length+' transactions)</span><span class="bold">'+fmt(totalSales)+'</span></div></div>' +
      '<div class="pl-section"><h4 style="color:var(--primary)">Cost of Goods Sold</h4><div class="pl-row"><span>Purchases ('+purchases.length+' transactions)</span><span class="bold">'+fmt(cogs)+'</span></div></div>' +
      '<div class="pl-section pl-total"><div class="pl-row"><span>Gross Profit</span><span class="'+(gross>=0?'text-success':'text-danger')+'">'+fmt(gross)+'</span></div></div>' +
      '<div class="pl-section"><h4 style="color:var(--warning)">Expenses</h4>'+expRows+'</div>' +
      '<div class="pl-section pl-total"><div class="pl-row" style="font-size:16px"><span>Net Profit / (Loss)</span><span class="'+(net>=0?'text-success':'text-danger')+'">'+fmt(net)+'</span></div></div>';
  }
  initPL();
  </script>`;
}

// ============================================================
// ADMIN
// ============================================================
function adminPage() {
  return `
  <div class="page-header"><div><div class="page-title">Admin Panel</div><div class="page-sub">System settings and data management</div></div></div>
  <div class="card" style="max-width:500px">
    <h3 style="font-size:15px;font-weight:600;margin-bottom:16px">License Info</h3>
    <div id="licenseInfo" class="text-muted">Loading...</div>
    <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
    <h3 style="font-size:15px;font-weight:600;margin-bottom:12px">Quick Actions</h3>
    <button class="btn btn-outline" onclick="location.reload()" style="margin-right:8px">ðŸ”„ Refresh Data</button>
  </div>
  <script>
  (async () => {
    const r = await fetch('/api/license-info');
    const d = await r.json();
    document.getElementById('licenseInfo').innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">' +
      '<div><div class="text-muted" style="font-size:11px;text-transform:uppercase;margin-bottom:2px">Status</div><span class="badge '+(d.status==='Active'?'badge-cash':'badge-bank')+'">'+d.status+'</span></div>' +
      '<div><div class="text-muted" style="font-size:11px;text-transform:uppercase;margin-bottom:2px">Expires</div><div class="bold">'+d.expiry+'</div></div>' +
      '<div><div class="text-muted" style="font-size:11px;text-transform:uppercase;margin-bottom:2px">Days Left</div><div class="bold '+(d.days<30?'text-danger':'text-success')+'">'+d.days+'</div></div></div>';
  })();
  </scrip
