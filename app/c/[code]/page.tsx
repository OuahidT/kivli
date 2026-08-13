import { CustomerCard } from "../../../components/CustomerCard";

export default async function CardPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <CustomerCard code={code.toUpperCase()} />;
}
