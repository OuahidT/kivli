import Link from "next/link";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className={`brand ${light ? "brand-light" : ""}`} aria-label="Tampo — accueil">
      <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
      <span>Tampo</span>
    </Link>
  );
}
