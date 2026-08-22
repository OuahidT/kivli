"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Gift, QrCode as QrCodeIcon, RefreshCw, Share2, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { Brand } from "./Brand";
import { QrCode } from "./QrCode";
import type { CardData } from "../lib/types";
import { visibleProgramTerms } from "../lib/program-style";
import { detectWalletEnvironment, type WalletEnvironment } from "../lib/wallet-environment";

export function CustomerCard({ code }: { code: string }) {
  const [card, setCard] = useState<CardData | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [installEnvironment, setInstallEnvironment] = useState<WalletEnvironment>("other");
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [privacyMessage, setPrivacyMessage] = useState("");
  const [googleWalletEnabled, setGoogleWalletEnabled] = useState(false);
  const [googleWalletBusy, setGoogleWalletBusy] = useState(false);
  const [googleWalletError, setGoogleWalletError] = useState("");
  const [appleWalletEnabled, setAppleWalletEnabled] = useState(false);

  useEffect(() => {
    fetch(`/api/card/${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { card?: CardData; googleWalletEnabled?: boolean; appleWalletEnabled?: boolean; error?: string };
        if (!response.ok) throw new Error(data.error);
        setCard(data.card ?? null);
        setGoogleWalletEnabled(Boolean(data.googleWalletEnabled));
        setAppleWalletEnabled(Boolean(data.appleWalletEnabled));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Carte introuvable."));
  }, [code]);

  useEffect(() => {
    setInstallEnvironment(detectWalletEnvironment(navigator.userAgent, navigator.platform, navigator.maxTouchPoints));
  }, []);

  if (!card && !error) return <main className="public-card-page"><div className="loading-card public-state"><Brand /><span className="public-state-icon public-state-loading"><RefreshCw size={23} aria-hidden="true" /></span><p>Chargement de ta carte…</p></div></main>;
  if (!card) return <main className="public-card-page"><div className="empty-card public-state"><Brand /><span className="public-state-icon"><QrCodeIcon size={24} aria-hidden="true" /></span><h1>Carte introuvable.</h1><p>Vérifie le lien ou demande un nouveau QR code à ton commerçant.</p><a className="button" href="/">Revenir à Kivli</a></div></main>;
  const appOrigin = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? window.location.origin : "https://kivli.fr";
  const shareUrl = `${appOrigin}/c/${card.code}`;
  const isWallet = card.earningMode === "spend";
  const remaining = Math.max(0, card.goal - card.points);
  const nextTier = card.rewardTiers.find((tier) => tier.threshold > card.points) ?? card.rewardTiers[0];
  const progress = Math.min(100, Math.round(card.points / card.goal * 100));
  const affordableTiers = isWallet ? card.rewardTiers.filter((tier) => tier.threshold <= card.points) : [];
  const terms = visibleProgramTerms(card.terms);
  const availableRewardGroups = card.availableRewardItems.reduce<Array<{ id: string; rewardText: string; threshold: number; count: number }>>((groups, reward) => {
    const existing = groups.find((group) => group.rewardText === reward.rewardText && group.threshold === reward.threshold);
    if (existing) existing.count += 1;
    else groups.push({ ...reward, count: 1 });
    return groups;
  }, []);

  async function share() {
    if (navigator.share) await navigator.share({ title: `Carte ${card?.businessName}`, url: shareUrl });
    else {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  async function addToGoogleWallet() {
    setGoogleWalletBusy(true);
    setGoogleWalletError("");
    try {
      const response = await fetch(`/api/card/${encodeURIComponent(code)}/google-wallet`, { method: "POST" });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "Google Wallet est momentanément indisponible.");
      window.location.assign(result.url);
    } catch (reason) {
      setGoogleWalletError(reason instanceof Error ? reason.message : "Google Wallet est momentanément indisponible.");
      setGoogleWalletBusy(false);
    }
  }

  async function withdrawMarketing() {
    setPrivacyBusy(true);
    setPrivacyMessage("");
    try {
      const response = await fetch(`/api/card/${encodeURIComponent(code)}/privacy`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "withdrawMarketing" }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Modification impossible.");
      setCard((current) => current ? { ...current, marketingConsent: 0 } : current);
      setPrivacyMessage("Ton accord SMS a bien été retiré. Ta carte reste active.");
    } catch (reason) {
      setPrivacyMessage(reason instanceof Error ? reason.message : "Modification impossible.");
    } finally {
      setPrivacyBusy(false);
    }
  }

  return (
    <main className="customer-page" style={{ "--merchant": card.accentColor } as React.CSSProperties}>
      <nav className="customer-nav"><Brand /><button className="icon-button" onClick={share} aria-label="Partager la carte">{copied ? <Check size={20} aria-hidden="true" /> : <Share2 size={19} aria-hidden="true" />}</button></nav>
      <section className="customer-wrap">
        <div className="loyalty-card loyalty-card-modern">
          <div className="card-orbit card-orbit-one" /><div className="card-orbit card-orbit-two" />
          <div className="loyalty-head"><span className="merchant-avatar">{card.businessName.slice(0, 1)}</span><div><small>{card.name}</small><strong>{card.businessName}</strong></div><span className="card-live"><Sparkles size={13} aria-hidden="true" />Active</span></div>
          <div className="loyalty-title"><span>Bonjour {card.firstName}</span><h1>{isWallet ? "Ton solde, tes choix." : card.availableRewards > 0 ? "Ta récompense est prête." : remaining === 0 ? "Objectif atteint." : card.points === 0 && card.totalPoints === 0 ? "Ta carte est prête." : card.points === 0 ? "Un nouveau tour commence." : "Ta fidélité prend forme."}</h1></div>
          {isWallet ? <div className="wallet-program-view">
            <div className="wallet-balance"><span>Solde disponible</span><strong>{card.points.toLocaleString("fr-FR")}</strong><small>points</small><p>{affordableTiers.length ? `${affordableTiers.length} récompense${affordableTiers.length > 1 ? "s" : ""} accessible${affordableTiers.length > 1 ? "s" : ""}` : nextTier ? `Encore ${nextTier.threshold - card.points} points avant ta première récompense` : "Continue à cumuler tes points"}</p></div>
            <section className="wallet-tiers" aria-label="Paliers de récompenses"><header><span>Mes récompenses</span><small>Tu choisis avec l’équipe au moment du scan</small></header><div className="wallet-tier-list">{card.rewardTiers.map((tier) => { const accessible = tier.threshold <= card.points; const missing = Math.max(0, tier.threshold - card.points); return <article key={tier.id} className={accessible ? "accessible" : tier.id === nextTier?.id ? "next" : "locked"}><span className="wallet-tier-cost"><b>{tier.threshold}</b><small>pts</small></span><div><strong>{tier.rewardText}</strong><small>{accessible ? <><Check size={12} aria-hidden="true" />Disponible</> : `Encore ${missing} pt${missing > 1 ? "s" : ""}`}</small></div></article>; })}</div></section>
          </div> : <>
            <div className="loyalty-progress"><span><b>{card.points}</b> sur {card.goal} points</span><i><i style={{ width: `${progress}%` }} /></i><strong>{progress}%</strong></div>
            {card.goal <= 12 ? <div className="customer-stamps" aria-label={`${card.points} points sur ${card.goal}`}>{Array.from({ length: card.goal }, (_, index) => <span key={index} className={index < card.points ? "filled" : ""}>{index < card.points ? "✓" : index + 1}</span>)}</div> : <div className="customer-milestones">{card.rewardTiers.map((tier) => <span key={tier.id} className={card.points >= tier.threshold ? "reached" : ""}><b>{tier.threshold}</b><small>{tier.rewardText}</small></span>)}</div>}
            <div className="reward-line"><span className="reward-symbol"><Gift size={20} aria-hidden="true" /></span><span>Prochaine récompense · {nextTier?.threshold ?? card.goal} points</span><strong>{nextTier?.rewardText ?? card.rewardText}</strong></div>
            {card.availableRewards > 0 && <div className="reward-ready"><Sparkles size={17} aria-hidden="true" /><span className="reward-ready-copy"><b>{card.availableRewards} récompense{card.availableRewards > 1 ? "s" : ""} disponible{card.availableRewards > 1 ? "s" : ""}</b><strong>{availableRewardGroups[0]?.rewardText ?? card.rewardText}</strong></span>{availableRewardGroups.length > 1 && <details className="reward-ready-details"><summary>Voir les {availableRewardGroups.length} types</summary><div>{availableRewardGroups.map((reward) => <span key={`${reward.rewardText}-${reward.threshold}`}><Gift size={13} aria-hidden="true" />{reward.rewardText}{reward.count > 1 ? ` · ×${reward.count}` : ""}</span>)}</div></details>}</div>}
          </>}

          <div className="card-qr-mobile">
            <span className="card-qr-mobile-label"><QrCodeIcon size={13} aria-hidden="true" />À présenter à l’équipe</span>
            <div className="card-qr-mobile-box"><QrCode value={`${appOrigin}/c/${card.code}`} size={190} label={`QR code personnel de ${card.firstName}`} /></div>
            <code className="card-qr-mobile-code">{card.code}</code>
          </div>

          {googleWalletEnabled && installEnvironment === "android" ? <div className="card-wallet-slot">
            <div className="google-wallet-action card-wallet-action">
              <button type="button" className="google-wallet-button" onClick={addToGoogleWallet} disabled={googleWalletBusy} aria-label="Ajouter à Google Wallet"><img src="/google-wallet-add-fr.svg" alt="Ajouter à Google Wallet" /></button>
              {googleWalletBusy && <small className="google-wallet-status" role="status">Préparation de ta carte…</small>}
              {googleWalletError && <small className="google-wallet-error" role="alert">{googleWalletError}</small>}
            </div>
          </div> : installEnvironment === "ios" ? <div className="card-wallet-slot">{appleWalletEnabled
            ? <a className="apple-wallet-button" href={`/api/card/${encodeURIComponent(card.code)}/apple-wallet`} aria-label="Ajouter à Apple Wallet"><img src="/apple-wallet-add-fr.svg" alt="Ajouter à Apple Wallet" /></a>
            : <p className="apple-wallet-coming-soon"><WalletCards size={14} aria-hidden="true" />Bientôt, votre carte pourra être ajoutée à Apple Wallet 🧡</p>}
          </div> : null}

          <details className="card-mobile-privacy-control">
            <summary aria-label="Confidentialité et conditions"><ShieldCheck size={15} aria-hidden="true" /></summary>
            <div className="card-mobile-privacy-popover">
              <div><ShieldCheck size={17} aria-hidden="true" /><p><strong>Conditions du programme</strong>{terms}</p></div>
              <div><ShieldCheck size={17} aria-hidden="true" /><p><strong>Tes données</strong><a href="/confidentialite" target="_blank">Voir tes droits et la politique de confidentialité</a>{card.marketingConsent ? <button type="button" className="privacy-withdraw-link" onClick={withdrawMarketing} disabled={privacyBusy}>{privacyBusy ? "Modification…" : "Retirer mon accord aux offres SMS"}</button> : null}{privacyMessage && <small className="privacy-feedback" role="status">{privacyMessage}</small>}</p></div>
            </div>
          </details>
        </div>

        <div className="qr-panel">
          <div><span className="eyebrow"><QrCodeIcon size={15} aria-hidden="true" />À présenter sur place</span><h2>Ton QR code personnel</h2><p>Présente cet écran au professionnel. Le scan ajoute ton passage ou permet de remettre ta récompense.</p><div className="qr-instruction"><span>1</span>Ouvre cette carte lors de ta visite<i /><span>2</span>Présente le QR code à l’équipe</div></div>
          <div className="qr-box"><QrCode value={`${appOrigin}/c/${card.code}`} size={210} label={`QR code personnel de ${card.firstName}`} /><code>{card.code}</code></div>
        </div>

        <aside className="card-terms"><span><ShieldCheck size={21} aria-hidden="true" /></span><div><strong>Conditions du programme</strong><p>{terms}</p></div></aside>

        <details className="card-privacy-menu"><summary><ShieldCheck size={16} aria-hidden="true" />Confidentialité et préférences<ChevronDown size={15} aria-hidden="true" /></summary><div><a href="/confidentialite" target="_blank">Consulter la politique de confidentialité et tes droits</a>{card.marketingConsent ? <button type="button" className="privacy-withdraw-button" onClick={withdrawMarketing} disabled={privacyBusy}>{privacyBusy ? "Modification…" : "Retirer mon accord aux offres SMS"}</button> : null}{privacyMessage && <p className="privacy-feedback" role="status">{privacyMessage}</p>}</div></details>

        <div className="card-footnote"><span><RefreshCw size={14} aria-hidden="true" />Carte mise à jour automatiquement</span><span>{card.totalPoints} point{card.totalPoints !== 1 ? "s" : ""} au total</span></div>
      </section>
    </main>
  );
}
