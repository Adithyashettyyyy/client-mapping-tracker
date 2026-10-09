import { actionErrorMessage, useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { IconActivity, IconAlertCircle, IconArrowDown, IconArrowUp, IconCalendar, IconCheck, IconClock, IconDownload, IconLayoutDashboard, IconList, IconMessage, IconMoon, IconEyePause, IconPlus, IconSearch, IconSun, IconUsers } from "@tabler/icons-react";
import { AgentToggleButton } from "@agent-native/toolkit/app/chat";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import "./mapping-desk.css";

type View = "overview" | "clients" | "attention" | "parked" | "activity";
type TrackingGroup = "cycle" | "await" | "nomap";
type StepKey = "flag10At" | "priceNaAt" | "compReviewAt" | "finalQcAt";

type Client = {
  id: string;
  orgId: string;
  customerId: number;
  name: string;
  siteCount: number | null;
  country: string;
  naCount: number | null;
  flag10At: string | null;
  priceNaAt: string | null;
  compReviewAt: string | null;
  finalQcAt: string | null;
  comments: string;
  poc: string;
  lead1: string;
  lead2: string;
  trackingGroup: TrackingGroup;
  createdAt: string;
  updatedAt: string;
};

type Activity = {
  id: string;
  orgId: string;
  clientId: string | null;
  customerId: number;
  clientName: string;
  message: string;
  createdAt: string;
};

type ClientForm = {
  customerId: string;
  name: string;
  siteCount: string;
  country: string;
  naCount: string;
  flag10At: string;
  priceNaAt: string;
  compReviewAt: string;
  finalQcAt: string;
  comments: string;
  poc: string;
  lead1: string;
  lead2: string;
  trackingGroup: TrackingGroup;
};

const STEPS: { key: StepKey; label: string }[] = [
  { key: "flag10At", label: "Flag 10 review" },
  { key: "priceNaAt", label: "Price N/A review" },
  { key: "compReviewAt", label: "Comp review" },
  { key: "finalQcAt", label: "Final QC" },
];

const NAV: { view: View; label: string; icon: typeof IconLayoutDashboard }[] = [
  { view: "overview", label: "Overview", icon: IconLayoutDashboard },
  { view: "clients", label: "All clients", icon: IconList },
  { view: "attention", label: "Needs attention", icon: IconAlertCircle },
  { view: "activity", label: "Activity log", icon: IconActivity },
  { view: "parked", label: "Not in cycle", icon: IconEyePause },
];

const SLA_DAYS = 15;
const EMPTY_FORM: ClientForm = {
  customerId: "",
  name: "",
  siteCount: "",
  country: "USA",
  naCount: "",
  flag10At: "",
  priceNaAt: "",
  compReviewAt: "",
  finalQcAt: "",
  comments: "",
  poc: "",
  lead1: "",
  lead2: "",
  trackingGroup: "cycle",
};

function statusOf(client: Client) {
  if (client.trackingGroup === "nomap") return { key: "nomap", label: "No mapping needed", age: null };
  if (client.trackingGroup === "await") return { key: "await", label: "Awaiting request", age: null };
  if (!client.finalQcAt) return { key: "nodate", label: "No date", age: null };
  const date = new Date(`${client.finalQcAt}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const age = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (age > SLA_DAYS) return { key: "overdue", label: `Overdue · ${age}d`, age };
  if (age > SLA_DAYS - 7) return { key: "soon", label: "Due soon", age };
  return { key: "ok", label: "On track", age };
}

function displayDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function initials(value: string) {
  return value.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "—";
}

function formFromClient(client?: Client): ClientForm {
  if (!client) return { ...EMPTY_FORM };
  return {
    customerId: String(client.customerId),
    name: client.name,
    siteCount: client.siteCount == null ? "" : String(client.siteCount),
    country: client.country,
    naCount: client.naCount == null ? "" : String(client.naCount),
    flag10At: client.flag10At ?? "",
    priceNaAt: client.priceNaAt ?? "",
    compReviewAt: client.compReviewAt ?? "",
    finalQcAt: client.finalQcAt ?? "",
    comments: client.comments,
    poc: client.poc,
    lead1: client.lead1,
    lead2: client.lead2,
    trackingGroup: client.trackingGroup,
  };
}

function toActionInput(form: ClientForm) {
  return {
    customerId: Number(form.customerId),
    name: form.name.trim(),
    siteCount: form.siteCount === "" ? null : Number(form.siteCount),
    country: form.country.trim() || "USA",
    naCount: form.naCount === "" ? null : Number(form.naCount),
    flag10At: form.flag10At || null,
    priceNaAt: form.priceNaAt || null,
    compReviewAt: form.compReviewAt || null,
    finalQcAt: form.finalQcAt || null,
    comments: form.comments,
    poc: form.poc.trim(),
    lead1: form.lead1.trim(),
    lead2: form.lead2.trim(),
    trackingGroup: form.trackingGroup,
  };
}

function csvValue(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function activityTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function cycleAge(client: Client) {
  const status = statusOf(client);
  return status.age == null ? "—" : `${status.age}d`;
}

type StatusKey = "overdue" | "soon" | "ok" | "nodate";

const STATUS_SERIES: { key: StatusKey; label: string; token: string }[] = [
  { key: "overdue", label: "Overdue", token: "--md-red" },
  { key: "soon", label: "Due soon", token: "--md-amber" },
  { key: "ok", label: "On track", token: "--md-green" },
  { key: "nodate", label: "No final QC", token: "--md-violet" },
];

function OverviewInsights({
  clients,
  cycleClients,
  counts,
  onStatus,
  onCountry,
}: {
  clients: Client[];
  cycleClients: Client[];
  counts: Record<StatusKey, number>;
  onStatus: (status: StatusKey) => void;
  onCountry: (country: string) => void;
}) {
  const total = cycleClients.length;
  let cursor = 0;
  const stops = STATUS_SERIES.flatMap((series) => {
    const count = counts[series.key];
    if (!total || !count) return [];
    const start = cursor;
    cursor += (count / total) * 100;
    return [`hsl(var(${series.token})) ${start}% ${cursor}%`];
  });
  const ring = total ? `conic-gradient(${stops.join(", ")})` : "none";
  const countryTotals = new Map<string, { clients: number; sites: number }>();
  clients.forEach((client) => {
    const current = countryTotals.get(client.country) ?? { clients: 0, sites: 0 };
    current.clients += 1;
    current.sites += client.siteCount ?? 0;
    countryTotals.set(client.country, current);
  });
  const countries = [...countryTotals.entries()]
    .sort((a, b) => b[1].clients - a[1].clients || a[0].localeCompare(b[0]))
    .slice(0, 5);
  const maxClients = Math.max(1, ...countries.map(([, values]) => values.clients));

  return (
    <div className="md-insights-grid" aria-label="Client data insights">
      <section className="md-insight-card" aria-label="Cycle status distribution">
        <div className="md-insight-head"><h2>Cycle status</h2><span>{total} clients</span></div>
        <div className="md-status-insight">
          <div className={`md-status-donut ${total ? "has-data" : ""}`} role="img" aria-label={STATUS_SERIES.map((series) => `${series.label}: ${counts[series.key]}`).join(", ")} style={{ background: ring }}>
            <div><b>{total}</b><span>clients</span></div>
          </div>
          <div className="md-chart-legend">
            {STATUS_SERIES.map((series) => (
              <button type="button" key={series.key} onClick={() => onStatus(series.key)} disabled={!counts[series.key]}>
                <span><i style={{ background: `hsl(var(${series.token}))` }} />{series.label}</span>
                <b>{counts[series.key]}</b>
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="md-insight-card" aria-label="Clients by country">
        <div className="md-insight-head"><h2>Clients by country</h2><span>Top 5</span></div>
        {countries.length ? (
          <div className="md-country-chart">
            {countries.map(([country, values]) => (
              <button type="button" className="md-country-bar" key={country} onClick={() => onCountry(country)} aria-label={`Filter ${values.clients} clients in ${country}`}>
                <span className="md-country-label"><b>{country}</b><small>{values.clients} · {values.sites.toLocaleString()} sites</small></span>
                <span className="md-country-track"><i style={{ width: `${Math.max(4, (values.clients / maxClients) * 100)}%` }} /></span>
              </button>
            ))}
          </div>
        ) : (
          <div className="md-insight-empty">Client records will appear here.</div>
        )}
      </section>
    </div>
  );
}

function ClientStatus({ client }: { client: Client }) {
  const status = statusOf(client);
  return <span className={`md-status md-status--${status.key}`}><i />{status.label}</span>;
}

function CycleTrack({ client }: { client: Client }) {
  const completed = STEPS.filter((step) => client[step.key]).length;
  return (
    <div className="md-track" aria-label={`${completed} of 4 cycle steps dated`}>
      {STEPS.map((step, index) => (
        <span className={`md-track-step ${client[step.key] ? "is-done" : ""}`} key={step.key} title={`${step.label}: ${displayDate(client[step.key])}`}>
          <i>{client[step.key] ? <IconCheck size={11} stroke={2.5} /> : null}</i>
          <small>{index + 1}</small>
        </span>
      ))}
    </div>
  );
}

export function MappingDesk() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ClientForm>({ ...EMPTY_FORM });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [sort, setSort] = useState<{ key: "customerId" | "name" | "poc" | "age" | "siteCount"; direction: 1 | -1 }>({ key: "age", direction: -1 });

  const { data, isPending, isError, refetch } = useActionQuery("list-clients", {});
  const { data: activityData } = useActionQuery("list-activity", {});
  const clients = (data?.clients ?? []) as Client[];
  const activities = (activityData?.activities ?? []) as Activity[];

  const view = (searchParams.get("view") as View | null) ?? "overview";
  const query = searchParams.get("q") ?? "";
  const countryFilter = searchParams.get("country") ?? "all";
  const pocFilter = searchParams.get("poc") ?? "all";
  const statusFilter = searchParams.get("status") ?? "all";
  const clientId = searchParams.get("clientId");
  const isNew = searchParams.get("new") === "1";
  const client = clients.find((candidate) => candidate.id === clientId);
  const isSheetOpen = isNew || Boolean(client);

  const cycleClients = clients.filter((candidate) => candidate.trackingGroup === "cycle");
  const counts = useMemo(() => {
    const result = { overdue: 0, soon: 0, ok: 0, nodate: 0 };
    cycleClients.forEach((candidate) => {
      const key = statusOf(candidate).key;
      if (key in result) result[key as keyof typeof result] += 1;
    });
    return result;
  }, [cycleClients]);
  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return clients
      .filter((candidate) => {
        if (view === "parked" && candidate.trackingGroup === "cycle") return false;
        if (view !== "parked" && candidate.trackingGroup !== "cycle") return false;
        const status = statusOf(candidate).key;
        if (view === "attention" && !["overdue", "soon"].includes(status)) return false;
        if (statusFilter !== "all" && status !== statusFilter) return false;
        if (countryFilter !== "all" && candidate.country !== countryFilter) return false;
        if (pocFilter !== "all" && candidate.poc !== pocFilter) return false;
        if (normalizedQuery) {
          const content = [candidate.customerId, candidate.name, candidate.country, candidate.comments, candidate.poc, candidate.lead1, candidate.lead2].join(" ").toLowerCase();
          if (!content.includes(normalizedQuery)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        let left: string | number = "";
        let right: string | number = "";
        if (sort.key === "age") {
          left = statusOf(a).age ?? -1;
          right = statusOf(b).age ?? -1;
        } else {
          left = a[sort.key] ?? "";
          right = b[sort.key] ?? "";
          if (typeof left === "string") left = left.toLowerCase();
          if (typeof right === "string") right = right.toLowerCase();
        }
        return (left > right ? 1 : left < right ? -1 : 0) * sort.direction || a.customerId - b.customerId;
      });
  }, [clients, countryFilter, pocFilter, query, sort, statusFilter, view]);

  const createClient = useActionMutation("create-client", {
    onError: (error) => toast.error(actionErrorMessage(error) ?? "Could not add this client."),
    onSuccess: () => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete("new");
        next.set("view", "clients");
        return next;
      });
      toast.success("Client added to the tracker.");
    },
  });
  const updateClient = useActionMutation("update-client", {
    onError: (error) => toast.error(actionErrorMessage(error) ?? "Could not save these changes."),
    onSuccess: () => {
      closeSheet();
      toast.success("Changes saved.");
    },
  });
  const deleteClient = useActionMutation("delete-client", {
    onError: (error) => toast.error(actionErrorMessage(error) ?? "Could not remove this client."),
    onSuccess: () => {
      setDeleteOpen(false);
      closeSheet();
      toast.success("Client removed from the tracker.");
    },
  });

  useEffect(() => {
    setForm(formFromClient(client));
  }, [client?.id, isNew]);

  useEffect(() => {
    const handleShortcuts = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, select, [contenteditable='true']");
      if (typing) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key.toLowerCase() === "c" && !isSheetOpen) {
        event.preventDefault();
        openNew();
      }
    };
    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, [isSheetOpen]);

  function updateParam(key: string, value: string | null) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: key === "q" });
  }

  function navigate(viewName: View) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("view", viewName);
      next.delete("country");
      next.delete("poc");
      next.delete("q");
      next.delete("status");
      next.delete("clientId");
      next.delete("new");
      return next;
    });
  }

  function filterByOwner(poc: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("view", "clients");
      next.set("poc", poc);
      next.delete("country");
      next.delete("status");
      next.delete("clientId");
      next.delete("new");
      return next;
    });
  }

  function filterByCountry(country: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("view", "clients");
      next.set("country", country);
      next.delete("poc");
      next.delete("status");
      next.delete("clientId");
      next.delete("new");
      return next;
    });
  }

  function selectStatus(status: "all" | "overdue" | "soon" | "ok" | "nodate") {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("view", status === "overdue" || status === "soon" ? "attention" : "clients");
      if (status === "all") next.delete("status");
      else next.set("status", status);
      next.delete("country");
      next.delete("poc");
      next.delete("clientId");
      next.delete("new");
      return next;
    });
  }

  function openNew() {
    setForm({ ...EMPTY_FORM });
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("new", "1");
      next.delete("clientId");
      return next;
    });
  }

  function openClient(id: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("clientId", id);
      next.delete("new");
      return next;
    });
  }

  function closeSheet() {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("clientId");
      next.delete("new");
      return next;
    });
    setDeleteOpen(false);
  }

  function submitClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = toActionInput(form);
    if (!input.customerId || !input.name) {
      toast.error("Add a customer ID and client name.");
      return;
    }
    if (client) updateClient.mutate({ id: client.id, ...input });
    else createClient.mutate(input);
  }

  function markCycleDone() {
    if (!client) return;
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setForm((current) => ({ ...current, flag10At: iso, priceNaAt: iso, compReviewAt: iso, finalQcAt: iso, trackingGroup: "cycle" }));
  }

  function exportCsv() {
    const heading = ["Customer ID", "Client name", "Sites", "Country", "N/A count", "Flag 10 review", "Price N/A review", "Comp review", "Final QC", "Days since QC", "Comments", "POC", "Lead 1", "Lead 2", "Tracking"];
    const rows = clients.map((row) => [row.customerId, row.name, row.siteCount, row.country, row.naCount, row.flag10At, row.priceNaAt, row.compReviewAt, row.finalQcAt, row.trackingGroup === "cycle" ? statusOf(row).age : "", row.comments, row.poc, row.lead1, row.lead2, row.trackingGroup].map(csvValue).join(","));
    const blob = new Blob([[heading.map(csvValue).join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `mapping-desk-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  const countries = [...new Set(clients.map((candidate) => candidate.country))].sort();
  const pocs = [...new Set(clients.map((candidate) => candidate.poc).filter(Boolean))].sort();
  const siteTotal = filteredClients.reduce((total, candidate) => total + (candidate.siteCount ?? 0), 0);
  const pageTitle = NAV.find((item) => item.view === view)?.label ?? "Overview";
  const pending = createClient.isPending || updateClient.isPending || deleteClient.isPending;

  function sortButton(key: typeof sort.key, label: string) {
    const active = sort.key === key;
    return (
      <button type="button" className={`md-th-sort ${active ? "is-active" : ""}`} onClick={() => setSort((current) => current.key === key ? { key, direction: current.direction === 1 ? -1 : 1 } : { key, direction: key === "age" || key === "siteCount" ? -1 : 1 })}>
        {label}{active ? sort.direction > 0 ? <IconArrowUp size={13} /> : <IconArrowDown size={13} /> : null}
      </button>
    );
  }

  return (
    <div className="mapping-desk">
      <aside className="md-sidebar">
        <a className="md-brand" href="/" onClick={(event) => { event.preventDefault(); navigate("overview"); }}>
          <span className="md-brand-mark"><IconCheck size={18} stroke={2.5} /></span>
          <span>Mapping<span>Desk</span></span>
        </a>
        <nav className="md-nav" aria-label="Main navigation">
          <span className="md-nav-label">Workspace</span>
          {NAV.map(({ view: navView, label, icon: Icon }) => (
            <button type="button" className={`md-nav-item ${view === navView ? "is-active" : ""}`} onClick={() => navigate(navView)} key={navView}>
              <Icon size={17} stroke={1.8} />
              <span>{label}</span>
              {navView === "attention" && counts.overdue > 0 ? <b className="md-nav-count is-alert">{counts.overdue}</b> : null}
              {navView === "clients" ? <b className="md-nav-count">{cycleClients.length}</b> : null}
              {navView === "parked" ? <b className="md-nav-count">{clients.length - cycleClients.length}</b> : null}
            </button>
          ))}
        </nav>
        <div className="md-sidebar-spacer" />
        {pocs.length ? (
          <section className="md-team" aria-label="Client owners">
            <div className="md-nav-label"><span>Owners</span><IconUsers size={14} /></div>
            {pocs.map((poc) => (
              <button type="button" className={`md-owner ${pocFilter === poc ? "is-active" : ""}`} key={poc} onClick={() => filterByOwner(poc)}>
                <span className="md-avatar">{initials(poc)}</span><span>{poc}</span>
                <b>{cycleClients.filter((candidate) => candidate.poc === poc).length}</b>
              </button>
            ))}
          </section>
        ) : null}
        <div className="md-sidebar-foot"><IconClock size={14} /> Final QC window · {SLA_DAYS} days</div>
      </aside>

      <main className="md-main">
        <header className="md-topbar">
          <div className="md-mobile-brand"><span className="md-brand-mark"><IconCheck size={16} stroke={2.5} /></span>Mapping Desk</div>
          <label className="md-search">
            <IconSearch size={16} stroke={1.8} />
            <Input ref={searchRef} value={query} onChange={(event) => updateParam("q", event.target.value)} placeholder="Search clients, IDs, notes…" aria-label="Search clients" />
            <kbd>/</kbd>
          </label>
          <div className="md-top-actions">
            <span className="md-save-state"><i />Live data</span>
            <Button type="button" variant="outline" size="sm" className="md-export" onClick={exportCsv}><IconDownload size={15} />Export CSV</Button>
            <Button type="button" size="sm" className="md-add" onClick={openNew}><IconPlus size={16} />New client <kbd>C</kbd></Button>
            <Button type="button" variant="ghost" size="icon-sm" className="md-theme-btn" aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`} onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>{resolvedTheme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}</Button>
            <AgentToggleButton />
          </div>
        </header>

        <nav className="md-mobile-nav" aria-label="Mobile navigation">
          {NAV.map(({ view: navView, label }) => (
            <button type="button" className={view === navView ? "is-active" : ""} onClick={() => navigate(navView)} key={navView}>{label}</button>
          ))}
        </nav>

        <section className="md-content">
          <div className="md-page-heading">
            <div>
              <p className="md-eyebrow"><span className="md-live-dot" />Mapping operations <span>/</span> {pageTitle}</p>
              <h1>Client mapping</h1>
            </div>
            {view !== "activity" ? <div className="md-heading-meta"><IconCalendar size={15} />Final QC · {SLA_DAYS}-day window</div> : null}
          </div>

          {view === "overview" ? (
            <div className="md-stats" aria-label="Cycle status summary">
              <button type="button" className="md-stat md-stat--overdue" onClick={() => selectStatus("overdue")}><span className="md-stat-icon"><IconAlertCircle size={18} /></span><span><b>{counts.overdue}</b><small>Overdue</small></span><IconArrowDown className="md-stat-arrow" size={15} /></button>
              <button type="button" className="md-stat md-stat--soon" onClick={() => selectStatus("soon")}><span className="md-stat-icon"><IconClock size={18} /></span><span><b>{counts.soon}</b><small>Due within 7 days</small></span><IconArrowDown className="md-stat-arrow" size={15} /></button>
              <button type="button" className="md-stat md-stat--ok" onClick={() => selectStatus("ok")}><span className="md-stat-icon"><IconCheck size={18} /></span><span><b>{counts.ok}</b><small>On track</small></span><IconArrowUp className="md-stat-arrow" size={15} /></button>
              <button type="button" className="md-stat md-stat--nodate" onClick={() => selectStatus("nodate")}><span className="md-stat-icon"><IconCalendar size={18} /></span><span><b>{counts.nodate}</b><small>No final QC date</small></span><IconArrowDown className="md-stat-arrow" size={15} /></button>
            </div>
          ) : null}

          {view === "overview" ? <OverviewInsights clients={clients} cycleClients={cycleClients} counts={counts} onStatus={selectStatus} onCountry={filterByCountry} /> : null}

          <div className="md-toolbar">
            <div className="md-tabs" role="tablist" aria-label="Client status filter">
              {(["all", "overdue", "soon", "ok", "nodate"] as const).map((key) => {
                const label = key === "all" ? "All clients" : key === "soon" ? "Due soon" : key === "ok" ? "On track" : key === "nodate" ? "No date" : "Overdue";
                const count = key === "all" ? cycleClients.length : counts[key];
                const active = statusFilter === key;
                return view === "activity" || view === "parked" ? null : (
                  <button type="button" role="tab" aria-selected={active} className={active ? "is-active" : ""} onClick={() => selectStatus(key)} key={key}>{label}<span>{count}</span></button>
                );
              })}
            </div>
            <div className="md-filters">
              <label className="md-select-wrap"><span className="sr-only">Filter by owner</span><select value={pocFilter} onChange={(event) => updateParam("poc", event.target.value)}><option value="all">All owners</option>{pocs.map((poc) => <option value={poc} key={poc}>{poc}</option>)}</select></label>
              <label className="md-select-wrap"><span className="sr-only">Filter by country</span><select value={countryFilter} onChange={(event) => updateParam("country", event.target.value)}><option value="all">All countries</option>{countries.map((country) => <option value={country} key={country}>{country}</option>)}</select></label>
              <span className="md-result-count">{filteredClients.length} clients <i /> {siteTotal.toLocaleString()} sites</span>
            </div>
          </div>

          {view === "activity" ? (
            <section className="md-activity-panel">
              {activities.length ? activities.map((item) => (
                <button type="button" className="md-activity-row" onClick={() => item.clientId && openClient(item.clientId)} key={item.id}>
                  <span className="md-activity-icon"><IconActivity size={15} /></span>
                  <span className="md-activity-copy"><b>CL-{item.customerId} · {item.clientName}</b><small>{item.message}</small></span>
                  <time>{activityTime(item.createdAt)}</time>
                </button>
              )) : <div className="md-empty md-empty--compact"><span className="md-empty-icon"><IconActivity size={20} /></span><b>No changes recorded</b><p>Client updates will appear here.</p></div>}
            </section>
          ) : (
            <section className="md-table-card" aria-label="Client records">
              <div className="md-table-caption"><div><h2>{view === "attention" ? "At-risk clients" : view === "parked" ? "Clients outside the cycle" : "Client register"}</h2><span>{view === "attention" ? `${counts.overdue + counts.soon} records need a closer look` : `${filteredClients.length} records in this view`}</span></div><Button type="button" variant="ghost" size="sm" onClick={() => refetch()} disabled={isPending} aria-label="Refresh client list"><IconActivity size={15} />Refresh</Button></div>
              {isPending ? (
                <div className="md-skeleton-list" aria-label="Loading clients"><div /><div /><div /><div /></div>
              ) : isError ? (
                <div className="md-empty"><span className="md-empty-icon md-empty-icon--error"><IconAlertCircle size={20} /></span><b>Couldn’t load the tracker</b><p>Try again to reconnect to the client records.</p><Button type="button" variant="outline" size="sm" onClick={() => refetch()}>Try again</Button></div>
              ) : filteredClients.length ? (
                <>
                  <div className="md-table-scroll">
                    <table className="md-table">
                      <thead><tr><th>{sortButton("customerId", "Client")}</th><th>{sortButton("poc", "Owner")}</th><th>Cycle progress</th><th>Status</th><th>{sortButton("age", "Since QC")}</th><th>{sortButton("siteCount", "Sites")}</th></tr></thead>
                      <tbody>{filteredClients.map((row) => (
                        <tr key={row.id}>
                          <td><button type="button" className="md-client-open" onClick={() => openClient(row.id)}><span className="md-client-cell"><span className="md-client-mark">{initials(row.name)}</span><span><b>{row.name}</b><small>CL-{row.customerId} <i /> {row.country}</small></span></span></button></td>
                          <td><span className="md-owner-cell"><span className="md-avatar">{initials(row.poc)}</span>{row.poc || "Unassigned"}</span></td>
                          <td><CycleTrack client={row} /></td>
                          <td><ClientStatus client={row} /></td>
                          <td><span className={`md-age md-age--${statusOf(row).key}`}>{cycleAge(row)}</span></td>
                          <td><span className="md-sites">{row.siteCount?.toLocaleString() ?? "—"}</span></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <div className="md-mobile-records">{filteredClients.map((row) => (
                    <button type="button" className="md-mobile-record" key={row.id} onClick={() => openClient(row.id)}>
                      <div className="md-mobile-record-top"><span className="md-client-mark">{initials(row.name)}</span><span className="md-mobile-name"><b>{row.name}</b><small>CL-{row.customerId} · {row.country}</small></span><ClientStatus client={row} /></div>
                      <div className="md-mobile-record-bottom"><span><span className="md-avatar">{initials(row.poc)}</span>{row.poc || "Unassigned"}</span><span>{row.siteCount?.toLocaleString() ?? "—"} sites</span><span>{cycleAge(row)} since QC</span></div>
                      <CycleTrack client={row} />
                    </button>
                  ))}</div>
                </>
              ) : (
                <div className="md-empty"><span className="md-empty-icon">{view === "attention" ? <IconCheck size={21} /> : view === "parked" ? <IconEyePause size={20} /> : <IconUsers size={20} />}</span><b>{query ? "No matching clients" : view === "attention" ? "Nothing needs attention" : view === "parked" ? "No clients outside the cycle" : "Your client register is empty"}</b><p>{query ? "Try a different name, ID, country, or note." : view === "attention" ? "No clients are overdue or due within the next week." : "Add a client to start tracking mapping progress."}</p>{view !== "attention" && view !== "parked" ? <Button type="button" size="sm" onClick={openNew}><IconPlus size={15} />Add client</Button> : null}</div>
              )}
            </section>
          )}

          {view === "overview" ? (
            <section className="md-lower-grid">
              <div className="md-lower-card"><div className="md-lower-head"><div><h2>Needs attention</h2><span>Oldest final QC first</span></div><button type="button" onClick={() => navigate("attention")}>View all <span>→</span></button></div>
                {cycleClients.filter((row) => ["overdue", "soon"].includes(statusOf(row).key)).sort((a, b) => (statusOf(b).age ?? 0) - (statusOf(a).age ?? 0)).slice(0, 4).map((row) => <button type="button" className="md-attention-row" key={row.id} onClick={() => openClient(row.id)}><span className="md-attention-key">CL-{row.customerId}</span><span className="md-attention-name"><b>{row.name}</b><small>{row.poc || "Unassigned"} · {row.siteCount ?? "?"} sites</small></span><ClientStatus client={row} /></button>)}
                {!cycleClients.some((row) => ["overdue", "soon"].includes(statusOf(row).key)) ? <div className="md-lower-empty"><IconCheck size={17} />No clients are currently at risk.</div> : null}
              </div>
              <div className="md-lower-card md-activity-preview"><div className="md-lower-head"><div><h2>Recent activity</h2><span>Latest tracker changes</span></div><button type="button" onClick={() => navigate("activity")}>View log <span>→</span></button></div>
                {activities.slice(0, 4).map((item) => <button type="button" className="md-feed-row" onClick={() => item.clientId && openClient(item.clientId)} key={item.id}><span className="md-feed-dot"><IconMessage size={13} /></span><span><b>CL-{item.customerId} · {item.clientName}</b><small>{item.message}</small></span><time>{activityTime(item.createdAt)}</time></button>)}
                {!activities.length ? <div className="md-lower-empty"><IconActivity size={16} />Activity will appear as clients change.</div> : null}
              </div>
            </section>
          ) : null}
        </section>
      </main>

      <Sheet open={isSheetOpen} onOpenChange={(open) => { if (!open) closeSheet(); }}>
        <SheetContent side="right" className="md-sheet" aria-describedby="md-sheet-description">
          <SheetHeader className="md-sheet-head">
            <span className="md-sheet-kicker">{client ? `CL-${client.customerId}` : "New record"}</span>
            <SheetTitle>{client ? client.name : "Add client"}</SheetTitle>
            <SheetDescription id="md-sheet-description">{client ? "Update ownership, mapping progress, and client notes." : "Create a client record in the mapping tracker."}</SheetDescription>
          </SheetHeader>
          <form className="md-form" onSubmit={submitClient}>
            <div className="md-form-body">
              <section className="md-form-section">
                <div className="md-form-section-head"><h3>Client details</h3><span>Required fields marked *</span></div>
                <div className="md-form-grid">
                  <div className="md-field"><Label htmlFor="md-customer-id">Customer ID <em>*</em></Label><Input id="md-customer-id" type="number" min="1" required value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })} placeholder="e.g. 1090" /></div>
                  <div className="md-field"><Label htmlFor="md-client-name">Client name <em>*</em></Label><Input id="md-client-name" required maxLength={200} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Client or brand name" /></div>
                  <div className="md-field"><Label htmlFor="md-sites">Number of sites</Label><Input id="md-sites" type="number" min="0" value={form.siteCount} onChange={(event) => setForm({ ...form, siteCount: event.target.value })} placeholder="—" /></div>
                  <div className="md-field"><Label htmlFor="md-na-count">Sites with N/A pricing</Label><Input id="md-na-count" type="number" min="0" value={form.naCount} onChange={(event) => setForm({ ...form, naCount: event.target.value })} placeholder="—" /></div>
                  <div className="md-field"><Label htmlFor="md-country">Country</Label><Input id="md-country" maxLength={80} value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} placeholder="USA" /></div>
                  <div className="md-field"><Label htmlFor="md-poc">Owner / POC</Label><Input id="md-poc" maxLength={120} list="md-poc-list" value={form.poc} onChange={(event) => setForm({ ...form, poc: event.target.value })} placeholder="Assign an owner" /><datalist id="md-poc-list">{pocs.map((poc) => <option value={poc} key={poc} />)}</datalist></div>
                  <div className="md-field"><Label htmlFor="md-lead-one">Lead 1</Label><Input id="md-lead-one" maxLength={120} value={form.lead1} onChange={(event) => setForm({ ...form, lead1: event.target.value })} placeholder="Mapping lead" /></div>
                  <div className="md-field"><Label htmlFor="md-lead-two">Lead 2</Label><Input id="md-lead-two" maxLength={120} value={form.lead2} onChange={(event) => setForm({ ...form, lead2: event.target.value })} placeholder="Second lead" /></div>
                  <div className="md-field md-field--full"><Label htmlFor="md-tracking">Tracking state</Label><select id="md-tracking" className="md-native-select" value={form.trackingGroup} onChange={(event) => setForm({ ...form, trackingGroup: event.target.value as TrackingGroup })}><option value="cycle">In mapping cycle</option><option value="await">Awaiting mapping request</option><option value="nomap">No mapping needed</option></select></div>
                </div>
              </section>

              <section className="md-form-section">
                <div className="md-form-section-head"><h3>Cycle steps</h3>{client ? <Button type="button" variant="outline" size="xs" onClick={markCycleDone}><IconCheck size={13} />Mark all today</Button> : null}</div>
                <div className="md-step-list">{STEPS.map((step, index) => (
                  <div className="md-step-row" key={step.key}>
                    <span className={`md-step-number ${form[step.key] ? "is-done" : ""}`}>{form[step.key] ? <IconCheck size={12} /> : index + 1}</span>
                    <Label htmlFor={`md-step-${step.key}`}>{step.label}</Label>
                    <Input id={`md-step-${step.key}`} type="date" value={form[step.key]} onChange={(event) => setForm({ ...form, [step.key]: event.target.value })} />
                  </div>
                ))}</div>
              </section>

              <section className="md-form-section md-comments-section">
                <div className="md-form-section-head"><h3>Mapping notes</h3></div>
                <Label className="sr-only" htmlFor="md-comments">Comments</Label>
                <textarea id="md-comments" maxLength={4000} value={form.comments} onChange={(event) => setForm({ ...form, comments: event.target.value })} placeholder="Station IDs, data issues, product mapping notes…" />
              </section>
              {client ? <p className="md-last-updated">Last updated {activityTime(client.updatedAt)}</p> : null}
            </div>
            <SheetFooter className="md-sheet-footer">
              {client ? <Button type="button" variant="outline-destructive" size="sm" className="md-delete-trigger" onClick={() => setDeleteOpen(true)}>Remove</Button> : null}
              <span className="md-footer-spacer" />
              <Button type="button" variant="ghost" size="sm" onClick={closeSheet}>Cancel</Button>
              <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : client ? "Save changes" : <><IconPlus size={15} />Add client</>}</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remove this client?</AlertDialogTitle><AlertDialogDescription>{client ? `${client.name} will be removed from the tracker. Its activity history will remain.` : "This client will be removed from the tracker."}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={deleteClient.isPending}>Keep client</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={!client || deleteClient.isPending} onClick={(event) => { event.preventDefault(); if (client) deleteClient.mutate({ id: client.id }); }}>{deleteClient.isPending ? "Removing…" : "Remove client"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

}
