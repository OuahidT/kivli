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
