export const MARKETING_CAMPAIGN_LIMIT = 4;
export const MARKETING_CAMPAIGN_WINDOW_DAYS = 7;

export const MARKETING_CAMPAIGN_QUOTA_SQL = `SELECT
  COUNT(*) AS used,
  MIN(created_at) AS oldestCreatedAt
  FROM wallet_notification_campaigns
  WHERE merchant_id = ? AND datetime(created_at) > datetime('now', '-7 days')`;

export const MARKETING_CAMPAIGN_INSERT_SQL = `INSERT OR IGNORE INTO wallet_notification_campaigns
  (id, merchant_id, program_id, title, message, request_key)
  SELECT ?, ?, ?, ?, ?, ?
  WHERE (SELECT COUNT(*) FROM wallet_notification_campaigns
    WHERE merchant_id = ? AND datetime(created_at) > datetime('now', '-7 days')) < 4`;

// Capture recipients when the campaign is accepted. Resuming a campaign must never
// include customers who joined after it was sent.
export const MARKETING_CAMPAIGN_TARGETS_SQL = `INSERT OR IGNORE INTO wallet_notification_deliveries
  (id, idempotency_key, merchant_id, customer_id, membership_id, program_id,
   campaign_id, notification_type, cycle_key, platform, title, message)
  SELECT 'wnd_' || lower(hex(randomblob(16))),
    'marketing:' || c.id || ':' || mb.id || ':' || platforms.platform,
    c.merchant_id, mb.customer_id, mb.id, c.program_id,
    c.id, 'marketing', c.id, platforms.platform, c.title, c.message
  FROM wallet_notification_campaigns c
  JOIN memberships mb ON mb.merchant_id = c.merchant_id AND mb.program_id = c.program_id
    AND mb.deleted_at IS NULL AND datetime(mb.created_at) <= datetime(c.created_at)
  JOIN (
    SELECT ap.membership_id, 'apple' AS platform FROM apple_wallet_passes ap
      WHERE ap.voided_at IS NULL AND EXISTS (
        SELECT 1 FROM apple_wallet_registrations r
        WHERE r.serial_number = ap.serial_number AND r.pass_type_identifier = ap.pass_type_identifier)
    UNION ALL
    SELECT gp.membership_id, 'google' AS platform FROM google_wallet_passes gp
  ) platforms ON platforms.membership_id = mb.id
  WHERE c.id = ?`;

export const EXPIRE_STALE_MARKETING_DELIVERIES_SQL = `UPDATE wallet_notification_deliveries SET status = 'skipped',
  error_message = 'Campagne expirée : aucun nouvel envoi après 24 heures.', updated_at = CURRENT_TIMESTAMP
  WHERE notification_type = 'marketing'
    AND (status IN ('pending', 'processing') OR (status = 'failed' AND attempt_count < 3))
    AND datetime(created_at) < datetime('now', '-24 hours')`;

export const REQUEUE_INTERRUPTED_MARKETING_DELIVERIES_SQL = `UPDATE wallet_notification_deliveries SET status = 'failed',
  error_message = 'Envoi interrompu ; reprise idempotente.', next_attempt_at = CURRENT_TIMESTAMP,
  updated_at = CURRENT_TIMESTAMP
  WHERE notification_type = 'marketing' AND status = 'processing'
    AND datetime(created_at) >= datetime('now', '-24 hours')
    AND datetime(updated_at) < datetime('now', '-10 minutes')`;

export function marketingCampaignQuotaFromRow(row: { used?: number; oldestCreatedAt?: string | null } | null) {
  const used = Math.max(0, Number(row?.used ?? 0));
  const remaining = Math.max(0, MARKETING_CAMPAIGN_LIMIT - used);
  const oldest = row?.oldestCreatedAt?.trim() || null;
  const parsedOldest = oldest
    ? new Date(oldest.includes("T") ? oldest : `${oldest.replace(" ", "T")}Z`)
    : null;
  const nextAllowedAt = remaining === 0 && parsedOldest && !Number.isNaN(parsedOldest.getTime())
    ? new Date(parsedOldest.getTime() + MARKETING_CAMPAIGN_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
    : null;
  return { used, remaining, limit: MARKETING_CAMPAIGN_LIMIT, nextAllowedAt };
}

export function validateCampaignRequestKey(value: string) {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
    throw new Error("Identifiant de campagne invalide.");
  }
  return value;
}
