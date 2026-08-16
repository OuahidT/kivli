"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Footprints,
  Gift,
  LayoutDashboard,
  LogOut,
  QrCode as QrCodeIcon,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRoundCog,
  UsersRound,
} from "lucide-react";
import { Brand } from "./Brand";
import { MerchantScanner } from "./MerchantScanner";
import { QrCode } from "./QrCode";
import { PROGRAM_COLORS, visibleProgramTerms } from "../lib/program-style";

type DashboardData = {
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
  program: { id: string; name: string; goal: number; rewardText: string; terms: string; active: number } | null;
  customers: Array<{ code: string; firstName: string; points: number; totalPoints: number; availableRewards: number; undoableStampId: string | null; updatedAt: string }>;
  activity: Array<{ id: string; firstName: string; delta: number; reason: string; actorName: string; createdAt: string }>;
  employees: Array<{ id: string; displayName: string; email: string | null; loginCode: string; active: number; mustChangePin: number; createdAt: string }>;
  stats: { customers: number; visits: number; rewards: number };
};

type ReadyDashboardData = DashboardData & { program: NonNullable<DashboardData["program"]> };

type StampResult = {
  customer: { firstName: string; code: string; points: number; goal: number };
  quantity: number;
  stampId: string;
  rewardEarned: boolean;
  rewardsEarned: number;
  availableRewards: number;
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
  const [search, setSearch] = useState("");
  const [employeeAccess, setEmployeeAccess] = useState<{ displayName: string; loginCode: string; temporaryPin: string } | null>(null);
  const [showEmployeePin, setShowEmployeePin] = useState(false);
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

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function stamp(code: string, quantity = 1) {
    if (quantity > 1 && !window.confirm(`Confirmer l’ajout de ${quantity} points ?`)) return;
    setBusy(true);
    setError("");
    const requestId = crypto.randomUUID();
    const submit = (confirmRecent: boolean) => fetch("/api/merchant/stamp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, quantity, requestId, confirmMultiple: quantity > 1, confirmRecent }),
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
    await load();
    setBusy(false);
  }

  async function redeem(code: string) {
    if (!window.confirm("Confirmer la remise de la récompense ?")) return;
    setBusy(true);
    const response = await fetch("/api/merchant/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const result = (await response.json()) as { firstName?: string; error?: string };
    if (!response.ok) setError(result.error ?? "Récompense non remise.");
    else {
      setToast(`Récompense remise à ${result.firstName}.`);
      setStampResult(null);
      await load();
    }
    setBusy(false);
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
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/merchant/program", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) setError(result.error ?? "Modifications non enregistrées.");
    else {
      setToast("Programme mis à jour.");
      await load();
    }
    setBusy(false);
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
      window.alert("Ton mot de passe a été modifié. Reconnecte-toi avec le nouveau mot de passe.");
      window.location.href = "/merchant";
      return;
    } else {
      form.reset();
      setToast("Mot de passe mis à jour.");
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

  const filteredCustomers = useMemo(() => data?.customers.filter((customer) => `${customer.firstName} ${customer.code}`.toLowerCase().includes(search.toLowerCase())) ?? [], [data, search]);
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
        <div className="sidebar-foot">{data.merchant.role === "employee" && <button onClick={() => setShowEmployeePin(true)}><ShieldCheck size={17} aria-hidden="true" />Modifier mon PIN</button>}<button onClick={logout}><LogOut size={17} aria-hidden="true" />Se déconnecter</button><small>Kivli · version pilote</small></div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-top"><div><small className="dashboard-date">{new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</small><small className="dashboard-context">{data.merchant.role === "employee" ? `${data.merchant.businessName} · ${data.merchant.employeeName}` : data.merchant.businessName}</small><h1>{data.merchant.role === "employee" ? "Scanner" : visibleTabs.find((item) => item.id === tab)?.label}</h1></div>{data.merchant.role === "employee" ? <div className="dashboard-actions employee-top-actions"><button className="button button-ghost" onClick={() => setShowEmployeePin(true)}><ShieldCheck size={17} aria-hidden="true" /><span>Mon PIN</span></button><button className="button button-ghost logout-quick" onClick={logout} aria-label="Se déconnecter"><LogOut size={18} aria-hidden="true" /><span>Déconnexion</span></button></div> : <div className="dashboard-actions"><button className="button button-ghost qr-quick" onClick={showEnrollmentQr}><QrCodeIcon size={18} aria-hidden="true" /><span>QR codes clients</span></button><button className="button scan-quick" onClick={() => setTab("scan")}><ScanLine size={18} aria-hidden="true" />Scanner</button><button className="button button-ghost owner-logout-quick" onClick={logout} aria-label="Se déconnecter"><LogOut size={18} aria-hidden="true" /></button></div>}</header>
        {data.merchant.role === "owner" && <nav className="mobile-tabs" aria-label="Navigation principale" style={{ "--tab-count": visibleTabs.length } as React.CSSProperties}>{visibleTabs.map((item) => { const Icon = item.icon; return <button key={item.id} aria-label={item.label} aria-current={tab === item.id ? "page" : undefined} className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setError(""); }}><span className="mobile-tab-icon"><Icon className="nav-icon" size={21} strokeWidth={2} aria-hidden="true" /></span><small>{item.shortLabel}</small></button>; })}</nav>}
        {error && <div className="dashboard-error" role="alert"><span>!</span>{error}<button onClick={() => setError("")}>×</button></div>}

        {tab === "overview" && <Overview data={{ ...data, program: data.program }} joinUrl={joinUrl} onScan={() => setTab("scan")} onCustomers={() => setTab("customers")} onShowQr={showEnrollmentQr} />}
        {tab === "scan" && (
          <div className="scan-layout">
            <div>{data.merchant.role === "owner" && <span className="eyebrow scan-eyebrow"><ScanLine size={15} aria-hidden="true" />Ajout instantané</span>}<h2>{data.merchant.role === "employee" ? "Présente le QR code du client." : "Scanne la carte du client."}</h2><p>{data.merchant.role === "employee" ? "Choisis le nombre de points, puis ouvre la caméra." : "Choisis le nombre d’achats, puis scanne le QR code. Une seconde validation rapprochée reste possible après confirmation."}</p><MerchantScanner onDetected={stamp} busy={busy} /></div>
            <aside className="scan-side"><h3>{data.merchant.role === "employee" ? "Mes dernières opérations" : "Derniers passages"}</h3>{data.activity.length ? data.activity.slice(0, 6).map((item) => <Activity key={item.id} item={item} />) : <p className="muted">Les premières opérations apparaîtront ici.</p>}</aside>
          </div>
        )}
        {tab === "customers" && (
          <div className="panel customer-panel">
            <div className="panel-head"><div><h2>{data.customers.length} client{data.customers.length !== 1 ? "s" : ""}</h2><p>Progression et récompenses en un coup d’œil.</p></div><input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher…" /></div>
            <div className="customer-table">
              <div className="table-head"><span>Client</span><span>Progression</span><span>Total</span><span>Récompense</span><span /></div>
              {filteredCustomers.map((customer) => <div className="table-row" key={customer.code}><span className="customer-name"><i>{customer.firstName.slice(0, 1)}</i><span><b>{customer.firstName}</b><small>{customer.code}</small></span></span><span data-label="Progression"><b>{customer.points}/{data.program.goal}</b><i className="mini-progress"><i style={{ width: `${customer.points / data.program.goal * 100}%` }} /></i></span><span data-label="Total">{customer.totalPoints} passages</span><span data-label="Récompense">{customer.availableRewards ? <b className="reward-badge">{customer.availableRewards} disponible</b> : <small className="muted">Aucune</small>}</span><span className="row-actions"><button onClick={() => stamp(customer.code)} disabled={busy}><Footprints size={16} aria-hidden="true" />Ajouter</button>{customer.undoableStampId && <button className="undo-button" onClick={() => undoStamp(customer.undoableStampId!, customer.firstName)} disabled={busy}><RotateCcw size={15} aria-hidden="true" />Annuler</button>}{customer.availableRewards > 0 && <button className="redeem-button" onClick={() => redeem(customer.code)} disabled={busy}><Gift size={15} aria-hidden="true" />Remettre</button>}</span></div>)}
              {!filteredCustomers.length && (data.customers.length ? <div className="table-empty">Aucun client ne correspond à cette recherche.</div> : <div className="table-empty table-empty-onboarding"><span><QrCodeIcon size={22} aria-hidden="true" /></span><strong>Ta liste de clients est prête.</strong><p>Partage le QR code d’inscription pour créer la première carte.</p><button className="button button-small" onClick={showEnrollmentQr}>Afficher le QR code</button></div>)}
            </div>
          </div>
        )}
        {tab === "program" && data.merchant.role === "owner" && (
          <div className="program-layout">
            <div className="settings-stack">
              <form className="panel settings-form" onSubmit={saveProgram}><div className="panel-head"><div><h2>Personnaliser le programme</h2><p>Les modifications s’appliquent immédiatement aux cartes existantes.</p></div></div><div className="form-grid"><label>Nom de la carte<input name="name" defaultValue={data.program.name} required /></label><div className="field-row"><label>Passages nécessaires<input name="goal" type="number" min="3" max="20" defaultValue={data.program.goal} /></label><label>Récompense<input name="rewardText" defaultValue={data.program.rewardText} required /></label></div><fieldset className="color-fieldset program-colors"><legend>Couleur de la carte</legend><small>Cette couleur personnalise la carte et la page d’inscription.</small><div className="color-options">{PROGRAM_COLORS.map((color) => <label key={color.value} className="color-choice" style={{ backgroundColor: color.value }} title={color.name}><input type="radio" name="accentColor" value={color.value} defaultChecked={data.merchant.accentColor.toLowerCase() === color.value} aria-label={color.name} /><span>{color.name}</span></label>)}</div></fieldset><label>Conditions affichées au client<textarea name="terms" defaultValue={visibleProgramTerms(data.program.terms)} rows={4} maxLength={200} /><small>Ce texte apparaît désormais sous le QR code personnel de chaque carte.</small></label><button className="button button-large" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer les modifications"}</button></div></form>
              <section className="panel security-panel">
                <div className="panel-head"><div><h2>Sécurité du propriétaire</h2><p>Les accès individuels des employés se gèrent dans l’onglet Mon équipe.</p></div></div>
                <form className="form-grid owner-pin-form" onSubmit={(event) => updateSecurity(event, "change_owner_password")}>
                  <label>Mot de passe actuel<input name="currentPassword" type="password" autoComplete="current-password" maxLength={128} required /></label>
                  <label>Nouveau mot de passe<input name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,}" required /><small>8 caractères minimum, une majuscule, une minuscule et un chiffre.</small></label>
                  <button className="button" disabled={busy}>Modifier mon mot de passe</button>
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

      {stampResult && <div className="modal-backdrop"><section className="result-modal" role="dialog" aria-modal="true"><div className={`result-icon ${stampResult.rewardEarned ? "reward" : ""}`}>{stampResult.rewardEarned ? "★" : `+${stampResult.quantity}`}</div><span className="eyebrow">{stampResult.rewardEarned ? `${stampResult.rewardsEarned} récompense${stampResult.rewardsEarned > 1 ? "s" : ""} débloquée${stampResult.rewardsEarned > 1 ? "s" : ""}` : `${stampResult.quantity} point${stampResult.quantity > 1 ? "s" : ""} ajouté${stampResult.quantity > 1 ? "s" : ""}`}</span><h2>{stampResult.rewardEarned ? `Bravo ${stampResult.customer.firstName} !` : `C’est fait pour ${stampResult.customer.firstName}.`}</h2><p>{stampResult.rewardEarned ? `La récompense est prête à être remise : ${data.program.rewardText}. La carte affiche ${stampResult.customer.points}/${stampResult.customer.goal}.` : `Sa carte affiche maintenant ${stampResult.customer.points}/${stampResult.customer.goal} points.`}</p>{stampResult.availableRewards > 0 && <button className="button reward-action button-full" onClick={() => redeem(stampResult.customer.code)} disabled={busy}>★ Utiliser une récompense</button>}<button className="button button-large button-full" onClick={() => { setStampResult(null); setTab("scan"); }}>Scanner le client suivant</button><button className="text-link result-undo" onClick={() => undoStamp(stampResult.stampId, stampResult.customer.firstName)} disabled={busy}>↶ Annuler cette opération</button><button className="text-link result-close" onClick={() => setStampResult(null)}>Fermer</button></section></div>}
      {showEmployeePin && <PinChangeModal busy={busy} error={error} onSubmit={changeEmployeePin} onClose={() => { setShowEmployeePin(false); setError(""); }} />}
      {employeeAccess && <EmployeeAccessModal access={employeeAccess} onClose={() => setEmployeeAccess(null)} />}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}

function ProgramOnboarding({ data, onCreated, onLogout }: { data: DashboardData; onCreated: () => Promise<void>; onLogout: () => Promise<void> }) {
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/merchant/program", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) setError(result.error ?? "Impossible de créer la carte.");
    else await onCreated();
    setBusy(false);
  }

  return <main className="program-onboarding" style={{ "--merchant": data.merchant.accentColor } as React.CSSProperties}>
    <header className="onboarding-nav"><Brand /><div><span>{data.merchant.businessName}</span><button onClick={onLogout}><LogOut size={17} aria-hidden="true" />Se déconnecter</button></div></header>
    <section className={`program-onboarding-shell ${showForm ? "form-open" : ""}`}>
      <div className="account-ready-card">
        <span className="account-ready-icon"><Check size={25} aria-hidden="true" /></span>
        <span className="eyebrow">Compte créé</span>
        <h1>Bienvenue {data.merchant.firstName || "chez Kivli"}.</h1>
        <p>Ton espace est prêt. Il reste une étape pour permettre à tes clients de créer leur carte.</p>
        <dl><div><dt>Commerce</dt><dd>{data.merchant.businessName}</dd></div><div><dt>Compte</dt><dd>{data.merchant.email}</dd></div></dl>
        {!showForm && <button className="button button-large" onClick={() => setShowForm(true)}>Créer ma carte<ArrowRight size={18} aria-hidden="true" /></button>}
      </div>
      <div className="program-setup-stage">
        {showForm ? <form className="program-setup-form" onSubmit={createProgram}>
          <div><span className="eyebrow">Votre carte de fidélité</span><h2>Configurez l’essentiel.</h2><p>Vous pourrez tout modifier plus tard depuis l’onglet Mon programme.</p></div>
          <label>Nom du commerce<input value={data.merchant.businessName} disabled /></label>
          <label>Nom de la carte<input name="name" defaultValue="Ma carte fidélité" maxLength={80} required /></label>
          <div className="field-row"><label>Nombre de points à atteindre<input name="goal" type="number" min="3" max="20" defaultValue="8" required /></label><label>Récompense<input name="rewardText" placeholder="Un avantage au choix" maxLength={120} required /></label></div>
          <fieldset className="color-fieldset program-colors"><legend>Couleur de la carte</legend><small>Choisissez la couleur qui correspond le mieux à votre activité.</small><div className="color-options">{PROGRAM_COLORS.map((color, index) => <label key={color.value} className="color-choice" style={{ backgroundColor: color.value }} title={color.name}><input type="radio" name="accentColor" value={color.value} defaultChecked={index === 0} aria-label={color.name} /><span>{color.name}</span></label>)}</div></fieldset>
          <label>Conditions affichées au client <small>Facultatif</small><textarea name="terms" rows={3} maxLength={200} placeholder="Un point est accordé par achat éligible…" /></label>
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
    <section className="stats-row"><article><span className="stat-icon orange"><UsersRound size={20} aria-hidden="true" /></span><div><small>Clients</small><strong>{data.stats.customers}</strong></div></article><article><span className="stat-icon green"><Footprints size={20} aria-hidden="true" /></span><div><small>Passages</small><strong>{data.stats.visits}</strong></div></article><article><span className="stat-icon purple"><Trophy size={20} aria-hidden="true" /></span><div><small>Récompenses</small><strong>{data.stats.rewards}</strong></div></article></section>
    <section className="panel activity-panel"><div className="panel-head"><div><h2>Activité récente</h2><p>Les derniers mouvements du programme.</p></div><button className="text-link activity-all" onClick={onCustomers}>Tous les clients<ArrowRight size={15} aria-hidden="true" /></button></div><div className="activity-list">{data.activity.length ? data.activity.map((item) => <Activity key={item.id} item={item} />) : <div className="empty-activity"><span><ScanLine size={21} aria-hidden="true" /></span><h3>Tout commence au premier scan.</h3><p>Inscris un client avec le QR code, puis ajoute son premier passage.</p></div>}</div></section>
    <section className="panel join-qr-panel" id="customer-enrollment-qr"><span className="eyebrow"><QrCodeIcon size={15} aria-hidden="true" />Inscription client</span><div className="dashboard-qr"><QrCode value={joinUrl} size={170} label="QR code d’inscription au programme" /></div><h3>À scanner pour créer une carte</h3><p>Présente ce QR code au client : sa carte est créée immédiatement sur son téléphone.</p><div className="copy-row"><code>{joinUrl.replace(/^https?:\/\//, "")}</code><button onClick={copy}>{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}<span>{copied ? "Copié" : "Copier"}</span></button></div><a href={`/join/${data.merchant.slug}`} target="_blank" rel="noreferrer" className="text-link">Tester l’inscription<ExternalLink size={14} aria-hidden="true" /></a></section>
  </div>;
}

function Activity({ item }: { item: DashboardData["activity"][number] }) {
  const redeemed = item.reason === "redeem";
  const undone = item.reason === "undo";
  const amount = Math.abs(item.delta);
  const action = redeemed ? "Récompense remise" : undone ? `${amount} point${amount > 1 ? "s" : ""} annulé${amount > 1 ? "s" : ""}` : `${amount} point${amount > 1 ? "s" : ""} ajouté${amount > 1 ? "s" : ""}`;
  return <div className="activity-item"><span className={redeemed ? "redeemed" : undone ? "undone" : ""}>{redeemed ? "★" : undone ? "↶" : `+${amount}`}</span><div><strong>{item.firstName}</strong><small>{action} · {item.actorName}</small></div><time>{relativeDate(item.createdAt)}</time></div>;
}

function relativeDate(value: string) {
  const date = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`);
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "À l’instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (minutes < 1440) return `Il y a ${Math.floor(minutes / 60)} h`;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date);
}
