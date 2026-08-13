"use client";

import { FormEvent, useEffect, useState } from "react";
import { Brand } from "./Brand";
import type { Program } from "../lib/types";

export function JoinProgram({ slug }: { slug: string }) {
  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/program/${encodeURIComponent(slug)}`)
      .then(async (response) => {
        const data = (await response.json()) as { program?: Program; error?: string };
        if (!response.ok) throw new Error(data.error);
        setProgram(data.program ?? null);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Programme introuvable."))
      .finally(() => setLoading(false));
  }, [slug]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/join/${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(data)),
    });
    const result = (await response.json()) as { code?: string; error?: string };
    if (!response.ok || !result.code) {
      setError(result.error ?? "Inscription impossible.");
      setBusy(false);
      return;
    }
    window.localStorage.setItem(`tampo-card-${slug}`, result.code);
    window.location.href = `/c/${result.code}`;
  }

  if (loading) return <main className="public-card-page"><div className="loading-card">Préparation de ta carte…</div></main>;
  if (!program) return <main className="public-card-page"><div className="empty-card"><Brand /><h1>Ce programme est introuvable.</h1><p>{error}</p></div></main>;

  return (
    <main className="public-card-page" style={{ "--merchant": program.accentColor } as React.CSSProperties}>
      <section className="join-card">
        <div className="join-preview">
          <div className="join-preview-top"><span className="merchant-avatar">{program.businessName.slice(0, 1)}</span><span>{program.businessName}</span></div>
          <span className="card-kicker">{program.name}</span>
          <h1>Une récompense t’attend.</h1>
          <div className="join-stamps">{Array.from({ length: Math.min(program.goal, 10) }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
          <div className="reward-line"><span>Au bout de {program.goal} passages</span><strong>{program.rewardText}</strong></div>
        </div>
        <div className="join-form-wrap">
          <Brand />
          <span className="eyebrow">Carte gratuite · sans application</span>
          <h2>Crée ta carte en quelques secondes.</h2>
          <p>Présente ensuite ton QR personnel à chaque passage.</p>
          <form onSubmit={submit} className="form-grid">
            <label>Ton prénom<input name="firstName" autoComplete="given-name" placeholder="Léa" required /></label>
            <label>Ton e-mail <em>facultatif</em><input name="email" type="email" autoComplete="email" placeholder="lea@email.fr" /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-large button-full merchant-button" disabled={busy}>{busy ? "Création…" : "Obtenir ma carte"}</button>
          </form>
          <small>En t’inscrivant, tu acceptes que {program.businessName} conserve ta carte et son historique de passages.</small>
        </div>
      </section>
    </main>
  );
}
