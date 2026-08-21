import { ensureSchema, getD1, queryAll, queryFirst } from "../../../../db";
import { getMerchant, isOwner } from "../../../../lib/auth";
import { cleanText, jsonError, readJson, safeApiError } from "../../../../lib/http";
import { makeId } from "../../../../lib/ids";

type Member = { id: string; firstName: string; points: number; goal: number; programId: string; availableRewards: number; earningMode: "visits" | "spend" };
type Tier = { id: string; threshold: number; rewardText: string };

export async function POST(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    if (!isOwner(merchant)) return jsonError("Seul le propriétaire peut attribuer un bonus.", 403);
    const body = await readJson<{ code?: string; quantity?: number; note?: string }>(request);
    const code = cleanText(body?.code, 80).toUpperCase();
    const quantity = Math.round(Number(body?.quantity));
    const note = cleanText(body?.note, 160);
    if (!code || quantity < 1 || quantity > 100) return jsonError("Choisis un bonus entre 1 et 100 points.");
    const member = await queryFirst<Member>(`SELECT mb.id, c.first_name AS firstName, mb.points, p.goal, p.id AS programId, p.earning_mode AS earningMode,
      (SELECT COUNT(*) FROM rewards r WHERE r.membership_id = mb.id AND r.status = 'available') AS availableRewards
      FROM memberships mb JOIN customers c ON c.id = mb.customer_id JOIN programs p ON p.id = mb.program_id
      WHERE mb.code = ? AND mb.merchant_id = ?`, code, merchant.id);
    if (!member) return jsonError("Carte introuvable.", 404);
    const tiers = await queryAll<Tier>(`SELECT id, threshold, reward_text AS rewardText FROM program_reward_tiers WHERE program_id = ? AND active = 1 ORDER BY threshold`, member.programId);
    const pointsAfter = member.earningMode === "spend" ? member.points + quantity : (member.points + quantity) % member.goal;
    const earned: Tier[] = [];
    if (member.earningMode === "visits") {
      for (let step = 1; step <= quantity; step += 1) {
        const progress = ((member.points + step - 1) % member.goal) + 1;
        for (const tier of tiers) if (tier.threshold === progress) earned.push(tier);
      }
    }
    const stampId = makeId("stp");
    const db = getD1();
    await ensureSchema();
    const statements = [
      db.prepare("UPDATE memberships SET points = ?, total_points = total_points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(pointsAfter, quantity, member.id),
      db.prepare(`INSERT INTO stamps (id, merchant_id, membership_id, delta, reason, actor_role, points_before, points_after, note) VALUES (?, ?, ?, ?, 'bonus', 'owner', ?, ?, ?)`)
        .bind(stampId, merchant.id, member.id, quantity, member.points, pointsAfter, note || null),
    ];
    for (const tier of earned) {
      const rewardId = makeId("rwd");
      statements.push(
        db.prepare(`INSERT INTO rewards (id, merchant_id, membership_id, program_id, status, tier_id, reward_text, threshold) VALUES (?, ?, ?, ?, 'available', ?, ?, ?)`)
          .bind(rewardId, merchant.id, member.id, member.programId, tier.id, tier.rewardText, tier.threshold),
        db.prepare("INSERT INTO stamp_reward_links (stamp_id, reward_id) VALUES (?, ?)").bind(stampId, rewardId),
      );
    }
    await db.batch(statements);
    const availableRewards = member.earningMode === "spend" ? tiers.filter((tier) => tier.threshold <= pointsAfter).length : member.availableRewards + earned.length;
    return Response.json({ ok: true, stampId, firstName: member.firstName, points: pointsAfter, quantity, rewardsEarned: earned.length, availableRewards });
  } catch (error) { return safeApiError(error); }
}
