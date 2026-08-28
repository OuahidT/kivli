import { ensureSchema, getD1, queryAll, queryFirst } from "../db";
import { invalidateAppleWalletPass } from "./apple-wallet";
import { invalidateGoogleWalletPass } from "./google-wallet";
import { makeId } from "./ids";

type MembershipForDeletion = {
  id: string;
  merchantId: string;
  customerId: string;
  code: string;
  deletedAt: string | null;
};

type InvalidationPlatform = "apple" | "google";

type InvalidationJob = {
  id: string;
  membershipId: string;
  platform: InvalidationPlatform;
  attemptCount: number;
};

export type CustomerDeletionResult = {
  ok: true;
  alreadyDeleted: boolean;
  walletInvalidationPending: boolean;
};

function revokedCode(membershipId: string) {
  return `REVOKED-${membershipId}-${crypto.randomUUID()}`.toUpperCase();
}

export async function deleteCustomerMembership(
  merchantId: string,
  membershipId: string,
): Promise<CustomerDeletionResult | null> {
  await ensureSchema();
  const membership = await queryFirst<MembershipForDeletion>(`SELECT id, merchant_id AS merchantId,
    customer_id AS customerId, code, deleted_at AS deletedAt
    FROM memberships WHERE id = ? AND merchant_id = ?`, membershipId, merchantId);
  if (!membership) return null;
  if (membership.deletedAt) {
    await processWalletInvalidationJobsForMembership(membership.id);
    const pending = await hasPendingWalletInvalidation(membership.id);
    return { ok: true, alreadyDeleted: true, walletInvalidationPending: pending };
  }

  const db = getD1();
  const now = new Date().toISOString();
  const code = revokedCode(membership.id);
  const appleJobId = makeId("wij");
  const googleJobId = makeId("wij");
  await db.batch([
    db.prepare(`UPDATE memberships SET code = ?, points = 0, deleted_at = ?, deleted_by_role = 'owner',
      updated_at = ? WHERE id = ? AND merchant_id = ? AND deleted_at IS NULL`)
      .bind(code, now, now, membership.id, merchantId),
    db.prepare(`UPDATE customers SET
      marketing_consent = 0, marketing_consented_at = NULL, marketing_consent_version = NULL,
      marketing_consent_source = NULL, marketing_withdrawn_at = ?,
      first_name = CASE WHEN NOT EXISTS (
        SELECT 1 FROM memberships other WHERE other.customer_id = customers.id
          AND other.id != ? AND other.deleted_at IS NULL
      ) THEN 'Client supprimé' ELSE first_name END,
      email = CASE WHEN NOT EXISTS (
        SELECT 1 FROM memberships other WHERE other.customer_id = customers.id
          AND other.id != ? AND other.deleted_at IS NULL
      ) THEN NULL ELSE email END,
      phone = CASE WHEN NOT EXISTS (
        SELECT 1 FROM memberships other WHERE other.customer_id = customers.id
          AND other.id != ? AND other.deleted_at IS NULL
      ) THEN NULL ELSE phone END,
      anonymized_at = CASE WHEN NOT EXISTS (
        SELECT 1 FROM memberships other WHERE other.customer_id = customers.id
          AND other.id != ? AND other.deleted_at IS NULL
      ) THEN ? ELSE anonymized_at END
      WHERE id = ? AND merchant_id = ?`)
      .bind(now, membership.id, membership.id, membership.id, membership.id, now, membership.customerId, merchantId),
    db.prepare("UPDATE stamps SET note = NULL WHERE membership_id = ?").bind(membership.id),
    db.prepare("UPDATE rewards SET status = 'cancelled' WHERE membership_id = ? AND status = 'available'").bind(membership.id),
    db.prepare(`UPDATE wallet_notification_deliveries SET status = 'skipped',
      error_message = 'Client supprimé du programme.', updated_at = CURRENT_TIMESTAMP
      WHERE membership_id = ? AND status IN ('pending', 'processing', 'failed')`).bind(membership.id),
    db.prepare(`DELETE FROM stamp_requests WHERE merchant_id = ?
      AND response_json LIKE ?`).bind(merchantId, `%\"code\":\"${membership.code}\"%`),
    db.prepare(`UPDATE apple_wallet_passes SET voided_at = COALESCE(voided_at, ?),
      last_updated_tag = MAX(last_updated_tag + 1, unixepoch()), push_pending = 1,
      notification_delivery_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE membership_id = ?`)
      .bind(now, membership.id),
    db.prepare("UPDATE google_wallet_passes SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE membership_id = ?")
      .bind(membership.id),
    db.prepare(`INSERT OR IGNORE INTO wallet_invalidation_jobs
      (id, idempotency_key, merchant_id, membership_id, platform)
      SELECT ?, ?, ?, ?, 'apple' WHERE EXISTS (
        SELECT 1 FROM apple_wallet_passes WHERE membership_id = ?
      )`).bind(appleJobId, `customer-delete:${membership.id}:apple`, merchantId, membership.id, membership.id),
    db.prepare(`INSERT OR IGNORE INTO wallet_invalidation_jobs
      (id, idempotency_key, merchant_id, membership_id, platform)
      SELECT ?, ?, ?, ?, 'google' WHERE EXISTS (
        SELECT 1 FROM google_wallet_passes WHERE membership_id = ?
      )`).bind(googleJobId, `customer-delete:${membership.id}:google`, merchantId, membership.id, membership.id),
  ]);

  await processWalletInvalidationJobsForMembership(membership.id);
  return {
    ok: true,
    alreadyDeleted: false,
    walletInvalidationPending: await hasPendingWalletInvalidation(membership.id),
  };
}

