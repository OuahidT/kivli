import { ensureSchema, getD1, queryAll, queryFirst } from "../../../../db";
import { getMerchant } from "../../../../lib/auth";
import { cleanText, isSameOrigin, jsonError, readJson, safeApiError } from "../../../../lib/http";
import { makeId } from "../../../../lib/ids";
import { syncWalletsSafely } from "../../../../lib/wallet-sync";
import { evaluateNearRewardNotifications } from "../../../../lib/wallet-notifications";
import { requireCurrentPilotAcceptance } from "../../../../lib/pilot-acceptance";

type StampPayload = {
  code?: string;
  quantity?: number;
  requestId?: string;
  confirmMultiple?: boolean;
  confirmRecent?: boolean;
  amountCents?: number;
};
type MembershipRow = {
  id: string;
  firstName: string;
  points: number;
  goal: number;
  programId: string;
  availableRewards: number;
  earningMode: "visits" | "spend";
  spendAmountCents: number;
};
type TierRow = { id: string; threshold: number; rewardText: string };
type RecentStamp = { actorName: string; createdAt: string };
type StoredRequest = { responseJson: string };

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Origine de la requête refusée.", 403);
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    const acceptanceError = await requireCurrentPilotAcceptance(merchant.id);
    if (acceptanceError) return acceptanceError;
    const payload = await readJson<StampPayload>(request);
    const code = cleanText(payload?.code, 80).toUpperCase();
    const requestId = cleanText(payload?.requestId, 80);
    const requestedQuantity = Math.round(Number(payload?.quantity) || 1);
    if (!code) return jsonError("Aucun code client détecté.");
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) return jsonError("La validation a expiré. Recommence le scan.");
    const amountCents = Math.round(Number(payload?.amountCents) || 0);

    const requestKey = `${merchant.id}:${requestId}`;
    const existing = await queryFirst<StoredRequest>(
      "SELECT response_json AS responseJson FROM stamp_requests WHERE request_key = ? AND merchant_id = ?",
      requestKey,
      merchant.id,
    );
    if (existing) return Response.json(JSON.parse(existing.responseJson));

    const membership = await queryFirst<MembershipRow>(
      `SELECT mb.id, c.first_name AS firstName, mb.points, p.goal, p.id AS programId,
        p.earning_mode AS earningMode, p.spend_amount_cents AS spendAmountCents,
        (SELECT COUNT(*) FROM rewards r WHERE r.membership_id = mb.id AND r.status = 'available') AS availableRewards
       FROM memberships mb JOIN customers c ON c.id = mb.customer_id JOIN programs p ON p.id = mb.program_id
       WHERE mb.code = ? AND mb.merchant_id = ?`,
      code,
      merchant.id,
    );
    if (!membership) return jsonError("Cette carte n’appartient pas à ton programme.", 404);
    const quantity = membership.earningMode === "spend" ? Math.floor(amountCents / membership.spendAmountCents) : requestedQuantity;
    if (membership.earningMode === "spend" && (amountCents < 1 || quantity < 1)) return jsonError(`Le montant doit atteindre au moins ${(membership.spendAmountCents / 100).toFixed(2).replace(".", ",")} € pour obtenir un point.`);
    if (quantity < 1 || quantity > 1000) return jsonError("Le nombre de points calculé n’est pas valide.");
    if (quantity > 1 && payload?.confirmMultiple !== true) return Response.json({ error: `Confirme l’ajout de ${quantity} points.`, code: "confirm_multiple", quantity }, { status: 409 });

    if (payload?.confirmRecent !== true) {
      const recent = await queryFirst<RecentStamp>(
        `SELECT CASE WHEN s.actor_role = 'employee' THEN COALESCE(e.display_name, 'un employé')
          ELSE 'le propriétaire' END AS actorName, s.created_at AS createdAt
         FROM stamps s
         LEFT JOIN employee_actions ea ON ea.stamp_id = s.id
         LEFT JOIN employees e ON e.id = ea.employee_id
         WHERE s.membership_id = ? AND s.reason IN ('visit', 'purchase') AND s.reversed_at IS NULL
           AND s.created_at >= datetime('now', '-60 seconds')
         ORDER BY s.rowid DESC LIMIT 1`,
        membership.id,
      );
      if (recent) {
        return Response.json(
          { error: `Cette carte vient déjà d’être créditée par ${recent.actorName}. Continuer quand même ?`, code: "recent_scan" },
          { status: 409 },
        );
      }
    }

    const tiers = await queryAll<TierRow>(`SELECT id, threshold, reward_text AS rewardText FROM program_reward_tiers WHERE program_id = ? AND active = 1 ORDER BY threshold`, membership.programId);
    const pointsAfter = membership.earningMode === "spend"
      ? membership.points + quantity
      : (membership.points + quantity) % membership.goal;
    const earnedTiers: TierRow[] = membership.earningMode === "spend"
      ? tiers.filter((tier) => tier.threshold > membership.points && tier.threshold <= pointsAfter)
      : [];
    if (membership.earningMode === "visits") {
      for (let step = 1; step <= quantity; step += 1) {
        const progress = ((membership.points + step - 1) % membership.goal) + 1;
        for (const tier of tiers) if (tier.threshold === progress) earnedTiers.push(tier);
      }
    }
    const rewardsEarned = earnedTiers.length;
    const stampId = makeId("stp");
    const rewardIds = membership.earningMode === "visits" ? earnedTiers.map(() => makeId("rwd")) : [];
    const availableRewards = membership.earningMode === "spend"
      ? tiers.filter((tier) => tier.threshold <= pointsAfter).length
      : membership.availableRewards + rewardsEarned;
    const result = {
      customer: { firstName: membership.firstName, code, points: pointsAfter, goal: membership.goal },
      quantity,
      stampId,
      rewardEarned: rewardsEarned > 0,
      rewardsEarned,
      availableRewards,
      rewards: earnedTiers.map((tier, index) => ({ id: rewardIds[index] ?? tier.id, rewardText: tier.rewardText, threshold: tier.threshold })),
      earningMode: membership.earningMode,
      amountCents: membership.earningMode === "spend" ? amountCents : null,
    };

    await ensureSchema();
    const db = getD1();
    const statements = [
      db.prepare("DELETE FROM stamp_requests WHERE created_at < datetime('now', '-1 day')"),
      db.prepare(
        "UPDATE memberships SET points = ?, total_points = total_points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(pointsAfter, quantity, membership.id),
      db.prepare(
        `INSERT INTO stamps
          (id, merchant_id, membership_id, delta, reason, actor_role, points_before, points_after, reward_id, amount_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        stampId,
        merchant.id,
        membership.id,
        quantity,
        membership.earningMode === "spend" ? "purchase" : "visit",
        merchant.role,
        membership.points,
        pointsAfter,
        rewardIds[0] ?? null,
        membership.earningMode === "spend" ? amountCents : null,
      ),
      db.prepare(
        "INSERT INTO stamp_requests (request_key, merchant_id, response_json) VALUES (?, ?, ?)",
      ).bind(requestKey, merchant.id, JSON.stringify(result)),
    ];
    if (merchant.role === "employee" && merchant.employeeId) {
      statements.push(
        db.prepare("INSERT INTO employee_actions (stamp_id, employee_id) VALUES (?, ?)")
          .bind(stampId, merchant.employeeId),
      );
    }
    for (const [index, rewardId] of rewardIds.entries()) {
      const tier = earnedTiers[index];
      statements.push(
        db.prepare(
          "INSERT INTO rewards (id, merchant_id, membership_id, program_id, status, tier_id, reward_text, threshold) VALUES (?, ?, ?, ?, 'available', ?, ?, ?)",
        ).bind(rewardId, merchant.id, membership.id, membership.programId, tier.id, tier.rewardText, tier.threshold),
        db.prepare("INSERT INTO stamp_reward_links (stamp_id, reward_id) VALUES (?, ?)")
          .bind(stampId, rewardId),
      );
    }

    try {
      await db.batch(statements);
    } catch (error) {
      const duplicate = await queryFirst<StoredRequest>(
        "SELECT response_json AS responseJson FROM stamp_requests WHERE request_key = ? AND merchant_id = ?",
        requestKey,
        merchant.id,
      );
      if (duplicate) return Response.json(JSON.parse(duplicate.responseJson));
      throw error;
    }
    await syncWalletsSafely(code);
    await evaluateNearRewardNotifications(code).catch((error) => {
      console.error("Alerte de proximité différée.", error instanceof Error ? error.message : error);
    });
    return Response.json(result);
  } catch (error) {
    return safeApiError(error);
  }
}
