import { ensureSchema, getD1, queryAll, queryFirst } from "../db";
import { refreshOutdatedAppleWalletPasses, sendAppleWalletNotification } from "./apple-wallet";
import { getCardByCode } from "./data";
import { sendGoogleWalletNotification } from "./google-wallet";
import { makeId } from "./ids";
import { merchantHasCurrentPilotAcceptance } from "./pilot-acceptance";
import { retryWalletInvalidationJobs } from "./customer-deletion";
import {
  AUTOMATED_WALLET_MESSAGE_MAX,
  NEARBY_DEFAULT_TEXT,
  NEARBY_RELEVANT_TEXT_MAX,
  NEAR_REWARD_DEFAULT_MESSAGE,
  REACTIVATION_DEFAULT_MESSAGE,
  renderWalletMessage,
  validateWalletText,
} from "./wallet-notification-content";
import {
  MARKETING_CAMPAIGN_INSERT_SQL,
  MARKETING_CAMPAIGN_QUOTA_SQL,
  marketingCampaignQuotaFromRow,
  validateCampaignRequestKey,
} from "./wallet-campaign-quota";

export type WalletNotificationSettings = {
  nearRewardEnabled: number;
  nearRewardThreshold: number;
  reactivationEnabled: number;
  reactivationDays: number;
  nearRewardMessage: string;
  reactivationMessage: string;
  nearbyEnabled: number;
  nearbyAddress: string | null;
  nearbyLatitude: number | null;
  nearbyLongitude: number | null;
  nearbyRelevantText: string;
  nearbyLocationConfirmedAt: string | null;
  nextMarketingAt: string | null;
  latestCampaignAt: string | null;
  marketingCampaignsUsed: number;
  marketingCampaignsRemaining: number;
  marketingCampaignLimit: number;
};

type NotificationPlatform = "apple" | "google";
type NotificationType = "near_reward" | "reactivation" | "marketing";

type NotificationTarget = {
  merchantId: string;
  customerId: string;
  membershipId: string;
  programId: string;
  code: string;
};

type NotificationEvent = {
  type: NotificationType;
  cycleKey: string;
  title: string;
  message: string;
  campaignId?: string;
};

type DeliveryRow = {
  id: string;
  status: string;
  attemptCount: number;
  nextAttemptAt: string;
  platform: NotificationPlatform;
  title: string;
  message: string;
  code?: string;
};

export class WalletCampaignLimitError extends Error {
  constructor(public nextAllowedAt: string) {
    super("La limite de 4 campagnes sur 7 jours est atteinte.");
  }
}

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return Number.isNaN(Date.parse(normalized)) ? null : normalized;
}

export async function notificationSettingsForMerchant(merchantId: string): Promise<WalletNotificationSettings> {
  await ensureSchema();
  await getD1().prepare(`INSERT OR IGNORE INTO wallet_notification_settings (merchant_id) VALUES (?)`).bind(merchantId).run();
  const row = await queryFirst<WalletNotificationSettings>(`SELECT
    s.near_reward_enabled AS nearRewardEnabled,
    s.near_reward_threshold AS nearRewardThreshold,
    s.reactivation_enabled AS reactivationEnabled,
    s.reactivation_days AS reactivationDays,
    s.near_reward_message AS nearRewardMessage,
    s.reactivation_message AS reactivationMessage,
    s.nearby_enabled AS nearbyEnabled,
    s.nearby_address AS nearbyAddress,
    s.nearby_latitude AS nearbyLatitude,
    s.nearby_longitude AS nearbyLongitude,
    s.nearby_relevant_text AS nearbyRelevantText,
    s.nearby_location_confirmed_at AS nearbyLocationConfirmedAt,
    (SELECT MAX(c.created_at) FROM wallet_notification_campaigns c WHERE c.merchant_id = s.merchant_id) AS latestCampaignAt
    FROM wallet_notification_settings s
    WHERE s.merchant_id = ?`, merchantId);
  const settings = row ?? {
    nearRewardEnabled: 0,
    nearRewardThreshold: 2,
    reactivationEnabled: 0,
    reactivationDays: 45,
    nearRewardMessage: NEAR_REWARD_DEFAULT_MESSAGE,
    reactivationMessage: REACTIVATION_DEFAULT_MESSAGE,
    nearbyEnabled: 0,
    nearbyAddress: null,
    nearbyLatitude: null,
    nearbyLongitude: null,
    nearbyRelevantText: NEARBY_DEFAULT_TEXT,
    nearbyLocationConfirmedAt: null,
    latestCampaignAt: null,
  };
  const quota = await marketingCampaignQuotaForMerchant(merchantId);
  return {
    ...settings,
    nextMarketingAt: quota.nextAllowedAt,
    marketingCampaignsUsed: quota.used,
    marketingCampaignsRemaining: quota.remaining,
    marketingCampaignLimit: quota.limit,
  };
}

