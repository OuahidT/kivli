"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Dumbbell,
  Handshake,
  MailCheck,
  MapPin,
  Sparkles,
  Store,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { motion, MotionConfig } from "motion/react";
import { Brand } from "./Brand";
import { KivliCardScreen, LaptopFrame, OrangeThread, PhoneFrame } from "./DeviceFrames";
import { ProductShowcase } from "./ProductShowcase";

const SECTORS = [
  { icon: Store, label: "Boutiques" },
  { icon: Sparkles, label: "Beauté" },
  { icon: UtensilsCrossed, label: "Restauration" },
  { icon: Dumbbell, label: "Sport" },
  { icon: Handshake, label: "Services" },
  { icon: MapPin, label: "Commerces locaux" },
];

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

  const fadeUp = { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-12%" }, transition: { duration: 0.55, ease: "easeOut" as const } };

  return (
    <MotionConfig reducedMotion="user">
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
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
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
        </motion.div>

        <motion.div
          className="land-hero-scene"
          aria-label="Aperçu de la carte digitale et du suivi Kivli"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
        >
          <div className="land-alcove" aria-hidden="true" />
          <div className="land-floor" aria-hidden="true" />
          <OrangeThread className="land-thread-hero" />
          <PhoneFrame width={320} tilt className="land-hero-phone">
            <KivliCardScreen />
          </PhoneFrame>
        </motion.div>
      </section>

      <section className="land-journey shell" id="comment-ca-marche">
        <div className="section-heading"><span className="eyebrow">Simple à chaque étape</span><h2>Du premier scan à la prochaine récompense.</h2></div>
        <div className="land-journey-scene">
          <div className="land-journey-plinth" aria-hidden="true" />
          <ol className="land-journey-devices">
            <motion.li className="land-journey-item land-journey-item-side" {...fadeUp}>
              <LaptopFrame src="/product-real/dashboard.jpg" alt="Tableau de bord Kivli avec les actions Créer une carte et Scanner un client" />
              <div className="land-journey-caption"><span className="land-step-number">01</span><h3>Vous partagez votre QR code</h3><p>Sur place, sur une affiche, dans un message ou directement depuis votre écran.</p></div>
            </motion.li>
            <motion.li className="land-journey-item land-journey-item-center" {...fadeUp} transition={{ ...(fadeUp.transition ?? {}), delay: 0.1 }}>
              <PhoneFrame width={220}>
                <img className="land-phone-shot" src="/product-real/client-card-full.jpg" alt="Véritable carte fidélité Kivli créée par un client" loading="lazy" decoding="async" />
              </PhoneFrame>
              <div className="land-journey-caption"><span className="land-step-number">02</span><h3>Le client crée sa carte</h3><p>Quelques secondes suffisent. Sa carte digitale et son QR code personnel sont prêts.</p></div>
            </motion.li>
            <motion.li className="land-journey-item land-journey-item-side" {...fadeUp} transition={{ ...(fadeUp.transition ?? {}), delay: 0.2 }}>
              <LaptopFrame src="/product-real/scanner.jpg" alt="Écran du scanner Kivli prêt à valider un passage" />
              <div className="land-journey-caption"><span className="land-step-number">03</span><h3>Votre équipe suit les passages</h3><p>Un scan met à jour la progression, l’historique et les récompenses disponibles.</p></div>
            </motion.li>
          </ol>
        </div>
        <OrangeThread className="land-thread-journey" />
      </section>

      <ProductShowcase />

      <section className="sector-section">
        <div className="shell">
          <span className="eyebrow">Une fidélité qui s’adapte à votre activité</span>
          <div className="sector-list land-sector-list" aria-label="Activités compatibles avec Kivli">
            {SECTORS.map(({ icon: Icon, label }) => (
              <span key={label}><Icon size={16} strokeWidth={1.8} aria-hidden="true" />{label}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="land-cta shell">
        <motion.div className="land-cta-copy" {...fadeUp}>
          <span className="eyebrow">Kivli — La fidélité, simplement.</span>
          <h2>Vous gardez le lien. Kivli garde le rythme.</h2>
          <p>Cartes, passages, récompenses, historique et accès équipe restent réunis dans un outil lisible sur mobile comme sur ordinateur.</p>
          <div className="feature-list">
            <span><Check size={17} aria-hidden="true" />QR code unique par client</span>
            <span><Check size={17} aria-hidden="true" />Progression en temps réel</span>
            <span><Check size={17} aria-hidden="true" />Récompenses automatiques</span>
            <span><Check size={17} aria-hidden="true" />Accès équipe limité</span>
          </div>
          <div className="land-cta-actions">
            <button className="button button-large button-light" onClick={() => setStep("form")}>Créer mon compte <ArrowRight size={18} aria-hidden="true" /></button>
            <div className="trust-row land-cta-trust">
              <span><b>0 €</b> pour commencer</span>
              <span><b>1 min</b> pour ouvrir son espace</span>
              <span><b>Sans app</b> à télécharger</span>
            </div>
          </div>
        </motion.div>
        <div className="land-cta-scene" aria-hidden="true">
          <div className="land-alcove land-alcove-cta" />
          <div className="land-floor land-floor-cta" />
          <div className="land-cta-devices">
            <LaptopFrame src="/product-real/program.jpg" alt="" className="land-cta-laptop" />
            <PhoneFrame width={190} tilt className="land-cta-phone">
              <img className="land-phone-shot" src="/product-real/client-card-full.jpg" alt="" loading="lazy" decoding="async" />
            </PhoneFrame>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="shell">
          <div><Brand light /><p>La fidélité, simplement.</p></div>
          <nav className="footer-links" aria-label="Informations et accès"><a href="/merchant">Espace commerçant →</a><a href="/mentions-legales">Mentions légales</a><a href="/confidentialite">Confidentialité</a><a href="/conditions-pilote">Pilote gratuit</a><a href="/accord-traitement-donnees">Annexe RGPD</a></nav>
        </div>
        <p className="land-footer-signature" aria-hidden="true">Kivli</p>
      </footer>

      {step !== "intro" && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setStep("intro"); }}>
          <section className="signup-modal" role="dialog" aria-modal="true" aria-labelledby="signup-title">
            <button type="button" className="modal-close" aria-label="Fermer" onClick={() => setStep("intro")}><X size={18} aria-hidden="true" /></button>
            <span className="eyebrow">Votre espace en 1 minute</span>
            <h2 id="signup-title">Créez simplement votre compte.</h2>
            <p>Votre carte de fidélité se configure juste après, tranquillement depuis votre espace.</p>
            {step === "form" ? <form onSubmit={submit} className="form-grid">
              <div className="field-row"><label>Prénom<input name="firstName" autoComplete="given-name" placeholder="Anaïs" required /></label><label>Nom<input name="lastName" autoComplete="family-name" placeholder="Martin" required /></label></div>
              <label>Nom du commerce<input name="businessName" placeholder="Atelier Nova" required /></label>
              <label>E-mail professionnel<input name="email" type="email" autoComplete="email" placeholder="bonjour@ateliernova.fr" required /></label>
              <label>Téléphone <small>Facultatif</small><input name="phone" type="tel" autoComplete="tel" placeholder="06 12 34 56 78" /></label>
              <div className="field-row pin-field-row"><label>Code confidentiel<input name="password" type="password" inputMode="numeric" autoComplete="new-password" minLength={6} maxLength={6} pattern="[0-9]{6}" placeholder="6 chiffres" required /><small>Il servira à vous connecter.</small></label><label>Confirmer le code<input name="confirmPassword" type="password" inputMode="numeric" autoComplete="new-password" minLength={6} maxLength={6} pattern="[0-9]{6}" placeholder="6 chiffres" required /><small>Saisissez exactement le même code.</small></label></div>
              <small className="form-privacy-note">Kivli utilise ces informations pour créer et sécuriser votre compte. Le téléphone est facultatif. <a href="/confidentialite" target="_blank" rel="noreferrer">Comment vos données sont protégées</a>.</small>
              <label className="consent-check form-legal-consent"><input name="termsAccepted" type="checkbox" required /><span>J’accepte les <a href="/conditions-pilote" target="_blank" rel="noreferrer">conditions du pilote gratuit</a> et l’<a href="/accord-traitement-donnees" target="_blank" rel="noreferrer">annexe RGPD</a>.</span></label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="button button-large button-full" disabled={busy}>{busy ? "Création en cours…" : "Créer mon compte"}</button>
            </form> : <div className="signup-confirmation"><span className="signup-confirmation-icon"><MailCheck size={26} aria-hidden="true" /></span><h3>Confirme ton adresse e-mail.</h3><p>Nous avons envoyé un lien valable 30 minutes à <strong>{pendingEmail}</strong>. Ouvre-le pour activer ton compte.</p>{error && <p className="form-error" role="status">{error}</p>}<button className="button button-ghost button-full" onClick={resend} disabled={busy}>{busy ? "Envoi…" : "Renvoyer l’e-mail"}</button><button className="text-link" onClick={() => { setStep("form"); setError(""); }}>Modifier mes informations</button></div>}
          </section>
        </div>
      )}
    </main>
    </MotionConfig>
  );
}
