"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Footprints,
  Gift,
  MessageSquareText,
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
  Coins,
  UserRoundCog,
  UsersRound,
} from "lucide-react";
import { Brand } from "./Brand";
import { MerchantScanner } from "./MerchantScanner";
import { QrCode } from "./QrCode";
import { PROGRAM_COLORS, visibleProgramTerms } from "../lib/program-style";

type DashboardData = {
  welcomePending?: boolean;
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
  customers: Array<{ code: string; firstName: string; phone: string | null; marketingConsent: number; points: number; totalPoints: number; availableRewards: number; undoableStampId: string | null; updatedAt: string; segment: "new" | "active" | "loyal" | "reactivate" }>;
  activity: Array<{ id: string; firstName: string; delta: number; reason: string; actorName: string; createdAt: string; amountCents: number | null; note: string | null }>;
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
  input: { quantity: number; amountCents?: number };
};

type CustomerDialog = {
  kind: "bonus" | "spend";
  customer: DashboardData["customers"][number];
};

const tabs = [
  { id: "overview", label: "Vue d’ensemble", shortLabel: "Accueil", icon: LayoutDashboard },
  { id: "scan", label: "Scanner un client", shortLabel: "Scanner", icon: ScanLine },
  { id: "customers", label: "Clients", shortLabel: "Clients", icon: UsersRound },
  { id: "program", label: "Mon programme", shortLabel: "Programme", icon: Gift },
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
  const [showWelcome, setShowWelcome] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [settingsTierCount, setSettingsTierCount] = useState(1);
  const [settingsEarningMode, setSettingsEarningMode] = useState<"visits" | "spend">("visits");
  const sessionInitialized = useRef(false);

  const load = useCallback(async () => {
    const preview = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("welcome") === "preview";
    const response = await fetch(`/api/merchant/dashboard${preview ? "?welcome=preview" : ""}`, { cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/merchant";
      return;
    }
    const result = (await response.json()) as DashboardData & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Tableau de bord indisponible.");
    setData(result);
    if (result.welcomePending) setShowWelcome(true);
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

  async function recognize(code: string, input: { quantity: number; amountCents?: number }) {
    setBusy(true); setError("");
    const response = await fetch("/api/merchant/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const result = await response.json() as Omit<ScanCandidate, "input"> & { error?: string };
    if (!response.ok) setError(result.error ?? "Carte non reconnue.");
    else setScanCandidate({ ...result, input });
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
    if (!window.confirm("Confirmer la remise de la récompense ?")) return;
    setBusy(true);
    const response = await fetch("/api/merchant/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, rewardId }) });
    const result = (await response.json()) as { firstName?: string; error?: string };
    if (!response.ok) setError(result.error ?? "Récompense non remise.");
    else {
      setToast(`Récompense remise à ${result.firstName}.`);
      if (!keepScan) { setStampResult(null); setScanCandidate(null); }
      await load();
    }
    setBusy(false);
    return response.ok;
  }

  async function redeemThenEarn(candidate: ScanCandidate, rewardId: string) {
    if (await redeem(candidate.customer.code, rewardId, true)) await stamp(candidate.customer.code, candidate.input.quantity, candidate.input.amountCents);
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

  function customerAction(customer: DashboardData["customers"][number]) {
    if (data?.program?.earningMode === "spend") {
      setCustomerDialog({ kind: "spend", customer });
      return;
    }
    void recognize(customer.code, { quantity: 1 });
  }

  async function submitSpend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customerDialog || customerDialog.kind !== "spend") return;
    const amount = String(new FormData(event.currentTarget).get("amount") ?? "").replace(",", ".");
    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setError("Indique un montant d’achat valide.");
      return;
    }
    const customer = customerDialog.customer;
    setCustomerDialog(null);
    await recognize(customer.code, { quantity: 1, amountCents });
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
    const result = (await response.json()) as { error?: string };
    if (!response.ok) setError(result.error ?? "Code PIN non modifié.");
    else {
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
        <div className="sidebar-foot">{data.merchant.role === "owner" && <button onClick={() => { setFeedbackError(""); setFeedbackOpen(true); }}><MessageSquareText size={17} aria-hidden="true" />Faire un retour</button>}{data.merchant.role === "employee" && <button onClick={() => setShowEmployeePin(true)}><ShieldCheck size={17} aria-hidden="true" />Modifier mon PIN</button>}<button onClick={logout}><LogOut size={17} aria-hidden="true" />Se déconnecter</button><small>Kivli · version pilote</small></div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-top"><div><small className="dashboard-date">{new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</small><small className="dashboard-context">{data.merchant.role === "employee" ? `${data.merchant.businessName} · ${data.merchant.employeeName}` : data.merchant.businessName}</small><h1>{data.merchant.role === "employee" ? "Scanner" : visibleTabs.find((item) => item.id === tab)?.label}</h1></div>{data.merchant.role === "employee" ? <div className="dashboard-actions employee-top-actions"><button className="button button-ghost" onClick={() => setShowEmployeePin(true)}><ShieldCheck size={17} aria-hidden="true" /><span>Mon PIN</span></button><button className="button button-ghost logout-quick" onClick={logout} aria-label="Se déconnecter"><LogOut size={18} aria-hidden="true" /><span>Déconnexion</span></button></div> : <div className="dashboard-actions"><button className="button button-ghost qr-quick" onClick={showEnrollmentQr}><QrCodeIcon size={18} aria-hidden="true" /><span>QR codes clients</span></button><button className="button scan-quick" onClick={() => setTab("scan")}><ScanLine size={18} aria-hidden="true" />Scanner</button><button className="button button-ghost feedback-quick" onClick={() => { setFeedbackError(""); setFeedbackOpen(true); }}><MessageSquareText size={17} aria-hidden="true" /><span>Faire un retour</span></button><button className="button button-ghost owner-logout-quick" onClick={logout} aria-label="Se déconnecter"><LogOut size={18} aria-hidden="true" /></button></div>}</header>
        {data.merchant.role === "owner" && <nav className="mobile-tabs" aria-label="Navigation principale" style={{ "--tab-count": visibleTabs.length } as React.CSSProperties}>{visibleTabs.map((item) => { const Icon = item.icon; return <button key={item.id} aria-label={item.label} aria-current={tab === item.id ? "page" : undefined} className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setError(""); }}><span className="mobile-tab-icon"><Icon className="nav-icon" size={21} strokeWidth={2} aria-hidden="true" /></span><small>{item.shortLabel}</small></button>; })}</nav>}
        {error && <div className="dashboard-error" role="alert"><span>!</span>{error}<button onClick={() => setError("")}>×</button></div>}

        {tab === "overview" && <Overview data={{ ...data, program: data.program }} joinUrl={joinUrl} onScan={() => setTab("scan")} onCustomers={() => setTab("customers")} onShowQr={showEnrollmentQr} />}
        {tab === "scan" && (
          <div className="scan-layout">
            <div>{data.merchant.role === "owner" && <span className="eyebrow scan-eyebrow"><ScanLine size={15} aria-hidden="true" />Validation guidée</span>}<h2>{data.merchant.role === "employee" ? "Présente le QR code du client." : "Scanne la carte du client."}</h2><p>Après reconnaissance, choisis clairement entre remettre une récompense et enregistrer le nouvel achat.</p><MerchantScanner onDetected={recognize} busy={busy} earningMode={data.program.earningMode} spendAmountCents={data.program.spendAmountCents} /></div>
            <aside className="scan-side"><h3>{data.merchant.role === "employee" ? "Mes dernières opérations" : "Derniers passages"}</h3>{data.activity.length ? data.activity.slice(0, 6).map((item) => <Activity key={item.id} item={item} />) : <p className="muted">Les premières opérations apparaîtront ici.</p>}</aside>
          </div>
        )}
        {tab === "customers" && (
          <div className="panel customer-panel">
            <div className="panel-head"><div><h2>{data.customers.length} client{data.customers.length !== 1 ? "s" : ""}</h2><p>Coordonnées, progression et récompenses au même endroit.</p></div><input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, téléphone ou code…" /></div>
            <div className="segment-filters">{([['all','Tous',data.customers.length],['new','Nouveaux',data.segmentCounts.new],['active','Actifs',data.segmentCounts.active],['loyal','Fidèles',data.segmentCounts.loyal],['reactivate','À réactiver',data.segmentCounts.reactivate],['reward','Récompense',data.segmentCounts.reward]] as const).map(([id,label,count]) => <button key={id} className={segment === id ? "active" : ""} onClick={() => setSegment(id)}>{label}<b>{count}</b></button>)}</div>
            <div className="customer-table">
              <div className="table-head"><span>Client</span><span>Progression</span><span>Total</span><span>Récompense</span><span /></div>
              {filteredCustomers.map((customer) => <div className="table-row" key={customer.code}><span className="customer-name"><i>{customer.firstName.slice(0, 1)}</i><span><b>{customer.firstName}</b><small>{customer.phone || "Ancienne fiche sans téléphone"}{customer.marketingConsent ? " · SMS accepté" : ""}</small></span></span><span data-label="Progression"><b>{customer.points}/{data.program.goal}</b><i className="mini-progress"><i style={{ width: `${customer.points / data.program.goal * 100}%` }} /></i></span><span data-label="Total">{customer.totalPoints} points</span><span data-label="Récompense">{customer.availableRewards ? <b className="reward-badge">{customer.availableRewards} disponible</b> : <small className="muted">Aucune</small>}</span><span className="row-actions"><button onClick={() => customerAction(customer)} disabled={busy}><Footprints size={16} aria-hidden="true" />Action</button><button onClick={() => addBonus(customer)} disabled={busy}><Coins size={15} aria-hidden="true" />Bonus</button>{customer.undoableStampId && <button className="undo-button" onClick={() => undoStamp(customer.undoableStampId!, customer.firstName)} disabled={busy}><RotateCcw size={15} aria-hidden="true" />Annuler</button>}{customer.availableRewards > 0 && <button className="redeem-button" onClick={() => redeem(customer.code)} disabled={busy}><Gift size={15} aria-hidden="true" />Remettre</button>}</span></div>)}
              {!filteredCustomers.length && (data.customers.length ? <div className="table-empty">Aucun client ne correspond à cette recherche.</div> : <div className="table-empty table-empty-onboarding"><span><QrCodeIcon size={22} aria-hidden="true" /></span><strong>Ta liste de clients est prête.</strong><p>Partage le QR code d’inscription pour créer la première carte.</p><button className="button button-small" onClick={showEnrollmentQr}>Afficher le QR code</button></div>)}
            </div>
          </div>
        )}
        {tab === "program" && data.merchant.role === "owner" && (
          <div className="program-layout">
            <div className="settings-stack">
              <form className="panel settings-form program-config-form" onSubmit={saveProgram}><div className="config-form-head"><div><span className="eyebrow">Votre programme</span><h2>Personnaliser la carte</h2></div><p>Les changements s’appliquent immédiatement aux cartes existantes.</p></div><div className="config-divider" /><label className="config-field">Nom de la carte<input name="name" defaultValue={data.program.name} required /></label><div className="config-group"><h3>Gain des points</h3><fieldset className="earning-mode premium-mode-picker compact"><legend className="sr-only">Comment gagner des points ?</legend><label className={settingsEarningMode === "visits" ? "selected" : ""}><input type="radio" name="earningMode" value="visits" checked={settingsEarningMode === "visits"} onChange={() => setSettingsEarningMode("visits")} /><span className="mode-icon"><Footprints size={20} aria-hidden="true" /></span><span><strong>Par passage</strong><small>1 passage = 1 point</small></span><Check className="mode-check" size={17} aria-hidden="true" /></label><label className={settingsEarningMode === "spend" ? "selected" : ""}><input type="radio" name="earningMode" value="spend" checked={settingsEarningMode === "spend"} onChange={() => setSettingsEarningMode("spend")} /><span className="mode-icon"><Coins size={20} aria-hidden="true" /></span><span><strong>Selon le montant</strong><small>1 € dépensé = 1 point</small></span><Check className="mode-check" size={17} aria-hidden="true" /></label></fieldset>{settingsEarningMode === "spend" && <div className="spend-rule-inline"><Coins size={17} aria-hidden="true" /><span><strong>1 point par euro dépensé</strong><small>Le calcul est automatique au moment du passage.</small></span></div>}<input type="hidden" name="spendAmountEuros" value="1" /></div><div className="config-group"><div className="config-group-title"><h3>Récompenses</h3><span>{settingsTierCount}/6</span></div><div className="dynamic-reward-list">{Array.from({ length: settingsTierCount }, (_, index) => { const tier = data.rewardTiers[index]; return <div className="dynamic-reward-row" key={tier?.id ?? `settings-${index}`}><span className="reward-index">{index + 1}</span><label>Points nécessaires<input name="tierThreshold" type="number" min="1" max="1000" defaultValue={tier?.threshold ?? ""} required /></label><label>Récompense<input name="tierRewardText" defaultValue={tier?.rewardText ?? ""} placeholder="Ex. Un café offert" required /></label>{settingsTierCount > 1 && <button type="button" className="remove-reward" onClick={() => setSettingsTierCount((count) => Math.max(1, count - 1))} aria-label="Supprimer la dernière récompense"><Trash2 size={16} aria-hidden="true" /></button>}</div>; })}</div>{settingsTierCount < 6 && <button type="button" className="add-reward-button" onClick={() => setSettingsTierCount((count) => Math.min(6, count + 1))}><Plus size={17} aria-hidden="true" />Ajouter une récompense</button>}<input type="hidden" name="rewardText" value={data.rewardTiers[0]?.rewardText ?? data.program.rewardText} /></div><div className="config-group"><h3>Couleur de la carte</h3><fieldset className="color-fieldset program-colors premium-colors"><legend className="sr-only">Couleur de la carte</legend><div className="color-options">{PROGRAM_COLORS.map((color) => <label key={color.value} className="color-choice" style={{ backgroundColor: color.value }} title={color.name}><input type="radio" name="accentColor" value={color.value} defaultChecked={data.merchant.accentColor.toLowerCase() === color.value} aria-label={color.name} /><span>{color.name}</span></label>)}</div></fieldset></div><label className="config-field">Conditions affichées au client <small>Facultatif</small><textarea name="terms" defaultValue={visibleProgramTerms(data.program.terms)} rows={3} maxLength={200} placeholder="Ex. Offre non cumulable avec une promotion." /></label><button className="button button-large button-full" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer les modifications"}</button></form>
              <section className="panel security-panel">
                <div className="panel-head"><div><h2>Sécurité du propriétaire</h2><p>Les accès individuels des employés se gèrent dans l’onglet Mon équipe.</p></div></div>
                <form className="form-grid owner-pin-form" onSubmit={(event) => updateSecurity(event, "change_owner_password")}>
                  <label>Code confidentiel actuel<input name="currentPassword" type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} pattern="[0-9]{6}" required /></label>
                  <label>Nouveau code<input name="newPassword" type="password" inputMode="numeric" autoComplete="new-password" minLength={6} maxLength={6} pattern="[0-9]{6}" required /><small>Exactement 6 chiffres.</small></label>
                  <button className="button" disabled={busy}>Modifier mon code</button>
                </form>
              </section>
            </div>
            <div className="panel program-preview"><span className="eyebrow"><Sparkles size={15} aria-hidden="true" />Aperçu client</span><div className="mini-loyalty mini-loyalty-modern"><div className="mini-card-head"><span>{data.merchant.businessName.slice(0, 1)}</span><div><small>CARTE FIDÉLITÉ</small><strong>{data.merchant.businessName}</strong></div></div><span className="mini-card-kicker">{data.program.name}</span><h3>Encore {data.program.goal} passages.</h3><div className="mini-card-stamps">{Array.from({ length: Math.min(data.program.goal, 10) }, (_, index) => <span key={index}>{index + 1}</span>)}</div><p><span><Gift size={16} aria-hidden="true" />Récompense</span><b>{data.program.rewardText}</b></p></div><p className="preview-terms"><ShieldCheck size={16} aria-hidden="true" />{visibleProgramTerms(data.program.terms)}</p><a href={`/join/${data.merchant.slug}`} target="_blank" rel="noreferrer" className="button button-ghost preview-open">Ouvrir la page d’inscription<ExternalLink size={16} aria-hidden="true" /></a></div>
          </div>
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

      {scanCandidate && <div className="modal-backdrop"><section className="scan-decision-modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={() => setScanCandidate(null)} aria-label="Fermer">×</button><span className="eyebrow">Carte reconnue</span><h2>Que fait {scanCandidate.customer.firstName} aujourd’hui ?</h2><p>Choisis l’action exacte. Remettre une récompense seule n’ajoutera aucun point.</p>{scanCandidate.rewards.length > 0 && <div className="available-reward-list"><strong>Récompenses disponibles</strong>{scanCandidate.rewards.map((reward) => <article key={reward.id}><span><Gift size={17} aria-hidden="true" /><b>{reward.rewardText}</b></span><div><button className="button button-ghost" onClick={() => redeem(scanCandidate.customer.code, reward.id)} disabled={busy}>Utiliser seulement</button><button className="text-link" onClick={() => redeemThenEarn(scanCandidate, reward.id)} disabled={busy}>Utiliser puis enregistrer l’achat</button></div></article>)}</div>}<button className="button button-large button-full" onClick={() => stamp(scanCandidate.customer.code, scanCandidate.input.quantity, scanCandidate.input.amountCents)} disabled={busy}>{scanCandidate.earningMode === "spend" ? `Enregistrer ${(Number(scanCandidate.input.amountCents ?? 0) / 100).toFixed(2).replace(".", ",")} €` : `Ajouter ${scanCandidate.input.quantity} point${scanCandidate.input.quantity > 1 ? "s" : ""}`}<ArrowRight size={17} aria-hidden="true" /></button><button className="text-link result-close" onClick={() => setScanCandidate(null)}>Ne rien enregistrer</button></section></div>}
      {stampResult && <div className="modal-backdrop"><section className="result-modal" role="dialog" aria-modal="true"><div className={`result-icon ${stampResult.rewardEarned ? "reward" : ""}`}>{stampResult.rewardEarned ? "★" : `+${stampResult.quantity}`}</div><span className="eyebrow">{stampResult.rewardEarned ? `${stampResult.rewardsEarned} récompense${stampResult.rewardsEarned > 1 ? "s" : ""} débloquée${stampResult.rewardsEarned > 1 ? "s" : ""}` : `${stampResult.quantity} point${stampResult.quantity > 1 ? "s" : ""} ajouté${stampResult.quantity > 1 ? "s" : ""}`}</span><h2>{stampResult.rewardEarned ? `Bravo ${stampResult.customer.firstName} !` : `C’est fait pour ${stampResult.customer.firstName}.`}</h2><p>{stampResult.rewardEarned ? `La carte compte maintenant ${stampResult.availableRewards} récompense${stampResult.availableRewards > 1 ? "s" : ""} disponible${stampResult.availableRewards > 1 ? "s" : ""}.` : `Sa carte affiche maintenant ${stampResult.customer.points}/${stampResult.customer.goal} points.`}</p>{stampResult.availableRewards > 0 && <button className="button reward-action button-full" onClick={() => redeem(stampResult.customer.code)} disabled={busy}>★ Utiliser une récompense</button>}<button className="button button-large button-full" onClick={() => { setStampResult(null); setTab("scan"); }}>Scanner le client suivant</button><button className="text-link result-undo" onClick={() => undoStamp(stampResult.stampId, stampResult.customer.firstName)} disabled={busy}>↶ Annuler cette opération</button><button className="text-link result-close" onClick={() => setStampResult(null)}>Fermer</button></section></div>}
      {showEmployeePin && <PinChangeModal busy={busy} error={error} onSubmit={changeEmployeePin} onClose={() => { setShowEmployeePin(false); setError(""); }} />}
      {customerDialog && <CustomerActionModal dialog={customerDialog} busy={busy} error={error} spendAmountCents={data.program.spendAmountCents} onBonus={submitBonus} onSpend={submitSpend} onClose={() => { setCustomerDialog(null); setError(""); }} />}
      {employeeAccess && <EmployeeAccessModal access={employeeAccess} onClose={() => setEmployeeAccess(null)} />}
      {showWelcome && <WelcomeModal onClose={() => { void fetch("/api/merchant/welcome-seen", { method: "POST" }); setShowWelcome(false); }} onContinue={() => { void fetch("/api/merchant/welcome-seen", { method: "POST" }); setShowWelcome(false); setTab("program"); }} />}
      {feedbackOpen && <FeedbackModal busy={busy} error={feedbackError} onSubmit={submitFeedback} onClose={() => { setFeedbackOpen(false); setFeedbackError(""); }} />}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}

function CustomerActionModal({ dialog, busy, error, spendAmountCents, onBonus, onSpend, onClose }: { dialog: CustomerDialog; busy: boolean; error: string; spendAmountCents: number; onBonus: (event: FormEvent<HTMLFormElement>) => Promise<void>; onSpend: (event: FormEvent<HTMLFormElement>) => Promise<void>; onClose: () => void }) {
  const bonus = dialog.kind === "bonus";
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="customer-action-modal" role="dialog" aria-modal="true" aria-labelledby="customer-action-title"><button className="modal-close" onClick={onClose} aria-label="Fermer">×</button><span className={`customer-action-icon ${bonus ? "bonus" : "spend"}`}>{bonus ? <Coins size={23} aria-hidden="true" /> : <Footprints size={23} aria-hidden="true" />}</span><span className="eyebrow">{bonus ? "Geste commercial" : "Nouvel achat"}</span><h2 id="customer-action-title">{bonus ? `Ajouter un bonus à ${dialog.customer.firstName}` : `Enregistrer l’achat de ${dialog.customer.firstName}`}</h2><p>{bonus ? "Les points bonus sont clairement identifiés dans l’historique et restent réservés au propriétaire." : `Kivli calcule automatiquement les points : 1 point tous les ${(spendAmountCents / 100).toFixed(2).replace(".", ",")} €.`}</p><form className="form-grid" onSubmit={bonus ? onBonus : onSpend}>{bonus ? <><label>Nombre de points bonus<input name="quantity" type="number" min="1" max="100" defaultValue="1" required autoFocus /></label><label>Motif <small>Facultatif</small><input name="note" maxLength={120} placeholder="Geste commercial, anniversaire…" /></label></> : <label>Montant de l’achat<input name="amount" type="number" min="0.01" max="100000" step="0.01" inputMode="decimal" placeholder="0,00" required autoFocus /><small>Montant en euros, taxes comprises.</small></label>}{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-large button-full" disabled={busy}>{busy ? "Enregistrement…" : bonus ? "Ajouter le bonus" : "Continuer"}</button><button type="button" className="text-link" onClick={onClose}>Annuler</button></form></section></div>;
}

function WelcomeModal({ onClose, onContinue }: { onClose: () => void; onContinue: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="welcome-modal" role="dialog" aria-modal="true" aria-labelledby="welcome-title"><button className="modal-close" onClick={onClose} aria-label="Fermer">×</button><span className="welcome-modal-icon">👋</span><span className="eyebrow">Bienvenue chez Kivli</span><h2 id="welcome-title">Bienvenue chez Kivli 👋</h2><p>Toute l’équipe Kivli vous remercie pour votre confiance.</p><p>En rejoignant Kivli aujourd’hui, vous faites partie de nos premiers ambassadeurs. À ce titre, vous bénéficiez actuellement de la plateforme gratuitement, pendant que nous construisons Kivli avec nos premiers commerçants.</p><p>Votre expérience compte énormément pour nous. Une idée, une amélioration, quelque chose qui vous manque ou qui pourrait être plus simple ? N’hésitez pas à nous le dire. Vos retours participent directement à l’évolution de Kivli.</p><p className="welcome-thanks">Merci de faire partie de l’aventure 🧡</p><button className="button button-large button-full" onClick={onContinue}>Créer ma carte de fidélité<ArrowRight size={18} aria-hidden="true" /></button><button className="text-link" onClick={onClose}>Continuer vers mon espace</button></section></div>;
}

function FeedbackModal({ busy, error, onSubmit, onClose }: { busy: boolean; error: string; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title"><button className="modal-close" onClick={onClose} aria-label="Fermer">×</button><span className="feedback-modal-icon"><MessageSquareText size={23} aria-hidden="true" /></span><span className="eyebrow">Votre avis compte</span><h2 id="feedback-title">Faire un retour</h2><p>Une idée, une amélioration ou un problème ? Votre message est envoyé directement à l’équipe Kivli.</p><form className="form-grid" onSubmit={onSubmit}><label>Type de retour<select name="type" defaultValue="Idée" required><option>Idée</option><option>Amélioration</option><option>Problème</option><option>Autre</option></select></label><label>Message<textarea name="message" rows={6} minLength={5} maxLength={2000} placeholder="Dites-nous ce qui pourrait être plus simple…" required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-large button-full" disabled={busy}>{busy ? "Envoi…" : "Envoyer mon retour"}</button><button type="button" className="text-link" onClick={onClose}>Annuler</button></form></section></div>;
}

function ProgramOnboarding({ data, onCreated, onLogout }: { data: DashboardData; onCreated: () => Promise<void>; onLogout: () => Promise<void> }) {
  const [showForm, setShowForm] = useState(false);
  const [showWelcome, setShowWelcome] = useState(Boolean(data.welcomePending) || (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("welcome") === "preview"));
  const [earningMode, setEarningMode] = useState<"visits" | "spend">("visits");
  const [onboardingTierCount, setOnboardingTierCount] = useState(1);
  const [cardName, setCardName] = useState("Ma carte fidélité");
  const [firstReward, setFirstReward] = useState("");
  const [firstThreshold, setFirstThreshold] = useState("8");
  const [selectedColor, setSelectedColor] = useState(PROGRAM_COLORS[0].value);
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
    {showWelcome && <WelcomeModal onClose={() => { void fetch("/api/merchant/welcome-seen", { method: "POST" }); setShowWelcome(false); }} onContinue={() => { void fetch("/api/merchant/welcome-seen", { method: "POST" }); setShowWelcome(false); setShowForm(true); }} />}
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
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="pin-change-modal" role="dialog" aria-modal="true" aria-labelledby="pin-change-title"><button className="modal-close" onClick={onClose} aria-label="Fermer">×</button><span className="security-orb"><ShieldCheck size={23} aria-hidden="true" /></span><h2 id="pin-change-title">Modifier mon code PIN</h2><p>Ton nouveau code sera utilisé dès ta prochaine connexion.</p><form className="form-grid" onSubmit={onSubmit}><label>Code PIN actuel<input name="currentPin" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{6}" maxLength={6} required /></label><label>Nouveau code PIN<input name="newPin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" maxLength={6} required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-large button-full" disabled={busy}>{busy ? "Enregistrement…" : "Modifier mon PIN"}</button></form></section></div>;
}

function EmployeeAccessModal({ access, onClose }: { access: { displayName: string; loginCode: string; temporaryPin: string }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copyAccess() {
    await navigator.clipboard.writeText(`Identifiant : ${access.loginCode}\nPIN temporaire : ${access.temporaryPin}`);
    setCopied(true);
  }
  return <div className="modal-backdrop"><section className="employee-access-modal" role="dialog" aria-modal="true" aria-labelledby="employee-access-title"><span className="access-created-icon"><Check size={25} aria-hidden="true" /></span><span className="eyebrow">Accès prêt</span><h2 id="employee-access-title">Transmets ces accès à {access.displayName}.</h2><p>Le PIN est temporaire et ne sera plus affiché après la fermeture. L’employé devra le modifier dès sa première connexion.</p><div className="temporary-access"><span><small>IDENTIFIANT</small><code>{access.loginCode}</code></span><span><small>PIN TEMPORAIRE</small><code>{access.temporaryPin}</code></span></div><button className="button button-large button-full" onClick={copyAccess}>{copied ? <><Check size={18} aria-hidden="true" />Accès copiés</> : <><Copy size={18} aria-hidden="true" />Copier les accès</>}</button><button className="text-link" onClick={onClose}>J’ai bien transmis les accès</button></section></div>;
}

function Overview({ data, joinUrl, onScan, onCustomers, onShowQr }: { data: ReadyDashboardData; joinUrl: string; onScan: () => void; onCustomers: () => void; onShowQr: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return <div className="overview-grid">
    <section className="welcome-panel"><div><span className="eyebrow"><Sparkles size={15} aria-hidden="true" />Ton programme est en ligne</span><h2>Prêt pour le prochain passage.</h2><p>Inscris un nouveau client ou ajoute un passage en quelques secondes.</p><div className="welcome-actions"><button className="button button-light" onClick={onShowQr}><QrCodeIcon size={18} aria-hidden="true" />Créer une carte</button><button className="button button-outline-light" onClick={onScan}><ScanLine size={18} aria-hidden="true" />Scanner un client</button><button className="button button-outline-light welcome-clients" onClick={onCustomers}>Voir les clients<ArrowRight size={17} aria-hidden="true" /></button></div></div><div className="welcome-motif"><i /><i /><i /><span><Check size={32} strokeWidth={2.5} aria-hidden="true" /></span></div></section>
    <section className="stats-row stats-row-expanded"><article><span className="stat-icon orange"><UsersRound size={20} aria-hidden="true" /></span><div><small>Nouveaux membres · 30 j</small><strong>{data.stats.newMembers}</strong></div></article><article><span className="stat-icon green"><Footprints size={20} aria-hidden="true" /></span><div><small>Clients revenus</small><strong>{data.stats.returningCustomers}</strong></div></article><article><span className="stat-icon purple"><Trophy size={20} aria-hidden="true" /></span><div><small>Récompenses utilisées · 30 j</small><strong>{data.stats.rewardsRedeemed}</strong></div></article><article><span className="stat-icon orange"><Coins size={20} aria-hidden="true" /></span><div><small>Fréquence moyenne</small><strong>{data.stats.avgFrequencyDays == null ? "—" : `${data.stats.avgFrequencyDays} j`}</strong></div></article></section>
    <section className="panel activity-panel"><div className="panel-head"><div><h2>Activité récente</h2><p>Les derniers mouvements du programme.</p></div><button className="text-link activity-all" onClick={onCustomers}>Tous les clients<ArrowRight size={15} aria-hidden="true" /></button></div><div className="activity-list">{data.activity.length ? data.activity.map((item) => <Activity key={item.id} item={item} />) : <div className="empty-activity"><span><ScanLine size={21} aria-hidden="true" /></span><h3>Tout commence au premier scan.</h3><p>Inscris un client avec le QR code, puis ajoute son premier passage.</p></div>}</div></section>
    <section className="panel join-qr-panel" id="customer-enrollment-qr"><span className="eyebrow"><QrCodeIcon size={15} aria-hidden="true" />Inscription client</span><div className="dashboard-qr"><QrCode value={joinUrl} size={170} label="QR code d’inscription au programme" /></div><h3>À scanner pour créer une carte</h3><p>Présente ce QR code au client : sa carte est créée immédiatement sur son téléphone.</p><div className="copy-row"><code>{joinUrl.replace(/^https?:\/\//, "")}</code><button onClick={copy}>{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}<span>{copied ? "Copié" : "Copier"}</span></button></div><a href={`/join/${data.merchant.slug}`} target="_blank" rel="noreferrer" className="text-link">Tester l’inscription<ExternalLink size={14} aria-hidden="true" /></a></section>
  </div>;
}

function Activity({ item }: { item: DashboardData["activity"][number] }) {
  const redeemed = item.reason === "redeem";
  const undone = item.reason === "undo";
  const purchase = item.reason === "purchase";
  const bonus = item.reason === "bonus";
  const amount = Math.abs(item.delta);
  const action = redeemed ? "Récompense remise" : undone ? `${amount} point${amount > 1 ? "s" : ""} annulé${amount > 1 ? "s" : ""}` : bonus ? `Bonus de ${amount} point${amount > 1 ? "s" : ""}${item.note ? ` · ${item.note}` : ""}` : purchase ? `Achat${item.amountCents ? ` ${(item.amountCents / 100).toFixed(2).replace(".", ",")} €` : ""} · ${amount} point${amount > 1 ? "s" : ""}` : `Passage · ${amount} point${amount > 1 ? "s" : ""}`;
  return <div className="activity-item"><span className={redeemed ? "redeemed" : undone ? "undone" : bonus ? "bonus" : ""}>{redeemed ? "★" : undone ? "↶" : bonus ? "+" : `+${amount}`}</span><div><strong>{item.firstName}</strong><small>{action} · {item.actorName}</small></div><time>{relativeDate(item.createdAt)}</time></div>;
}

function relativeDate(value: string) {
  const date = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`);
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "À l’instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (minutes < 1440) return `Il y a ${Math.floor(minutes / 60)} h`;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date);
}
