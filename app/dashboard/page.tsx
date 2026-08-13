import type { Metadata } from "next";
import { DashboardApp } from "../../components/DashboardApp";

export const metadata: Metadata = { title: "Tableau de bord" };

export default function DashboardPage() {
  return <DashboardApp />;
}
