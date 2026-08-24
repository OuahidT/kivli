"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, Check, LockKeyhole } from "lucide-react";
import { Brand } from "./Brand";

export function OwnerSecurityIncident() {
  const [step, setStep] = useState<"confirm" | "pin" | "done">("confirm");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirmIncident() {
    setBusy(true);
    setError("");
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    const response = await fetch("/api/merchant/security/not-me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const result = await response.json() as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setError(result.error ?? "Ce lien de sécurité n’est plus valide.");
      return;
    }
    window.history.replaceState({}, "", "/security/not-me");
    setStep("pin");
  }

  async function changePin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/merchant/security/forced-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
    });
    const result = await response.json() as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setError(result.error ?? "Le code n’a pas pu être modifié.");
      return;
    }
    setStep("done");
  }

  return (
    <main className="auth-page verify-page">
      <div className="auth-brand"><Brand /></div>
      <section className="verify-card">
        <span className={`verify-icon ${step === "done" ? "success" : "error"}`}>
          {step === "done" ? <Check size={26} /> : step === "pin" ? <LockKeyhole size={26} /> : <AlertTriangle size={26} />}
        </span>
        <span className="eyebrow">Sécurité du compte</span>
        {step === "confirm" && <>
          <h1>Cette connexion n’était pas la tienne ?</h1>
          <p>Confirme uniquement si tu ne reconnais pas la connexion signalée dans l’e-mail. Toutes les sessions et tous les appareils reconnus seront alors révoqués.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-large" disabled={busy} onClick={confirmIncident}>
            {busy ? "Sécurisation…" : "Oui, sécuriser mon compte"}
          </button>
        </>}
        {step === "pin" && <>
          <h1>Choisis un nouveau code.</h1>
          <p>Ton compte est bloqué jusqu’à la définition d’un nouveau PIN propriétaire à 6 chiffres.</p>
          <form className="form-grid" onSubmit={changePin}>
            <label>Nouveau code<input name="newPin" type="password" inputMode="numeric" autoComplete="new-password" minLength={6} maxLength={6} pattern="[0-9]{6}" required /></label>
            <label>Confirmer le code<input name="confirmPin" type="password" inputMode="numeric" autoComplete="new-password" minLength={6} maxLength={6} pattern="[0-9]{6}" required /></label>
            <small>Évite les suites simples, les répétitions et les codes très courants.</small>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-large" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer mon nouveau code"}</button>
          </form>
        </>}
        {step === "done" && <>
          <h1>Ton compte est sécurisé.</h1>
          <p>Toutes les anciennes sessions ont été fermées. Reconnecte-toi avec ton nouveau code confidentiel.</p>
          <a className="button button-large" href="/merchant">Se reconnecter</a>
        </>}
      </section>
    </main>
  );
}
