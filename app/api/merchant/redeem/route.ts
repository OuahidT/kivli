import { ensureSchema, getD1, queryAll, queryFirst } from "../../../../db";
import { getMerchant } from "../../../../lib/auth";
import { cleanText, jsonError, readJson, safeApiError } from "../../../../lib/http";
import { makeId } from "../../../../lib/ids";

type RedeemPayload = { code?: string; rewardId?: string };
type MemberRow = { id: string; firstName: string; points: number; programId: string; earningMode: "visits" | "spend" };
type RewardRow = { id: string; membershipId: string; firstName: string; rewardText: string };
type TierRow = { id: string; threshold: number; rewardText: string };

export async function POST(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    const payload = await readJson<RedeemPayload>(request);
    const code = cleanText(payload?.code, 80).toUpperCase();
    const rewardId = cleanText(payload?.rewardId, 80);
    if (!code) return jsonError("Aucune carte client sélectionnée.");

    const member = await queryFirst<MemberRow>(
      `SELECT mb.id, c.first_name AS firstName, mb.points, mb.program_id AS programId, p.earning_mode AS earningMode
       FROM memberships mb JOIN customers c ON c.id = mb.customer_id JOIN programs p ON p.id = mb.program_id
       WHERE mb.code = ? AND mb.merchant_id = ?`,
      code,
      merchant.id,
    );
    if (!member) return jsonError("Cette carte n’appartient pas à ton programme.", 404);

    await ensureSchema();
    const db = getD1();
    const stampId = makeId("stp");

    if (member.earningMode === "spend") {
      if (!rewardId) return jsonError("Choisis précisément la récompense à utiliser.", 409);
      const tier = await queryFirst<TierRow>(
        `SELECT id, threshold, reward_text AS rewardText FROM program_reward_tiers
         WHERE id = ? AND program_id = ? AND active = 1`,
        rewardId,
        member.programId,
      );
      if (!tier) return jsonError("Cette récompense n’est plus proposée.", 404);
      if (member.points < tier.threshold) return jsonError(`Il manque ${tier.threshold - member.points} point${tier.threshold - member.points > 1 ? "s" : ""} pour cette récompense.`, 409);

      const pointsAfter = member.points - tier.threshold;
      const redemptionId = makeId("rwd");
      const statements = [
        db.prepare("UPDATE memberships SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(pointsAfter, member.id),
        db.prepare(`INSERT INTO rewards
          (id, merchant_id, membership_id, program_id, status, tier_id, reward_text, threshold, redeemed_at)
          VALUES (?, ?, ?, ?, 'redeemed', ?, ?, ?, CURRENT_TIMESTAMP)`)
          .bind(redemptionId, merchant.id, member.id, member.programId, tier.id, tier.rewardText, tier.threshold),
        db.prepare(`INSERT INTO stamps
          (id, merchant_id, membership_id, delta, reason, actor_role, points_before, points_after, reward_id, note)
          VALUES (?, ?, ?, ?, 'redeem', ?, ?, ?, ?, ?)`)
          .bind(stampId, merchant.id, member.id, -tier.threshold, merchant.role, member.points, pointsAfter, redemptionId, tier.rewardText),
      ];
      if (merchant.role === "employee" && merchant.employeeId) {
        statements.push(db.prepare("INSERT INTO employee_actions (stamp_id, employee_id) VALUES (?, ?)").bind(stampId, merchant.employeeId));
      }
      await db.batch(statements);
      return Response.json({ ok: true, rewardId: tier.id, redemptionId, stampId, firstName: member.firstName, rewardText: tier.rewardText, pointsDebited: tier.threshold, pointsAfter });
    }

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
    const statements = [
      db.prepare("UPDATE rewards SET status = 'redeemed', redeemed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(reward.id),
      db.prepare("INSERT INTO stamps (id, merchant_id, membership_id, delta, reason, actor_role, reward_id) VALUES (?, ?, ?, 0, 'redeem', ?, ?)")
        .bind(stampId, merchant.id, reward.membershipId, merchant.role, reward.id),
    ];
    if (merchant.role === "employee" && merchant.employeeId) {
      statements.push(db.prepare("INSERT INTO employee_actions (stamp_id, employee_id) VALUES (?, ?)").bind(stampId, merchant.employeeId));
    }
    await db.batch(statements);
    return Response.json({ ok: true, rewardId: reward.id, stampId, firstName: reward.firstName, rewardText: reward.rewardText });
  } catch (error) {
    return safeApiError(error);
  }
}
