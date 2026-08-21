import { ensureSchema, getD1, queryAll, queryFirst } from "../../../../db";
import { getMerchant } from "../../../../lib/auth";
import { cleanText, jsonError, readJson, safeApiError } from "../../../../lib/http";
import { makeId } from "../../../../lib/ids";

type RedeemPayload = { code?: string; rewardId?: string };
type RewardRow = { id: string; membershipId: string; firstName: string; rewardText: string };

export async function POST(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    const payload = await readJson<RedeemPayload>(request);
    const code = cleanText(payload?.code, 80).toUpperCase();
    const rewardId = cleanText(payload?.rewardId, 80);
    if (!code) return jsonError("Aucune carte client sélectionnée.");
    const availableRewards = await queryAll<{ id: string }>(
      `SELECT r.id FROM rewards r JOIN memberships mb ON mb.id = r.membership_id
       WHERE mb.code = ? AND r.merchant_id = ? AND r.status = 'available' ORDER BY r.earned_at`,
      code,
      merchant.id,
    );
    if (!availableRewards.length) return jsonError("Aucune récompense disponible pour cette carte.", 404);
    if (!rewardId && availableRewards.length > 1) return jsonError("Choisis précisément la récompense à utiliser.", 409);
    if (rewardId && !availableRewards.some((reward) => reward.id === rewardId)) return jsonError("Cette récompense n’est plus disponible.", 404);
    const reward = await queryFirst<RewardRow>(
      `SELECT r.id, r.membership_id AS membershipId, c.first_name AS firstName,
        COALESCE(r.reward_text, p.reward_text) AS rewardText
       FROM rewards r JOIN memberships mb ON mb.id = r.membership_id JOIN customers c ON c.id = mb.customer_id
       JOIN programs p ON p.id = r.program_id
       WHERE mb.code = ? AND r.merchant_id = ? AND r.status = 'available' AND (? = '' OR r.id = ?) ORDER BY r.earned_at LIMIT 1`,
      code,
      merchant.id,
      rewardId,
      rewardId,
    );
    if (!reward) return jsonError("Aucune récompense disponible pour cette carte.", 404);
    await ensureSchema();
    const db = getD1();
    const stampId = makeId("stp");
    const statements = [
      db.prepare("UPDATE rewards SET status = 'redeemed', redeemed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(reward.id),
      db.prepare(
        "INSERT INTO stamps (id, merchant_id, membership_id, delta, reason, actor_role, reward_id) VALUES (?, ?, ?, 0, 'redeem', ?, ?)",
      ).bind(stampId, merchant.id, reward.membershipId, merchant.role, reward.id),
    ];
    if (merchant.role === "employee" && merchant.employeeId) {
      statements.push(
        db.prepare("INSERT INTO employee_actions (stamp_id, employee_id) VALUES (?, ?)")
          .bind(stampId, merchant.employeeId),
      );
    }
    await db.batch(statements);
    return Response.json({ ok: true, rewardId: reward.id, firstName: reward.firstName, rewardText: reward.rewardText });
  } catch (error) {
    return safeApiError(error);
  }
}
