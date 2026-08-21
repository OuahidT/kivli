"use client";

import { useEffect, useState } from "react";
import { Brand } from "./Brand";

export function LegalHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return <nav className={`legal-nav${scrolled ? " legal-nav-scrolled" : ""}`}><Brand /><a href="/" className="text-link">Retour à l’accueil</a></nav>;
}
