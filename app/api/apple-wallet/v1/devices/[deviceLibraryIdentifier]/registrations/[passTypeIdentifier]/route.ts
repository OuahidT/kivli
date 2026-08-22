import { updatedAppleWalletSerials } from "@/lib/apple-wallet";
import { cleanText } from "@/lib/http";

export async function GET(request: Request, context: { params: Promise<{ deviceLibraryIdentifier: string; passTypeIdentifier: string }> }) {
  const parameters = await context.params;
  const sinceValue = new URL(request.url).searchParams.get("passesUpdatedSince");
  const since = sinceValue && /^\d+$/.test(sinceValue) ? Number(sinceValue) : null;
  const result = await updatedAppleWalletSerials(cleanText(parameters.deviceLibraryIdentifier, 240), parameters.passTypeIdentifier, since);
  if (!result) return new Response(null, { status: 404 });
  if (!result.serialNumbers.length) return new Response(null, { status: 204 });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

