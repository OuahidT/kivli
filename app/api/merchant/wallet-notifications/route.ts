import { waitUntil } from "cloudflare:workers";
import { getMerchant, isOwner } from "../../../../lib/auth";
import { cleanText, isSameOrigin, jsonError, readJson, safeApiError } from "../../../../lib/http";
import {
  createMarketingCampaign,
  notificationSettingsForMerchant,
  processMarketingCampaign,
  updateNotificationSettings,
  WalletCampaignCooldownError,
} from "../../../../lib/wallet-notifications";
import { requireCurrentPilotAcceptance } from "../../../../lib/pilot-acceptance";

type NotificationPayload = {
  action?: "settings" | "send";
  nearRewardEnabled?: boolean;
  nearRewardThreshold?: number;
  reactivationEnabled?: boolean;
  reactivationDays?: number;
  title?: string;
  message?: string;
};

export async function GET(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    if (!isOwner(merchant)) return jsonError("Cet espace est réservé au propriétaire.", 403);
    const acceptanceError = await requireCurrentPilotAcceptance(merchant.id);
    if (acceptanceError) return acceptanceError;
    return Response.json(await notificationSettingsForMerchant(merchant.id));
  } catch (error) {
    return safeApiError(error);
  }
}
export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Origine de la requête refusée.", 403);
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    if (!isOwner(merchant)) return jsonError("Cet espace est réservé au propriétaire.", 403);
    const acceptanceError = await requireCurrentPilotAcceptance(merchant.id);
    if (acceptanceError) return acceptanceError;
    const payload = await readJson<NotificationPayload>(request);
    if (payload?.action === "settings") {
      const settings = await updateNotificationSettings(merchant.id, {
        nearRewardEnabled: payload.nearRewardEnabled === true,
        nearRewardThreshold: Number(payload.nearRewardThreshold),
        reactivationEnabled: payload.reactivationEnabled === true,
        reactivationDays: Number(payload.reactivationDays),
      });
      return Response.json(settings);
    }
    if (payload?.action === "send") {
      const title = cleanText(payload.title, 60);
      const message = cleanText(payload.message, 240);
      if (title.length < 2) return jsonError("Ajoutez un titre court à la notification.");
      if (message.length < 3) return jsonError("Ajoutez un message à la notification.");
      try {
        const campaign = await createMarketingCampaign(merchant.id, title, message);
        waitUntil(processMarketingCampaign(campaign.campaignId));
        return Response.json({ ok: true, ...campaign });
      } catch (error) {
        if (error instanceof WalletCampaignCooldownError) {
          return Response.json({ error: error.message, nextAllowedAt: error.nextAllowedAt }, { status: 429 });
        }
        throw error;
      }
    }
    return jsonError("Action inconnue.");
  } catch (error) {
    return safeApiError(error);
  }
}
