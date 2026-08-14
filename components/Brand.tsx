import Link from "next/link";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" prefetch={false} className={`brand ${light ? "brand-light" : ""}`} aria-label="Kivli — accueil">
      <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
      <span>Kivli</span>
    </Link>
  );
}
