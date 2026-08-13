"use client";

import { useEffect, useState } from "react";
import { Check, QrCode as QrCodeIcon, RefreshCw, Share2 } from "lucide-react";
import { Brand } from "./Brand";
import { QrCode } from "./QrCode";
import type { CardData } from "../lib/types";

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

  if (!card) return <main className="public-card-page"><div className="loading-card">{error || "Chargement de ta carte…"}</div></main>;
  const shareUrl = typeof window === "undefined" ? `/c/${card.code}` : window.location.href;

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
        <div className="loyalty-card">
          <div className="loyalty-head"><span className="merchant-avatar">{card.businessName.slice(0, 1)}</span><div><small>CARTE FIDÉLITÉ</small><strong>{card.businessName}</strong></div></div>
          <div className="loyalty-title"><span>{card.name}</span><h1>{card.points === 0 && card.totalPoints > 0 ? "Un nouveau tour commence." : `Encore ${card.goal - card.points} ${card.goal - card.points > 1 ? "passages" : "passage"}, ${card.firstName}.`}</h1></div>
          <div className="customer-stamps" aria-label={`${card.points} passages sur ${card.goal}`}>
            {Array.from({ length: card.goal }, (_, index) => <span key={index} className={index < card.points ? "filled" : ""}>{index < card.points ? "✓" : index + 1}</span>)}
          </div>
          <div className="reward-line"><span>Ta récompense</span><strong>{card.rewardText}</strong></div>
          {card.availableRewards > 0 && <div className="reward-ready">★ {card.availableRewards} récompense{card.availableRewards > 1 ? "s" : ""} disponible{card.availableRewards > 1 ? "s" : ""}</div>}
        </div>

        <div className="qr-panel">
          <div><span className="eyebrow"><QrCodeIcon size={15} aria-hidden="true" />À présenter au comptoir</span><h2>Ton QR personnel</h2><p>Le commerçant le scanne pour ajouter ton passage ou remettre ta récompense.</p></div>
          <div className="qr-box"><QrCode value={`${window.location.origin}/c/${card.code}`} size={210} label={`QR personnel de ${card.firstName}`} /><code>{card.code}</code></div>
        </div>

        <div className="card-footnote"><span><RefreshCw size={14} aria-hidden="true" />Carte mise à jour automatiquement</span><span>{card.totalPoints} passage{card.totalPoints !== 1 ? "s" : ""} au total</span></div>
      </section>
    </main>
  );
}