export async function marketingCampaignQuotaForMerchant(merchantId: string) {
  const row = await queryFirst<{ used: number; oldestCreatedAt: string | null }>(MARKETING_CAMPAIGN_QUOTA_SQL, merchantId);
  return marketingCampaignQuotaFromRow(row);
}

export async function updateNotificationSettings(
  merchantId: string,
  values: {
    nearRewardEnabled: boolean;
    nearRewardThreshold: number;
    nearRewardMessage: string;
    reactivationEnabled: boolean;
    reactivationDays: number;
    reactivationMessage: string;
    nearbyEnabled: boolean;
    nearbyAddress: string | null;
    nearbyLatitude: number | null;
    nearbyLongitude: number | null;
    nearbyRelevantText: string;
    nearbyLocationConfirmed: boolean;
  },
) {
  const threshold = Math.round(values.nearRewardThreshold);
  const days = Math.round(values.reactivationDays);
  if (threshold < 1 || threshold > 1000) throw new Error("Le seuil doit être compris entre 1 et 1 000.");
  if (days < 7 || days > 365) throw new Error("Le délai d’inactivité doit être compris entre 7 et 365 jours.");
  const nearRewardMessage = validateWalletText(values.nearRewardMessage, AUTOMATED_WALLET_MESSAGE_MAX, "Le message de proximité d’une récompense");
  const reactivationMessage = validateWalletText(values.reactivationMessage, AUTOMATED_WALLET_MESSAGE_MAX, "Le message de réactivation");
  const nearbyRelevantText = validateWalletText(values.nearbyRelevantText, NEARBY_RELEVANT_TEXT_MAX, "Le texte de proximité");
  const nearbyAddress = typeof values.nearbyAddress === "string" ? values.nearbyAddress.trim().replace(/\s{2,}/g, " ") : null;
  const latitude = values.nearbyLatitude == null ? null : Number(values.nearbyLatitude);
  const longitude = values.nearbyLongitude == null ? null : Number(values.nearbyLongitude);
  if (nearbyAddress && (nearbyAddress.length < 5 || nearbyAddress.length > 200 || /[<>]/.test(nearbyAddress))) {
    throw new Error("L’adresse de l’établissement est invalide.");
  }
  if (latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) throw new Error("La latitude est invalide.");
  if (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) throw new Error("La longitude est invalide.");
  if (values.nearbyEnabled && (!nearbyAddress || latitude == null || longitude == null || !values.nearbyLocationConfirmed)) {
    throw new Error("Confirmez l’adresse et l’emplacement avant d’activer l’affichage à proximité.");
  }
  await ensureSchema();
  await getD1().prepare(`INSERT INTO wallet_notification_settings
    (merchant_id, near_reward_enabled, near_reward_threshold, near_reward_message,
     reactivation_enabled, reactivation_days, reactivation_message,
     nearby_enabled, nearby_address, nearby_latitude, nearby_longitude,
     nearby_relevant_text, nearby_location_confirmed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END)
    ON CONFLICT(merchant_id) DO UPDATE SET
      near_reward_enabled = excluded.near_reward_enabled,
      near_reward_threshold = excluded.near_reward_threshold,
      near_reward_message = excluded.near_reward_message,
      reactivation_enabled = excluded.reactivation_enabled,
      reactivation_days = excluded.reactivation_days,
      reactivation_message = excluded.reactivation_message,
      nearby_enabled = excluded.nearby_enabled,
      nearby_address = excluded.nearby_address,
      nearby_latitude = excluded.nearby_latitude,
      nearby_longitude = excluded.nearby_longitude,
      nearby_relevant_text = excluded.nearby_relevant_text,
      nearby_location_confirmed_at = CASE WHEN excluded.nearby_enabled = 1 THEN CURRENT_TIMESTAMP ELSE wallet_notification_settings.nearby_location_confirmed_at END,
      updated_at = CURRENT_TIMESTAMP`)
    .bind(
      merchantId, values.nearRewardEnabled ? 1 : 0, threshold, nearRewardMessage,
      values.reactivationEnabled ? 1 : 0, days, reactivationMessage,
      values.nearbyEnabled ? 1 : 0, nearbyAddress, latitude, longitude,
      nearbyRelevantText, values.nearbyEnabled && values.nearbyLocationConfirmed,
    ).run();
  return notificationSettingsForMerchant(merchantId);
}