async function hasPendingWalletInvalidation(membershipId: string) {
  const row = await queryFirst<{ count: number }>(`SELECT COUNT(*) AS count
    FROM wallet_invalidation_jobs WHERE membership_id = ? AND status != 'succeeded'`, membershipId);
  return (row?.count ?? 0) > 0;
}

async function claimInvalidationJob(job: InvalidationJob) {
  const result = await getD1().prepare(`UPDATE wallet_invalidation_jobs SET
    status = 'processing', attempt_count = attempt_count + 1,
    error_message = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status IN ('pending', 'failed')
      AND datetime(next_attempt_at) <= CURRENT_TIMESTAMP AND attempt_count < 8`)
    .bind(job.id).run();
  return Number(result.meta.changes ?? 0) > 0;
}

async function processInvalidationJob(job: InvalidationJob) {
  if (!(await claimInvalidationJob(job))) return;
  try {
    const outcome = job.platform === "apple"
      ? await invalidateAppleWalletPass(job.membershipId)
      : await invalidateGoogleWalletPass(job.membershipId);
    if (outcome.sent) {
      await getD1().prepare(`UPDATE wallet_invalidation_jobs SET status = 'succeeded',
        error_message = NULL, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(job.id).run();
      return;
    }
    const delayMinutes = Math.min(1440, 5 * (2 ** Math.max(0, job.attemptCount)));
    await getD1().prepare(`UPDATE wallet_invalidation_jobs SET status = 'failed', error_message = ?,
      next_attempt_at = datetime('now', ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(outcome.error ?? "Invalidation Wallet différée.", `+${delayMinutes} minutes`, job.id).run();
  } catch (error) {
    const delayMinutes = Math.min(1440, 5 * (2 ** Math.max(0, job.attemptCount)));
    await getD1().prepare(`UPDATE wallet_invalidation_jobs SET status = 'failed', error_message = ?,
      next_attempt_at = datetime('now', ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(error instanceof Error ? error.message.slice(0, 500) : "Invalidation Wallet différée.", `+${delayMinutes} minutes`, job.id).run();
  }
}

export async function processWalletInvalidationJobsForMembership(membershipId: string) {
  await ensureSchema();
  const jobs = await queryAll<InvalidationJob>(`SELECT id, membership_id AS membershipId,
    platform, attempt_count AS attemptCount FROM wallet_invalidation_jobs
    WHERE membership_id = ? AND status IN ('pending', 'failed')
      AND datetime(next_attempt_at) <= CURRENT_TIMESTAMP AND attempt_count < 8`, membershipId);
  await Promise.allSettled(jobs.map(processInvalidationJob));
  return jobs.length;
}

export async function retryWalletInvalidationJobs() {
  await ensureSchema();
  await getD1().prepare(`UPDATE wallet_invalidation_jobs SET status = 'failed',
    error_message = COALESCE(error_message, 'Traitement interrompu, nouvelle tentative.'),
    next_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE status = 'processing' AND datetime(updated_at) < datetime('now', '-15 minutes')`).run();
  const jobs = await queryAll<InvalidationJob>(`SELECT id, membership_id AS membershipId,
    platform, attempt_count AS attemptCount FROM wallet_invalidation_jobs
    WHERE status IN ('pending', 'failed') AND datetime(next_attempt_at) <= CURRENT_TIMESTAMP
      AND attempt_count < 8 ORDER BY next_attempt_at LIMIT 100`);
  for (const job of jobs) await processInvalidationJob(job);
  return jobs.length;
}
