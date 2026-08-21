import { JoinProgram } from "../../../components/JoinProgram";

export default async function JoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <JoinProgram slug={slug} />;
}

