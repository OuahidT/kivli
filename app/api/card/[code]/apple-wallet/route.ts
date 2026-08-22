import { appleWalletConfigured, createAppleStoreCardSource, createSignedAppleWalletPass, rememberAppleWalletPass } from "@/lib/apple-wallet";
import { getCardByCode } from "@/lib/data";
import { jsonError, safeApiError } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    if (!appleWalletConfigured()) return jsonError("Apple Wallet sera activé après la finalisation du certificat Apple.", 503);
    const { code } = await context.params;
    const card = await getCardByCode(code.toUpperCase());
    if (!card) return jsonError("Carte introuvable.", 404);
    const source = await createAppleStoreCardSource(card);
    const pass = await createSignedAppleWalletPass(card);
    await rememberAppleWalletPass(card, source);
    return new Response(pass as BodyInit, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="kivli-${card.code}.pkpass"`,
        "Content-Type": "application/vnd.apple.pkpass",
      },
    });
  } catch (error) {
    return safeApiError(error);
  }
}

