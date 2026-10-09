(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  const STORAGE = {
    theme: "mapping-desk:theme",
    agentOpen: "mapping-desk:agent-open",
  };
  const DAY = 86_400_000;
  const VIEWS = ["overview", "clients", "attention", "activity", "parked"];
  const TRACKING_GROUPS = ["cycle", "await", "nomap"];
  const UNASSIGNED = "__unassigned";

  const STEPS = [
    { key: "flag10At", label: "Flag 10 review", sub: "Via report" },
    { key: "priceNaAt", label: "Sites with price N/A", sub: "Via report" },
    { key: "compReviewAt", label: "Comp sites mapping review", sub: "Address screening" },
    { key: "finalQcAt", label: "Dashboard final QC", sub: "Drives the cycle status" },
  ];

  const NAV = [
    { view: "overview", label: "Overview", icon: "layout-dashboard" },
    { view: "clients", label: "All clients", icon: "list" },
    { view: "attention", label: "Needs attention", icon: "alert-circle" },
    { view: "activity", label: "Activity log", icon: "activity" },
    { view: "parked", label: "Not in cycle", icon: "eye-pause" },
  ];

  // Status segments for charts, in the order they're drawn.
  const SEGMENTS = [
    { key: "ok", label: "On track", token: "--md-green" },
    { key: "soon", label: "Due in 7 days", token: "--md-amber" },
    { key: "overdue", label: "Overdue", token: "--md-red" },
    { key: "nodate", label: "No date", token: "--md-dim" },
  ];

  const STATUS_TABS = [
    { key: "all", label: "All" },
    { key: "overdue", label: "Overdue" },
    { key: "soon", label: "Due soon" },
    { key: "ok", label: "On track" },
    { key: "nodate", label: "No date" },
  ];

  const OWNER_PALETTE = ["#f4a58a", "#f0b7d8", "#9fd9b4", "#a9c3f7", "#f4d48a", "#c6b6fb", "#8fd3d9", "#e7b98f", "#b9dd8f", "#f5a3b5"];

  // Tabler icon paths (24×24, stroke-based).
  const ICONS = {
    activity: '<path d="M3 12h4l3 8l4 -16l3 8h4"/>',
    "alert-circle": '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    "arrow-down": '<path d="M12 5l0 14"/><path d="M18 13l-6 6"/><path d="M6 13l6 6"/>',
    "arrow-up": '<path d="M12 5l0 14"/><path d="M18 11l-6 -6"/><path d="M6 11l6 -6"/>',
    calendar: '<path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M4 11h16"/><path d="M11 15h1"/><path d="M12 15v3"/>',
    check: '<path d="M5 12l5 5l10 -10"/>',
    clock: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 7v5l3 3"/>',
    download: '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 11l5 5l5 -5"/><path d="M12 4l0 12"/>',
    "eye-pause": '<path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M13 17.94a9.6 9.6 0 0 1 -1 .06c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6"/><path d="M17 17v5"/><path d="M21 17v5"/>',
    "layout-dashboard": '<path d="M5 4h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1"/><path d="M5 16h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1"/><path d="M15 12h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1"/><path d="M15 4h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1"/>',
    list: '<path d="M9 6l11 0"/><path d="M9 12l11 0"/><path d="M9 18l11 0"/><path d="M5 6l0 .01"/><path d="M5 12l0 .01"/><path d="M5 18l0 .01"/>',
    message: '<path d="M8 9h8"/><path d="M8 13h6"/><path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z"/>',
    moon: '<path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"/>',
    plus: '<path d="M12 5l0 14"/><path d="M5 12l14 0"/>',
    search: '<path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/>',
    sparkles: '<path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z"/>',
    sun: '<path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/>',
    users: '<path d="M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0 -3 -3.85"/>',
    x: '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
  };

  function icon(name, size = 16, stroke = 2, className = "") {
    return `<svg${className ? ` class="${className}"` : ""} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  // ---------------------------------------------------------------------------
  // Data (MongoDB via the server's /api routes)
  // ---------------------------------------------------------------------------

  let clients = [];
  let activities = [];
  let activityTotal = 0;
  let cyclesClosedThisWeek = 0;
  let owners = [];
  let settings = { slaDays: 15 };
  let loadState = "loading"; // "loading" | "ready" | "error"
  let saving = false;

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
    return body;
  }

  async function loadData() {
    try {
      const [clientData, activityData, ownerData, settingsData] = await Promise.all([
        api("/api/clients"),
        api("/api/activity?limit=200"),
        api("/api/owners"),
        api("/api/settings"),
      ]);
      clients = clientData.clients;
      activities = activityData.activities;
      activityTotal = activityData.total;
      cyclesClosedThisWeek = activityData.cyclesClosedThisWeek;
      owners = ownerData.owners;
      settings = settingsData.settings;
      loadState = "ready";
    } catch {
      if (loadState !== "ready") loadState = "error";
      else toast("error", "Couldn't refresh from the database.");
    }
    render();
  }

  function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  // Mirrors the server's checks so mistakes show instantly; the server re-validates.
  function validateClient(input) {
    if (!Number.isInteger(input.customerId) || input.customerId <= 0) return "Customer ID must be a positive whole number.";
    if (!input.name || input.name.length > 200) return "Client name is required (up to 200 characters).";
    for (const [key, label] of [["siteCount", "Number of sites"], ["naCount", "No. of N/As"]]) {
      const value = input[key];
      if (value !== null && (!Number.isInteger(value) || value < 0)) return `${label} must be a whole number of 0 or more.`;
    }
    if (!input.country || input.country.length > 80) return "Country is required (up to 80 characters).";
    for (const step of STEPS) {
      if (input[step.key] !== null && !isValidDate(input[step.key])) return `${step.label}: use a valid calendar date.`;
    }
    if (input.comments.length > 4000) return "Comments can be up to 4000 characters.";
    if ([input.poc, input.lead1, input.lead2].some((value) => value.length > 120)) return "Owner and lead names can be up to 120 characters.";
    if (!TRACKING_GROUPS.includes(input.trackingGroup)) return "Choose a valid tracking state.";
    return null;
  }

  async function createClient(input) {
    const error = validateClient(input);
    if (error) throw new Error(error);
    const { client } = await api("/api/clients", { method: "POST", body: JSON.stringify(input) });
    return client;
  }

  async function updateClient(id, input) {
    const error = validateClient(input);
    if (error) throw new Error(error);
    const { client } = await api(`/api/clients/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
    return client;
  }

  async function deleteClient(id) {
    await api(`/api/clients/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async function bulkUpdate(ids, action, extra = {}) {
    const { updated } = await api("/api/clients/bulk", { method: "POST", body: JSON.stringify({ ids, action, ...extra }) });
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Dates, status and owners
  // ---------------------------------------------------------------------------

  function localDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function todayStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function todayIso() {
    const today = todayStart();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  }

  /** Whole days since an ISO date, or null when there's no date. */
  function daysSince(iso) {
    return iso ? Math.round((todayStart() - localDate(iso)) / DAY) : null;
  }

  function shortDate(iso) {
    if (!iso) return "—";
    const date = localDate(iso);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function longDate(iso) {
    return iso ? localDate(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Not done";
  }

  function activityTime(value) {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  }

  function timeAgo(value) {
    const seconds = (Date.now() - new Date(value)) / 1000;
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  const STATUS_RANK = { overdue: 0, soon: 1, nodate: 2, ok: 3, await: 5, nomap: 5 };

  function statusOf(client) {
    if (client.trackingGroup === "nomap") return { key: "nomap", label: "No mapping needed", age: null };
    if (client.trackingGroup === "await") return { key: "await", label: "Awaiting request", age: null };
    const age = daysSince(client.finalQcAt);
    const sla = settings.slaDays;
    if (age == null) return { key: "nodate", label: "No date", age: null };
    if (age > sla) return { key: "overdue", label: `Overdue · ${age}d`, age };
    if (age > sla - 7) return { key: "soon", label: `Due in ${sla - age + 1}d`, age };
    return { key: "ok", label: "On track", age };
  }

  function initials(value) {
    return (value || "Unassigned").trim().split(/\s+/).map((part) => part[0] ?? "").join("").slice(0, 2).toUpperCase();
  }

  function ownerLabel(poc) {
    return poc || "Unassigned";
  }

  /** Stable colour per owner name. */
  function ownerColor(poc) {
    if (!poc) return "#8f8f9c";
    let hash = 0;
    for (const char of poc.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return OWNER_PALETTE[hash % OWNER_PALETTE.length];
  }

  function ownerAvatar(poc, className = "md-avatar") {
    return `<span class="${className}" style="background:${ownerColor(poc)}">${esc(initials(poc))}</span>`;
  }

  /** Does the client match an owner filter value ("all", UNASSIGNED, or a name)? */
  function matchesOwner(client, filter) {
    if (filter === "all") return true;
    if (filter === UNASSIGNED) return !client.poc;
    return client.poc === filter;
  }

  function cycleClients() {
    return clients.filter((client) => client.trackingGroup === "cycle");
  }

  /** Owners to show in team views: every owner, plus "Unassigned" when cycle clients have no owner. */
  function teamKeys() {
    const keys = owners.map((owner) => owner.name);
    if (cycleClients().some((client) => !client.poc)) keys.push(UNASSIGNED);
    return keys;
  }

  function teamLabel(key) {
    return key === UNASSIGNED ? "Unassigned" : key;
  }

  function ownerStats(key) {
    const mine = cycleClients().filter((client) => matchesOwner(client, key));
    const counts = { ok: 0, soon: 0, overdue: 0, nodate: 0, n: mine.length, mine };
    for (const client of mine) counts[statusOf(client).key] += 1;
    return counts;
  }

  function csvValue(value) {
    let text = value == null ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  // ---------------------------------------------------------------------------
  // URL state (kept in the hash)
  // ---------------------------------------------------------------------------

  function readParams() {
    return new URLSearchParams(location.hash.slice(1));
  }

  function setParams(mutate, { replace = false } = {}) {
    const next = readParams();
    mutate(next);
    const hash = `#${next.toString()}`;
    if (hash === (location.hash || "#")) return;
    if (replace) location.replace(hash);
    else location.hash = hash;
  }

  function clearSelection(params) {
    params.delete("clientId");
    params.delete("new");
  }

  function navigate(view) {
    setParams((p) => {
      for (const key of [...p.keys()]) p.delete(key);
      if (view !== "overview") p.set("view", view);
    });
    scrollToTop();
  }

  function updateParam(key, value) {
    setParams((p) => {
      if (!value || value === "all") p.delete(key);
      else p.set(key, value);
    });
  }

  function showClients({ poc = null, status = null, country = null } = {}) {
    setParams((p) => {
      p.set("view", "clients");
      for (const [key, value] of [["poc", poc], ["status", status], ["country", country]]) {
        if (value && value !== "all") p.set(key, value);
        else p.delete(key);
      }
      clearSelection(p);
    });
    scrollToTop();
  }

  function selectStatus(status) {
    setParams((p) => {
      if (!["clients", "attention"].includes(p.get("view"))) p.set("view", "clients");
      if (status === "all") p.delete("status");
      else p.set("status", status);
      clearSelection(p);
    });
  }

  function clearFilters() {
    setParams((p) => {
      for (const key of ["status", "poc", "country", "q"]) p.delete(key);
    });
  }

  function openNew() {
    setParams((p) => {
      p.set("new", "1");
      p.delete("clientId");
    });
  }

  function openClient(id) {
    setParams((p) => {
      p.set("clientId", id);
      p.delete("new");
    });
  }

  function closeSheet() {
    closeDeleteDialog();
    setParams(clearSelection);
  }

  function scrollToTop() {
    window.scrollTo({ top: 0 });
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  const $ = (id) => document.getElementById(id);
  const els = {
    nav: $("md-nav"),
    team: $("md-team"),
    sidebarFoot: $("md-sidebar-foot"),
    mobileNav: $("md-mobile-nav"),
    content: $("md-content"),
    search: $("md-search"),
    themeBtn: $("md-theme-btn"),
    agentBtn: $("md-agent-btn"),
    agentRail: $("agent-rail"),
    sheet: $("md-sheet"),
    sheetOverlay: $("md-sheet-overlay"),
    form: $("md-form"),
    stepList: $("md-step-list"),
    dialog: $("md-dialog"),
    dialogOverlay: $("md-dialog-overlay"),
    toasts: $("md-toasts"),
  };

  let sort = { key: "age", direction: -1 };
  let sheetKey = null;
  let state = null;
  const selected = new Set();
  let selectionScope = "";

  function deriveState() {
    const p = readParams();
    const view = VIEWS.includes(p.get("view")) ? p.get("view") : "overview";
    const poc = p.get("poc") ?? "all";
    const scope = `${view}|${poc}`;
    if (scope !== selectionScope) {
      selected.clear();
      selectionScope = scope;
    }
    return {
      view,
      query: p.get("q") ?? "",
      countryFilter: p.get("country") ?? "all",
      pocFilter: poc,
      statusFilter: p.get("status") ?? "all",
      client: clients.find((candidate) => candidate.id === p.get("clientId")),
      isNew: p.get("new") === "1",
    };
  }

  function render() {
    state = deriveState();
    renderSidebar(state);
    renderMobileNav(state);
    if (els.search.value !== state.query && document.activeElement !== els.search) els.search.value = state.query;
    els.content.innerHTML = loadState === "ready" ? renderView(state) : renderLoadState();
    syncSheet(state);
    if (!$("md-owners").hidden) renderOwnersList();
  }

  function renderLoadState() {
    if (loadState === "loading") {
      return `<div class="md-page"><div class="md-skeleton-list md-card" aria-label="Loading clients"><div></div><div></div><div></div><div></div></div></div>`;
    }
    return `<div class="md-page"><div class="md-card md-empty"><span class="md-empty-icon md-empty-icon--error">${icon("alert-circle", 20)}</span><b>Couldn’t load the tracker</b><p>The server or database isn’t reachable. Try again to reconnect to the client records.</p><button type="button" class="btn btn--outline btn--sm" data-action="refresh">Try again</button></div></div>`;
  }

  function renderView(s) {
    if (s.view === "overview") return renderOverview();
    if (s.view === "activity") return renderActivityPage();
    const sla = settings.slaDays;
    if (s.view === "attention") {
      return renderClientsPage(s, {
        title: "Needs attention",
        lede: `Clients past or within a week of the ${sla}-day final QC window, oldest first. Select several to close them in one go.`,
        list: cycleClients().filter((client) => ["overdue", "soon"].includes(statusOf(client).key)),
      });
    }
    if (s.view === "parked") {
      return renderClientsPage(s, {
        title: "Not in cycle",
        lede: "Clients that don't need mapping, or where the mapping request hasn't come in yet. Open one to move it into the cycle.",
        list: clients.filter((client) => client.trackingGroup !== "cycle"),
        noStatus: true,
      });
    }
    const ownerTitle = s.pocFilter !== "all" ? `${teamLabel(s.pocFilter)}${s.pocFilter === UNASSIGNED ? " clients" : "'s clients"}` : "All clients";
    return renderClientsPage(s, {
      title: ownerTitle,
      lede: `Each client moves through four steps every cycle. Status is set by the final QC date: past ${sla} days it turns overdue.`,
      list: cycleClients(),
      ownerHeader: s.pocFilter !== "all",
    });
  }

  // ---- Sidebar ---------------------------------------------------------------

  function renderSidebar({ view, pocFilter }) {
    const cycle = cycleClients();
    const overdue = cycle.filter((client) => statusOf(client).key === "overdue").length;
    const counts = {
      clients: `<b class="md-nav-count">${cycle.length}</b>`,
      attention: overdue ? `<b class="md-nav-count is-alert">${overdue}</b>` : "",
      activity: activityTotal ? `<b class="md-nav-count">${activityTotal}</b>` : "",
      parked: `<b class="md-nav-count">${clients.length - cycle.length}</b>`,
    };
    els.nav.innerHTML = `<span class="md-nav-label">Workspace</span>${NAV.map((item) => {
      const active = view === item.view && (item.view !== "clients" || pocFilter === "all");
      return `<button type="button" class="md-nav-item ${active ? "is-active" : ""}" data-action="nav" data-view="${item.view}">${icon(item.icon, 17, 1.8)}<span>${item.label}</span>${counts[item.view] ?? ""}</button>`;
    }).join("")}`;

    els.team.innerHTML = `<div class="md-nav-label"><span>Team</span><button type="button" class="md-team-manage" data-action="owners-open">Manage</button></div>${teamKeys().map((key) => {
      const stats = ownerStats(key);
      const badge = stats.overdue ? `<b class="md-owner-badge is-alert" title="${stats.overdue} overdue">${stats.overdue}</b>` : `<b>${stats.n}</b>`;
      const name = key === UNASSIGNED ? "" : key;
      return `<button type="button" class="md-owner ${view === "clients" && pocFilter === key ? "is-active" : ""}" data-action="owner" data-poc="${esc(key)}">
        <span class="md-owner-dot" style="background:${ownerColor(name)}"></span><span>${esc(teamLabel(key))}</span>${badge}
      </button>`;
    }).join("")}
      <button type="button" class="md-team-add" data-action="owners-open">${icon("plus", 14)}<span>Add owner</span></button>`;

    els.sidebarFoot.innerHTML = `
      <button type="button" class="md-foot-btn" data-action="settings-open" title="Change the overdue window">${icon("clock", 14)}<span>Overdue after ${settings.slaDays} days since final QC</span></button>
      <span class="md-foot-hint">Press <kbd>/</kbd> to search, <kbd>C</kbd> for a new client</span>`;
  }

  function renderMobileNav({ view }) {
    els.mobileNav.innerHTML = NAV.map((item) => `<button type="button" class="${view === item.view ? "is-active" : ""}" data-action="nav" data-view="${item.view}">${item.label}</button>`).join("")
      + `<button type="button" data-action="owners-open">Owners</button><button type="button" data-action="settings-open">Overdue: ${settings.slaDays}d</button>`;
  }

  // ---- Shared pieces -----------------------------------------------------------

  function statusPill(client) {
    const status = statusOf(client);
    return `<span class="md-status md-status--${status.key}"><i></i>${esc(status.label)}</span>`;
  }

  function pageHeading(title, lede) {
    return `<div class="md-page-head"><h1>${esc(title)}</h1><p class="md-lede">${lede}</p></div>`;
  }

  /** Pie chart of an owner's clients by status; each slice filters to those clients. */
  function donut(key, stats, size) {
    const radius = 15.9155;
    const total = stats.n || 1;
    let offset = 25;
    const slices = SEGMENTS.filter((seg) => stats[seg.key] > 0).map((seg) => {
      const length = (100 * stats[seg.key]) / total;
      const gap = stats.n > 1 && length < 100 ? 0.8 : 0;
      const dash = Math.max(length - gap, 0.01);
      const slice = `<circle class="md-donut-seg" data-action="owner-status" data-poc="${esc(key)}" data-status="${seg.key}" cx="21" cy="21" r="${radius}" style="stroke:hsl(var(${seg.token}))" stroke-width="5" stroke-dasharray="${dash} ${100 - dash}" stroke-dashoffset="${offset}"><title>${seg.label}: ${stats[seg.key]} of ${stats.n} (${Math.round((100 * stats[seg.key]) / total)}%)</title></circle>`;
      offset -= length;
      return slice;
    }).join("");
    const inWindow = stats.n ? Math.round((100 * (stats.ok + stats.soon)) / stats.n) : 0;
    const big = size > 100;
    return `<svg class="md-donut" width="${size}" height="${size}" viewBox="0 0 42 42" role="img" aria-label="${esc(teamLabel(key))}: ${stats.ok} on track, ${stats.soon} due soon, ${stats.overdue} overdue, ${stats.nodate} no date">
      <circle cx="21" cy="21" r="${radius}" fill="none" style="stroke:hsl(var(--md-line))" stroke-width="5"/>${slices}
      <text x="21" y="21.5" text-anchor="middle" font-size="${big ? 7.5 : 8.5}" font-weight="650">${inWindow}%</text>
      <text x="21" y="27.5" text-anchor="middle" font-size="${big ? 3.4 : 3.8}" class="md-donut-sub">in window</text>
    </svg>`;
  }

  function donutLegend(key, stats) {
    return `<div class="md-legend">${SEGMENTS.map((seg) => `
      <button type="button" class="md-legend-item" data-action="owner-status" data-poc="${esc(key)}" data-status="${seg.key}">
        <i style="background:hsl(var(${seg.token}))"></i>${seg.label}<b>${stats[seg.key]}</b>
      </button>`).join("")}</div>`;
  }

  function feedItems(limit) {
    const items = limit ? activities.slice(0, limit) : activities;
    if (!items.length) return `<div class="md-empty md-empty--compact"><span class="md-empty-icon">${icon("activity", 20)}</span><b>No changes yet</b><p>Mark a step done or edit a client and it shows up here.</p></div>`;
    return items.map((item) => {
      const client = item.clientId && clients.find((candidate) => candidate.id === item.clientId);
      const subject = client
        ? `<button type="button" class="md-link" data-action="open-client" data-id="${esc(client.id)}">CL-${esc(client.customerId)} ${esc(client.name)}</button> — `
        : item.customerId != null && !item.message.startsWith("Removed") ? `<b>CL-${esc(item.customerId)} ${esc(item.clientName)}</b> — ` : "";
      return `<div class="md-feed-item">
        <span class="md-feed-badge">${icon(item.kind === "settings" ? "clock" : "check", 11, 2.5)}</span>
        <div><p>${subject}${esc(item.message)}</p><small>${timeAgo(item.createdAt)} · ${esc(activityTime(item.createdAt))}</small></div>
      </div>`;
    }).join("");
  }

  // ---- Overview ----------------------------------------------------------------

  function greeting() {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  }

  function renderOverview() {
    const cycle = cycleClients();
    const byStatus = (key) => cycle.filter((client) => statusOf(client).key === key);
    const overdue = byStatus("overdue");
    const soon = byStatus("soon");
    const sla = settings.slaDays;
    const lede = overdue.length
      ? `${overdue.length} client${overdue.length === 1 ? " is" : "s are"} past the ${sla}-day final QC window. ${soon.length} more cross it this week.`
      : `Nothing is overdue. Everything in the cycle is within ${sla} days.`;
    const worst = [...overdue, ...soon].sort((a, b) => statusOf(b).age - statusOf(a).age);

    const tiles = [
      { key: "overdue", label: "Overdue", icon: "alert-circle", count: overdue.length },
      { key: "soon", label: "Due in 7 days", icon: "clock", count: soon.length },
      { key: "ok", label: "On track", icon: "check", count: byStatus("ok").length },
      { key: "nodate", label: "No date yet", icon: "calendar", count: byStatus("nodate").length },
    ];

    return `<div class="md-page">
      ${pageHeading(`${greeting()}, team`, esc(lede))}
      <div class="md-stats" aria-label="Cycle status summary">${tiles.map((tile) => `
        <button type="button" class="md-stat md-stat--${tile.key}" data-action="status" data-status="${tile.key}">
          <span class="md-stat-icon">${icon(tile.icon, 18)}</span>
          <span><b>${tile.count}</b><small>${tile.label}</small></span>
        </button>`).join("")}
      </div>

      <div class="md-overview-grid">
        <div class="md-overview-main">
          <div class="md-section-head"><h2>Needs attention</h2><button type="button" class="md-section-link" data-action="nav" data-view="attention">View all ${worst.length}</button></div>
          <div class="md-card md-att-list">${worst.length ? worst.slice(0, 7).map((client) => `
            <div class="md-att-row" data-action="open-client" data-id="${esc(client.id)}" role="button" tabindex="0">
              <span class="md-key">CL-${esc(client.customerId)}</span>
              <span class="md-att-name"><b>${esc(client.name)}</b><small>${esc(ownerLabel(client.poc))} · ${client.siteCount ?? "?"} sites · final QC ${shortDate(client.finalQcAt)}</small></span>
              ${statusPill(client)}
              <button type="button" class="btn btn--outline btn--xs" data-action="cycle-done" data-id="${esc(client.id)}" title="Set all four steps to today">Mark cycle done</button>
            </div>`).join("") : `<div class="md-lower-empty">${icon("check", 17)}Nothing overdue or at risk.</div>`}
          </div>

          <div class="md-section-head md-section-head--spaced"><h2>Team</h2><button type="button" class="md-section-link" data-action="nav" data-view="clients">All clients</button></div>
          <div class="md-team-grid">${teamKeys().map(teamCard).join("") || `<div class="md-card md-lower-empty">Add owners to see each person's workload.</div>`}</div>
        </div>

        <aside class="md-overview-side">
          <div class="md-section-head"><h2>What changed <span class="md-live-tag">live</span></h2><button type="button" class="md-section-link" data-action="nav" data-view="activity">Full log</button></div>
          <div class="md-card md-feed">${feedItems(5)}</div>

          <div class="md-section-head md-section-head--spaced"><h2>Steps missing a date</h2></div>
          <div class="md-card md-mini">${STEPS.map((step) => {
            const missing = cycle.filter((client) => !client[step.key]).length;
            const donePct = cycle.length ? (100 * (cycle.length - missing)) / cycle.length : 0;
            return `<div class="md-mini-row"><span>${step.label}</span><span class="md-mini-bar"><i style="width:${donePct}%"></i></span><b>${missing}</b></div>`;
          }).join("")}</div>

          <div class="md-section-head md-section-head--spaced"><h2>By country</h2></div>
          <div class="md-card md-mini">${countryRows(cycle)}</div>
          <p class="md-help">${cyclesClosedThisWeek} cycle${cyclesClosedThisWeek === 1 ? "" : "s"} closed in the last 7 days.</p>
        </aside>
      </div>
    </div>`;
  }

  function countryRows(cycle) {
    const totals = new Map();
    for (const client of cycle) {
      const row = totals.get(client.country) ?? { n: 0, overdue: 0, sites: 0 };
      row.n += 1;
      row.sites += client.siteCount ?? 0;
      if (statusOf(client).key === "overdue") row.overdue += 1;
      totals.set(client.country, row);
    }
    const rows = [...totals].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
    if (!rows.length) return `<div class="md-lower-empty">No clients in the cycle yet.</div>`;
    return rows.map(([country, row]) => `
      <button type="button" class="md-mini-row md-mini-row--link" data-action="country" data-country="${esc(country)}">
        <span>${esc(country)} <small>· ${row.sites.toLocaleString()} sites</small></span>
        ${row.overdue ? `<span class="md-status md-status--overdue">${row.overdue} overdue</span>` : ""}
        <b>${row.n}</b>
      </button>`).join("");
  }

  function teamCard(key) {
    const stats = ownerStats(key);
    const sites = stats.mine.reduce((total, client) => total + (client.siteCount ?? 0), 0);
    const tag = stats.overdue / (stats.n || 1) > 0.4
      ? `<span class="md-status md-status--overdue">At risk</span>`
      : stats.overdue ? `<span class="md-status md-status--soon">Slipping</span>` : `<span class="md-status md-status--ok">On track</span>`;
    const name = key === UNASSIGNED ? "" : key;
    return `<div class="md-card md-team-card" data-action="owner" data-poc="${esc(key)}" role="button" tabindex="0" aria-label="Open ${esc(teamLabel(key))}'s clients">
      <div class="md-team-card-head">${ownerAvatar(name, "md-team-avatar")}<span><b>${esc(teamLabel(key))}</b><small>${stats.n} clients · ${sites.toLocaleString()} sites</small></span>${tag}</div>
      <div class="md-donut-wrap">${donut(key, stats, 92)}${donutLegend(key, stats)}</div>
    </div>`;
  }

  function ownerHeader(key) {
    const stats = ownerStats(key);
    const ages = stats.mine.map((client) => daysSince(client.finalQcAt)).filter((age) => age != null);
    const average = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : "—";
    const oldest = stats.mine.filter((client) => client.finalQcAt).sort((a, b) => daysSince(b.finalQcAt) - daysSince(a.finalQcAt))[0];
    const sites = stats.mine.reduce((total, client) => total + (client.siteCount ?? 0), 0);
    const openNas = stats.mine.reduce((total, client) => total + (client.naCount ?? 0), 0);
    return `<div class="md-card md-owner-head">
      <div class="md-donut-wrap">${donut(key, stats, 150)}${donutLegend(key, stats)}</div>
      <div class="md-kpis">
        <div><span>Clients</span><b>${stats.n}</b></div>
        <div><span>Sites</span><b>${sites.toLocaleString()}</b></div>
        <div><span>Open N/As</span><b>${openNas}</b></div>
        <div><span>Avg days since QC</span><b>${average}</b></div>
        <div class="md-kpi-wide"><span>Oldest final QC</span><b>${oldest
          ? `<button type="button" class="md-link" data-action="open-client" data-id="${esc(oldest.id)}">CL-${esc(oldest.customerId)} ${esc(oldest.name)}</button> <span class="md-status md-status--${statusOf(oldest).key}">${daysSince(oldest.finalQcAt)}d</span>`
          : "—"}</b></div>
      </div>
    </div>`;
  }

  // ---- Client lists -------------------------------------------------------------

  function filterClients(list, s) {
    const query = s.query.trim().toLowerCase();
    return list.filter((client) => {
      if (s.statusFilter !== "all" && statusOf(client).key !== s.statusFilter) return false;
      if (!matchesOwner(client, s.pocFilter)) return false;
      if (s.countryFilter !== "all" && client.country !== s.countryFilter) return false;
      if (query) {
        const haystack = [client.customerId, `CL-${client.customerId}`, client.name, client.comments, client.poc, client.lead1, client.lead2, client.country].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }

  function sortValue(client, key) {
    switch (key) {
      case "age": return daysSince(client.finalQcAt) ?? -1;
      case "status": return STATUS_RANK[statusOf(client).key];
      case "name": return client.name.toLowerCase();
      case "poc": return ownerLabel(client.poc).toLowerCase();
      case "siteCount": return client.siteCount ?? -1;
      case "naCount": return client.naCount ?? -1;
      default: return client[key] ?? "";
    }
  }

  function sortClients(list) {
    return [...list].sort((a, b) => {
      const left = sortValue(a, sort.key);
      const right = sortValue(b, sort.key);
      return (left > right ? 1 : left < right ? -1 : 0) * sort.direction || a.customerId - b.customerId;
    });
  }

  function sortHeader(key, label, className = "") {
    const active = sort.key === key;
    const arrow = active ? icon(sort.direction > 0 ? "arrow-up" : "arrow-down", 13) : "";
    return `<th class="${className}"><button type="button" class="md-th-sort ${active ? "is-active" : ""}" data-action="sort" data-key="${key}">${label}${arrow}</button></th>`;
  }

  /** Four dots, one per step, coloured by how stale each date is. */
  function stepTrack(client) {
    const sla = settings.slaDays;
    return `<div class="md-track">${STEPS.map((step) => {
      const value = client[step.key];
      const age = daysSince(value);
      const cls = !value ? "" : age > sla * 2 ? "is-late" : age > sla ? "is-stale" : "is-done";
      return `<span class="md-track-step ${cls}" title="${esc(`${step.label}: ${longDate(value)}${value ? ` (${age}d ago)` : ""}`)}"><i></i><small>${shortDate(value)}</small></span>`;
    }).join("")}</div>`;
  }

  function ageCell(client) {
    const age = daysSince(client.finalQcAt);
    if (age == null) return `<span class="md-dim">—</span>`;
    const sla = settings.slaDays;
    const token = age > sla ? "--md-red" : age > sla - 7 ? "--md-amber" : "--md-green";
    return `<div class="md-age-cell"><b style="color:hsl(var(${token}))">${age}d</b><span class="md-age-bar"><i style="width:${Math.min(100, (100 * age) / (sla * 4))}%;background:hsl(var(${token}))"></i></span></div>`;
  }

  function renderClientsPage(s, { title, lede, list, noStatus = false, ownerHeader: showOwner = false }) {
    const counts = { all: 0, overdue: 0, soon: 0, ok: 0, nodate: 0 };
    for (const client of list) {
      if (!matchesOwner(client, s.pocFilter) || (s.countryFilter !== "all" && client.country !== s.countryFilter)) continue;
      counts.all += 1;
      counts[statusOf(client).key] = (counts[statusOf(client).key] ?? 0) + 1;
    }
    const rows = sortClients(filterClients(list, s));
    const siteTotal = rows.reduce((total, client) => total + (client.siteCount ?? 0), 0);
    const countries = [...new Set(clients.map((client) => client.country))].sort();
    const hasFilters = s.statusFilter !== "all" || s.pocFilter !== "all" || s.countryFilter !== "all" || s.query;
    const allSelected = rows.length > 0 && rows.every((client) => selected.has(client.id));
    const option = (value, label, current) => `<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(label)}</option>`;

    const toolbar = `<div class="md-filter-bar">
      ${noStatus ? "" : `<div class="md-seg" role="tablist" aria-label="Status filter">${STATUS_TABS.map((tab) => `
        <button type="button" role="tab" aria-selected="${s.statusFilter === tab.key}" class="${s.statusFilter === tab.key ? "is-active" : ""}" data-action="status" data-status="${tab.key}">${tab.label}<span>${counts[tab.key] ?? 0}</span></button>`).join("")}</div>`}
      <label class="md-select-wrap"><span class="sr-only">Filter by POC</span><select data-filter="poc">${option("all", "All POCs", s.pocFilter)}${owners.map((owner) => option(owner.name, owner.name, s.pocFilter)).join("")}${option(UNASSIGNED, "Unassigned", s.pocFilter)}</select></label>
      <label class="md-select-wrap"><span class="sr-only">Filter by country</span><select data-filter="country">${option("all", "All countries", s.countryFilter)}${countries.map((country) => option(country, country, s.countryFilter)).join("")}</select></label>
      ${hasFilters ? `<button type="button" class="btn btn--ghost btn--sm" data-action="clear-filters">Clear filters</button>` : ""}
      <span class="md-result-count">${rows.length} shown <i></i> ${siteTotal.toLocaleString()} sites</span>
    </div>`;

    let table;
    if (!rows.length) {
      const anyFilter = hasFilters;
      table = `<div class="md-card md-empty"><span class="md-empty-icon">${icon(s.view === "attention" ? "check" : "users", 20)}</span>
        <b>${anyFilter ? "No clients match these filters" : s.view === "attention" ? "Nothing needs attention" : s.view === "parked" ? "No clients outside the cycle" : "Your client register is empty"}</b>
        <p>${anyFilter ? "Clear a filter or search for a different name or ID." : s.view === "attention" ? "No clients are overdue or due within the next week." : "Add a client to start tracking mapping progress."}</p>
        ${anyFilter ? `<button type="button" class="btn btn--outline btn--sm" data-action="clear-filters">Clear filters</button>` : s.view === "clients" ? `<button type="button" class="btn btn--primary btn--sm" data-action="new">${icon("plus", 15)}Add client</button>` : ""}
      </div>`;
    } else {
      table = `<div class="md-card md-table-card"><div class="md-table-scroll"><table class="md-table">
        <thead><tr>
          <th class="md-th-check"><input type="checkbox" class="md-check" data-action="select-all" ${allSelected ? "checked" : ""} aria-label="Select all shown clients"></th>
          ${sortHeader("customerId", "Key")}${sortHeader("name", "Client")}${sortHeader("status", "Status")}${sortHeader("poc", "POC")}
          <th>Flag 10 · Price N/A · Comp review · Final QC</th>
          ${sortHeader("age", "Since QC")}${sortHeader("siteCount", "Sites", "md-num")}${sortHeader("naCount", "N/A", "md-num")}<th>Leads</th>
        </tr></thead>
        <tbody>${rows.map((client) => `
          <tr data-action="open-client" data-id="${esc(client.id)}" class="${selected.has(client.id) ? "is-selected" : ""}">
            <td class="md-td-check"><input type="checkbox" class="md-check" data-action="select-row" data-id="${esc(client.id)}" ${selected.has(client.id) ? "checked" : ""} aria-label="Select ${esc(client.name)}"></td>
            <td><span class="md-key">CL-${esc(client.customerId)}</span></td>
            <td class="md-td-client"><button type="button" class="md-client-open" data-action="open-client" data-id="${esc(client.id)}"><b>${esc(client.name)}</b></button>${client.comments ? `<small class="md-comment" title="${esc(client.comments)}">${esc(client.comments)}</small>` : ""}</td>
            <td>${statusPill(client)}</td>
            <td><span class="md-owner-cell">${ownerAvatar(client.poc)}${esc(ownerLabel(client.poc))}</span></td>
            <td>${client.trackingGroup === "cycle" ? stepTrack(client) : `<span class="md-dim">—</span>`}</td>
            <td>${client.trackingGroup === "cycle" ? ageCell(client) : ""}</td>
            <td class="md-num">${client.siteCount?.toLocaleString() ?? "—"}</td>
            <td class="md-num ${client.naCount > 0 ? "md-na-alert" : ""}">${client.naCount ?? "—"}</td>
            <td class="md-leads">${esc([client.lead1, client.lead2].filter(Boolean).join(", ")) || "—"}</td>
          </tr>`).join("")}</tbody>
      </table></div>
      <div class="md-mobile-records">${rows.map((client) => `
        <div class="md-mobile-record" data-action="open-client" data-id="${esc(client.id)}" role="button" tabindex="0">
          <div class="md-mobile-record-top"><input type="checkbox" class="md-check" data-action="select-row" data-id="${esc(client.id)}" ${selected.has(client.id) ? "checked" : ""} aria-label="Select ${esc(client.name)}"><span class="md-mobile-name"><b>${esc(client.name)}</b><small>CL-${esc(client.customerId)} · ${esc(client.country)}</small></span>${statusPill(client)}</div>
          <div class="md-mobile-record-bottom"><span>${ownerAvatar(client.poc)}${esc(ownerLabel(client.poc))}</span><span>${client.siteCount?.toLocaleString() ?? "—"} sites</span><span>${client.naCount ?? "—"} N/A</span></div>
          ${client.trackingGroup === "cycle" ? stepTrack(client) : ""}
        </div>`).join("")}</div></div>`;
    }

    const visibleSelected = [...selected].filter((id) => clients.some((client) => client.id === id));
    const bulk = visibleSelected.length ? `<div class="md-bulk" role="region" aria-label="Bulk actions">
      <b>${visibleSelected.length} selected</b>
      <button type="button" class="btn btn--primary btn--sm" data-action="bulk-cycle">Mark cycle done today</button>
      <button type="button" class="btn btn--outline btn--sm" data-action="bulk-final">Final QC today</button>
      <label class="md-select-wrap"><span class="sr-only">Reassign POC</span><select data-bulk="assign"><option value="">Reassign POC…</option>${owners.map((owner) => `<option value="${esc(owner.name)}">${esc(owner.name)}</option>`).join("")}<option value="${UNASSIGNED}">Unassigned</option></select></label>
      <button type="button" class="btn btn--ghost btn--sm" data-action="bulk-clear">Clear</button>
    </div>` : "";

    return `<div class="md-page md-page--wide">
      ${pageHeading(title, esc(lede))}
      ${showOwner ? ownerHeader(s.pocFilter) : ""}
      ${toolbar}
      ${table}
      ${bulk}
    </div>`;
  }

  function renderActivityPage() {
    const shown = activities.length;
    return `<div class="md-page">
      ${pageHeading("Activity log", `Every change made in this tracker, newest first. Each entry links back to its client.${activityTotal > shown ? ` Showing the latest ${shown} of ${activityTotal}.` : ""}`)}
      <div class="md-card md-feed">${feedItems(0)}</div>
    </div>`;
  }

  // ---------------------------------------------------------------------------
  // Client sheet
  // ---------------------------------------------------------------------------

  els.stepList.innerHTML = STEPS.map((step, index) => `
    <div class="md-step-row">
      <span class="md-step-number" id="md-step-number-${step.key}">${index + 1}</span>
      <span class="md-step-label"><label for="md-step-${step.key}">${step.label}</label><small id="md-step-sub-${step.key}">${step.sub}</small></span>
      <input class="input" id="md-step-${step.key}" name="${step.key}" type="date">
      <button type="button" class="btn btn--outline btn--xs" data-action="step-today" data-step="${step.key}">Today</button>
    </div>`).join("");

  function updateStepNumbers() {
    STEPS.forEach((step, index) => {
      const value = els.form.elements[step.key].value;
      const number = $(`md-step-number-${step.key}`);
      number.classList.toggle("is-done", Boolean(value));
      number.innerHTML = value ? icon("check", 12) : String(index + 1);
      $(`md-step-sub-${step.key}`).textContent = value && isValidDate(value) ? `${longDate(value)} · ${daysSince(value)}d ago` : step.sub;
    });
  }

  // Owner dropdown: "Unassigned" plus every owner. A name that is no longer an
  // owner (e.g. still selected in an open form) is kept so it isn't silently lost.
  function renderPocOptions(current) {
    const names = owners.map((owner) => owner.name);
    if (current && !names.includes(current)) names.push(current);
    const select = els.form.elements.poc;
    select.innerHTML = `<option value="">Unassigned</option>${names.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join("")}`;
    select.value = current;
  }

  function fillForm(client) {
    const f = els.form.elements;
    const defaultOwner = state.pocFilter !== "all" && state.pocFilter !== UNASSIGNED ? state.pocFilter : "";
    f.customerId.value = client ? String(client.customerId) : "";
    f.name.value = client?.name ?? "";
    f.siteCount.value = client?.siteCount == null ? "" : String(client.siteCount);
    f.naCount.value = client?.naCount == null ? "" : String(client.naCount);
    f.country.value = client?.country ?? "USA";
    renderPocOptions(client ? client.poc : defaultOwner);
    f.lead1.value = client?.lead1 ?? "";
    f.lead2.value = client?.lead2 ?? "";
    f.trackingGroup.value = client?.trackingGroup ?? "cycle";
    f.comments.value = client ? client.comments : "new client";
    STEPS.forEach((step) => { f[step.key].value = client?.[step.key] ?? ""; });
    updateStepNumbers();
  }

  function readForm() {
    const f = els.form.elements;
    const count = (value) => (value.trim() === "" ? null : Number(value));
    const input = {
      customerId: Number(f.customerId.value),
      name: f.name.value.trim(),
      siteCount: count(f.siteCount.value),
      country: f.country.value.trim() || "USA",
      naCount: count(f.naCount.value),
      comments: f.comments.value,
      poc: f.poc.value.trim(),
      lead1: f.lead1.value.trim(),
      lead2: f.lead2.value.trim(),
      trackingGroup: f.trackingGroup.value,
    };
    STEPS.forEach((step) => { input[step.key] = f[step.key].value || null; });
    return input;
  }

  let historyRequest = 0;

  async function loadHistory(clientId) {
    const request = ++historyRequest;
    const list = $("md-history");
    list.innerHTML = `<div class="md-history-item md-dim">Loading history…</div>`;
    try {
      const { activities: items } = await api(`/api/activity?clientId=${encodeURIComponent(clientId)}&limit=50`);
      if (request !== historyRequest) return;
      list.innerHTML = items.length
        ? items.map((item) => `<div class="md-history-item">${esc(item.message)}<time>${esc(activityTime(item.createdAt))}</time></div>`).join("")
        : `<div class="md-history-item md-dim">No changes recorded yet.</div>`;
    } catch {
      if (request === historyRequest) list.innerHTML = `<div class="md-history-item md-dim">Couldn't load history.</div>`;
    }
  }

  function syncSheet({ client, isNew }) {
    const key = client ? client.id : isNew ? "new" : null;
    renderPocOptions(els.form.elements.poc.value);
    $("md-country-list").innerHTML = [...new Set(clients.map((candidate) => candidate.country))].sort().map((country) => `<option value="${esc(country)}"></option>`).join("");
    if (client) $("md-sheet-status").innerHTML = statusPill(client);
    if (key === sheetKey) return;
    sheetKey = key;
    const open = Boolean(key);
    els.sheet.hidden = !open;
    els.sheetOverlay.hidden = !open;
    if (!open) {
      closeDeleteDialog();
      return;
    }
    $("md-sheet-kicker").textContent = client ? `CL-${client.customerId}` : "New client";
    $("md-sheet-status").innerHTML = client ? statusPill(client) : "";
    $("md-sheet-title").textContent = client ? client.name : "Add a client to the tracker";
    $("md-sheet-description").textContent = client ? "Update ownership, mapping progress, and client notes." : "Create a client record in the mapping tracker.";
    $("md-mark-all").hidden = !client;
    $("md-delete-trigger").hidden = !client;
    $("md-history-section").hidden = !client;
    const lastUpdated = $("md-last-updated");
    lastUpdated.hidden = !client;
    lastUpdated.textContent = client ? `Last updated ${activityTime(client.updatedAt)}` : "";
    $("md-submit").innerHTML = client ? "Save changes" : `${icon("plus", 15)}Add client`;
    fillForm(client);
    if (client) loadHistory(client.id);
    els.form.querySelector(".md-form-body").scrollTop = 0;
    requestAnimationFrame(() => els.form.elements[client ? "name" : "customerId"].focus());
  }

  function setSaving(value) {
    saving = value;
    const submit = $("md-submit");
    submit.disabled = value;
    if (value) submit.textContent = "Saving…";
    else submit.innerHTML = state.client ? "Save changes" : `${icon("plus", 15)}Add client`;
    const confirm = els.dialog.querySelector('[data-action="delete-confirm"]');
    confirm.disabled = value;
    confirm.textContent = value && !els.dialog.hidden ? "Removing…" : "Remove client";
    els.dialog.querySelector('[data-action="delete-cancel"]').disabled = value;
  }

  async function submitForm(event) {
    event.preventDefault();
    if (saving) return;
    const input = readForm();
    if (!input.customerId || !input.name) {
      toast("error", "Add a customer ID and client name.");
      return;
    }
    const editing = state.client;
    setSaving(true);
    try {
      if (editing) {
        await updateClient(editing.id, input);
        closeSheet();
        toast("success", "Changes saved.");
      } else {
        await createClient(input);
        setParams((p) => {
          p.delete("new");
          if (p.get("view") !== "clients") p.set("view", "clients");
        });
        toast("success", `${input.name} added to the tracker.`);
      }
      await loadData();
    } catch (error) {
      toast("error", error.message || (editing ? "Could not save these changes." : "Could not add this client."));
    } finally {
      setSaving(false);
    }
  }

  function markCycleDone() {
    const iso = todayIso();
    STEPS.forEach((step) => { els.form.elements[step.key].value = iso; });
    els.form.elements.trackingGroup.value = "cycle";
    updateStepNumbers();
    toast("success", "All four steps set to today. Save to keep.");
  }

  // ---------------------------------------------------------------------------
  // Bulk and quick actions
  // ---------------------------------------------------------------------------

  async function runBulk(ids, action, extra, successMessage) {
    if (!ids.length || saving) return;
    saving = true;
    try {
      const updated = await bulkUpdate(ids, action, extra);
      selected.clear();
      toast("success", successMessage(updated));
      await loadData();
    } catch (error) {
      toast("error", error.message || "Could not update these clients.");
    } finally {
      saving = false;
    }
  }

  const plural = (n) => `${n} client${n === 1 ? "" : "s"}`;

  function markCyclesDone(ids) {
    const date = todayIso();
    runBulk(ids, "cycle-done", { date }, (n) => `${plural(n)} marked cycle done for ${shortDate(date)}.`);
  }

  function setFinalQc(ids) {
    const date = todayIso();
    runBulk(ids, "final-qc", { date }, (n) => `Final QC set to ${shortDate(date)} for ${plural(n)}.`);
  }

  function reassign(ids, poc) {
    const name = poc === UNASSIGNED ? "" : poc;
    runBulk(ids, "assign", { poc: name }, (n) => `${plural(n)} reassigned to ${ownerLabel(name)}.`);
  }

  // ---------------------------------------------------------------------------
  // Remove dialog
  // ---------------------------------------------------------------------------

  function openDeleteDialog() {
    if (!state.client) return;
    $("md-dialog-description").textContent = `${state.client.name} will be removed from the tracker. Its activity history will remain.`;
    els.dialog.hidden = false;
    els.dialogOverlay.hidden = false;
    els.dialog.querySelector('[data-action="delete-cancel"]').focus();
  }

  function closeDeleteDialog() {
    els.dialog.hidden = true;
    els.dialogOverlay.hidden = true;
  }

  async function confirmDelete() {
    if (!state.client || saving) return;
    const name = state.client.name;
    setSaving(true);
    try {
      await deleteClient(state.client.id);
      closeSheet();
      toast("success", `${name} removed from the tracker.`);
      await loadData();
    } catch (error) {
      toast("error", error.message || "Could not remove this client.");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Overdue window setting
  // ---------------------------------------------------------------------------

  function openSettings() {
    $("md-sla-input").value = String(settings.slaDays);
    $("md-settings").hidden = false;
    $("md-settings-overlay").hidden = false;
    $("md-sla-input").select();
  }

  function closeSettings() {
    $("md-settings").hidden = true;
    $("md-settings-overlay").hidden = true;
  }

  async function saveSettings(event) {
    event.preventDefault();
    const slaDays = Number($("md-sla-input").value);
    if (!Number.isInteger(slaDays) || slaDays < 1 || slaDays > 365) {
      toast("error", "Enter a whole number of days from 1 to 365.");
      return;
    }
    if (slaDays === settings.slaDays) {
      closeSettings();
      return;
    }
    $("md-settings-submit").disabled = true;
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify({ slaDays }) });
      closeSettings();
      toast("success", `Clients now turn overdue ${slaDays} days after final QC.`);
      await loadData();
    } catch (error) {
      toast("error", error.message || "Could not save the overdue window.");
    } finally {
      $("md-settings-submit").disabled = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Manage owners
  // ---------------------------------------------------------------------------

  let confirmingOwnerId = null;
  let ownerBusy = false;

  function clientsOwnedBy(name) {
    const key = name.toLowerCase();
    return clients.filter((client) => client.poc.toLowerCase() === key).length;
  }

  function renderOwnersList() {
    const list = $("md-owner-list");
    if (!owners.length) {
      list.innerHTML = `<div class="md-owner-list-empty">No owners yet. Add the first one above.</div>`;
      return;
    }
    list.innerHTML = owners.map((owner) => {
      const count = clientsOwnedBy(owner.name);
      const countText = plural(count);
      if (owner.id === confirmingOwnerId) {
        return `<div class="md-owner-row is-confirming">
          ${ownerAvatar(owner.name)}
          <span class="md-owner-row-name"><b>Remove ${esc(owner.name)}?</b><small>${count ? `${countText} will become Unassigned.` : "No clients are assigned to them."}</small></span>
          <span class="md-owner-row-actions">
            <button type="button" class="btn btn--ghost btn--xs" data-action="owner-remove-cancel"${ownerBusy ? " disabled" : ""}>Cancel</button>
            <button type="button" class="btn btn--destructive btn--xs" data-action="owner-remove-confirm" data-id="${esc(owner.id)}"${ownerBusy ? " disabled" : ""}>${ownerBusy ? "Removing…" : "Remove"}</button>
          </span>
        </div>`;
      }
      return `<div class="md-owner-row">
        ${ownerAvatar(owner.name)}
        <span class="md-owner-row-name"><b>${esc(owner.name)}</b><small>${countText}</small></span>
        <span class="md-owner-row-actions">
          <button type="button" class="btn btn--outline-destructive btn--xs" data-action="owner-remove" data-id="${esc(owner.id)}" aria-label="Remove ${esc(owner.name)}"${ownerBusy ? " disabled" : ""}>Remove</button>
        </span>
      </div>`;
    }).join("");
  }

  function openOwners() {
    confirmingOwnerId = null;
    renderOwnersList();
    $("md-owners").hidden = false;
    $("md-owners-overlay").hidden = false;
    $("md-owner-name").focus();
  }

  function closeOwners() {
    if (ownerBusy) return;
    confirmingOwnerId = null;
    $("md-owners").hidden = true;
    $("md-owners-overlay").hidden = true;
  }

  async function addOwner(event) {
    event.preventDefault();
    if (ownerBusy) return;
    const input = $("md-owner-name");
    const name = input.value.trim().replace(/\s+/g, " ");
    if (!name) {
      toast("error", "Type the owner's name first.");
      input.focus();
      return;
    }
    if (owners.some((owner) => owner.name.toLowerCase() === name.toLowerCase())) {
      toast("error", `"${name}" is already an owner.`);
      return;
    }
    ownerBusy = true;
    $("md-owner-submit").disabled = true;
    try {
      await api("/api/owners", { method: "POST", body: JSON.stringify({ name }) });
      input.value = "";
      toast("success", `${name} added as an owner.`);
      await loadData();
    } catch (error) {
      toast("error", error.message || "Could not add this owner.");
    } finally {
      ownerBusy = false;
      $("md-owner-submit").disabled = false;
      renderOwnersList();
      input.focus();
    }
  }

  async function removeOwner(id) {
    const owner = owners.find((candidate) => candidate.id === id);
    if (!owner || ownerBusy) return;
    ownerBusy = true;
    renderOwnersList();
    try {
      const { unassignedClients } = await api(`/api/owners/${encodeURIComponent(id)}`, { method: "DELETE" });
      confirmingOwnerId = null;
      toast("success", unassignedClients ? `${owner.name} removed. ${plural(unassignedClients)} now Unassigned.` : `${owner.name} removed.`);
      if (readParams().get("poc") === owner.name) updateParam("poc", null);
      await loadData();
    } catch (error) {
      toast("error", error.message || "Could not remove this owner.");
    } finally {
      ownerBusy = false;
      renderOwnersList();
    }
  }

  // ---------------------------------------------------------------------------
  // Toasts, theme, agent rail, export
  // ---------------------------------------------------------------------------

  function toast(kind, message) {
    const node = document.createElement("div");
    node.className = `md-toast md-toast--${kind}`;
    node.setAttribute("role", kind === "error" ? "alert" : "status");
    node.innerHTML = `${icon(kind === "error" ? "alert-circle" : "check", 16)}<span>${esc(message)}</span>`;
    els.toasts.append(node);
    setTimeout(() => node.remove(), 3600);
  }

  function currentTheme() {
    return document.documentElement.classList.contains("light") ? "light" : "dark";
  }

  function renderThemeButton() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    els.themeBtn.setAttribute("aria-label", `Switch to ${next} theme`);
    els.themeBtn.innerHTML = icon(currentTheme() === "dark" ? "sun" : "moon", 16);
  }

  function toggleTheme() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.className = next;
    try { localStorage.setItem(STORAGE.theme, next); } catch {}
    renderThemeButton();
  }

  function setAgentOpen(open) {
    els.agentRail.hidden = !open;
    els.agentBtn.classList.toggle("is-active", open);
    els.agentBtn.setAttribute("aria-expanded", String(open));
    try { localStorage.setItem(STORAGE.agentOpen, open ? "1" : "0"); } catch {}
  }

  /** CSV in the same column layout as the team's Excel tracker. */
  function exportCsv() {
    const usDate = (iso) => {
      if (!iso) return "";
      const date = localDate(iso);
      return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    };
    const heading = ["Mapping Status", "Customer ID", "Client Name", "Number of Sites", "Country", "No. of NA's", "Flag 10 Review via Report", "Site with Price N/a", "Comp Sites Mapping Review", "Dashboard Final Qc", "Days Since Final QC", "Comments, If any", "POC", "Lead 1", "Lead 2", "Tracking"];
    const rows = sortClients(clients).map((client) => {
      const status = statusOf(client);
      const age = daysSince(client.finalQcAt);
      const label = status.key === "overdue" ? `Overdue (${age}+ days)` : status.key === "soon" || status.key === "ok" ? "On Track" : status.key === "nodate" ? "No Date" : "";
      const tracking = client.trackingGroup === "cycle" ? "In cycle" : status.label;
      return [label, client.customerId, client.name, client.siteCount, client.country, client.naCount, usDate(client.flag10At), usDate(client.priceNaAt), usDate(client.compReviewAt), usDate(client.finalQcAt), client.trackingGroup === "cycle" ? age : "", client.comments, client.poc, client.lead1, client.lead2, tracking].map(csvValue).join(",");
    });
    const blob = new Blob([[heading.map(csvValue).join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `client-mapping-tracker-${todayIso()}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target || target.disabled) return;
    const { action } = target.dataset;
    switch (action) {
      case "nav": event.preventDefault(); navigate(target.dataset.view); break;
      case "status": selectStatus(target.dataset.status); break;
      case "country": showClients({ country: target.dataset.country }); break;
      case "owner": showClients({ poc: target.dataset.poc }); break;
      case "owner-status": showClients({ poc: target.dataset.poc, status: target.dataset.status }); break;
      case "clear-filters": clearFilters(); break;
      case "open-client": if (target.dataset.id) openClient(target.dataset.id); break;
      case "new": openNew(); break;
      case "sort": {
        const { key } = target.dataset;
        sort = sort.key === key ? { key, direction: sort.direction === 1 ? -1 : 1 } : { key, direction: ["age", "siteCount", "naCount"].includes(key) ? -1 : 1 };
        render();
        break;
      }
      case "select-row":
        if (target.checked) selected.add(target.dataset.id);
        else selected.delete(target.dataset.id);
        render();
        break;
      case "select-all": {
        const ids = [...document.querySelectorAll('.md-table [data-action="select-row"]')].map((box) => box.dataset.id);
        for (const id of ids) target.checked ? selected.add(id) : selected.delete(id);
        render();
        break;
      }
      case "bulk-cycle": markCyclesDone([...selected]); break;
      case "bulk-final": setFinalQc([...selected]); break;
      case "bulk-clear": selected.clear(); render(); break;
      case "cycle-done": markCyclesDone([target.dataset.id]); break;
      case "refresh": loadData(); break;
      case "export": exportCsv(); break;
      case "theme": toggleTheme(); break;
      case "agent": setAgentOpen(els.agentRail.hidden); break;
      case "close-sheet": closeSheet(); break;
      case "mark-all-today": markCycleDone(); break;
      case "step-today": {
        const input = els.form.elements[target.dataset.step];
        input.value = todayIso();
        updateStepNumbers();
        break;
      }
      case "delete-open": openDeleteDialog(); break;
      case "delete-cancel": closeDeleteDialog(); break;
      case "delete-confirm": confirmDelete(); break;
      case "settings-open": openSettings(); break;
      case "settings-close": closeSettings(); break;
      case "owners-open": openOwners(); break;
      case "owners-close": closeOwners(); break;
      case "owner-remove": confirmingOwnerId = target.dataset.id; renderOwnersList(); break;
      case "owner-remove-cancel": confirmingOwnerId = null; renderOwnersList(); break;
      case "owner-remove-confirm": removeOwner(target.dataset.id); break;
    }
  });

  document.addEventListener("change", (event) => {
    const { filter, bulk } = event.target.dataset ?? {};
    if (filter) updateParam(filter, event.target.value);
    if (bulk === "assign" && event.target.value) reassign([...selected], event.target.value);
  });

  els.search.addEventListener("input", () => {
    const value = els.search.value;
    setParams((p) => {
      if (value) p.set("q", value);
      else p.delete("q");
      if (["overview", "activity"].includes(p.get("view") ?? "overview")) {
        p.set("view", "clients");
        p.delete("status");
      }
    }, { replace: true });
  });
  els.form.addEventListener("submit", submitForm);
  els.form.addEventListener("input", (event) => {
    if (STEPS.some((step) => step.key === event.target.name)) updateStepNumbers();
  });
  $("md-owner-form").addEventListener("submit", addOwner);
  $("md-settings").addEventListener("submit", saveSettings);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!$("md-settings").hidden) closeSettings();
      else if (!$("md-owners").hidden) closeOwners();
      else if (!els.dialog.hidden) closeDeleteDialog();
      else if (!els.sheet.hidden) closeSheet();
      else if (document.activeElement === els.search) els.search.blur();
      return;
    }
    const typing = event.target.matches?.("input, textarea, select, [contenteditable='true']");
    // Keyboard support for card-style elements that act as buttons.
    if ((event.key === "Enter" || event.key === " ") && !typing && event.target.matches?.('[role="button"][data-action]')) {
      event.preventDefault();
      event.target.click();
      return;
    }
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
    const dialogOpen = !els.sheet.hidden || !$("md-owners").hidden || !$("md-settings").hidden;
    if (event.key === "/") {
      event.preventDefault();
      els.search.focus();
    } else if (event.key.toLowerCase() === "c" && !dialogOpen) {
      event.preventDefault();
      openNew();
    }
  });

  window.addEventListener("hashchange", render);

  // Pick up changes made by teammates when returning to the tab.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && loadState === "ready") loadData();
  });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  document.querySelectorAll("[data-icon]").forEach((node) => {
    node.outerHTML = icon(node.dataset.icon, Number(node.dataset.size) || 16, Number(node.dataset.stroke) || 2);
  });
  renderThemeButton();
  let agentOpen = false;
  try { agentOpen = localStorage.getItem(STORAGE.agentOpen) === "1"; } catch {}
  setAgentOpen(agentOpen && window.innerWidth > 760);
  render();
  loadData();
})();
