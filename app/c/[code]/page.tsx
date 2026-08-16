import type { Metadata } from "next";
import { CustomerCard } from "../../../components/CustomerCard";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return {
    title: "Ma carte fidélité",
    description: "Ma carte de fidélité digitale Kivli.",
    manifest: `/api/card/${encodeURIComponent(code.toUpperCase())}/manifest`,
    robots: { index: false, follow: false },
  };
}

export default async function CardPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <CustomerCard code={code.toUpperCase()} />;
}
