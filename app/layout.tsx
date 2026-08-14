import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { PwaRegister } from "../components/PwaRegister";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const title = "Kivli — Créez une habitude, pas juste une carte";
  const description = "Carte digitale, scan, récompenses et suivi client : Kivli simplifie la fidélité pour tous les commerces et professionnels.";
  return {
    metadataBase: base,
    title: { default: title, template: "%s · Kivli" },
    description,
    manifest: "/manifest.webmanifest",
    icons: { icon: "/favicon.svg", apple: "/icon.svg" },
    openGraph: { title, description, type: "website", images: [{ url: new URL("/og.png", base), width: 1536, height: 1024, alt: "Kivli — Créez une habitude, pas juste une carte" }] },
    twitter: { card: "summary_large_image", title, description, images: [new URL("/og.png", base)] },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f3f0e8" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body className={`${geistSans.variable} ${geistMono.variable}`}><PwaRegister />{children}</body></html>;
}
