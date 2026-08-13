import type { Metadata } from "next";
import { MerchantLogin } from "../../components/MerchantLogin";

export const metadata: Metadata = { title: "Connexion commerçant" };

export default function MerchantPage() {
  return <MerchantLogin />;
}