async function createDelivery(target: NotificationTarget, event: NotificationEvent, platform: NotificationPlatform) {
  await ensureSchema();
  const idempotencyKey = `${event.type}:${event.cycleKey}:${target.membershipId}:${platform}`;
  const id = makeId("wnd");
  const db = getD1();
  await db.prepare(`INSERT OR IGNORE INTO wallet_notification_deliveries
    (id, idempotency_key, merchant_id, customer_id, membership_id, program_id,
     campaign_id, notification_type, cycle_key, platform, title, message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id,
      idempotencyKey,
      target.merchantId,
      target.customerId,
      target.membershipId,
      target.programId,
      event.campaignId ?? null,
      event.type,
      event.cycleKey,
      platform,
      event.title,
      event.message,
    ).run();
  return queryFirst<DeliveryRow>(`SELECT id, status, attempt_count AS attemptCount,
    next_attempt_at AS nextAttemptAt, platform, title, message
    FROM wallet_notification_deliveries WHERE idempotency_key = ?`, idempotencyKey);
}

async function claimDelivery(delivery: DeliveryRow) {
  if (["sent", "skipped", "processing"].includes(delivery.status)) return false;
  if (delivery.attemptCount >= 3) return false;
  const nextAttempt = validDate(delivery.nextAttemptAt);
  if (nextAttempt && Date.parse(nextAttempt) > Date.now()) return false;
  const recent = await queryFirst<{ count: number }>(`SELECT COUNT(*) AS count
    FROM wallet_notification_deliveries
    WHERE membership_id = (SELECT membership_id FROM wallet_notification_deliveries WHERE id = ?)
      AND platform = ? AND status = 'sent' AND created_at >= datetime('now', '-24 hours')`, delivery.id, delivery.platform);
  if ((recent?.count ?? 0) >= 3) {
    await getD1().prepare(`UPDATE wallet_notification_deliveries SET status = 'failed',
      error_message = 'Limite anti-spam de 3 notifications sur 24 heures.',
      next_attempt_at = datetime('now', '+24 hours'), updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(delivery.id).run();
    return false;
  }
  const result = await getD1().prepare(`UPDATE wallet_notification_deliveries
    SET status = 'processing', attempt_count = attempt_count + 1,
      error_message = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status IN ('pending', 'failed') AND attempt_count < 3
      AND datetime(next_attempt_at) <= CURRENT_TIMESTAMP`).bind(delivery.id).run();
  return Number(result.meta.changes ?? 0) > 0;
}

