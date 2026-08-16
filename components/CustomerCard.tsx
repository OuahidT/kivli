"use client";

import { useEffect, useState } from "react";
import { Check, Gift, QrCode as QrCodeIcon, RefreshCw, Share2, ShieldCheck, Sparkles } from "lucide-react";
import { Brand } from "./Brand";
import { QrCode } from "./QrCode";
import type { CardData } from "../lib/types";
import { visibleProgramTerms } from "../lib/program-style";

export function CustomerCard({ code }: { code: string }) {
  const [card, setCard] = useState<CardData | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/card/${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { card?: CardData; error?: string };
        if (!response.ok) throw new Error(data.error);
        setCard(data.card ?? null);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Carte introuvable."));
  }, [code]);

  if (!card && !error) return <main className="public-card-page"><div className="loading-card public-state"><Brand /><span className="public-state-icon public-state-loading"><RefreshCw size={23} aria-hidden="true" /></span><p>Chargement de ta carte…</p></div></main>;
  if (!card) return <main className="public-card-page"><div className="empty-card public-state"><Brand /><span className="public-state-icon"><QrCodeIcon size={24} aria-hidden="true" /></span><h1>Carte introuvable.</h1><p>Vérifie le lien ou demande un nouveau QR à ton commerçant.</p><a className="button" href="/">Revenir à Kivli</a></div></main>;
  const appOrigin = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? window.location.origin : "https://kivli.fr";
  const shareUrl = `${appOrigin}/c/${card.code}`;
  const remaining = Math.max(0, card.goal - card.points);
  const progress = Math.min(100, Math.round(card.points / card.goal * 100));
  const terms = visibleProgramTerms(card.terms);

  async function share() {
    if (navigator.share) await navigator.share({ title: `Carte ${card?.businessName}`, url: shareUrl });
    else {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <main className="customer-page" style={{ "--merchant": card.accentColor } as React.CSSProperties}>
      <nav className="customer-nav"><Brand /><button className="icon-button" onClick={share} aria-label="Partager la carte">{copied ? <Check size={20} aria-hidden="true" /> : <Share2 size={19} aria-hidden="true" />}</button></nav>
      <section className="customer-wrap">
        <div className="loyalty-card loyalty-card-modern">
          <div className="card-orbit card-orbit-one" /><div className="card-orbit card-orbit-two" />
          <div className="loyalty-head"><span className="merchant-avatar">{card.businessName.slice(0, 1)}</span><div><small>CARTE FIDÉLITÉ DIGITALE</small><strong>{card.businessName}</strong></div><span className="card-live"><Sparkles size={13} aria-hidden="true" />Active</span></div>
          <div className="loyalty-title"><span>{card.name}</span><h1>{card.points === 0 && card.totalPoints > 0 ? `Un nouveau tour commence, ${card.firstName}.` : remaining === 0 ? `Ta récompense est prête, ${card.firstName}.` : `Encore ${remaining} ${remaining > 1 ? "passages" : "passage"}, ${card.firstName}.`}</h1></div>
          <div className="loyalty-progress"><span><b>{card.points}</b> sur {card.goal} passages</span><i><i style={{ width: `${progress}%` }} /></i><strong>{progress}%</strong></div>
          <div className="customer-stamps" aria-label={`${card.points} passages sur ${card.goal}`}>
            {Array.from({ length: card.goal }, (_, index) => <span key={index} className={index < card.points ? "filled" : ""}>{index < card.points ? "✓" : index + 1}</span>)}
          </div>
          <div className="reward-line"><span className="reward-symbol"><Gift size={20} aria-hidden="true" /></span><span>Ta récompense</span><strong>{card.rewardText}</strong></div>
          {card.availableRewards > 0 && <div className="reward-ready"><Sparkles size={17} aria-hidden="true" />{card.availableRewards} récompense{card.availableRewards > 1 ? "s" : ""} disponible{card.availableRewards > 1 ? "s" : ""}</div>}
        </div>

        <div className="qr-panel">
          <div><span className="eyebrow"><QrCodeIcon size={15} aria-hidden="true" />À présenter sur place</span><h2>Ton QR personnel</h2><p>Présente cet écran au professionnel. Le scan ajoute ton passage ou permet de remettre ta récompense.</p><div className="qr-instruction"><span>1</span>Ouvre cette carte lors de ta visite<i /><span>2</span>Présente le QR à l’équipe</div></div>
          <div className="qr-box"><QrCode value={`${appOrigin}/c/${card.code}`} size={210} label={`QR personnel de ${card.firstName}`} /><code>{card.code}</code></div>
        </div>

        <aside className="card-terms"><span><ShieldCheck size={21} aria-hidden="true" /></span><div><strong>Conditions du programme</strong><p>{terms}</p></div></aside>

        <div className="card-footnote"><span><RefreshCw size={14} aria-hidden="true" />Carte mise à jour automatiquement</span><span>{card.totalPoints} passage{card.totalPoints !== 1 ? "s" : ""} au total</span></div>
      </section>
    </main>
  );
}
