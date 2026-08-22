import { CSSProperties, ReactNode } from "react";
import { Gift, Sparkles } from "lucide-react";
import { QrCode as KivliQrCode } from "./QrCode";

/**
 * Real iPhone chassis asset (public/kivli-iphone-premium.png) with a screen
 * cutout sized from the same proven insets as the original hero mockup.
 */
export function PhoneFrame({ children, width = 300, tilt = false, className = "" }: { children: ReactNode; width?: number; tilt?: boolean; className?: string }) {
  return (
    <div className={`land-phone${tilt ? " land-phone-tilt" : ""} ${className}`} style={{ "--land-phone-w": `${width}px` } as CSSProperties}>
      <img className="land-phone-frame" src="/kivli-iphone-premium.png" alt="" aria-hidden="true" draggable={false} />
      <div className="land-phone-screen">{children}</div>
    </div>
  );
}

/** A simplified, crisp laptop chassis hosting a real Kivli screenshot. */
export function LaptopFrame({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`land-laptop ${className}`}>
      <div className="land-laptop-screen">
        <img src={src} alt={alt} loading="lazy" decoding="async" />
      </div>
      <div className="land-laptop-base" />
    </div>
  );
}

/** Faithful, live-styled reproduction of the real Kivli customer card screen. */
export function KivliCardScreen() {
  return (
    <>
      <div className="phone-top">
        <span>9:41</span>
        <span className="phone-status" aria-label="Réseau, Wi-Fi et batterie pleine">
          <svg className="phone-signal" viewBox="0 0 21 15" fill="none"><rect x=".4" y="10.8" width="3.6" height="3.8" rx="1.25" fill="currentColor" /><rect x="5.9" y="7.5" width="3.6" height="7.1" rx="1.25" fill="currentColor" /><rect x="11.4" y="4.15" width="3.6" height="10.45" rx="1.25" fill="currentColor" /><rect x="16.9" y=".4" width="3.6" height="14.2" rx="1.25" fill="currentColor" /></svg>
          <svg className="phone-wifi" viewBox="0 0 25 18" fill="none"><path d="M1 5.65C7.32-.18 17.68-.18 24 5.65l-3.02 3C16.35 4.5 8.65 4.5 4.02 8.65L1 5.65Z" fill="currentColor" /><path d="M6.25 10.88c3.45-3.25 9.05-3.25 12.5 0l-3.03 3.02a4.66 4.66 0 0 0-6.44 0l-3.03-3.02Z" fill="currentColor" /><path d="M10.56 15.14a2.76 2.76 0 0 1 3.88 0L12.5 17.1l-1.94-1.96Z" fill="currentColor" /></svg>
          <svg className="phone-battery" viewBox="0 0 30 15" fill="none"><rect x=".7" y=".85" width="24.3" height="13.3" rx="4.25" stroke="currentColor" strokeWidth="1.4" /><rect x="2.45" y="2.6" width="20.8" height="9.8" rx="2.65" fill="currentColor" /><path d="M26.35 4.8c1.55.58 2.55 1.64 2.55 2.7s-1 2.12-2.55 2.7V4.8Z" fill="currentColor" /></svg>
        </span>
      </div>
      <div className="kivli-app">
        <div className="kivli-app-head">
          <span className="kivli-app-brand"><i className="kivli-app-mark" aria-hidden="true"><i /><i /><i /></i><b>Kivli</b></span>
          <span className="kivli-app-avatar">L</span>
        </div>
        <div className="kivli-app-greeting"><small>BONJOUR ANAÏS</small><h3>Ta fidélité prend forme.</h3></div>
        <section className="kivli-app-card">
          <div className="kivli-app-merchant"><span>A</span><div><small>CARTE FIDÉLITÉ</small><strong>Atelier Nova</strong></div><i><Sparkles size={10} aria-hidden="true" />Active</i></div>
          <div className="kivli-app-progress"><span><b>6</b> / 8 passages</span><strong>75%</strong></div>
          <div className="kivli-app-progressbar"><i /></div>
          <div className="kivli-app-stamps" aria-label="6 passages sur 8">
            {Array.from({ length: 8 }, (_, index) => <span key={index} className={index < 6 ? "filled" : ""}>{index < 6 ? "✓" : index + 1}</span>)}
          </div>
          <div className="kivli-app-reward"><span><Gift size={15} aria-hidden="true" /></span><div><small>PROCHAINE RÉCOMPENSE</small><strong>Un avantage au choix</strong></div></div>
          <div className="kivli-app-qr"><small>À PRÉSENTER À L’ÉQUIPE</small><div><KivliQrCode value="https://kivli.fr/c/DEMO-KIVLI" size={96} label="Aperçu du QR code personnel Kivli" /></div><code>DEMO-KIVLI</code></div>
          <p className="kivli-app-wallet">Disponible dans Google Wallet. Apple Wallet arrive bientôt.</p>
        </section>
      </div>
      <div className="home-indicator" aria-hidden="true" />
    </>
  );
}

/** Subtle continuity thread (maquette 1) linking two chapters. Never a gimmick. */
export function OrangeThread({ className = "" }: { className?: string }) {
  return (
    <svg className={`land-thread ${className}`} viewBox="0 0 200 160" preserveAspectRatio="none" aria-hidden="true">
      <path d="M100 0 C100 40, 40 40, 40 78 C40 116, 160 116, 160 160" fill="none" stroke="var(--orange)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
