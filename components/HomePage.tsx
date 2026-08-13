"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Check, QrCode, ScanLine, UserPlus } from "lucide-react";
import { Brand } from "./Brand";
import { PROGRAM_COLORS } from "../lib/program-style";

export function HomePage() {
  const [step, setStep] = useState<"intro" | "form">("intro");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/merchant/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(data)),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Impossible de créer le compte.");
      setBusy(false);
      return;
    }
    window.location.href = "/dashboard?welcome=1";
  }

  return (
    <main>
      <nav className="nav shell">
        <Brand />
        <div className="nav-actions">
          <a href="/merchant" className="text-link">Se connecter</a>
          <button className="button button-small" onClick={() => setStep("form")}>Créer mon programme</button>
        </div>
      </nav>

      <section className="hero shell">
        <div className="hero-copy">
          <span className="eyebrow">La fidélité, sans carte à perdre</span>
          <h1>Chaque visite donne envie de revenir.</h1>
          <p className="hero-lead">Crée une carte de fidélité digitale en quelques minutes. Tes clients scannent, tu tamponnes, ils reviennent.</p>
          <div className="hero-actions">
            <button className="button button-large" onClick={() => setStep("form")}>Lancer mon programme <ArrowRight size={18} aria-hidden="true" /></button>
            <a href="#comment-ca-marche" className="button button-ghost button-large">Voir comment ça marche</a>
          </div>
          <div className="trust-row">
            <span><b>0 €</b> pour commencer</span>
            <span><b>2 min</b> pour créer sa carte</span>
            <span><b>Sans app</b> à télécharger</span>
          </div>
        </div>

        <div className="hero-visual" aria-label="Aperçu d’une carte fidélité Tampo">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="phone-card">
            <div className="phone-top"><span>9:41</span><span>● ● ●</span></div>
            <div className="demo-card">
              <div className="demo-card-head"><span className="mini-logo">M</span><span>Maison Moka</span></div>
              <div><small>CARTE CAFÉ</small><h3>Plus que 2 visites, Léa.</h3></div>
              <div className="stamp-grid" aria-label="8 visites sur 10">
                {Array.from({ length: 10 }, (_, index) => <span key={index} className={index < 8 ? "filled" : ""}>{index < 8 ? "✓" : index + 1}</span>)}
              </div>
              <div className="reward-line"><span>Ta récompense</span><strong>1 boisson offerte</strong></div>
            </div>
            <div className="demo-note"><span>✓</span><div><b>Passage ajouté</b><small>Ta carte est à jour</small></div><strong>+1</strong></div>
          </div>
        </div>
      </section>

      <section className="steps-section" id="comment-ca-marche">
        <div className="shell">
          <div className="section-heading"><span className="eyebrow">Simple pour tout le monde</span><h2>Du comptoir au prochain passage.</h2></div>
          <div className="steps-grid">
            <article><span className="step-number">01</span><div className="step-icon"><QrCode size={30} strokeWidth={1.8} aria-hidden="true" /></div><h3>Tu affiches ton QR</h3><p>À la caisse, sur une affiche ou directement sur ton téléphone.</p></article>
            <article><span className="step-number">02</span><div className="step-icon"><UserPlus size={30} strokeWidth={1.8} aria-hidden="true" /></div><h3>Le client s’inscrit</h3><p>Un prénom suffit. Sa carte digitale apparaît immédiatement.</p></article>
            <article><span className="step-number">03</span><div className="step-icon"><ScanLine size={30} strokeWidth={1.8} aria-hidden="true" /></div><h3>Tu ajoutes un passage</h3><p>Scanne son QR personnel. La progression et la récompense sont automatiques.</p></article>
          </div>
        </div>
      </section>

      <section className="feature-band shell">
        <div><span className="eyebrow">Pensé pour le terrain</span><h2>Tu pilotes. Tampo fait le reste.</h2><p>Ton tableau de bord garde les cartes, les passages, les récompenses et l’historique au même endroit.</p></div>
        <div className="feature-list"><span><Check size={17} aria-hidden="true" />QR unique par client</span><span><Check size={17} aria-hidden="true" />Progression en temps réel</span><span><Check size={17} aria-hidden="true" />Récompenses automatiques</span><span><Check size={17} aria-hidden="true" />Installable sur mobile</span></div>
      </section>

      <footer className="footer"><div className="shell"><Brand light /><p>La fidélité locale, simplement.</p><a href="/merchant">Espace commerçant →</a></div></footer>

      {step === "form" && (
        <div className="modal-backdrop" role="presentation">
          <section className="signup-modal" role="dialog" aria-modal="true" aria-labelledby="signup-title">
            <button className="modal-close" aria-label="Fermer" onClick={() => setStep("intro")}>×</button>
            <span className="eyebrow">Ton espace en 2 minutes</span>
            <h2 id="signup-title">Crée ton premier programme.</h2>
            <p>Tu pourras tout modifier ensuite depuis ton tableau de bord.</p>
            <form onSubmit={submit} className="form-grid">
              <label>Nom du commerce<input name="businessName" placeholder="Maison Moka" required /></label>
              <label>E-mail professionnel<input name="email" type="email" placeholder="bonjour@maisonmoka.fr" required /></label>
              <div className="field-row"><label>Nom de la carte<input name="programName" defaultValue="Carte fidélité" required /></label><label>Objectif<input name="goal" type="number" min="3" max="20" defaultValue="10" required /></label></div>
              <label>Récompense<input name="rewardText" placeholder="1 boisson offerte" required /></label>
              <label>Code d’accès à 6 chiffres<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="••••••" required /><small>À garder pour te reconnecter au tableau de bord.</small></label>
              <fieldset className="color-fieldset"><legend>Style de la carte</legend><small>Choisis la couleur qui correspond le mieux à ton commerce.</small><div className="color-options">{PROGRAM_COLORS.map((color, index) => <label key={color.value} className="color-choice" style={{ backgroundColor: color.value }} title={color.name}><input type="radio" name="accentColor" value={color.value} defaultChecked={index === 0} aria-label={color.name} /><span>{color.name}</span></label>)}</div></fieldset>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="button button-large button-full" disabled={busy}>{busy ? "Création en cours…" : "Créer mon espace"}</button>
              <small className="form-note">En continuant, tu acceptes que les données de démonstration soient enregistrées pour faire fonctionner ton programme.</small>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
