import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "./Brand";

export function LegalPage({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return (
    <main className="legal-page">
      <nav className="legal-nav"><Brand /><Link href="/" className="text-link">Retour à l’accueil</Link></nav>
      <article className="legal-document">
        <header><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{intro}</p><small>Version du 21 août 2026</small></header>
        <div className="legal-content">{children}</div>
      </article>
      <footer className="legal-footer">
        <Link href="/mentions-legales">Mentions légales</Link>
        <Link href="/confidentialite">Confidentialité</Link>
        <Link href="/conditions-pilote">Conditions du pilote</Link>
        <Link href="/accord-traitement-donnees">Annexe RGPD</Link>
        <a href="mailto:contact@kivli.fr">contact@kivli.fr</a>
      </footer>
    </main>
  );
}

export function LegalSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return <section id={id}><h2>{title}</h2>{children}</section>;
}
