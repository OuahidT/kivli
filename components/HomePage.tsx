"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Gift,
  MailCheck,
  QrCode,
  ScanLine,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { Brand } from "./Brand";
import { QrCode as KivliQrCode } from "./QrCode";

export function HomePage() {
  const [step, setStep] = useState<"intro" | "form" | "pending">("intro");
  const [pendingEmail, setPendingEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    const updateNavigation = () => setNavScrolled(window.scrollY > 18);
    updateNavigation();
    window.addEventListener("scroll", updateNavigation, { passive: true });
    return () => window.removeEventListener("scroll", updateNavigation);
  }, []);

  useEffect(() => {
    if (step === "intro") return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStep("intro");
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [step]);

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
    const result = (await response.json()) as { error?: string; email?: string };
    if (!response.ok) {
      setError(result.error ?? "Impossible de créer le compte.");
      setBusy(false);
      return;
    }
    setPendingEmail(result.email ?? String(data.get("email") ?? ""));
    setStep("pending");
    setBusy(false);
  }

  async function resend() {
    setBusy(true); setError("");
    const response = await fetch("/api/merchant/signup/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: pendingEmail }) });
    const result = await response.json() as { error?: string };
    setError(response.ok ? "E-mail renvoyé. Pense à vérifier les courriers indésirables." : result.error ?? "Envoi impossible.");
    setBusy(false);
  }

  return (
    <main>
      <nav className={`nav${navScrolled ? " nav-scrolled" : ""}`}>
        <div className="nav-inner shell">
          <Brand />
          <div className="nav-actions">
            <a href="/merchant" className="text-link">Se connecter</a>
            <button className="button button-small nav-cta" onClick={() => setStep("form")}><span>Créer mon compte</span></button>
          </div>
        </div>
      </nav>

      <section className="hero shell">
        <div className="hero-copy">
          <span className="eyebrow">La fidélité digitale pour tous les commerces</span>
          <h1>Créez une habitude, pas juste une carte.</h1>
          <p className="hero-lead">Kivli réunit carte digitale, scan, récompenses et suivi client dans un outil simple pour les commerces et professionnels du quotidien.</p>
          <div className="hero-actions">
            <button className="button button-large" onClick={() => setStep("form")}>Créer mon compte <ArrowRight size={18} aria-hidden="true" /></button>
            <button type="button" className="button button-ghost button-large" onClick={() => document.getElementById("produit")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Voir le produit</button>
          </div>
          <div className="trust-row">
            <span><b>0 €</b> pour commencer</span>
            <span><b>1 min</b> pour ouvrir son espace</span>
            <span><b>Sans app</b> à télécharger</span>
          </div>
        </div>

        <div className="hero-visual" aria-label="Aperçu de la carte digitale et du suivi Kivli">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="phone-card iphone-mockup">
            <img className="iphone-frame-image" src="/kivli-iphone-frame.png" alt="" aria-hidden="true" draggable="false" />
            <div className="iphone-screen">
              <div className="phone-top"><span>9:41</span><span className="phone-status" aria-hidden="true"><i className="phone-signal" /><i className="phone-wifi" /><i className="phone-battery" /></span></div>
              <div className="kivli-app">
                <div className="kivli-app-head">
                  <span className="kivli-app-brand"><i className="kivli-app-mark" aria-hidden="true"><i /><i /><i /></i><b>Kivli</b></span>
                  <span className="kivli-app-avatar">L</span>
                </div>
                <div className="kivli-app-greeting"><small>BONJOUR LÉA</small><h3>Ta fidélité prend forme.</h3></div>
                <section className="kivli-app-card">
                  <div className="kivli-app-merchant"><span>A</span><div><small>CARTE FIDÉLITÉ</small><strong>Atelier Nova</strong></div><i><Sparkles size={10} aria-hidden="true" />Active</i></div>
                  <div className="kivli-app-progress"><span><b>6</b> / 8 passages</span><strong>75%</strong></div>
                  <div className="kivli-app-progressbar"><i /></div>
                  <div className="kivli-app-stamps" aria-label="6 passages sur 8">
                    {Array.from({ length: 8 }, (_, index) => <span key={index} className={index < 6 ? "filled" : ""}>{index < 6 ? "✓" : index + 1}</span>)}
                  </div>
                  <div className="kivli-app-reward"><span><Gift size={15} aria-hidden="true" /></span><div><small>PROCHAINE RÉCOMPENSE</small><strong>Un avantage au choix</strong></div></div>
                  <div className="kivli-app-qr"><small>À PRÉSENTER À L’ÉQUIPE</small><div><KivliQrCode value="https://kivli.fr/c/DEMO-KIVLI" size={96} label="Aperçu du QR code personnel Kivli" /></div><code>DEMO-KIVLI</code></div>
                  <p className="kivli-app-wallet">Bientôt disponible dans Apple Wallet et Google Wallet.</p>
                </section>
              </div>
              <div className="home-indicator" aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      <section className="steps-section" id="comment-ca-marche">
        <div className="shell">
          <div className="section-heading"><span className="eyebrow">Simple à chaque étape</span><h2>Du premier scan à la prochaine récompense.</h2></div>
          <div className="steps-grid">
            <article><span className="step-number">01</span><div className="step-icon"><QrCode size={30} strokeWidth={1.8} aria-hidden="true" /></div><h3>Vous partagez votre QR code</h3><p>Sur place, sur une affiche, dans un message ou directement depuis votre écran.</p></article>
            <article><span className="step-number">02</span><div className="step-icon"><UserPlus size={30} strokeWidth={1.8} aria-hidden="true" /></div><h3>Le client crée sa carte</h3><p>Quelques secondes suffisent. Sa carte digitale et son QR code personnel sont prêts.</p></article>
            <article><span className="step-number">03</span><div className="step-icon"><ScanLine size={30} strokeWidth={1.8} aria-hidden="true" /></div><h3>Votre équipe suit les passages</h3><p>Un scan met à jour la progression, l’historique et les récompenses disponibles.</p></article>
          </div>
        </div>
      </section>

      <section className="product-section shell" id="produit">
        <div className="section-heading product-heading">
          <span className="eyebrow">Le produit, sans détour</span>
          <h2>Chaque écran a un rôle clair.</h2>
          <p>Le client garde sa carte. L’équipe scanne. Le responsable pilote. Tout le monde voit uniquement ce dont il a besoin.</p>
        </div>
        <div className="real-product-grid">
          <article className="real-product-card real-product-card-wide">
            <div className="real-product-copy"><span>TABLEAU DE BORD COMMERÇANT</span><h3>Le pilotage utile, dès l’ouverture.</h3><p>Les indicateurs, les accès rapides et l’activité récente réunis sur le véritable écran d’accueil Kivli.</p></div>
            <div className="real-product-window"><div className="real-product-bar" aria-hidden="true"><i /><i /><i /><small>kivli.fr/dashboard</small></div><img src="/product-real/dashboard.jpg" alt="Véritable tableau de bord commerçant Kivli pour Studio Nova" loading="lazy" /></div>
          </article>
          <article className="real-product-card">
            <div className="real-product-copy"><span>CARTE CLIENT</span><h3>La progression et le QR code, au même endroit.</h3><p>Une vraie carte créée dans Kivli, avec ses paliers et sa prochaine récompense.</p></div>
            <div className="real-product-window real-product-window-card"><div className="real-product-bar" aria-hidden="true"><i /><i /><i /><small>Carte de Léa</small></div><img src="/product-real/client-card.jpg" alt="Véritable carte client Kivli de Studio Nova avec six points" loading="lazy" /></div>
          </article>
          <article className="real-product-card">
            <div className="real-product-copy"><span>SCANNER</span><h3>Un passage validé sans détour.</h3><p>Caméra, saisie manuelle et quantité de points depuis le véritable espace de scan.</p></div>
            <div className="real-product-window"><div className="real-product-bar" aria-hidden="true"><i /><i /><i /><small>Espace équipe</small></div><img src="/product-real/scanner.jpg" alt="Véritable écran du scanner Kivli" loading="lazy" /></div>
          </article>
          <article className="real-product-card">
            <div className="real-product-copy"><span>PROGRAMME</span><h3>Une carte fidèle à chaque commerce.</h3><p>Couleur, récompenses et conditions restent modifiables depuis l’interface réelle.</p></div>
            <div className="real-product-window"><div className="real-product-bar" aria-hidden="true"><i /><i /><i /><small>Mon programme</small></div><img src="/product-real/program.jpg" alt="Véritable écran de gestion du programme Kivli" loading="lazy" /></div>
          </article>
        </div>
      </section>

      <section className="sector-section">
        <div className="shell">
          <span className="eyebrow">Une fidélité qui s’adapte à votre activité</span>
          <div className="sector-list" aria-label="Activités compatibles avec Kivli">
            <span>Boutiques</span><span>Beauté</span><span>Restauration</span><span>Sport</span><span>Services</span><span>Commerces locaux</span>
          </div>
        </div>
      </section>

      <section className="feature-band shell">
        <div><span className="eyebrow">Kivli — La fidélité, simplement.</span><h2>Vous gardez le lien. Kivli garde le rythme.</h2><p>Cartes, passages, récompenses, historique et accès équipe restent réunis dans un outil lisible sur mobile comme sur ordinateur.</p></div>
        <div className="feature-list"><span><Check size={17} aria-hidden="true" />QR code unique par client</span><span><Check size={17} aria-hidden="true" />Progression en temps réel</span><span><Check size={17} aria-hidden="true" />Récompenses automatiques</span><span><Check size={17} aria-hidden="true" />Accès équipe limité</span></div>
      </section>

      <footer className="footer"><div className="shell"><div><Brand light /><p>La fidélité, simplement.</p></div><div className="footer-links"><a href="/merchant">Espace commerçant →</a><Link href="/mentions-legales">Mentions légales</Link><Link href="/confidentialite">Confidentialité</Link><Link href="/conditions-pilote">Pilote gratuit</Link></div></div></footer>

      {step !== "intro" && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setStep("intro"); }}>
          <section className="signup-modal" role="dialog" aria-modal="true" aria-labelledby="signup-title">
            <button className="modal-close" aria-label="Fermer" onClick={() => setStep("intro")}>×</button>
            <span className="eyebrow">Votre espace en 1 minute</span>
            <h2 id="signup-title">Créez simplement votre compte.</h2>
            <p>Votre carte de fidélité se configure juste après, tranquillement depuis votre espace.</p>
            {step === "form" ? <form onSubmit={submit} className="form-grid">
              <div className="field-row"><label>Prénom<input name="firstName" autoComplete="given-name" placeholder="Léa" required /></label><label>Nom<input name="lastName" autoComplete="family-name" placeholder="Martin" required /></label></div>
              <label>Nom du commerce<input name="businessName" placeholder="Atelier Nova" required /></label>
              <label>E-mail professionnel<input name="email" type="email" autoComplete="email" placeholder="bonjour@ateliernova.fr" required /></label>
              <label>Téléphone <small>Facultatif</small><input name="phone" type="tel" autoComplete="tel" placeholder="06 12 34 56 78" /></label>
              <div className="field-row pin-field-row"><label>Code confidentiel<input name="password" type="password" inputMode="numeric" autoComplete="new-password" minLength={6} maxLength={6} pattern="[0-9]{6}" placeholder="6 chiffres" required /><small>Il servira à vous connecter.</small></label><label>Confirmer le code<input name="confirmPassword" type="password" inputMode="numeric" autoComplete="new-password" minLength={6} maxLength={6} pattern="[0-9]{6}" placeholder="6 chiffres" required /><small>Saisissez exactement le même code.</small></label></div>
              <small className="form-privacy-note">Kivli utilise ces informations pour créer et sécuriser votre compte. Le téléphone est facultatif. <Link href="/confidentialite" target="_blank">Comment vos données sont protégées</Link>.</small>
              <label className="consent-check form-legal-consent"><input name="termsAccepted" type="checkbox" required /><span>J’accepte les <Link href="/conditions-pilote" target="_blank">conditions du pilote gratuit</Link> et l’<Link href="/accord-traitement-donnees" target="_blank">annexe RGPD</Link>.</span></label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="button button-large button-full" disabled={busy}>{busy ? "Création en cours…" : "Créer mon compte"}</button>
            </form> : <div className="signup-confirmation"><span className="signup-confirmation-icon"><MailCheck size={26} aria-hidden="true" /></span><h3>Confirme ton adresse e-mail.</h3><p>Nous avons envoyé un lien valable 30 minutes à <strong>{pendingEmail}</strong>. Ouvre-le pour activer ton compte.</p>{error && <p className="form-error" role="status">{error}</p>}<button className="button button-ghost button-full" onClick={resend} disabled={busy}>{busy ? "Envoi…" : "Renvoyer l’e-mail"}</button><button className="text-link" onClick={() => { setStep("form"); setError(""); }}>Modifier mes informations</button></div>}
          </section>
        </div>
      )}
    </main>
  );
}
