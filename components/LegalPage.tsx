import type { ReactNode } from "react";
import { LegalHeader } from "./LegalHeader";

export function LegalPage({ eyebrow, title, intro, version = "21 août 2026", children }: { eyebrow: string; title: string; intro: string; version?: string; children: ReactNode }) {
  return (
    <main className="legal-page">
      <LegalHeader />
      <article className="legal-document">
        <header><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{intro}</p><small>Version du {version}</small></header>
        <div className="legal-content">{children}</div>
      </article>
      <footer className="legal-footer" aria-label="Navigation légale">
        <a href="/mentions-legales">Mentions légales</a>
        <a href="/confidentialite">Confidentialité</a>
        <a href="/conditions-pilote">Conditions du pilote</a>
        <a href="/accord-traitement-donnees">Annexe RGPD</a>
        <a href="mailto:contact@kivli.fr">contact@kivli.fr</a>
      </footer>
    </main>
  );
}

export function LegalSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return <section id={id}><h2>{title}</h2>{children}</section>;
}
