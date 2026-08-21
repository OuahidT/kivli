"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole, ScanLine, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { Brand } from "./Brand";

export function MerchantLogin() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/merchant/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(data)),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Connexion impossible.");
      setBusy(false);
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <main className="auth-page">
      <div className="auth-brand"><Brand /></div>
      <div className="auth-shell">
        <aside className="auth-showcase" aria-label="Aperçu de l’espace Kivli">
          <span className="auth-showcase-kicker"><Sparkles size={15} aria-hidden="true" />Votre fidélité, en mouvement</span>
          <h1>Scannez. Récompensez. Fidélisez.</h1>
          <p>Un espace clair pour votre équipe, vos passages et vos récompenses.</p>
          <div className="auth-scan-preview">
            <span><ScanLine size={23} aria-hidden="true" /></span>
            <div><small>SCAN CLIENT</small><strong>Carte reconnue</strong><em>Prête à recevoir un point</em></div>
            <i>+1</i>
          </div>
          <div className="auth-proof"><ShieldCheck size={17} aria-hidden="true" />Accès séparés pour le responsable et l’équipe</div>
        </aside>
        <section className="auth-card auth-card-merchant">
          <span className="eyebrow">Espace commerçant</span>
          <h1>Content de te revoir.</h1>
          <p>Propriétaire : utilise ton e-mail et ton code confidentiel. Employé : utilise ton identifiant et ton code PIN.</p>
          <form onSubmit={submit} className="form-grid">
            <label><span className="field-title"><UserRound size={15} aria-hidden="true" />E-mail ou identifiant employé</span><input name="identifier" type="text" autoComplete="username" autoCapitalize="none" required /></label>
            <label><span className="field-title"><LockKeyhole size={15} aria-hidden="true" />Code confidentiel ou PIN employé</span><input name="password" type="password" autoComplete="current-password" maxLength={128} required /><small>Les nouveaux codes et les PIN employés contiennent 6 chiffres.</small></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-large button-full" disabled={busy}>{busy ? "Connexion…" : <>Ouvrir mon espace<ArrowRight size={18} aria-hidden="true" /></>}</button>
          </form>
          <div className="auth-foot">Pas encore de programme ? <a href="/">Créer gratuitement</a></div>
          <div className="auth-legal-links"><a href="/confidentialite">Confidentialité</a><a href="/conditions-pilote">Conditions du pilote</a><a href="/mentions-legales">Mentions légales</a><a href="/accord-traitement-donnees">Annexe RGPD</a></div>
        </section>
      </div>
    </main>
  );
}
