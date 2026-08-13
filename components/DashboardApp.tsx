"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brand } from "./Brand";
import { MerchantScanner } from "./MerchantScanner";
import { QrCode } from "./QrCode";

type DashboardData = {
  merchant: {
    id: string;
    businessName: string;
    slug: string;
    email: string;
    accentColor: string;
    role: "owner" | "employee";
    employeeId: string | null;
    employeeName: string | null;
  };
  program: { id: string; name: string; goal: number; rewardText: string; terms: string; active: number };
  customers: Array<{ code: string; firstName: string; points: number; totalPoints: number; availableRewards: number; undoableStampId: string | null; updatedAt: string }>;
  activity: Array<{ id: string; firstName: string; delta: number; reason: string; actorName: string; createdAt: string }>;
  employees: Array<{ id: string; displayName: string; email: string | null; loginCode: string; active: number; createdAt: string }>;
  stats: { customers: number; visits: number; rewards: number };
};

type StampResult = {
  customer: { firstName: string; code: string; points: number; goal: number };
  quantity: number;
  stampId: string;
  rewardEarned: boolean;
  rewardsEarned: number;
  availableRewards: number;
};

const tabs = [
  { id: "overview", label: "Vue d’ensemble", shortLabel: "Accueil" },
  { id: "scan", label: "Scanner un client", shortLabel: "Scanner" },
  { id: "customers", label: "Clients", shortLabel: "Clients" },
  { id: "program", label: "Mon programme", shortLabel: "Programme" },
  { id: "team", label: "Mon équipe", shortLabel: "Équipe" },
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
    action: "change_owner_pin",
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
      window.alert("Ton code propriétaire a été modifié. Reconnecte-toi avec le nouveau code.");
      window.location.href = "/merchant";
      return;
    } else {
      form.reset();
      setToast("Code propriétaire mis à jour.");
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
    const result = (await response.json()) as { employee?: { displayName: string; loginCode: string }; error?: string };
    if (!response.ok) setError(result.error ?? "Employé non créé.");
    else {
      form.reset();
      setToast(`${result.employee?.displayName} peut se connecter avec ${result.employee?.loginCode}.`);
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
    const pin = window.prompt(`Nouveau code à 6 chiffres pour ${employee.displayName} :`);
    if (pin === null) return;
    if (!/^\d{6}$/.test(pin)) {
      setError("Le nouveau code doit contenir exactement 6 chiffres.");
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch("/api/merchant/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset_pin", employeeId: employee.id, pin }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) setError(result.error ?? "Code non modifié.");
    else setToast(`Nouveau code enregistré pour ${employee.displayName}. Ses anciennes sessions sont fermées.`);
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
  const joinUrl = data && typeof window !== "undefined" ? `${window.location.origin}/join/${data.merchant.slug}` : "";

  function showEnrollmentQr() {
    setTab("overview");
    window.setTimeout(() => {
      document.getElementById("customer-enrollment-qr")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  if (loading) return <main className="dashboard-loading"><Brand /><div className="loading-bar"><span /></div><p>Ouverture de ton espace…</p></main>;
  if (!data) return <main className="dashboard-loading"><Brand /><p>{error || "Tableau de bord indisponible."}</p><a href="/merchant" className="button">Se reconnecter</a></main>;

  return (
    <main className="dashboard" style={{ "--merchant": data.merchant.accentColor } as React.CSSProperties}>
      <aside className="sidebar">
        <Brand />
        <div className="merchant-pill"><span>{data.merchant.businessName.slice(0, 1)}</span><div><strong>{data.merchant.businessName}</strong><small>{data.merchant.role === "employee" ? `${data.merchant.employeeName} · Employé` : "Accès propriétaire"}</small></div></div>
        <nav>{visibleTabs.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setError(""); }}><span className={`nav-icon nav-icon-${item.id}`} aria-hidden="true" />{item.label}</button>)}</nav>
        <div className="sidebar-foot"><button onClick={logout}>↗ Se déconnecter</button><small>Tampo · version pilote</small></div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-top"><div><small>{new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</small><h1>{visibleTabs.find((item) => item.id === tab)?.label}</h1></div>{data.merchant.role === "employee" ? <button className="button button-ghost" onClick={logout}>Se déconnecter</button> : <div className="dashboard-actions"><button className="button button-ghost qr-quick" onClick={showEnrollmentQr}>QR clients</button><button className="button scan-quick" onClick={() => setTab("scan")}>Scanner</button></div>}</header>
        <nav className="mobile-tabs" aria-label="Navigation principale" style={{ "--tab-count": visibleTabs.length } as React.CSSProperties}>{visibleTabs.map((item) => <button key={item.id} aria-label={item.label} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><span className={`nav-icon nav-icon-${item.id}`} aria-hidden="true" /><small>{item.shortLabel}</small></button>)}</nav>
        {error && <div className="dashboard-error" role="alert"><span>!</span>{error}<button onClick={() => setError("")}>×</button></div>}

        {tab === "overview" && <Overview data={data} joinUrl={joinUrl} onScan={() => setTab("scan")} onCustomers={() => setTab("customers")} onShowQr={showEnrollmentQr} />}
        {tab === "scan" && (
          <div className="scan-layout">
            <div><span className="eyebrow">{data.merchant.role === "employee" ? `Session de ${data.merchant.employeeName}` : "Ajout instantané"}</span><h2>Scanne la carte du client.</h2><p>Choisis le nombre d’achats, puis scanne le QR. Une seconde validation rapprochée reste possible après confirmation.</p><MerchantScanner onDetected={stamp} busy={busy} /></div>
            <aside className="scan-side"><h3>{data.merchant.role === "employee" ? "Mes dernières opérations" : "Derniers passages"}</h3>{data.activity.length ? data.activity.slice(0, 6).map((item) => <Activity key={item.id} item={item} />) : <p className="muted">Les premières opérations apparaîtront ici.</p>}</aside>
          </div>
        )}
        {tab === "customers" && (
          <div className="panel customer-panel">
            <div className="panel-head"><div><h2>{data.customers.length} client{data.customers.length !== 1 ? "s" : ""}</h2><p>Progression et récompenses en un coup d’œil.</p></div><input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher…" /></div>
            <div className="customer-table">
              <div className="table-head"><span>Client</span><span>Progression</span><span>Total</span><span>Récompense</span><span /></div>
              {filteredCustomers.map((customer) => <div className="table-row" key={customer.code}><span className="customer-name"><i>{customer.firstName.slice(0, 1)}</i><span><b>{customer.firstName}</b><small>{customer.code}</small></span></span><span><b>{customer.points}/{data.program.goal}</b><i className="mini-progress"><i style={{ width: `${customer.points / data.program.goal * 100}%` }} /></i></span><span>{customer.totalPoints} passages</span><span>{customer.availableRewards ? <b className="reward-badge">{customer.availableRewards} disponible</b> : <small className="muted">Aucune</small>}</span><span className="row-actions"><button onClick={() => stamp(customer.code)} disabled={busy}>+ Passage</button>{customer.undoableStampId && <button className="undo-button" onClick={() => undoStamp(customer.undoableStampId!, customer.firstName)} disabled={busy}>↶ Annuler</button>}{customer.availableRewards > 0 && <button className="redeem-button" onClick={() => redeem(customer.code)} disabled={busy}>Remettre</button>}</span></div>)}
              {!filteredCustomers.length && <div className="table-empty">Aucun client ne correspond à cette recherche.</div>}
            </div>
          </div>
        )}
        {tab === "program" && data.merchant.role === "owner" && (
          <div className="program-layout">
            <div className="settings-stack">
              <form className="panel settings-form" onSubmit={saveProgram}><div className="panel-head"><div><h2>Règles du programme</h2><p>Les modifications s’appliquent aux cartes existantes.</p></div></div><div className="form-grid"><label>Nom de la carte<input name="name" defaultValue={data.program.name} required /></label><div className="field-row"><label>Passages nécessaires<input name="goal" type="number" min="3" max="20" defaultValue={data.program.goal} /></label><label>Récompense<input name="rewardText" defaultValue={data.program.rewardText} required /></label></div><label>Conditions<textarea name="terms" defaultValue={data.program.terms} rows={3} /></label><button className="button button-large" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button></div></form>
              <section className="panel security-panel">
                <div className="panel-head"><div><h2>Sécurité du propriétaire</h2><p>Les accès individuels des employés se gèrent dans l’onglet Mon équipe.</p></div></div>
                <form className="form-grid owner-pin-form" onSubmit={(event) => updateSecurity(event, "change_owner_pin")}>
                  <label>Code actuel<input name="currentPin" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{6}" maxLength={6} required /></label>
                  <label>Nouveau code<input name="newPin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" maxLength={6} required /></label>
                  <button className="button" disabled={busy}>Modifier mon code</button>
                </form>
              </section>
            </div>
            <div className="panel program-preview"><span className="eyebrow">Aperçu client</span><div className="mini-loyalty"><small>{data.program.name.toUpperCase()}</small><h3>Encore {data.program.goal} passages.</h3><div>{Array.from({ length: Math.min(data.program.goal, 10) }, (_, index) => <span key={index}>{index + 1}</span>)}</div><p><span>Récompense</span><b>{data.program.rewardText}</b></p></div><a href={`/join/${data.merchant.slug}`} target="_blank" rel="noreferrer" className="text-link">Ouvrir la page d’inscription ↗</a></div>
          </div>
        )}
        {tab === "team" && data.merchant.role === "owner" && (
          <div className="team-layout">
            <form className="panel team-create" onSubmit={createEmployee}>
              <div className="panel-head"><div><h2>Ajouter un employé</h2><p>Chaque personne reçoit son propre identifiant et son propre code.</p></div></div>
              <div className="form-grid">
                <label>Prénom ou nom affiché<input name="displayName" autoComplete="off" required /></label>
                <label>E-mail professionnel <small>Facultatif</small><input name="email" type="email" autoComplete="off" /></label>
                <label>Code PIN à 6 chiffres<input name="pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" maxLength={6} required /></label>
                <button className="button button-large" disabled={busy}>{busy ? "Création…" : "Créer l’accès employé"}</button>
              </div>
            </form>
            <section className="panel team-list">
              <div className="panel-head"><div><h2>{data.employees.length} accès employé{data.employees.length !== 1 ? "s" : ""}</h2><p>Un départ ? Désactive l’accès sans supprimer son historique.</p></div></div>
              {data.employees.length ? data.employees.map((employee) => (
                <article className={`employee-row ${employee.active ? "" : "inactive"}`} key={employee.id}>
                  <span className="employee-avatar">{employee.displayName.slice(0, 1).toUpperCase()}</span>
                  <div className="employee-details"><strong>{employee.displayName}</strong><small>{employee.email || "Sans e-mail"}</small><code>{employee.loginCode}</code></div>
                  <span className={`access-status ${employee.active ? "active" : ""}`}>{employee.active ? "Actif" : "Désactivé"}</span>
                  <div className="employee-actions"><button onClick={() => copyEmployeeIdentifier(employee)} disabled={busy}>Copier l’identifiant</button><button onClick={() => resetEmployeePin(employee)} disabled={busy}>Changer le PIN</button><button className={employee.active ? "danger" : ""} onClick={() => setEmployeeActive(employee)} disabled={busy}>{employee.active ? "Désactiver" : "Réactiver"}</button></div>
                </article>
              )) : <div className="empty-activity"><span>♙</span><h3>Aucun employé pour le moment.</h3><p>Crée le premier accès individuel avec le formulaire.</p></div>}
            </section>
          </div>
        )}
      </section>

      {stampResult && <div className="modal-backdrop"><section className="result-modal" role="dialog" aria-modal="true"><div className={`result-icon ${stampResult.rewardEarned ? "reward" : ""}`}>{stampResult.rewardEarned ? "★" : `+${stampResult.quantity}`}</div><span className="eyebrow">{stampResult.rewardEarned ? `${stampResult.rewardsEarned} récompense${stampResult.rewardsEarned > 1 ? "s" : ""} débloquée${stampResult.rewardsEarned > 1 ? "s" : ""}` : `${stampResult.quantity} point${stampResult.quantity > 1 ? "s" : ""} ajouté${stampResult.quantity > 1 ? "s" : ""}`}</span><h2>{stampResult.rewardEarned ? `Bravo ${stampResult.customer.firstName} !` : `C’est fait pour ${stampResult.customer.firstName}.`}</h2><p>{stampResult.rewardEarned ? `La récompense est prête à être remise : ${data.program.rewardText}. La carte affiche ${stampResult.customer.points}/${stampResult.customer.goal}.` : `Sa carte affiche maintenant ${stampResult.customer.points}/${stampResult.customer.goal} points.`}</p>{stampResult.availableRewards > 0 && <button className="button reward-action button-full" onClick={() => redeem(stampResult.customer.code)} disabled={busy}>★ Utiliser une récompense</button>}<button className="button button-large button-full" onClick={() => { setStampResult(null); setTab("scan"); }}>Scanner le client suivant</button><button className="text-link result-undo" onClick={() => undoStamp(stampResult.stampId, stampResult.customer.firstName)} disabled={busy}>↶ Annuler cette opération</button><button className="text-link result-close" onClick={() => setStampResult(null)}>Fermer</button></section></div>}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}

function Overview({ data, joinUrl, onScan, onCustomers, onShowQr }: { data: DashboardData; joinUrl: string; onScan: () => void; onCustomers: () => void; onShowQr: () => void }) {
  const copy = async () => { await navigator.clipboard.writeText(joinUrl); };
  return <div className="overview-grid">
    <section className="welcome-panel"><div><span className="eyebrow">Ton programme est en ligne</span><h2>Prêt pour le prochain passage.</h2><p>Affiche le QR d’inscription, puis scanne la carte personnelle du client à chaque visite.</p><div><button className="button button-light" onClick={onShowQr}>Afficher le QR client</button><button className="button button-outline-light" onClick={onScan}>Ajouter un passage</button><button className="button button-outline-light" onClick={onCustomers}>Voir les clients</button></div></div><div className="welcome-motif"><i /><i /><i /><span>✓</span></div></section>
    <section className="stats-row"><article><span className="stat-icon orange">◎</span><div><small>Clients inscrits</small><strong>{data.stats.customers}</strong></div></article><article><span className="stat-icon green">↗</span><div><small>Passages ajoutés</small><strong>{data.stats.visits}</strong></div></article><article><span className="stat-icon purple">★</span><div><small>Récompenses gagnées</small><strong>{data.stats.rewards}</strong></div></article></section>
    <section className="panel activity-panel"><div className="panel-head"><div><h2>Activité récente</h2><p>Les derniers mouvements du programme.</p></div><button className="text-link" onClick={onCustomers}>Tous les clients →</button></div><div className="activity-list">{data.activity.length ? data.activity.map((item) => <Activity key={item.id} item={item} />) : <div className="empty-activity"><span>↻</span><h3>Tout commence au premier scan.</h3><p>Inscris un client avec le QR, puis ajoute son premier passage.</p></div>}</div></section>
    <section className="panel join-qr-panel" id="customer-enrollment-qr"><span className="eyebrow">QR d’inscription client</span><div className="dashboard-qr"><QrCode value={joinUrl} size={170} label="QR d’inscription au programme" /></div><h3>À montrer ou afficher à la caisse</h3><p>Le client scanne ce QR pour créer immédiatement sa carte de fidélité.</p><div className="copy-row"><code>{joinUrl.replace(/^https?:\/\//, "")}</code><button onClick={copy}>Copier le lien</button></div><a href={`/join/${data.merchant.slug}`} target="_blank" rel="noreferrer" className="text-link">Tester la création d’une carte ↗</a></section>
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
