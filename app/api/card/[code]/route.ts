import { getCardByCode } from "../../../../lib/data";
import { jsonError, safeApiError } from "../../../../lib/http";
import { toWalletPassPayload } from "../../../../lib/wallet";
import { googleWalletConfigured } from "../../../../lib/google-wallet";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const card = await getCardByCode(code.toUpperCase());
    return card
      ? Response.json({ card, walletPayload: toWalletPassPayload(card), googleWalletEnabled: googleWalletConfigured() })
      : jsonError("Carte introuvable.", 404);
  } catch (error) {
    return safeApiError(error);
  }
}
