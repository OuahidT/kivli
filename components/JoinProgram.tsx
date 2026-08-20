"use client";

import { FormEvent, useEffect, useState } from "react";
import { Gift, QrCode, ShieldCheck, Sparkles } from "lucide-react";
import { Brand } from "./Brand";
import type { Program } from "../lib/types";
import { visibleProgramTerms } from "../lib/program-style";

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
    window.localStorage.setItem(`kivli-card-${slug}`, result.code);
    window.location.href = `/c/${result.code}`;
  }

  if (loading) return <main className="public-card-page"><div className="loading-card public-state"><Brand /><span className="public-state-icon public-state-loading"><QrCode size={24} aria-hidden="true" /></span><p>Préparation de ta carte…</p></div></main>;
  if (!program) return <main className="public-card-page"><div className="empty-card public-state"><Brand /><span className="public-state-icon"><QrCode size={24} aria-hidden="true" /></span><h1>Programme introuvable.</h1><p>Ce lien n’est plus disponible ou contient une erreur.</p><a className="button" href="/">Découvrir Kivli</a></div></main>;
  const terms = visibleProgramTerms(program.terms);

  return (
    <main className="public-card-page" style={{ "--merchant": program.accentColor } as React.CSSProperties}>
      <section className="join-card">
        <div className="join-preview join-preview-modern">
          <div className="card-orbit card-orbit-one" /><div className="card-orbit card-orbit-two" />
          <div className="join-preview-top"><span className="merchant-avatar">{program.businessName.slice(0, 1)}</span><span><small>CARTE FIDÉLITÉ DIGITALE</small><strong>{program.businessName}</strong></span><i><Sparkles size={13} aria-hidden="true" />Gratuite</i></div>
          <span className="card-kicker">{program.name}</span>
          <h1>Une récompense t’attend.</h1>
          <p className="join-promise">{program.earningMode === "spend" ? `À chaque achat, tu gagnes 1 point tous les ${(program.spendAmountCents / 100).toFixed(2).replace(".", ",")} € dépensés.` : "À chaque passage, ton commerçant scanne ta carte et ta progression se met à jour instantanément."}</p>
          <div className="join-stamps">{Array.from({ length: Math.min(program.goal, 10) }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
          <div className="reward-line"><span className="reward-symbol"><Gift size={20} aria-hidden="true" /></span><span>Dès {program.rewardTiers[0]?.threshold ?? program.goal} points</span><strong>{program.rewardTiers[0]?.rewardText ?? program.rewardText}</strong></div>
        </div>
        <div className="join-form-wrap">
          <Brand />
          <span className="eyebrow"><QrCode size={15} aria-hidden="true" />Carte gratuite · sans application</span>
          <h2>Crée ta carte en quelques secondes.</h2>
          <p>Présente ensuite ton QR code personnel à chaque passage.</p>
          <form onSubmit={submit} className="form-grid">
            <label>Ton prénom<input name="firstName" autoComplete="given-name" placeholder="Léa" required /></label>
            <label>Ton numéro de téléphone<input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="06 12 34 56 78" required /><small>Il permet de retrouver ta carte si tu changes de téléphone.</small></label>
            <label className="consent-check"><input name="marketingConsent" type="checkbox" /><span>J’accepte de recevoir, plus tard, les offres de {program.businessName} par SMS. <em>Facultatif</em></span></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-large button-full merchant-button" disabled={busy}>{busy ? "Création…" : "Obtenir ma carte"}</button>
          </form>
          <small>En t’inscrivant, tu acceptes que {program.businessName} conserve ta carte et son historique de passages.</small>
          <aside className="join-terms"><ShieldCheck size={17} aria-hidden="true" /><span><strong>Conditions</strong>{terms}</span></aside>
        </div>
      </section>
    </main>
  );
}
