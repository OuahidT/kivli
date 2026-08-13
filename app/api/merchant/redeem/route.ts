import { ensureSchema, getD1, queryFirst } from "../../../../db";
import { getMerchant } from "../../../../lib/auth";
import { cleanText, jsonError, readJson, safeApiError } from "../../../../lib/http";
import { makeId } from "../../../../lib/ids";

type RedeemPayload = { code?: string };
type RewardRow = { id: string; membershipId: string; firstName: string };

export async function POST(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    const payload = await readJson<RedeemPayload>(request);
    const code = cleanText(payload?.code, 80).toUpperCase();
    const reward = await queryFirst<RewardRow>(
      `SELECT r.id, r.membership_id AS membershipId, c.first_name AS firstName
       FROM rewards r JOIN memberships mb ON mb.id = r.membership_id JOIN customers c ON c.id = mb.customer_id
       WHERE mb.code = ? AND r.merchant_id = ? AND r.status = 'available' ORDER BY r.earned_at LIMIT 1`,
      code,
      merchant.id,
    );
    if (!reward) return jsonError("Aucune récompense disponible pour cette carte.", 404);
    await ensureSchema();
    const db = getD1();
    const stampId = makeId("stp");
    const statements = [
      db.prepare("UPDATE rewards SET status = 'redeemed', redeemed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(reward.id),
      db.prepare(
        "INSERT INTO stamps (id, merchant_id, membership_id, delta, reason, actor_role) VALUES (?, ?, ?, 0, 'redeem', ?)",
      ).bind(stampId, merchant.id, reward.membershipId, merchant.role),
    ];
    if (merchant.role === "employee" && merchant.employeeId) {
      statements.push(
        db.prepare("INSERT INTO employee_actions (stamp_id, employee_id) VALUES (?, ?)")
          .bind(stampId, merchant.employeeId),
      );
    }
    await db.batch(statements);
    return Response.json({ ok: true, firstName: reward.firstName });
  } catch (error) {
    return safeApiError(error);
  }
}
