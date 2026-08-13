"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
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
      <section className="auth-card">
        <span className="eyebrow">Espace commerçant</span>
        <h1>Content de te revoir.</h1>
        <p>Propriétaire ou employé : connecte-toi avec l’accès qui t’a été attribué.</p>
        <form onSubmit={submit} className="form-grid">
          <label>E-mail ou identifiant employé<input name="identifier" type="text" autoComplete="username" autoCapitalize="none" required /></label>
          <label>Code d’accès<input name="pin" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{6}" maxLength={6} required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-large button-full" disabled={busy}>{busy ? "Connexion…" : "Ouvrir mon espace"}</button>
        </form>
        <div className="auth-foot">Pas encore de programme ? <Link href="/" prefetch={false}>Créer gratuitement</Link></div>
      </section>
    </main>
  );
}