async function finishDelivery(deliveryId: string, outcome: { active: boolean; sent: boolean; error?: string }) {
  if (!outcome.active) {
    await getD1().prepare(`UPDATE wallet_notification_deliveries SET status = 'skipped',
      error_message = 'Aucune carte Wallet active sur cette plateforme.', updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(deliveryId).run();
    return "skipped" as const;
  }
  if (outcome.sent) {
    await getD1().prepare(`UPDATE wallet_notification_deliveries SET status = 'sent', sent_at = CURRENT_TIMESTAMP,
      error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(deliveryId).run();
    return "sent" as const;
  }
  const attempt = await queryFirst<{ attemptCount: number }>(
    "SELECT attempt_count AS attemptCount FROM wallet_notification_deliveries WHERE id = ?",
    deliveryId,
  );
  const delayMinutes = Math.min(60, 5 * (2 ** Math.max(0, (attempt?.attemptCount ?? 1) - 1)));
  await getD1().prepare(`UPDATE wallet_notification_deliveries SET status = 'failed',
    error_message = ?, next_attempt_at = datetime('now', ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(outcome.error ?? "Échec Wallet inconnu.", `+${delayMinutes} minutes`, deliveryId).run();
  return "failed" as const;
}

async function processDelivery(delivery: DeliveryRow, code: string) {
  if (!(await claimDelivery(delivery))) return delivery.status;
  const card = await getCardByCode(code.toUpperCase());
  if (!card) {
    await getD1().prepare(`UPDATE wallet_notification_deliveries SET status = 'skipped',
      error_message = 'Carte Kivli introuvable.', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(delivery.id).run();
    return "skipped";
  }
  try {
    const outcome = delivery.platform === "apple"
      ? await sendAppleWalletNotification(card, delivery.id)
      : await sendGoogleWalletNotification(card, delivery.id, delivery.title, delivery.message);
    return finishDelivery(delivery.id, outcome);
  } catch (error) {
    return finishDelivery(delivery.id, {
      active: true,
      sent: false,
      error: error instanceof Error ? error.message : "Erreur Wallet inconnue.",
    });
  }
}

async function dispatchNotification(target: NotificationTarget, event: NotificationEvent) {
  const deliveries = await Promise.all([
    createDelivery(target, event, "apple"),
    createDelivery(target, event, "google"),
  ]);
  return Promise.all(deliveries.filter((delivery): delivery is DeliveryRow => Boolean(delivery))
    .map((delivery) => processDelivery(delivery, target.code)));
}

type NearRewardCandidate = NotificationTarget & {
  businessName: string;
  earningMode: "visits" | "spend";
  points: number;
  totalPoints: number;
  goal: number;
  nextTierId: string;
  nextThreshold: number;
  notificationMessage: string;
};

async function nearRewardCandidates(code?: string) {
  return queryAll<NearRewardCandidate>(`SELECT
    mb.merchant_id AS merchantId, mb.customer_id AS customerId, mb.id AS membershipId,
    mb.program_id AS programId, mb.code, m.business_name AS businessName,
    p.earning_mode AS earningMode, mb.points, mb.total_points AS totalPoints, p.goal,
    s.near_reward_message AS notificationMessage,
    (SELECT t.id FROM program_reward_tiers t WHERE t.program_id = p.id AND t.active = 1
      AND t.threshold > mb.points ORDER BY t.threshold LIMIT 1) AS nextTierId,
    (SELECT t.threshold FROM program_reward_tiers t WHERE t.program_id = p.id AND t.active = 1
      AND t.threshold > mb.points ORDER BY t.threshold LIMIT 1) AS nextThreshold
    FROM wallet_notification_settings s
    JOIN merchants m ON m.id = s.merchant_id
    JOIN programs p ON p.merchant_id = s.merchant_id AND p.active = 1
    JOIN memberships mb ON mb.program_id = p.id
    WHERE s.near_reward_enabled = 1
      AND mb.deleted_at IS NULL
      AND (? IS NULL OR mb.code = ?)
      AND EXISTS (SELECT 1 FROM program_reward_tiers t WHERE t.program_id = p.id AND t.active = 1
        AND t.threshold > mb.points AND t.threshold - mb.points <= s.near_reward_threshold)
    ORDER BY mb.updated_at LIMIT 500`, code ?? null, code ?? null);
}

export async function evaluateNearRewardNotifications(code?: string) {
  const candidates = await nearRewardCandidates(code?.toUpperCase());
  let processed = 0;
  for (const candidate of candidates) {
    if (!(await merchantHasCurrentPilotAcceptance(candidate.merchantId))) continue;
    const remaining = candidate.nextThreshold - candidate.points;
    if (remaining < 1) continue;
    const cycle = candidate.earningMode === "visits"
      ? Math.floor(candidate.totalPoints / Math.max(1, candidate.goal))
      : Math.floor(Math.max(0, candidate.totalPoints - candidate.points) / Math.max(1, candidate.nextThreshold));
    await dispatchNotification(candidate, {
      type: "near_reward",
      cycleKey: `${candidate.nextTierId}:${cycle}`,
      title: candidate.businessName,
      message: renderWalletMessage(candidate.notificationMessage || NEAR_REWARD_DEFAULT_MESSAGE, {
        remaining,
        unit: candidate.earningMode === "visits" ? `passage${remaining > 1 ? "s" : ""}` : `point${remaining > 1 ? "s" : ""}`,
        businessName: candidate.businessName,
      }),
    });
    processed += 1;
  }
  return processed;
}

type ReactivationCandidate = NotificationTarget & {
  businessName: string;
  lastActivity: string;
  notificationMessage: string;
  reactivationDays: number;
};

export async function evaluateReactivationNotifications() {
  const candidates = await queryAll<ReactivationCandidate>(`SELECT
    mb.merchant_id AS merchantId, mb.customer_id AS customerId, mb.id AS membershipId,
    mb.program_id AS programId, mb.code, m.business_name AS businessName,
    s.reactivation_message AS notificationMessage, s.reactivation_days AS reactivationDays,
    COALESCE((SELECT MAX(st.created_at) FROM stamps st WHERE st.membership_id = mb.id
      AND st.reason IN ('visit', 'purchase') AND st.reversed_at IS NULL), mb.created_at) AS lastActivity
    FROM wallet_notification_settings s
    JOIN merchants m ON m.id = s.merchant_id
    JOIN programs p ON p.merchant_id = s.merchant_id AND p.active = 1
    JOIN memberships mb ON mb.program_id = p.id
    WHERE s.reactivation_enabled = 1
      AND mb.deleted_at IS NULL
      AND datetime(COALESCE((SELECT MAX(st.created_at) FROM stamps st WHERE st.membership_id = mb.id
        AND st.reason IN ('visit', 'purchase') AND st.reversed_at IS NULL), mb.created_at))
        <= datetime('now', '-' || s.reactivation_days || ' days')
    ORDER BY lastActivity LIMIT 500`);
  let processed = 0;
  for (const candidate of candidates) {
    if (!(await merchantHasCurrentPilotAcceptance(candidate.merchantId))) continue;
    await dispatchNotification(candidate, {
      type: "reactivation",
      cycleKey: candidate.lastActivity,
      title: candidate.businessName,
      message: renderWalletMessage(candidate.notificationMessage || REACTIVATION_DEFAULT_MESSAGE, {
        businessName: candidate.businessName,
        days: candidate.reactivationDays,
      }),
    });
    processed += 1;
  }
  return processed;
}

async function campaignTargets(merchantId: string, programId: string) {
  return queryAll<NotificationTarget>(`SELECT mb.merchant_id AS merchantId, mb.customer_id AS customerId,
    mb.id AS membershipId, mb.program_id AS programId, mb.code
    FROM memberships mb WHERE mb.merchant_id = ? AND mb.program_id = ? AND mb.deleted_at IS NULL`, merchantId, programId);
}

export async function createMarketingCampaign(
  merchantId: string,
  title: string,
  message: string,
  requestKey: string,
) {
  await ensureSchema();
  const validRequestKey = validateCampaignRequestKey(requestKey);
  const program = await queryFirst<{ id: string }>("SELECT id FROM programs WHERE merchant_id = ? AND active = 1", merchantId);
  if (!program) throw new Error("Créez d’abord votre programme de fidélité.");
  const db = getD1();
  const existing = await queryFirst<{ id: string; programId: string }>(`SELECT id, program_id AS programId
    FROM wallet_notification_campaigns WHERE merchant_id = ? AND request_key = ?`, merchantId, validRequestKey);
  if (existing) {
    const quota = await marketingCampaignQuotaForMerchant(merchantId);
    return { campaignId: existing.id, programId: existing.programId, ...quota, reused: true };
  }
  const campaignId = makeId("wnc");
  const insertion = await db.prepare(MARKETING_CAMPAIGN_INSERT_SQL)
    .bind(campaignId, merchantId, program.id, title, message, validRequestKey, merchantId).run();
  if (Number(insertion.meta.changes ?? 0) === 0) {
    const concurrentRetry = await queryFirst<{ id: string; programId: string }>(`SELECT id, program_id AS programId
      FROM wallet_notification_campaigns WHERE merchant_id = ? AND request_key = ?`, merchantId, validRequestKey);
    if (concurrentRetry) {
      const quota = await marketingCampaignQuotaForMerchant(merchantId);
      return { campaignId: concurrentRetry.id, programId: concurrentRetry.programId, ...quota, reused: true };
    }
    const quota = await marketingCampaignQuotaForMerchant(merchantId);
    throw new WalletCampaignLimitError(quota.nextAllowedAt ?? "");
  }
  const quota = await marketingCampaignQuotaForMerchant(merchantId);
  return { campaignId, programId: program.id, ...quota, reused: false };
}

export async function processMarketingCampaign(campaignId: string) {
  const campaign = await queryFirst<{ id: string; merchantId: string; programId: string; title: string; message: string }>(`SELECT
    id, merchant_id AS merchantId, program_id AS programId, title, message
    FROM wallet_notification_campaigns WHERE id = ?`, campaignId);
  if (!campaign) return;
  if (!(await merchantHasCurrentPilotAcceptance(campaign.merchantId))) return;
  const targets = await campaignTargets(campaign.merchantId, campaign.programId);
  for (let index = 0; index < targets.length; index += 10) {
    await Promise.allSettled(targets.slice(index, index + 10).map((target) => dispatchNotification(target, {
      type: "marketing",
      cycleKey: campaign.id,
      campaignId: campaign.id,
      title: campaign.title,
      message: campaign.message,
    })));
  }
  const counts = await queryFirst<{ sent: number; failed: number; skipped: number }>(`SELECT
    SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
    SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped
    FROM wallet_notification_deliveries WHERE campaign_id = ?`, campaign.id);
  const status = (counts?.failed ?? 0) > 0 ? ((counts?.sent ?? 0) > 0 ? "partial" : "failed") : "sent";
  await getD1().prepare(`UPDATE wallet_notification_campaigns SET status = ?, target_count = ?,
    sent_count = ?, failed_count = ?, skipped_count = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(status, targets.length, counts?.sent ?? 0, counts?.failed ?? 0, counts?.skipped ?? 0, campaign.id).run();
}

export async function retryFailedWalletNotifications() {
  const rows = await queryAll<DeliveryRow & { code: string }>(`SELECT d.id, d.status,
    d.attempt_count AS attemptCount, d.next_attempt_at AS nextAttemptAt,
    d.platform, d.title, d.message, mb.code
    FROM wallet_notification_deliveries d JOIN memberships mb ON mb.id = d.membership_id
    WHERE d.status = 'failed' AND mb.deleted_at IS NULL AND d.attempt_count < 3 AND datetime(d.next_attempt_at) <= CURRENT_TIMESTAMP
    ORDER BY d.next_attempt_at LIMIT 100`);
  for (const row of rows) await processDelivery(row, row.code);
  return rows.length;
}

export async function runWalletNotificationSchedule() {
  await ensureSchema();
  const [retried, invalidations, nearReward, reactivation, appleLayouts] = await Promise.all([
    retryFailedWalletNotifications(),
    retryWalletInvalidationJobs(),
    evaluateNearRewardNotifications(),
    evaluateReactivationNotifications(),
    refreshOutdatedAppleWalletPasses(),
  ]);
  return { retried, invalidations, nearReward, reactivation, appleLayouts };
}
