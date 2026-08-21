import { getCardByCode } from "../../../../../lib/data";
import { createGoogleWalletSaveUrl, googleWalletConfigured } from "../../../../../lib/google-wallet";
import { jsonError, safeApiError } from "../../../../../lib/http";

export async function POST(_request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    if (!googleWalletConfigured()) return jsonError("Google Wallet n’est pas encore disponible.", 503);
    const { code } = await context.params;
    const card = await getCardByCode(code.toUpperCase());
    if (!card) return jsonError("Carte introuvable.", 404);
    return Response.json({ url: await createGoogleWalletSaveUrl(card) });
  } catch (error) {
    return safeApiError(error);
  }
}
