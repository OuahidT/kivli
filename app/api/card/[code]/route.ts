import { getCardByCode } from "../../../../lib/data";
import { jsonError, safeApiError } from "../../../../lib/http";
import { toWalletPassPayload } from "../../../../lib/wallet";
import { googleWalletConfigured } from "../../../../lib/google-wallet";
import { appleWalletConfigured } from "../../../../lib/apple-wallet";
import type { PublicCardData } from "../../../../lib/types";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const card = await getCardByCode(code.toUpperCase());
    if (!card) return jsonError("Carte introuvable.", 404);
    const publicCard: PublicCardData = {
      businessName: card.businessName,
      accentColor: card.accentColor,
      name: card.name,
      goal: card.goal,
      rewardText: card.rewardText,
      terms: card.terms,
      earningMode: card.earningMode,
      spendAmountCents: card.spendAmountCents,
      code: card.code,
      firstName: card.firstName,
      points: card.points,
      totalPoints: card.totalPoints,
      availableRewards: card.availableRewards,
      marketingConsent: card.marketingConsent,
      rewardTiers: card.rewardTiers.map((tier) => ({
        threshold: tier.threshold,
        rewardText: tier.rewardText,
        sortOrder: tier.sortOrder,
      })),
      availableRewardItems: card.availableRewardItems.map((reward) => ({
        rewardText: reward.rewardText,
        threshold: reward.threshold,
      })),
    };
    return Response.json({
      card: publicCard,
      walletPayload: toWalletPassPayload(card),
      googleWalletEnabled: googleWalletConfigured(),
      appleWalletEnabled: appleWalletConfigured(),
    });
  } catch (error) {
    return safeApiError(error);
  }
}
