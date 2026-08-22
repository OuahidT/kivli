"use client";

import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";

const SCREENS = [
  { n: "01", label: "Tableau de bord", src: "/product-real/dashboard.jpg", alt: "Véritable tableau de bord commerçant Kivli pour Studio Nova" },
  { n: "02", label: "Carte client", src: "/product-real/client-card.jpg", alt: "Véritable carte client Kivli de Studio Nova avec QR code personnel" },
  { n: "03", label: "Scanner", src: "/product-real/scanner.jpg", alt: "Véritable écran du scanner Kivli" },
  { n: "04", label: "Mon programme", src: "/product-real/program.jpg", alt: "Véritable écran de gestion du programme Kivli" },
] as const;

function ShowcaseHead() {
  return (
    <div className="shell land-showcase-head">
      <span className="eyebrow">Voir le produit</span>
      <h2>Un outil complet, pensé pour votre activité.</h2>
      <p>Découvrez Kivli à travers ses espaces clés. Chaque écran a une fonction claire ; chaque fonction sert votre fidélité.</p>
    </div>
  );
}

export function ProductShowcase() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({ target: trackRef, offset: ["start start", "end end"] });
  const activeFloat = useTransform(scrollYProgress, [0, 1], [0, SCREENS.length - 1]);
  useMotionValueEvent(activeFloat, "change", (value) => {
    setActive(Math.min(SCREENS.length - 1, Math.max(0, Math.round(value))));
  });

  function goToScreen(index: number) {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const targetY = window.scrollY + rect.top + index * window.innerHeight + 1;
    window.scrollTo({ top: targetY, behavior: reduceMotion ? "auto" : "smooth" });
  }

  return (
    <div id="produit">
      <section className="land-showcase land-showcase-desktop" ref={trackRef} style={{ height: `${SCREENS.length * 100}vh` }}>
        <div className="land-showcase-sticky">
          <ShowcaseHead />
          <div className="shell land-showcase-scene">
            <nav className="land-showcase-nav" aria-label="Écrans du produit Kivli">
              {SCREENS.map((screen, index) => (
                <button key={screen.n} type="button" className={index === active ? "active" : ""} onClick={() => goToScreen(index)}>
                  <b>{screen.n}</b>{screen.label}
                </button>
              ))}
            </nav>
            <div className="land-showcase-frame">
              {SCREENS.map((screen, index) => (
                <img key={screen.n} src={screen.src} alt={screen.alt} className={index === active ? "active" : ""} loading={index === 0 ? "eager" : "lazy"} decoding="async" />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="land-showcase land-showcase-mobile">
        <ShowcaseHead />
        <div className="shell land-showcase-stack">
          {SCREENS.map((screen) => (
            <motion.figure
              key={screen.n}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <span className="land-step-badge">{screen.n}</span>
              <img src={screen.src} alt={screen.alt} loading="lazy" decoding="async" />
              <figcaption>{screen.label}</figcaption>
            </motion.figure>
          ))}
        </div>
      </section>
    </div>
  );
}
