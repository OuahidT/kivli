import { readJson } from "@/lib/http";

export async function POST(request: Request) {
  const body = await readJson<{ logs?: unknown[] }>(request);
  const count = Array.isArray(body?.logs) ? Math.min(body.logs.length, 100) : 0;
  if (count) console.info(`Apple Wallet a transmis ${count} entrée${count > 1 ? "s" : ""} de diagnostic.`);
  return new Response(null, { status: 200 });
}

