"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  Footprints,
  Gift,
  MessageSquareText,
  MapPin,
  Search,
  Minus,
  Plus,
  LayoutDashboard,
  LogOut,
  QrCode as QrCodeIcon,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Trophy,
  Trash2,
  X,
  Coins,
  UserRoundCog,
  UsersRound,
} from "lucide-react";
import { Brand } from "./Brand";
import { MerchantScanner } from "./MerchantScanner";
import { QrCode } from "./QrCode";
import { PROGRAM_COLORS, visibleProgramTerms } from "../lib/program-style";
import { PILOT_DURATION_REMINDER } from "../lib/legal";

type DashboardData = {
  welcomePending?: boolean;
  pilotAcceptanceRequired: boolean;
  pilot: { startedAt: string; endsAt: string; daysRemaining: number; state: "standard" | "extended" | "continued" } | null;
  merchant: {
    id: string;
    firstName: string;
    lastName: string;
    businessName: string;
    slug: string;
    email: string;
    accentColor: string;
    role: "owner" | "employee";
    employeeId: string | null;
    employeeName: string | null;
    employeeMustChangePin: number;
  };
  program: { id: string; name: string; goal: number; rewardText: string; terms: string; active: number; earningMode: "visits" | "spend"; spendAmountCents: number } | null;
  rewardTiers: Array<{ id: string; threshold: number; rewardText: string; sortOrder: number }>;
  customers: Array<{ membershipId: string; code: string; firstName: string; phone: string | null; marketingConsent: number; points: number; totalPoints: number; availableRewards: number; undoableStampId: string | null; updatedAt: string; segment: "new" | "active" | "loyal" | "reactivate" }>;
  activity: Array<{ id: string; code: string; firstName: string; delta: number; reason: string; actorName: string; createdAt: string; amountCents: number | null; note: string | null; rewardText: string | null; canUndoReward: number }>;
  employees: Array<{ id: string; displayName: string; email: string | null; loginCode: string; active: number; mustChangePin: number; createdAt: string }>;
  stats: { customers: number; visits: number; rewards: number; newMembers: number; returningCustomers: number; avgFrequencyDays: number | null; rewardsEarned: number; rewardsRedeemed: number };
  segmentCounts: { new: number; active: number; loyal: number; reactivate: number; reward: number };
};

type ReadyDashboardData = DashboardData & { program: NonNullable<DashboardData["program"]> };

type StampResult = {
  customer: { firstName: string; code: string; points: number; goal: number };
  quantity: number;
  stampId: string;
  rewardEarned: boolean;
  rewardsEarned: number;
  availableRewards: number;
  rewards: Array<{ id: string; rewardText: string; threshold: number }>;
  earningMode: "visits" | "spend";
  amountCents: number | null;
};

type ScanCandidate = {
  customer: { firstName: string; code: string; points: number; goal: number };
  earningMode: "visits" | "spend";
  spendAmountCents: number;
  rewards: Array<{ id: string; rewardText: string; threshold: number }>;
};

type CustomerDialog = {
  kind: "bonus" | "delete";
  customer: DashboardData["customers"][number];
};

const tabs = [
  { id: "overview", label: "Vue d’ensemble", shortLabel: "Accueil", icon: LayoutDashboard },
  { id: "scan", label: "Scanner un client", shortLabel: "Scanner", icon: ScanLine },
  { id: "customers", label: "Clients", shortLabel: "Clients", icon: UsersRound },
  { id: "program", label: "Mon programme", shortLabel: "Programme", icon: Gift },
  { id: "notifications", label: "Alertes Wallet", shortLabel: "Alertes", icon: BellRing },
  { id: "team", label: "Mon équipe", shortLabel: "Équipe", icon: UserRoundCog },
] as const;

type Tab = (typeof tabs)[number]["id"];

