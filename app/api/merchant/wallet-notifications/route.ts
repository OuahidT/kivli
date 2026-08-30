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
import { syncMerchantWalletsSafely } from "../../../../lib/wallet-sync";
import { AUTOMATED_WALLET_MESSAGE_MAX, NEARBY_RELEVANT_TEXT_MAX } from "../../../../lib/wallet-notification-content";
import { ensureSchema, getD1 } from "../../../../db";

type NotificationPayload = {
  action?: "settings" | "send" | "geocode";
  nearRewardEnabled?: boolean;
  nearRewardThreshold?: number;
  reactivationEnabled?: boolean;
  reactivationDays?: number;
  nearRewardMessage?: string;
  reactivationMessage?: string;
  nearbyEnabled?: boolean;
  nearbyAddress?: string | null;
  nearbyLatitude?: number | null;
  nearbyLongitude?: number | null;
  nearbyRelevantText?: string;
  nearbyLocationConfirmed?: boolean;
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
    if (payload?.action === "geocode") {
      const address = cleanText(payload.nearbyAddress, 200);
      if (address.length < 5 || /[<>]/.test(address)) return jsonError("Saisissez une adresse complète.");
      await ensureSchema();
      const lock = await getD1().prepare(`UPDATE wallet_geocoding_rate_limit
        SET next_allowed_at = datetime('now', '+2 seconds')
        WHERE id = 1 AND datetime(next_allowed_at) <= CURRENT_TIMESTAMP
        RETURNING id`).first();
      if (!lock) return jsonError("La recherche est déjà en cours. Patientez un instant puis réessayez.", 429);
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "3");
      url.searchParams.set("countrycodes", "fr");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("q", address);
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Kivli/1.0 (contact@kivli.fr)",
          "Accept-Language": "fr",
          Referer: "https://kivli.fr/",
        },
      });
      if (!response.ok) return jsonError("La recherche d’adresse est momentanément indisponible.", 503);
      const rows = await response.json() as Array<{ display_name?: string; lat?: string; lon?: string }>;
      const results = rows.map((row) => ({
        address: cleanText(row.display_name, 200),
        latitude: Number(row.lat),
        longitude: Number(row.lon),
      })).filter((row) => row.address && Number.isFinite(row.latitude) && Number.isFinite(row.longitude));
      return Response.json({ results });
    }
    if (payload?.action === "settings") {
      const before = await notificationSettingsForMerchant(merchant.id);
      const settings = await updateNotificationSettings(merchant.id, {
        nearRewardEnabled: payload.nearRewardEnabled === true,
        nearRewardThreshold: Number(payload.nearRewardThreshold),
        reactivationEnabled: payload.reactivationEnabled === true,
        reactivationDays: Number(payload.reactivationDays),
        nearRewardMessage: cleanText(payload.nearRewardMessage, AUTOMATED_WALLET_MESSAGE_MAX + 1),
        reactivationMessage: cleanText(payload.reactivationMessage, AUTOMATED_WALLET_MESSAGE_MAX + 1),
        nearbyEnabled: payload.nearbyEnabled === true,
        nearbyAddress: payload.nearbyAddress == null ? null : cleanText(payload.nearbyAddress, 201),
        nearbyLatitude: payload.nearbyLatitude == null ? null : Number(payload.nearbyLatitude),
        nearbyLongitude: payload.nearbyLongitude == null ? null : Number(payload.nearbyLongitude),
        nearbyRelevantText: cleanText(payload.nearbyRelevantText, NEARBY_RELEVANT_TEXT_MAX + 1),
        nearbyLocationConfirmed: payload.nearbyLocationConfirmed === true,
      });
      const locationChanged = before.nearbyEnabled !== settings.nearbyEnabled
        || before.nearbyAddress !== settings.nearbyAddress
        || before.nearbyLatitude !== settings.nearbyLatitude
        || before.nearbyLongitude !== settings.nearbyLongitude
        || before.nearbyRelevantText !== settings.nearbyRelevantText;
      if (locationChanged) waitUntil(syncMerchantWalletsSafely(merchant.id));
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
