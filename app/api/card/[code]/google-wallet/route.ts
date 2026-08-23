import { getCardByCode } from "../../../../../lib/data";
import { createGoogleWalletSaveUrl, googleWalletConfigured } from "../../../../../lib/google-wallet";
import { isSameOrigin, jsonError, safeApiError } from "../../../../../lib/http";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    if (!isSameOrigin(request)) return jsonError("Origine de la requête refusée.", 403);
    if (!googleWalletConfigured()) return jsonError("Google Wallet n’est pas encore disponible.", 503);
    const { code } = await context.params;
    const card = await getCardByCode(code.toUpperCase());
    if (!card) return jsonError("Carte introuvable.", 404);
    return Response.json({ url: await createGoogleWalletSaveUrl(card) });
  } catch (error) {
    return safeApiError(error);
  }
}