export function DashboardApp() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [stampResult, setStampResult] = useState<StampResult | null>(null);
  const [scanCandidate, setScanCandidate] = useState<ScanCandidate | null>(null);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<"all" | "new" | "active" | "loyal" | "reactivate" | "reward">("all");
  const [employeeAccess, setEmployeeAccess] = useState<{ displayName: string; loginCode: string; temporaryPin: string } | null>(null);
  const [showEmployeePin, setShowEmployeePin] = useState(false);
  const [customerDialog, setCustomerDialog] = useState<CustomerDialog | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [settingsTierCount, setSettingsTierCount] = useState(1);
  const [settingsEarningMode, setSettingsEarningMode] = useState<"visits" | "spend">("visits");
  const sessionInitialized = useRef(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/merchant/dashboard", { cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/merchant";
      return;
    }
    const result = (await response.json()) as DashboardData & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Tableau de bord indisponible.");
    setData(result);
    if (!sessionInitialized.current) {
      sessionInitialized.current = true;
      if (result.merchant.role === "employee") setTab("scan");
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        await load();
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Erreur de chargement.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => { active = false; };
  }, [load]);

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setFeedbackError("");
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/merchant/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(formData)) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setFeedbackError(result.error ?? "Le retour n’a pas pu être envoyé.");
    else { setFeedbackOpen(false); setToast("Merci pour ton retour."); }
    setBusy(false);
  }

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (data?.program) {
      setSettingsTierCount(Math.max(1, data.rewardTiers.length));
      setSettingsEarningMode(data.program.earningMode);
    }
  }, [data?.program?.id, data?.rewardTiers.length]);

  async function recognize(code: string) {
    setBusy(true); setError("");
    const response = await fetch("/api/merchant/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const result = await response.json() as ScanCandidate & { error?: string };
    if (!response.ok) setError(result.error ?? "Carte non reconnue.");
    else setScanCandidate(result);
    setBusy(false);
  }

  async function stamp(code: string, quantity = 1, amountCents?: number) {
    if (quantity > 1 && !window.confirm(`Confirmer l’ajout de ${quantity} points ?`)) return;
    setBusy(true);
    setError("");
    const requestId = crypto.randomUUID();
    const submit = (confirmRecent: boolean) => fetch("/api/merchant/stamp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, quantity, amountCents, requestId, confirmMultiple: quantity > 1 || Boolean(amountCents), confirmRecent }),
    });
    let response = await submit(false);
    let result = (await response.json()) as StampResult & { error?: string; code?: string };
    if (response.status === 409 && result.code === "recent_scan" && window.confirm(result.error)) {
      response = await submit(true);
      result = (await response.json()) as StampResult & { error?: string; code?: string };
    }
    if (!response.ok) {
      setError(result.error ?? "Passage non ajouté.");
      setBusy(false);
      return;
    }
    setStampResult(result);
    setScanCandidate(null);
    await load();
    setBusy(false);
  }

  async function redeem(code: string, rewardId?: string, keepScan = false) {
    if (!rewardId && !window.confirm("Confirmer la remise de la récompense ?")) return false;
    setBusy(true);
    const response = await fetch("/api/merchant/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, rewardId }) });
    const result = (await response.json()) as { rewardId?: string; stampId?: string; firstName?: string; rewardText?: string; pointsDebited?: number; pointsAfter?: number; error?: string };
    if (!response.ok) setError(result.error ?? "Récompense non remise.");
    else {
      setToast(`${result.rewardText ?? "Récompense"} remise à ${result.firstName}.`);
      if (!keepScan) { setStampResult(null); setScanCandidate(null); }
      await load();
      if (keepScan) await recognize(code);
    }
    setBusy(false);
    return response.ok;
  }

  async function undoStamp(stampId: string, firstName: string) {
    if (!window.confirm(`Annuler le dernier passage de ${firstName} ?`)) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/merchant/stamp/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stampId }),
    });
    const result = (await response.json()) as { firstName?: string; error?: string };
    if (!response.ok) setError(result.error ?? "Passage non annulé.");
    else {
      setToast(`Dernier passage de ${result.firstName} annulé.`);
      setStampResult(null);
      await load();
    }
    setBusy(false);
  }

  async function undoReward(stampId: string, firstName: string) {
    if (!window.confirm(`Annuler la remise de récompense à ${firstName} et restituer les points ?`)) return;
    setBusy(true); setError("");
    const response = await fetch("/api/merchant/redeem/undo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stampId }) });
    const result = await response.json() as { firstName?: string; pointsRestored?: number; error?: string };
    if (!response.ok) setError(result.error ?? "La remise n’a pas pu être annulée.");
    else { setToast(`${result.pointsRestored ?? 0} points restitués à ${result.firstName}.`); await load(); }
    setBusy(false);
  }

  async function saveProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const formData = new FormData(event.currentTarget);
    const payload = { ...Object.fromEntries(formData), rewardTiers: formData.getAll("tierThreshold").map((threshold, index) => ({ threshold: Number(threshold), rewardText: String(formData.getAll("tierRewardText")[index] ?? "") })) };
    const response = await fetch("/api/merchant/program", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) setError(result.error ?? "Modifications non enregistrées.");
    else {
      setToast("Programme mis à jour.");
      await load();
    }
    setBusy(false);
  }

  function addBonus(customer: DashboardData["customers"][number]) {
    setCustomerDialog({ kind: "bonus", customer });
  }

  function confirmCustomerDeletion(customer: DashboardData["customers"][number]) {
    setError("");
    setCustomerDialog({ kind: "delete", customer });
  }

  async function submitBonus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customerDialog || customerDialog.kind !== "bonus") return;
    const formData = new FormData(event.currentTarget);
    const quantity = Number(formData.get("quantity"));
    const note = String(formData.get("note") ?? "");
    setBusy(true); setError("");
    const response = await fetch("/api/merchant/bonus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: customerDialog.customer.code, quantity, note }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error ?? "Bonus non ajouté."); else { setToast(`Bonus ajouté à ${customerDialog.customer.firstName}.`); setCustomerDialog(null); await load(); }
    setBusy(false);
  }

  async function deleteCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customerDialog || customerDialog.kind !== "delete") return;
    setBusy(true); setError("");
    const response = await fetch(`/api/merchant/customers/${encodeURIComponent(customerDialog.customer.membershipId)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    });
    const result = await response.json() as { error?: string; walletInvalidationPending?: boolean };
    if (!response.ok) setError(result.error ?? "Le client n’a pas pu être supprimé.");
    else {
      setCustomerDialog(null);
      setToast(result.walletInvalidationPending
        ? "Client supprimé. La désactivation Wallet se terminera automatiquement."
        : "Client supprimé du programme.");
      await load();
    }
    setBusy(false);
  }

  function customerAction(customer: DashboardData["customers"][number]) {
    void recognize(customer.code);
  }

  async function updateSecurity(
    event: FormEvent<HTMLFormElement>,
    action: "change_owner_password",
  ) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const response = await fetch("/api/merchant/security", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), action }),
    });
    const result = (await response.json()) as { error?: string; reauthenticate?: boolean };
    if (!response.ok) setError(result.error ?? "Accès non modifié.");
    else if (result.reauthenticate) {
      window.alert("Ton code confidentiel a été modifié. Reconnecte-toi avec le nouveau code.");
      window.location.href = "/merchant";
      return;
    } else {
      form.reset();
      setToast("Code confidentiel mis à jour.");
      await load();
    }
    setBusy(false);
  }

  async function createEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const response = await fetch("/api/merchant/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const result = (await response.json()) as { employee?: { displayName: string; loginCode: string; temporaryPin: string }; error?: string };
    if (!response.ok) setError(result.error ?? "Employé non créé.");
    else {
      form.reset();
      if (result.employee) setEmployeeAccess(result.employee);
      await load();
    }
    setBusy(false);
  }

  async function setEmployeeActive(employee: DashboardData["employees"][number]) {
    const nextActive = !employee.active;
    if (!nextActive && !window.confirm(`Désactiver immédiatement l’accès de ${employee.displayName} ?`)) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/merchant/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_active", employeeId: employee.id, active: nextActive }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) setError(result.error ?? "Accès non modifié.");
    else {
      setToast(nextActive ? `Accès de ${employee.displayName} réactivé.` : `Accès de ${employee.displayName} désactivé.`);
      await load();
    }
    setBusy(false);
  }

  async function resetEmployeePin(employee: DashboardData["employees"][number]) {
    if (!window.confirm(`Réinitialiser le code PIN de ${employee.displayName} ? Ses sessions seront fermées.`)) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/merchant/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset_pin", employeeId: employee.id }),
    });
    const result = (await response.json()) as { temporaryPin?: string; error?: string };
    if (!response.ok) setError(result.error ?? "Code non modifié.");
    else if (result.temporaryPin) setEmployeeAccess({ displayName: employee.displayName, loginCode: employee.email || employee.loginCode, temporaryPin: result.temporaryPin });
    setBusy(false);
  }

  async function changeEmployeePin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const response = await fetch("/api/merchant/security", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), action: "change_employee_pin" }),
    });
    const result = (await response.json()) as { error?: string; reauthenticate?: boolean };
    if (!response.ok) setError(result.error ?? "Code PIN non modifié.");
    else if (result.reauthenticate) {
      window.alert("Ton code PIN a été modifié. Reconnecte-toi avec le nouveau code.");
      window.location.href = "/merchant";
      return;
    } else {
      form.reset();
      setShowEmployeePin(false);
      setToast("Ton nouveau code PIN est enregistré.");
      await load();
    }
    setBusy(false);
  }

  async function copyEmployeeIdentifier(employee: DashboardData["employees"][number]) {
    await navigator.clipboard.writeText(employee.email || employee.loginCode);
    setToast(`Identifiant de ${employee.displayName} copié.`);
  }

  async function logout() {
    await fetch("/api/merchant/logout", { method: "POST" });
    window.location.href = "/";
  }

  const filteredCustomers = useMemo(() => data?.customers.filter((customer) => `${customer.firstName} ${customer.phone ?? ""} ${customer.code}`.toLowerCase().includes(search.toLowerCase()) && (segment === "all" || segment === "reward" ? segment === "all" || customer.availableRewards > 0 : customer.segment === segment)) ?? [], [data, search, segment]);
  const visibleTabs = useMemo(
    () => data?.merchant.role === "employee" ? tabs.filter((item) => item.id === "scan") : tabs,
    [data],
  );
  const appOrigin = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? window.location.origin : "https://kivli.fr";
  const joinUrl = data ? `${appOrigin}/join/${data.merchant.slug}` : "";

  function showEnrollmentQr() {
    setTab("overview");
    window.setTimeout(() => {
      document.getElementById("customer-enrollment-qr")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  if (loading) return <main className="dashboard-loading"><Brand /><div className="loading-bar"><span /></div><p>Ouverture de ton espace…</p></main>;
  if (!data) return <main className="dashboard-loading"><Brand /><p>{error || "Tableau de bord indisponible."}</p><a href="/merchant" className="button">Se reconnecter</a></main>;
  if (data.merchant.role === "employee" && data.merchant.employeeMustChangePin) {
    return <EmployeePinSetup data={data} busy={busy} error={error} onSubmit={changeEmployeePin} onLogout={logout} />;
  }
  if (data.pilotAcceptanceRequired) {
    return <PilotActivationGate data={data} onAccepted={load} onLogout={logout} />;
  }
  if (!data.program) {
    return <ProgramOnboarding data={data} onCreated={load} onLogout={logout} />;
  }

  return (
    <main className={`dashboard ${data.merchant.role === "employee" ? "employee-dashboard" : ""}`} style={{ "--merchant": data.merchant.accentColor } as React.CSSProperties}>
      {busy && <div className="dashboard-progress" role="status" aria-live="polite" aria-label="Action en cours"><span /></div>}
      <aside className="sidebar">
        <Brand />
        <div className="merchant-pill"><span>{data.merchant.businessName.slice(0, 1)}</span><div><strong>{data.merchant.businessName}</strong><small>{data.merchant.role === "employee" ? `${data.merchant.employeeName} · Employé` : "Accès propriétaire"}</small></div></div>
        <nav>{visibleTabs.map((item) => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setError(""); }}><Icon className="nav-icon" size={20} strokeWidth={2} aria-hidden="true" />{item.label}</button>; })}</nav>
        <div className="sidebar-foot">{data.merchant.role === "owner" && <button className="sidebar-feedback" onClick={() => { setFeedbackError(""); setFeedbackOpen(true); }}><MessageSquareText size={16} aria-hidden="true" />Faire un retour</button>}{data.merchant.role === "employee" && <button onClick={() => setShowEmployeePin(true)}><ShieldCheck size={17} aria-hidden="true" />Modifier mon PIN</button>}<button className="sidebar-logout" onClick={logout}><LogOut size={17} aria-hidden="true" />Se déconnecter</button><small>Kivli · version pilote</small></div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-top"><div><small className="dashboard-date">{new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</small><small className="dashboard-context">{data.merchant.role === "employee" ? `${data.merchant.businessName} · ${data.merchant.employeeName}` : data.merchant.businessName}</small><h1>{data.merchant.role === "employee" ? "Scanner" : visibleTabs.find((item) => item.id === tab)?.label}</h1></div>{data.merchant.role === "employee" ? <div className="dashboard-actions employee-top-actions"><button className="button button-ghost" onClick={() => setShowEmployeePin(true)}><ShieldCheck size={17} aria-hidden="true" /><span>Mon PIN</span></button><button className="button button-ghost logout-quick" onClick={logout} aria-label="Se déconnecter"><LogOut size={18} aria-hidden="true" /><span>Déconnexion</span></button></div> : <div className="dashboard-actions"><button className="button button-ghost qr-quick" onClick={showEnrollmentQr}><QrCodeIcon size={18} aria-hidden="true" /><span>QR codes clients</span></button><button className="button scan-quick" onClick={() => setTab("scan")}><ScanLine size={18} aria-hidden="true" />Scanner</button><button className="button button-ghost feedback-quick" onClick={() => { setFeedbackError(""); setFeedbackOpen(true); }}><MessageSquareText size={17} aria-hidden="true" /><span>Faire un retour</span></button><button className="button button-ghost owner-logout-quick" onClick={logout} aria-label="Se déconnecter"><LogOut size={18} aria-hidden="true" /></button></div>}</header>
        {data.merchant.role === "owner" && data.pilot && <PilotCounter pilot={data.pilot} />}
        {data.merchant.role === "owner" && <nav className="mobile-tabs" aria-label="Navigation principale" style={{ "--tab-count": visibleTabs.length } as React.CSSProperties}>{visibleTabs.map((item) => { const Icon = item.icon; return <button key={item.id} aria-label={item.label} aria-current={tab === item.id ? "page" : undefined} className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setError(""); }}><span className="mobile-tab-icon"><Icon className="nav-icon" size={21} strokeWidth={2} aria-hidden="true" /></span><small>{item.shortLabel}</small></button>; })}</nav>}
        {error && <div className="dashboard-error" role="alert"><span>!</span>{error}<button onClick={() => setError("")}>×</button></div>}

        {tab === "overview" && <Overview data={{ ...data, program: data.program }} joinUrl={joinUrl} onScan={() => setTab("scan")} onCustomers={() => setTab("customers")} onShowQr={showEnrollmentQr} onUndoReward={undoReward} busy={busy} />}
        {tab === "scan" && (
          <div className="scan-layout">
            <div>{data.merchant.role === "owner" && <span className="eyebrow scan-eyebrow"><ScanLine size={15} aria-hidden="true" />Validation guidée</span>}<h2>{data.merchant.role === "employee" ? "Présente le QR code du client." : "Scanne la carte du client."}</h2><p>Identifie d’abord le client. Son solde, ses récompenses et les actions disponibles s’affichent ensuite.</p><MerchantScanner onDetected={recognize} busy={busy} /></div>
            <aside className="scan-side"><h3>{data.merchant.role === "employee" ? "Mes dernières opérations" : "Derniers passages"}</h3>{data.activity.length ? data.activity.slice(0, 6).map((item) => <Activity key={item.id} item={item} onUndoReward={undoReward} busy={busy} />) : <p className="muted">Les premières opérations apparaîtront ici.</p>}</aside>
          </div>
        )}
        {tab === "customers" && (
          <div className="panel customer-panel">
            <div className="panel-head"><div><h2>{data.customers.length} client{data.customers.length !== 1 ? "s" : ""}</h2><p>Coordonnées, progression et récompenses au même endroit.</p></div><input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, téléphone ou code…" /></div>
            <div className="segment-filters">{([['all','Tous',data.customers.length],['new','Nouveaux',data.segmentCounts.new],['active','Actifs',data.segmentCounts.active],['loyal','Fidèles',data.segmentCounts.loyal],['reactivate','À réactiver',data.segmentCounts.reactivate],['reward','Récompense',data.segmentCounts.reward]] as const).map(([id,label,count]) => <button key={id} className={segment === id ? "active" : ""} onClick={() => setSegment(id)}>{label}<b>{count}</b></button>)}</div>
            <div className="customer-table">
              <div className="table-head"><span>Client</span><span>Progression</span><span>Total</span><span>Récompense</span><span /></div>
              {filteredCustomers.map((customer) => <div className="table-row" key={customer.membershipId}><span className="customer-name"><i>{customer.firstName.slice(0, 1)}</i><span><b>{customer.firstName}</b><small>{customer.phone || "Ancienne fiche sans téléphone"}{customer.marketingConsent ? " · SMS accepté" : ""}</small></span></span><span data-label={data.program!.earningMode === "spend" ? "Solde" : "Progression"}><b>{data.program!.earningMode === "spend" ? `${customer.points} points` : `${customer.points}/${data.program!.goal}`}</b>{data.program!.earningMode === "visits" && <i className="mini-progress"><i style={{ width: `${customer.points / data.program!.goal * 100}%` }} /></i>}</span><span data-label="Total">{customer.totalPoints} points cumulés</span><span data-label="Récompense">{customer.availableRewards ? <b className="reward-badge">{customer.availableRewards} {data.program!.earningMode === "spend" ? `palier${customer.availableRewards > 1 ? "s" : ""} accessible${customer.availableRewards > 1 ? "s" : ""}` : `disponible${customer.availableRewards > 1 ? "s" : ""}`}</b> : <small className="muted">Aucune</small>}</span><span className="row-actions"><button onClick={() => customerAction(customer)} disabled={busy}><Footprints size={16} aria-hidden="true" />Action</button><button onClick={() => addBonus(customer)} disabled={busy}><Coins size={15} aria-hidden="true" />Bonus</button>{customer.undoableStampId && <button className="undo-button" onClick={() => undoStamp(customer.undoableStampId!, customer.firstName)} disabled={busy}><RotateCcw size={15} aria-hidden="true" />Annuler</button>}{customer.availableRewards > 0 && <button className="redeem-button" onClick={() => recognize(customer.code)} disabled={busy}><Gift size={15} aria-hidden="true" />Remettre</button>}<button className="delete-customer-button" onClick={() => confirmCustomerDeletion(customer)} disabled={busy}><Trash2 size={15} aria-hidden="true" />Supprimer</button></span></div>)}
              {!filteredCustomers.length && (data.customers.length ? <div className="table-empty">Aucun client ne correspond à cette recherche.</div> : <div className="table-empty table-empty-onboarding"><span><QrCodeIcon size={22} aria-hidden="true" /></span><strong>Ta liste de clients est prête.</strong><p>Partage le QR code d’inscription pour créer la première carte.</p><button className="button button-small" onClick={showEnrollmentQr}>Afficher le QR code</button></div>)}
            </div>
          </div>
        )}
        {tab === "program" && data.merchant.role === "owner" && (
          <div className="program-layout program-layout-single">
            <div className="settings-stack">
              <form className="panel settings-form program-config-form" onSubmit={saveProgram}><div className="config-form-head"><div><span className="eyebrow">Votre programme</span><h2>Personnaliser la carte</h2></div><p>Les changements s’appliquent immédiatement aux cartes existantes.</p></div><div className="config-divider" /><label className="config-field">Nom de la carte<input name="name" defaultValue={data.program.name} required /></label><div className="config-group"><h3>Gain des points</h3><fieldset className="earning-mode premium-mode-picker compact"><legend className="sr-only">Comment gagner des points ?</legend><label className={settingsEarningMode === "visits" ? "selected" : ""}><input type="radio" name="earningMode" value="visits" checked={settingsEarningMode === "visits"} onChange={() => setSettingsEarningMode("visits")} /><span className="mode-icon"><Footprints size={20} aria-hidden="true" /></span><span><strong>Par passage</strong><small>1 passage = 1 point</small></span><Check className="mode-check" size={17} aria-hidden="true" /></label><label className={settingsEarningMode === "spend" ? "selected" : ""}><input type="radio" name="earningMode" value="spend" checked={settingsEarningMode === "spend"} onChange={() => setSettingsEarningMode("spend")} /><span className="mode-icon"><Coins size={20} aria-hidden="true" /></span><span><strong>Selon le montant</strong><small>1 € dépensé = 1 point</small></span><Check className="mode-check" size={17} aria-hidden="true" /></label></fieldset>{settingsEarningMode === "spend" && <div className="spend-rule-inline"><Coins size={17} aria-hidden="true" /><span><strong>1 point par euro dépensé</strong><small>Le calcul est automatique au moment du passage.</small></span></div>}<input type="hidden" name="spendAmountEuros" value="1" /></div><div className="config-group"><div className="config-group-title"><h3>Récompenses</h3><span>{settingsTierCount}/6</span></div><div className="dynamic-reward-list">{Array.from({ length: settingsTierCount }, (_, index) => { const tier = data.rewardTiers[index]; return <div className="dynamic-reward-row" key={tier?.id ?? `settings-${index}`}><span className="reward-index">{index + 1}</span><label>Points nécessaires<input name="tierThreshold" type="number" min="1" max="1000" defaultValue={tier?.threshold ?? ""} required /></label><label>Récompense<input name="tierRewardText" defaultValue={tier?.rewardText ?? ""} placeholder="Ex. Un café offert" required /></label>{settingsTierCount > 1 && <button type="button" className="remove-reward" onClick={() => setSettingsTierCount((count) => Math.max(1, count - 1))} aria-label="Supprimer la dernière récompense"><Trash2 size={16} aria-hidden="true" /></button>}</div>; })}</div>{settingsTierCount < 6 && <button type="button" className="add-reward-button" onClick={() => setSettingsTierCount((count) => Math.min(6, count + 1))}><Plus size={17} aria-hidden="true" />Ajouter une récompense</button>}<input type="hidden" name="rewardText" value={data.rewardTiers[0]?.rewardText ?? data.program.rewardText} /></div><div className="config-group"><h3>Couleur de la carte</h3><fieldset className="color-fieldset program-colors premium-colors"><legend className="sr-only">Couleur de la carte</legend><div className="color-options">{PROGRAM_COLORS.map((color) => <label key={color.value} className="color-choice" style={{ backgroundColor: color.value }} title={color.name}><input type="radio" name="accentColor" value={color.value} defaultChecked={data.merchant.accentColor.toLowerCase() === color.value} aria-label={color.name} /><span>{color.name}</span></label>)}</div></fieldset></div><label className="config-field">Conditions affichées au client <small>Facultatif</small><textarea name="terms" defaultValue={visibleProgramTerms(data.program.terms)} rows={3} maxLength={200} placeholder="Ex. Offre non cumulable avec une promotion." /></label><button className="button button-large button-full" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer les modifications"}</button></form>
              <section className="panel security-panel">
                <div className="panel-head"><div><h2>Sécurité du propriétaire</h2><p>Les accès individuels des employés se gèrent dans l’onglet Mon équipe.</p></div></div>
                <form className="form-grid owner-pin-form" onSubmit={(event) => updateSecurity(event, "change_owner_password")}>
                  <label>Code confidentiel actuel<input name="currentPassword" type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} pattern="[0-9]{6}" required /></label>
                  <label>Nouveau code<input name="newPassword" type="password" inputMode="numeric" autoComplete="new-password" minLength={6} maxLength={6} pattern="[0-9]{6}" required /><small>6 chiffres, sans suite simple ni répétition.</small></label>
                  <button className="button" disabled={busy}>Modifier mon code</button>
                </form>
              </section>
            </div>
          </div>
        )}
        {tab === "notifications" && data.merchant.role === "owner" && (
          <WalletNotifications program={data.program} businessName={data.merchant.businessName} />
        )}
        {tab === "team" && data.merchant.role === "owner" && (
          <div className="team-layout">
            <form className="panel team-create" onSubmit={createEmployee}>
              <div className="panel-head"><div><h2>Ajouter un employé</h2><p>Chaque personne reçoit son propre identifiant et son propre code.</p></div></div>
              <div className="form-grid">
                <label>Prénom ou nom affiché<input name="displayName" autoComplete="off" required /></label>
                <label>E-mail professionnel <small>Facultatif</small><input name="email" type="email" autoComplete="off" /></label>
                <p className="employee-pin-note"><ShieldCheck size={16} aria-hidden="true" />Kivli génère un PIN temporaire sécurisé. L’employé devra le personnaliser à sa première connexion.</p>
                <button className="button button-large" disabled={busy}>{busy ? "Création…" : "Générer l’accès employé"}</button>
              </div>
            </form>
            <section className="panel team-list">
              <div className="panel-head"><div><h2>{data.employees.length} accès employé{data.employees.length !== 1 ? "s" : ""}</h2><p>Un départ ? Désactive l’accès sans supprimer son historique.</p></div></div>
              {data.employees.length ? data.employees.map((employee) => (
                <article className={`employee-row ${employee.active ? "" : "inactive"}`} key={employee.id}>
                  <span className="employee-avatar">{employee.displayName.slice(0, 1).toUpperCase()}</span>
                  <div className="employee-details"><strong>{employee.displayName}</strong><small>{employee.email || "Sans e-mail"}</small><code>{employee.loginCode}</code></div>
                  <span className={`access-status ${employee.active ? "active" : ""}`}>{employee.active ? (employee.mustChangePin ? "PIN à personnaliser" : "Actif") : "Désactivé"}</span>
                  <div className="employee-actions"><button onClick={() => copyEmployeeIdentifier(employee)} disabled={busy}>Copier l’identifiant</button><button onClick={() => resetEmployeePin(employee)} disabled={busy}>Réinitialiser le PIN</button><button className={employee.active ? "danger" : ""} onClick={() => setEmployeeActive(employee)} disabled={busy}>{employee.active ? "Désactiver" : "Réactiver"}</button></div>
                </article>
              )) : <div className="empty-activity"><span><UsersRound size={21} aria-hidden="true" /></span><h3>Aucun employé pour le moment.</h3><p>Crée le premier accès individuel avec le formulaire.</p></div>}
            </section>
          </div>
        )}
      </section>

      {scanCandidate && <ScanDecisionModal candidate={scanCandidate} busy={busy} onClose={() => setScanCandidate(null)} onStamp={stamp} onRedeem={(rewardId) => redeem(scanCandidate.customer.code, rewardId, true)} />}
      {stampResult && <div className="modal-backdrop"><section className="result-modal" role="dialog" aria-modal="true"><div className={`result-icon ${stampResult.rewardEarned ? "reward" : ""}`}>{stampResult.rewardEarned ? "★" : `+${stampResult.quantity}`}</div><span className="eyebrow">{stampResult.rewardEarned ? `${stampResult.rewardsEarned} palier${stampResult.rewardsEarned > 1 ? "s" : ""} désormais accessible${stampResult.rewardsEarned > 1 ? "s" : ""}` : `${stampResult.quantity} point${stampResult.quantity > 1 ? "s" : ""} ajouté${stampResult.quantity > 1 ? "s" : ""}`}</span><h2>{stampResult.rewardEarned ? `Bravo ${stampResult.customer.firstName} !` : `C’est fait pour ${stampResult.customer.firstName}.`}</h2><p>{stampResult.earningMode === "spend" ? `Son solde est maintenant de ${stampResult.customer.points} points.` : stampResult.rewardEarned ? `La carte compte maintenant ${stampResult.availableRewards} récompense${stampResult.availableRewards > 1 ? "s" : ""} disponible${stampResult.availableRewards > 1 ? "s" : ""}.` : `Sa carte affiche maintenant ${stampResult.customer.points}/${stampResult.customer.goal} points.`}</p>{stampResult.availableRewards > 0 && <button className="button reward-action button-full" onClick={() => { setStampResult(null); void recognize(stampResult.customer.code); }} disabled={busy}>★ Voir les récompenses accessibles</button>}<button className="button button-large button-full" onClick={() => { setStampResult(null); setTab("scan"); }}>Scanner le client suivant</button><button className="text-link result-undo" onClick={() => undoStamp(stampResult.stampId, stampResult.customer.firstName)} disabled={busy}>↶ Annuler cette opération</button><button className="text-link result-close" onClick={() => setStampResult(null)}>Fermer</button></section></div>}
      {showEmployeePin && <PinChangeModal busy={busy} error={error} onSubmit={changeEmployeePin} onClose={() => { setShowEmployeePin(false); setError(""); }} />}
      {customerDialog && <CustomerActionModal dialog={customerDialog} busy={busy} error={error} onBonus={submitBonus} onDelete={deleteCustomer} onClose={() => { setCustomerDialog(null); setError(""); }} />}
      {employeeAccess && <EmployeeAccessModal access={employeeAccess} onClose={() => setEmployeeAccess(null)} />}
      {feedbackOpen && <FeedbackModal busy={busy} error={feedbackError} onSubmit={submitFeedback} onClose={() => { setFeedbackOpen(false); setFeedbackError(""); }} />}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}

function PilotCounter({ pilot }: { pilot: NonNullable<DashboardData["pilot"]> }) {
  const endDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(pilot.endsAt));
  const remainingLabel = `${pilot.daysRemaining} jour${pilot.daysRemaining > 1 ? "s" : ""} restant${pilot.daysRemaining > 1 ? "s" : ""}`;
  const title = pilot.state === "continued"
    ? "Accès pilote prolongé gratuitement"
    : pilot.state === "extended"
      ? `Pilote prolongé gratuitement · ${remainingLabel}`
      : `Pilote gratuit · ${remainingLabel}`;
  return <aside className={`pilot-counter pilot-counter-${pilot.state}`} aria-label="Durée du pilote">
    <span><CalendarClock size={18} aria-hidden="true" /></span>
    <div><strong>{title}</strong><small>{pilot.state === "continued" ? "Votre espace reste pleinement fonctionnel, sans facturation automatique." : `Échéance actuelle : ${endDate}. Aucun paiement automatique.`}</small></div>
  </aside>;
}

type WalletNotificationSettingsData = {
  nearRewardEnabled: number;
  nearRewardThreshold: number;
  reactivationEnabled: number;
  reactivationDays: number;
  nearRewardMessage: string;
  reactivationMessage: string;
  nearbyEnabled: number;
  nearbyAddress: string | null;
  nearbyLatitude: number | null;
  nearbyLongitude: number | null;
  nearbyRelevantText: string;
  nearbyLocationConfirmedAt: string | null;
  nextMarketingAt: string | null;
};

type GeocodingResult = { address: string; latitude: number; longitude: number };

function WalletNotifications({ program, businessName }: { program: ReadyDashboardData["program"]; businessName: string }) {
  const [settings, setSettings] = useState<WalletNotificationSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [title, setTitle] = useState(businessName);
  const [message, setMessage] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [locationResults, setLocationResults] = useState<GeocodingResult[]>([]);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/merchant/wallet-notifications", { cache: "no-store" });
    const result = await response.json() as WalletNotificationSettingsData & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Notifications indisponibles.");
    setSettings(result);
    setLocationConfirmed(Boolean(result.nearbyLocationConfirmedAt));
  }, []);

  useEffect(() => {
    let active = true;
    void refresh().catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Notifications indisponibles."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true); setError(""); setSuccess("");
    const response = await fetch("/api/merchant/wallet-notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "settings", ...settings,
        nearRewardEnabled: Boolean(settings.nearRewardEnabled),
        reactivationEnabled: Boolean(settings.reactivationEnabled),
        nearbyEnabled: Boolean(settings.nearbyEnabled),
        nearbyLocationConfirmed: locationConfirmed }),
    });
    const result = await response.json() as WalletNotificationSettingsData & { error?: string };
    if (!response.ok) setError(result.error ?? "Réglages non enregistrés.");
    else { setSettings(result); setLocationConfirmed(Boolean(result.nearbyLocationConfirmedAt)); setSuccess("Réglages Wallet enregistrés."); }
    setSaving(false);
  }

  async function searchAddress() {
    if (!settings?.nearbyAddress?.trim()) return;
    setGeocoding(true); setError(""); setSuccess(""); setLocationResults([]);
    const response = await fetch("/api/merchant/wallet-notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "geocode", nearbyAddress: settings.nearbyAddress }),
    });
    const result = await response.json() as { results?: GeocodingResult[]; error?: string };
    if (!response.ok) setError(result.error ?? "Adresse introuvable.");
    else if (!result.results?.length) setError("Aucun emplacement précis trouvé. Complétez l’adresse puis réessayez.");
    else setLocationResults(result.results);
    setGeocoding(false);
  }

  function selectLocation(result: GeocodingResult) {
    if (!settings) return;
    setSettings({ ...settings, nearbyAddress: result.address, nearbyLatitude: result.latitude, nearbyLongitude: result.longitude });
    setLocationConfirmed(false);
    setLocationResults([]);
  }

  const renderTemplate = (value: string, remaining = 2) => value
    .replaceAll("{reste}", String(remaining))
    .replaceAll("{unité}", program.earningMode === "visits" ? "passages" : "points")
    .replaceAll("{commerce}", businessName)
    .replaceAll("{jours}", String(settings?.reactivationDays ?? 45));

  async function sendCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true); setError(""); setSuccess("");
    const response = await fetch("/api/merchant/wallet-notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", title, message }),
    });
    const result = await response.json() as { error?: string; nextAllowedAt?: string };
    if (!response.ok) {
      setError(result.error ?? "La notification n’a pas pu être envoyée.");
      if (result.nextAllowedAt && settings) setSettings({ ...settings, nextMarketingAt: result.nextAllowedAt });
    } else {
      setMessage("");
      setSuccess("Envoi lancé. Kivli contacte automatiquement les cartes Wallet actives.");
      if (settings) setSettings({ ...settings, nextMarketingAt: result.nextAllowedAt ?? settings.nextMarketingAt });
    }
    setSending(false);
  }

  const nextDate = settings?.nextMarketingAt ? new Date(settings.nextMarketingAt.includes("T") ? settings.nextMarketingAt : `${settings.nextMarketingAt.replace(" ", "T")}Z`) : null;
  const campaignAllowed = !nextDate || nextDate.getTime() <= Date.now();
  if (loading) return <section className="panel wallet-notifications-loading"><span className="loading-dot" />Préparation des notifications…</section>;
  if (!settings) return <section className="panel"><p className="form-error">{error || "Notifications indisponibles."}</p></section>;

  return <div className="wallet-notifications-page">
    <header className="wallet-notifications-intro">
      <span className="wallet-notifications-icon"><BellRing size={24} aria-hidden="true" /></span>
      <div><span className="eyebrow">Simple côté commerce</span><h2>Kivli s’occupe du Wallet.</h2><p>Configurez vos messages une fois. Apple Wallet et Google Wallet sont contactés automatiquement, sans choix technique à faire.</p></div>
    </header>
    {(error || success) && <p className={error ? "wallet-notification-feedback error" : "wallet-notification-feedback success"} role="status">{error || success}</p>}
    <form className="wallet-automation-grid" onSubmit={saveSettings}>
      <article className="panel wallet-setting-card">
        <div className="wallet-setting-head"><span><Gift size={20} aria-hidden="true" /></span><div><h3>Proche d’une récompense</h3><p>Prévenir au moment où l’objectif devient concret.</p></div><button type="button" role="switch" aria-checked={Boolean(settings.nearRewardEnabled)} className={`premium-switch ${settings.nearRewardEnabled ? "active" : ""}`} onClick={() => setSettings({ ...settings, nearRewardEnabled: settings.nearRewardEnabled ? 0 : 1 })}><i /></button></div>
        <label className="wallet-threshold-field">Prévenir lorsqu’il reste<div><input type="number" min="1" max="1000" value={settings.nearRewardThreshold} onChange={(event) => setSettings({ ...settings, nearRewardThreshold: Number(event.target.value) })} disabled={!settings.nearRewardEnabled} /><span>{program.earningMode === "visits" ? "passage(s)" : "point(s)"}</span></div></label>
        <label className="wallet-automation-message">Message personnalisé <small>{settings.nearRewardMessage.length}/160</small><textarea rows={3} maxLength={160} value={settings.nearRewardMessage} onChange={(event) => setSettings({ ...settings, nearRewardMessage: event.target.value })} disabled={!settings.nearRewardEnabled} required /><span className="wallet-inline-preview"><b>Aperçu</b>{renderTemplate(settings.nearRewardMessage, settings.nearRewardThreshold)}</span></label>
        <p className="wallet-template-help">Variables disponibles : <code>{"{reste}"}</code>, <code>{"{unité}"}</code>, <code>{"{commerce}"}</code>.</p>
        <small>Une seule alerte par palier et par cycle, même si le contrôle automatique se répète.</small>
      </article>
      <article className="panel wallet-setting-card">
        <div className="wallet-setting-head"><span><RotateCcw size={20} aria-hidden="true" /></span><div><h3>Clients à réactiver</h3><p>Un rappel discret après une vraie période d’absence.</p></div><button type="button" role="switch" aria-checked={Boolean(settings.reactivationEnabled)} className={`premium-switch ${settings.reactivationEnabled ? "active" : ""}`} onClick={() => setSettings({ ...settings, reactivationEnabled: settings.reactivationEnabled ? 0 : 1 })}><i /></button></div>
        <label className="wallet-threshold-field">Après<div><input list="reactivation-days" type="number" min="7" max="365" value={settings.reactivationDays} onChange={(event) => setSettings({ ...settings, reactivationDays: Number(event.target.value) })} disabled={!settings.reactivationEnabled} /><span>jours sans activité</span></div></label>
        <datalist id="reactivation-days"><option value="30" /><option value="45" /><option value="60" /></datalist>
        <label className="wallet-automation-message">Message personnalisé <small>{settings.reactivationMessage.length}/160</small><textarea rows={3} maxLength={160} value={settings.reactivationMessage} onChange={(event) => setSettings({ ...settings, reactivationMessage: event.target.value })} disabled={!settings.reactivationEnabled} required /><span className="wallet-inline-preview"><b>Aperçu</b>{renderTemplate(settings.reactivationMessage)}</span></label>
        <p className="wallet-template-help">Variables disponibles : <code>{"{commerce}"}</code>, <code>{"{jours}"}</code>.</p>
        <small>Un nouveau passage ou achat remet automatiquement ce délai à zéro.</small>
      </article>
      <article className="panel wallet-setting-card wallet-location-card">
        <div className="wallet-setting-head"><span><MapPin size={20} aria-hidden="true" /></span><div><h3>Afficher la carte à proximité</h3><p>Faciliter le retour au commerce sans suivre les clients.</p></div><button type="button" role="switch" aria-checked={Boolean(settings.nearbyEnabled)} className={`premium-switch ${settings.nearbyEnabled ? "active" : ""}`} onClick={() => setSettings({ ...settings, nearbyEnabled: settings.nearbyEnabled ? 0 : 1 })}><i /></button></div>
        <p className="wallet-location-explanation">Apple Wallet ou Google Wallet pourra afficher votre carte lorsque le client se trouve à proximité. Le déclenchement et la distance exacte dépendent du téléphone et du Wallet utilisé.</p>
        <label className="wallet-location-address">Adresse de l’établissement<div><input value={settings.nearbyAddress ?? ""} maxLength={200} required={Boolean(settings.nearbyEnabled)} onChange={(event) => { setSettings({ ...settings, nearbyAddress: event.target.value, nearbyLatitude: null, nearbyLongitude: null }); setLocationConfirmed(false); setLocationResults([]); }} placeholder="2 rue Léonie, 28100 Dreux" /><button type="button" className="button button-ghost" onClick={() => void searchAddress()} disabled={geocoding || !settings.nearbyAddress?.trim()}><Search size={16} aria-hidden="true" />{geocoding ? "Recherche…" : "Rechercher"}</button></div></label>
        {locationResults.length > 0 && <div className="wallet-location-results" aria-label="Résultats d’adresse">{locationResults.map((result) => <button type="button" key={`${result.latitude}-${result.longitude}`} onClick={() => selectLocation(result)}><MapPin size={15} aria-hidden="true" /><span>{result.address}</span></button>)}</div>}
        {settings.nearbyLatitude != null && settings.nearbyLongitude != null && <div className="wallet-location-confirmation"><span><MapPin size={17} aria-hidden="true" /><span><strong>Emplacement sélectionné</strong><small>{settings.nearbyLatitude.toFixed(5)}, {settings.nearbyLongitude.toFixed(5)}</small></span></span><label><input type="checkbox" checked={locationConfirmed} required={Boolean(settings.nearbyEnabled)} onChange={(event) => setLocationConfirmed(event.target.checked)} /> Je confirme cet emplacement</label></div>}
        <label className="wallet-automation-message">Court texte de proximité <small>{settings.nearbyRelevantText.length}/80</small><input maxLength={80} value={settings.nearbyRelevantText} onChange={(event) => setSettings({ ...settings, nearbyRelevantText: event.target.value })} required /><span className="wallet-inline-preview"><b>Aperçu Apple Wallet</b>{settings.nearbyRelevantText}</span></label>
        <small>Données cartographiques © OpenStreetMap contributors. Kivli conserve uniquement l’emplacement du commerce, jamais celui des clients.</small>
      </article>
      <button className="button wallet-settings-save" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer les automatisations"}</button>
    </form>
    <section className="wallet-campaign-layout">
      <form className="panel wallet-campaign-form" onSubmit={sendCampaign}>
        <div className="panel-head"><div><span className="eyebrow">Notification libre</span><h2>Envoyer un message</h2><p>Une campagne maximum tous les 7 jours par commerce.</p></div></div>
        <label>Titre<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={60} required /><small>{title.length}/60</small></label>
        <label>Message<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} maxLength={240} placeholder="Ex. Une nouveauté vous attend cette semaine…" required /><small>{message.length}/240</small></label>
        <div className={`wallet-campaign-availability ${campaignAllowed ? "available" : "locked"}`}><span>{campaignAllowed ? <Check size={16} /> : <RotateCcw size={16} />}</span><p>{campaignAllowed ? "Une campagne peut être envoyée maintenant." : `Prochain envoi possible le ${nextDate!.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} à ${nextDate!.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`}</p></div>
        <button className="button button-large button-full" disabled={sending || !campaignAllowed || !title.trim() || !message.trim()}>{sending ? "Envoi en cours…" : "Envoyer la notification"}</button>
      </form>
      <aside className="wallet-message-preview">
        <span className="eyebrow">Aperçu</span><div className="wallet-preview-phone"><div className="wallet-preview-screen"><small>maintenant</small><article><span>{businessName.slice(0, 1).toUpperCase()}</span><div><strong>{title || businessName}</strong><p>{message || "Votre message apparaîtra ici avant l’envoi."}</p></div></article></div></div><p>Le rendu exact est adapté nativement par Apple Wallet ou Google Wallet.</p>
      </aside>
    </section>
  </div>;
}

function ScanDecisionModal({ candidate, busy, onClose, onStamp, onRedeem }: { candidate: ScanCandidate; busy: boolean; onClose: () => void; onStamp: (code: string, quantity?: number, amountCents?: number) => Promise<void>; onRedeem: (rewardId: string) => Promise<boolean | undefined> }) {
  const [quantity, setQuantity] = useState(1);
  const [amount, setAmount] = useState("");
  const amountCents = Math.round(Number(amount.replace(",", ".")) * 100);
  const calculatedPoints = Number.isFinite(amountCents) && amountCents > 0 ? Math.floor(amountCents / candidate.spendAmountCents) : 0;
  const progress = Math.min(100, Math.round(candidate.customer.points / candidate.customer.goal * 100));
  const rewardGroups = candidate.rewards.reduce<Array<{ id: string; rewardText: string; threshold: number; count: number }>>((groups, reward) => {
    const existing = groups.find((group) => group.rewardText === reward.rewardText && group.threshold === reward.threshold);
    if (existing) existing.count += 1;
    else groups.push({ ...reward, count: 1 });
    return groups;
  }, []);

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="scan-decision-modal" role="dialog" aria-modal="true" aria-labelledby="scan-decision-title"><button type="button" className="modal-close" onClick={onClose} aria-label="Fermer"><X size={18} aria-hidden="true" /></button><span className="eyebrow">Carte reconnue</span><div className={`scan-customer-summary ${candidate.earningMode === "spend" ? "wallet-summary" : ""}`}><span className="scan-customer-avatar">{candidate.customer.firstName.slice(0, 1)}</span><div><small>CLIENT</small><h2 id="scan-decision-title">{candidate.customer.firstName}</h2><p>{candidate.earningMode === "spend" ? <><b>{candidate.customer.points}</b> points disponibles</> : <><b>{candidate.customer.points}</b> sur {candidate.customer.goal} points</>}</p></div><strong className={candidate.rewards.length ? "has-reward" : ""}>{candidate.rewards.length ? `${candidate.rewards.length} récompense${candidate.rewards.length > 1 ? "s" : ""} accessible${candidate.rewards.length > 1 ? "s" : ""}` : "Aucune récompense"}</strong>{candidate.earningMode === "visits" && <i className="scan-customer-progress"><i style={{ width: `${progress}%` }} /></i>}</div>
    <div className="scan-action-heading"><span>2</span><div><strong>Choisis l’action</strong><small>Aucune opération n’est enregistrée avant ton choix.</small></div></div>
    {candidate.rewards.length > 0 && <div className="available-reward-list"><strong>Récompenses disponibles</strong>{rewardGroups.map((reward) => <article key={`${reward.rewardText}-${reward.threshold}`}><span><Gift size={18} aria-hidden="true" /><span><b>{reward.rewardText}</b><small>{candidate.earningMode === "spend" ? `${reward.threshold} points seront débités` : `Palier de ${reward.threshold} points${reward.count > 1 ? ` · ${reward.count} disponibles` : ""}`}</small></span></span><button className="button button-ghost" onClick={() => void onRedeem(reward.id)} disabled={busy}>{candidate.earningMode === "spend" ? `Utiliser · ${reward.threshold} pts` : "Utiliser cette récompense"}</button></article>)}<p>{candidate.earningMode === "spend" ? "Le reste du solde est conservé. Une autre récompense peut ensuite être utilisée si le solde le permet." : "Après une remise, tu peux aussi enregistrer le nouvel achat ou passage ci-dessous."}</p></div>}
    <section className="earn-action-card">{candidate.earningMode === "spend" ? <><div className="earn-action-title"><span><Coins size={20} aria-hidden="true" /></span><div><strong>Enregistrer un achat</strong><small>1 point tous les {(candidate.spendAmountCents / 100).toFixed(2).replace(".", ",")} €</small></div></div><label className="scan-amount-field"><span>Montant de l’achat</span><div><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0,00" aria-label="Montant de l’achat en euros" autoFocus /><b>€</b></div><small>{calculatedPoints > 0 ? `${calculatedPoints} point${calculatedPoints > 1 ? "s" : ""} seront ajouté${calculatedPoints > 1 ? "s" : ""}.` : "Saisis le montant pour calculer les points."}</small></label><button className="button button-large button-full" onClick={() => void onStamp(candidate.customer.code, 1, amountCents)} disabled={busy || calculatedPoints < 1}>Enregistrer l’achat<ArrowRight size={17} aria-hidden="true" /></button></> : <><div className="earn-action-title"><span><Footprints size={20} aria-hidden="true" /></span><div><strong>Ajouter un passage</strong><small>1 passage = 1 point</small></div></div><div className="scan-quantity-row"><span>Points à ajouter</span><div><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={busy || quantity === 1} aria-label="Retirer un point"><Minus size={18} aria-hidden="true" /></button><output>{quantity}</output><button type="button" onClick={() => setQuantity((value) => Math.min(10, value + 1))} disabled={busy || quantity === 10} aria-label="Ajouter un point"><Plus size={18} aria-hidden="true" /></button></div></div><button className="button button-large button-full" onClick={() => void onStamp(candidate.customer.code, quantity)} disabled={busy}>Ajouter {quantity === 1 ? "le passage" : `${quantity} points`}<ArrowRight size={17} aria-hidden="true" /></button></>}</section>
    <button className="text-link result-close" onClick={onClose}>Ne rien enregistrer</button></section></div>;
}

function CustomerActionModal({ dialog, busy, error, onBonus, onDelete, onClose }: { dialog: CustomerDialog; busy: boolean; error: string; onBonus: (event: FormEvent<HTMLFormElement>) => Promise<void>; onDelete: (event: FormEvent<HTMLFormElement>) => Promise<void>; onClose: () => void }) {
  if (dialog.kind === "delete") {
    return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="customer-action-modal customer-delete-modal" role="dialog" aria-modal="true" aria-labelledby="customer-action-title" aria-describedby="customer-delete-warning"><button type="button" className="modal-close" onClick={onClose} aria-label="Fermer"><X size={18} aria-hidden="true" /></button><span className="customer-action-icon delete"><Trash2 size={23} aria-hidden="true" /></span><span className="eyebrow">Suppression définitive</span><h2 id="customer-action-title">Supprimer {dialog.customer.firstName} du programme ?</h2><p id="customer-delete-warning">Ses points, ses récompenses et l’accès à sa carte seront perdus. Son QR code et ses cartes Wallet deviendront inutilisables.</p><form className="form-grid" onSubmit={onDelete}><label className="customer-delete-confirm"><input type="checkbox" required aria-label="Je confirme la suppression du client" /><span><strong>Je confirme la suppression</strong><small>Cette action ne touche pas aux cartes que cette personne possède dans d’autres commerces.</small></span></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-large button-full button-danger" disabled={busy}>{busy ? "Suppression…" : "Supprimer le client"}</button><button type="button" className="text-link" onClick={onClose}>Annuler et conserver le client</button></form></section></div>;
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="customer-action-modal" role="dialog" aria-modal="true" aria-labelledby="customer-action-title"><button type="button" className="modal-close" onClick={onClose} aria-label="Fermer"><X size={18} aria-hidden="true" /></button><span className="customer-action-icon bonus"><Coins size={23} aria-hidden="true" /></span><span className="eyebrow">Geste commercial</span><h2 id="customer-action-title">Ajouter un bonus à {dialog.customer.firstName}</h2><p>Les points bonus sont clairement identifiés dans l’historique et restent réservés au propriétaire.</p><form className="form-grid" onSubmit={onBonus}><label>Nombre de points bonus<input name="quantity" type="number" min="1" max="100" defaultValue="1" required autoFocus /></label><label>Motif <small>Facultatif</small><input name="note" maxLength={120} placeholder="Geste commercial, anniversaire…" /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-large button-full" disabled={busy}>{busy ? "Enregistrement…" : "Ajouter le bonus"}</button><button type="button" className="text-link" onClick={onClose}>Annuler</button></form></section></div>;
}

function PilotActivationGate({ data, onAccepted, onLogout }: { data: DashboardData; onAccepted: () => Promise<void>; onLogout: () => Promise<void> }) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accepted || data.merchant.role !== "owner") return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/merchant/pilot-acceptance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "L’activation n’a pas pu être enregistrée.");
      await onAccepted();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "L’activation n’a pas pu être enregistrée.");
      setBusy(false);
    }
  }

  if (data.merchant.role !== "owner") {
    return <main className="pilot-activation-page"><header className="pilot-activation-nav"><Brand /><button onClick={onLogout}><LogOut size={17} aria-hidden="true" />Se déconnecter</button></header><section className="pilot-activation-card pilot-activation-employee"><span className="pilot-activation-icon"><ShieldCheck size={26} aria-hidden="true" /></span><span className="eyebrow">Activation requise</span><h1>Le propriétaire doit activer le pilote.</h1><p>Par sécurité, seul le propriétaire du commerce peut accepter les documents du pilote Kivli. Le scanner sera disponible immédiatement après son activation.</p><button className="button button-ghost" onClick={onLogout}>Revenir à la connexion</button></section></main>;
  }

  return <main className="pilot-activation-page">
    <header className="pilot-activation-nav"><Brand /><div><span>{data.merchant.businessName}</span><button onClick={onLogout}><LogOut size={17} aria-hidden="true" />Se déconnecter</button></div></header>
    <section className="pilot-activation-card" aria-labelledby="pilot-activation-title">
      <div className="pilot-activation-copy"><span className="pilot-activation-icon" aria-hidden="true">👋</span><span className="eyebrow">Bienvenue chez Kivli</span><h1 id="pilot-activation-title">Bienvenue chez Kivli 👋</h1><p>Toute l’équipe Kivli vous remercie pour votre confiance.</p><p>En rejoignant Kivli aujourd’hui, vous faites partie de nos premiers ambassadeurs. À ce titre, vous bénéficiez actuellement de la plateforme gratuitement, pendant que nous construisons Kivli avec nos premiers commerçants.</p><p>Votre expérience compte énormément pour nous. Une idée, une amélioration, quelque chose qui vous manque ou qui pourrait être plus simple ? N’hésitez pas à nous le dire. Vos retours participent directement à l’évolution de Kivli.</p><p className="pilot-activation-thanks">Merci de faire partie de l’aventure 🧡</p></div>
      <form className="pilot-acceptance-form" onSubmit={activate}>
        <div className="pilot-legal-heading"><span><ShieldCheck size={20} aria-hidden="true" /></span><div><small>Dernière étape</small><h2>Activez votre pilote gratuitement.</h2></div></div>
        <label className={`pilot-consent ${accepted ? "checked" : ""}`}><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} required /><span className="pilot-consent-box" aria-hidden="true"><Check size={16} /></span><span>Je confirme être habilité(e) à engager le commerce <strong>{data.merchant.businessName}</strong> et j’accepte les <a href="/conditions-pilote" target="_blank" rel="noreferrer">Conditions du pilote Kivli</a> ainsi que l’<a href="/accord-traitement-donnees" target="_blank" rel="noreferrer">Accord relatif au traitement des données personnelles</a>.</span></label>
        <p className="pilot-duration-reminder"><Check size={17} aria-hidden="true" />{PILOT_DURATION_REMINDER}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-large button-full" disabled={!accepted || busy}>{busy ? "Activation…" : "Activer gratuitement mon pilote"}<ArrowRight size={18} aria-hidden="true" /></button>
        <small className="pilot-proof-note">Votre acceptation datée et les versions exactes des documents seront conservées de manière sécurisée.</small>
      </form>
    </section>
  </main>;
}

function FeedbackModal({ busy, error, onSubmit, onClose }: { busy: boolean; error: string; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title"><button type="button" className="modal-close" onClick={onClose} aria-label="Fermer"><X size={18} aria-hidden="true" /></button><span className="feedback-modal-icon"><MessageSquareText size={23} aria-hidden="true" /></span><span className="eyebrow">Votre avis compte</span><h2 id="feedback-title">Faire un retour</h2><p>Une idée, une amélioration ou un problème ? Votre message est envoyé directement à l’équipe Kivli.</p><form className="form-grid" onSubmit={onSubmit}><label>Type de retour<select name="type" defaultValue="Idée" required><option>Idée</option><option>Amélioration</option><option>Problème</option><option>Autre</option></select></label><label>Message<textarea name="message" rows={6} minLength={5} maxLength={2000} placeholder="Dites-nous ce qui pourrait être plus simple…" required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-large button-full" disabled={busy}>{busy ? "Envoi…" : "Envoyer mon retour"}</button><button type="button" className="text-link" onClick={onClose}>Annuler</button></form></section></div>;
}

function ProgramOnboarding({ data, onCreated, onLogout }: { data: DashboardData; onCreated: () => Promise<void>; onLogout: () => Promise<void> }) {
  const [showForm, setShowForm] = useState(false);
  const [earningMode, setEarningMode] = useState<"visits" | "spend">("visits");
  const [onboardingTierCount, setOnboardingTierCount] = useState(1);
  const [cardName, setCardName] = useState("Ma carte fidélité");
  const [firstReward, setFirstReward] = useState("");
  const [firstThreshold, setFirstThreshold] = useState("8");
  const [selectedColor, setSelectedColor] = useState<string>(PROGRAM_COLORS[0].value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    const payload = { ...Object.fromEntries(formData), rewardTiers: formData.getAll("tierThreshold").map((threshold, index) => ({ threshold: Number(threshold), rewardText: String(formData.getAll("tierRewardText")[index] ?? "") })) };
    const response = await fetch("/api/merchant/program", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) setError(result.error ?? "Impossible de créer la carte.");
    else await onCreated();
    setBusy(false);
  }

  return <main className="program-onboarding" style={{ "--merchant": data.merchant.accentColor } as React.CSSProperties}>
    <header className="onboarding-nav"><Brand /><div><span>{data.merchant.businessName}</span><button onClick={onLogout}><LogOut size={17} aria-hidden="true" />Se déconnecter</button></div></header>
    <section className={`program-onboarding-shell ${showForm ? "form-open" : ""}`}>
      {showForm ? <aside className="setup-live-preview"><span className="eyebrow">Aperçu en direct</span><div className="live-card" style={{ "--preview-color": selectedColor } as React.CSSProperties}><div className="live-card-head"><span>{data.merchant.businessName.slice(0, 1)}</span><div><small>CARTE FIDÉLITÉ</small><strong>{data.merchant.businessName}</strong></div></div><p>{cardName || "Ma carte fidélité"}</p><div className="live-card-progress"><span><b>0</b> / {Number(firstThreshold) || 8} points</span><i><i /></i></div><div className="live-card-reward"><Gift size={18} aria-hidden="true" /><span><small>PROCHAINE RÉCOMPENSE</small><strong>{firstReward || "Votre première récompense"}</strong></span></div></div><p className="live-preview-note"><Sparkles size={16} aria-hidden="true" />Chaque choix met à jour l’aperçu de votre carte.</p></aside> : <div className="account-ready-card">
        <span className="account-ready-icon"><Check size={25} aria-hidden="true" /></span>
        <span className="eyebrow">Compte créé</span>
        <h1>Bienvenue {data.merchant.firstName || "chez Kivli"}.</h1>
        <p>Ton espace est prêt. Il reste une étape pour permettre à tes clients de créer leur carte.</p>
        <dl><div><dt>Commerce</dt><dd>{data.merchant.businessName}</dd></div><div><dt>Compte</dt><dd>{data.merchant.email}</dd></div></dl>
        {!showForm && <button className="button button-large" onClick={() => setShowForm(true)}>Créer ma carte<ArrowRight size={18} aria-hidden="true" /></button>}
      </div>}
      <div className="program-setup-stage">
        {showForm ? <form className="program-setup-form" onSubmit={createProgram}>
          <div><span className="eyebrow">Votre carte de fidélité</span><h2>Configurez l’essentiel.</h2><p>Vous pourrez tout modifier plus tard depuis l’onglet Mon programme.</p></div>
          <div className="config-group config-identity"><h3>Votre carte</h3><div className="setup-fields"><label>Commerce<input value={data.merchant.businessName} disabled /></label><label>Nom de la carte<input name="name" value={cardName} onChange={(event) => setCardName(event.target.value)} maxLength={80} required /></label></div></div>
          <div className="config-group"><h3>Comment vos clients gagnent-ils des points ?</h3><fieldset className="earning-mode premium-mode-picker"><legend className="sr-only">Mode de fidélité</legend><label className={earningMode === "visits" ? "selected" : ""}><input type="radio" name="earningMode" value="visits" checked={earningMode === "visits"} onChange={() => setEarningMode("visits")} /><span className="mode-icon"><Footprints size={22} aria-hidden="true" /></span><span><strong>Par passage</strong><small>1 passage = 1 point</small></span><Check className="mode-check" size={17} aria-hidden="true" /></label><label className={earningMode === "spend" ? "selected" : ""}><input type="radio" name="earningMode" value="spend" checked={earningMode === "spend"} onChange={() => setEarningMode("spend")} /><span className="mode-icon"><Coins size={22} aria-hidden="true" /></span><span><strong>Selon le montant</strong><small>1 € dépensé = 1 point</small></span><Check className="mode-check" size={17} aria-hidden="true" /></label></fieldset>{earningMode === "spend" && <div className="spend-rule-inline"><Coins size={17} aria-hidden="true" /><span><strong>1 point par euro dépensé</strong><small>Le calcul est automatique.</small></span></div>}<input type="hidden" name="spendAmountEuros" value="1" /></div>
          <div className="config-group"><div className="config-group-title"><h3>Récompenses</h3><span>{onboardingTierCount}/6</span></div><div className="dynamic-reward-list">{Array.from({ length: onboardingTierCount }, (_, index) => <div className="dynamic-reward-row" key={`onboarding-${index}`}><span className="reward-index">{index + 1}</span><label>Points nécessaires<input name="tierThreshold" type="number" min="1" max="1000" value={index === 0 ? firstThreshold : undefined} defaultValue={index === 0 ? undefined : ""} onChange={index === 0 ? (event) => setFirstThreshold(event.target.value) : undefined} required /></label><label>Récompense<input name="tierRewardText" value={index === 0 ? firstReward : undefined} defaultValue={index === 0 ? undefined : ""} onChange={index === 0 ? (event) => setFirstReward(event.target.value) : undefined} placeholder="Ex. Un café offert" maxLength={120} required /></label>{onboardingTierCount > 1 && <button type="button" className="remove-reward" onClick={() => setOnboardingTierCount((count) => Math.max(1, count - 1))} aria-label="Supprimer la dernière récompense"><Trash2 size={16} aria-hidden="true" /></button>}</div>)}</div>{onboardingTierCount < 6 && <button type="button" className="add-reward-button" onClick={() => setOnboardingTierCount((count) => Math.min(6, count + 1))}><Plus size={17} aria-hidden="true" />Ajouter une récompense</button>}<input type="hidden" name="rewardText" value="Récompense fidélité" /></div>
          <div className="config-group"><h3>Apparence</h3><fieldset className="color-fieldset program-colors premium-colors"><legend className="sr-only">Couleur de la carte</legend><div className="color-options">{PROGRAM_COLORS.map((color) => <label key={color.value} className="color-choice" style={{ backgroundColor: color.value }} title={color.name}><input type="radio" name="accentColor" value={color.value} checked={selectedColor === color.value} onChange={() => setSelectedColor(color.value)} aria-label={color.name} /><span>{color.name}</span></label>)}</div></fieldset></div>
          <details className="optional-config"><summary>Ajouter des conditions au programme <span>Facultatif</span></summary><label className="standalone-field">Conditions affichées au client<textarea name="terms" rows={3} maxLength={200} placeholder="Ex. Offre non cumulable avec une promotion." /></label></details>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-large button-full" disabled={busy}>{busy ? "Création…" : "Créer ma carte"}</button>
        </form> : <div className="program-setup-preview"><div className="setup-preview-card"><span>{data.merchant.businessName.slice(0, 1)}</span><small>VOTRE FUTURE CARTE</small><h2>{data.merchant.businessName}</h2><div>{Array.from({ length: 8 }, (_, index) => <i key={index}>{index + 1}</i>)}</div><p><Gift size={17} aria-hidden="true" />Votre récompense apparaîtra ici</p></div><p><Sparkles size={17} aria-hidden="true" />Après la création, votre QR code d’inscription sera immédiatement prêt à partager.</p></div>}
      </div>
    </section>
  </main>;
}

function EmployeePinSetup({ data, busy, error, onSubmit, onLogout }: { data: DashboardData; busy: boolean; error: string; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>; onLogout: () => Promise<void> }) {
  return <main className="employee-pin-setup">
    <header><Brand /><button onClick={onLogout}><LogOut size={17} aria-hidden="true" />Déconnexion</button></header>
    <section>
      <span className="security-orb"><ShieldCheck size={28} aria-hidden="true" /></span>
      <span className="eyebrow">Première connexion</span>
      <h1>Personnalise ton code PIN.</h1>
      <p>Bonjour {data.merchant.employeeName}. Le code reçu est temporaire : choisis maintenant ton propre code à 6 chiffres avant d’accéder au scanner.</p>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>Code PIN temporaire<input name="currentPin" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{6}" maxLength={6} required /></label>
        <label>Nouveau code PIN<input name="newPin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" maxLength={6} required /><small>Choisis 6 chiffres faciles à retenir pour toi, mais difficiles à deviner.</small></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-large button-full" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer mon PIN"}</button>
      </form>
    </section>
  </main>;
}

function PinChangeModal({ busy, error, onSubmit, onClose }: { busy: boolean; error: string; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="pin-change-modal" role="dialog" aria-modal="true" aria-labelledby="pin-change-title"><button type="button" className="modal-close" onClick={onClose} aria-label="Fermer"><X size={18} aria-hidden="true" /></button><span className="security-orb"><ShieldCheck size={23} aria-hidden="true" /></span><h2 id="pin-change-title">Modifier mon code PIN</h2><p>Ton nouveau code sera utilisé dès ta prochaine connexion.</p><form className="form-grid" onSubmit={onSubmit}><label>Code PIN actuel<input name="currentPin" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{6}" maxLength={6} required /></label><label>Nouveau code PIN<input name="newPin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" maxLength={6} required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-large button-full" disabled={busy}>{busy ? "Enregistrement…" : "Modifier mon PIN"}</button></form></section></div>;
}

function EmployeeAccessModal({ access, onClose }: { access: { displayName: string; loginCode: string; temporaryPin: string }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copyAccess() {
    await navigator.clipboard.writeText(`Identifiant : ${access.loginCode}\nPIN temporaire : ${access.temporaryPin}`);
    setCopied(true);
  }
  return <div className="modal-backdrop"><section className="employee-access-modal" role="dialog" aria-modal="true" aria-labelledby="employee-access-title"><span className="access-created-icon"><Check size={25} aria-hidden="true" /></span><span className="eyebrow">Accès prêt</span><h2 id="employee-access-title">Transmets ces accès à {access.displayName}.</h2><p>Le PIN est temporaire et ne sera plus affiché après la fermeture. L’employé devra le modifier dès sa première connexion.</p><div className="temporary-access"><span><small>IDENTIFIANT</small><code>{access.loginCode}</code></span><span><small>PIN TEMPORAIRE</small><code>{access.temporaryPin}</code></span></div><button className="button button-large button-full" onClick={copyAccess}>{copied ? <><Check size={18} aria-hidden="true" />Accès copiés</> : <><Copy size={18} aria-hidden="true" />Copier les accès</>}</button><button className="text-link" onClick={onClose}>J’ai bien transmis les accès</button></section></div>;
}

function Overview({ data, joinUrl, onScan, onCustomers, onShowQr, onUndoReward, busy }: { data: ReadyDashboardData; joinUrl: string; onScan: () => void; onCustomers: () => void; onShowQr: () => void; onUndoReward: (stampId: string, firstName: string) => Promise<void>; busy: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return <div className="overview-grid">
    <section className="welcome-panel"><div><span className="eyebrow"><Sparkles size={15} aria-hidden="true" />Ton programme est en ligne</span><h2>Prêt pour le prochain passage.</h2><p>Inscris un nouveau client ou ajoute un passage en quelques secondes.</p><div className="welcome-actions"><button className="button button-light" onClick={onShowQr}><QrCodeIcon size={18} aria-hidden="true" />Créer une carte</button><button className="button button-outline-light" onClick={onScan}><ScanLine size={18} aria-hidden="true" />Scanner un client</button><button className="button button-outline-light welcome-clients" onClick={onCustomers}>Voir les clients<ArrowRight size={17} aria-hidden="true" /></button></div></div><div className="welcome-motif"><i /><i /><i /><span><Check size={32} strokeWidth={2.5} aria-hidden="true" /></span></div></section>
    <section className="stats-row stats-row-expanded"><article><span className="stat-icon orange"><UsersRound size={20} aria-hidden="true" /></span><div><small>Nouveaux membres · 30 j</small><strong>{data.stats.newMembers}</strong></div></article><article><span className="stat-icon green"><Footprints size={20} aria-hidden="true" /></span><div><small>Clients revenus</small><strong>{data.stats.returningCustomers}</strong></div></article><article><span className="stat-icon purple"><Trophy size={20} aria-hidden="true" /></span><div><small>Récompenses utilisées · 30 j</small><strong>{data.stats.rewardsRedeemed}</strong></div></article><article><span className="stat-icon orange"><Coins size={20} aria-hidden="true" /></span><div><small>Fréquence moyenne</small><strong>{data.stats.avgFrequencyDays == null ? "—" : `${data.stats.avgFrequencyDays} j`}</strong></div></article></section>
    <section className="panel activity-panel"><div className="panel-head"><div><h2>Activité récente</h2><p>Les derniers mouvements du programme.</p></div><button className="text-link activity-all" onClick={onCustomers}>Tous les clients<ArrowRight size={15} aria-hidden="true" /></button></div><div className="activity-list">{data.activity.length ? data.activity.map((item) => <Activity key={item.id} item={item} onUndoReward={onUndoReward} busy={busy} />) : <div className="empty-activity"><span><ScanLine size={21} aria-hidden="true" /></span><h3>Tout commence au premier scan.</h3><p>Inscris un client avec le QR code, puis ajoute son premier passage.</p></div>}</div></section>
    <section className="panel join-qr-panel" id="customer-enrollment-qr"><span className="eyebrow"><QrCodeIcon size={15} aria-hidden="true" />Inscription client</span><div className="dashboard-qr"><QrCode value={joinUrl} size={170} label="QR code d’inscription au programme" /></div><h3>À scanner pour créer une carte</h3><p>Présente ce QR code au client : sa carte est créée immédiatement sur son téléphone.</p><div className="copy-row"><code>{joinUrl.replace(/^https?:\/\//, "")}</code><button onClick={copy}>{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}<span>{copied ? "Copié" : "Copier"}</span></button></div><a href={`/join/${data.merchant.slug}`} target="_blank" rel="noreferrer" className="text-link">Tester l’inscription<ExternalLink size={14} aria-hidden="true" /></a></section>
  </div>;
}

function Activity({ item, onUndoReward, busy }: { item: DashboardData["activity"][number]; onUndoReward: (stampId: string, firstName: string) => Promise<void>; busy: boolean }) {
  const redeemed = item.reason === "redeem";
  const undone = item.reason === "undo";
  const rewardRestored = undone && item.note?.startsWith("reward_restore:");
  const purchase = item.reason === "purchase";
  const bonus = item.reason === "bonus";
  const amount = Math.abs(item.delta);
  const action = redeemed ? `Récompense remise${item.rewardText ? ` · ${item.rewardText}` : ""}${amount ? ` · ${amount} points débités` : ""}` : rewardRestored ? `Récompense annulée · ${amount} points restitués` : undone ? `${amount} point${amount > 1 ? "s" : ""} annulé${amount > 1 ? "s" : ""}` : bonus ? `Bonus de ${amount} point${amount > 1 ? "s" : ""}${item.note ? ` · ${item.note}` : ""}` : purchase ? `Achat${item.amountCents ? ` ${(item.amountCents / 100).toFixed(2).replace(".", ",")} €` : ""} · ${amount} point${amount > 1 ? "s" : ""}` : `Passage · ${amount} point${amount > 1 ? "s" : ""}`;
  return <div className="activity-item"><span className={redeemed ? "redeemed" : undone ? "undone" : bonus ? "bonus" : ""}>{redeemed ? "★" : undone ? "↶" : bonus ? "+" : `+${amount}`}</span><div><strong>{item.firstName}</strong><small>{action} · {item.actorName}</small></div>{item.canUndoReward ? <button className="activity-undo-reward" onClick={() => void onUndoReward(item.id, item.firstName)} disabled={busy}><RotateCcw size={13} aria-hidden="true" />Annuler</button> : <time>{relativeDate(item.createdAt)}</time>}</div>;
}

function relativeDate(value: string) {
  const date = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`);
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "À l’instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (minutes < 1440) return `Il y a ${Math.floor(minutes / 60)} h`;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date);
}
