export function Brand({ light = false }: { light?: boolean }) {
  return (
    <a href="/" className={`brand ${light ? "brand-light" : ""}`} aria-label="Kivli — accueil">
      <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
      <span>Kivli</span>
    </a>
  );
}
