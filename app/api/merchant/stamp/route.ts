import { ensureSchema, getD1, queryFirst } from "../../../../db";
import { getMerchant } from "../../../../lib/auth";
import { cleanText, jsonError, readJson, safeApiError } from "../../../../lib/http";
import { makeId } from "../../../../lib/ids";

type StampPayload = {
  code?: string;
  quantity?: number;
  requestId?: string;
  confirmMultiple?: boolean;
  confirmRecent?: boolean;
};
type MembershipRow = {
  id: string;
  firstName: string;
  points: number;
  goal: number;
  programId: string;
  availableRewards: number;
};
type RecentStamp = { actorName: string; createdAt: string };
type StoredRequest = { responseJson: string };

export async function POST(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    const payload = await readJson<StampPayload>(request);
    const code = cleanText(payload?.code, 80).toUpperCase();
    const requestId = cleanText(payload?.requestId, 80);
    const quantity = Math.round(Number(payload?.quantity) || 1);
    if (!code) return jsonError("Aucun code client détecté.");
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) return jsonError("La validation a expiré. Recommence le scan.");
    if (quantity < 1 || quantity > 10) return jsonError("Choisis entre 1 et 10 points.");
    if (quantity > 1 && payload?.confirmMultiple !== true) {
      return Response.json({ error: `Confirme l’ajout de ${quantity} points.`, code: "confirm_multiple" }, { status: 409 });
    }

    const requestKey = `${merchant.id}:${requestId}`;
    const existing = await queryFirst<StoredRequest>(
      "SELECT response_json AS responseJson FROM stamp_requests WHERE request_key = ? AND merchant_id = ?",
      requestKey,
      merchant.id,
    );
    if (existing) return Response.json(JSON.parse(existing.responseJson));

    const membership = await queryFirst<MembershipRow>(
      `SELECT mb.id, c.first_name AS firstName, mb.points, p.goal, p.id AS programId,
        (SELECT COUNT(*) FROM rewards r WHERE r.membership_id = mb.id AND r.status = 'available') AS availableRewards
       FROM memberships mb JOIN customers c ON c.id = mb.customer_id JOIN programs p ON p.id = mb.program_id
       WHERE mb.code = ? AND mb.merchant_id = ?`,
      code,
      merchant.id,
    );
    if (!membership) return jsonError("Cette carte n’appartient pas à ton programme.", 404);

    if (payload?.confirmRecent !== true) {
      const recent = await queryFirst<RecentStamp>(
        `SELECT CASE WHEN s.actor_role = 'employee' THEN COALESCE(e.display_name, 'un employé')
          ELSE 'le propriétaire' END AS actorName, s.created_at AS createdAt
         FROM stamps s
         LEFT JOIN employee_actions ea ON ea.stamp_id = s.id
         LEFT JOIN employees e ON e.id = ea.employee_id
         WHERE s.membership_id = ? AND s.reason = 'visit' AND s.reversed_at IS NULL
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

    const combined = membership.points + quantity;
    const rewardsEarned = Math.floor(combined / membership.goal);
    const pointsAfter = combined % membership.goal;
    const stampId = makeId("stp");
    const rewardIds = Array.from({ length: rewardsEarned }, () => makeId("rwd"));
    const result = {
      customer: { firstName: membership.firstName, code, points: pointsAfter, goal: membership.goal },
      quantity,
      stampId,
      rewardEarned: rewardsEarned > 0,
      rewardsEarned,
      availableRewards: membership.availableRewards + rewardsEarned,
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
          (id, merchant_id, membership_id, delta, reason, actor_role, points_before, points_after, reward_id)
         VALUES (?, ?, ?, ?, 'visit', ?, ?, ?, ?)`,
      ).bind(
        stampId,
        merchant.id,
        membership.id,
        quantity,
        merchant.role,
        membership.points,
        pointsAfter,
        rewardIds[0] ?? null,
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
    for (const rewardId of rewardIds) {
      statements.push(
        db.prepare(
          "INSERT INTO rewards (id, merchant_id, membership_id, program_id, status) VALUES (?, ?, ?, ?, 'available')",
        ).bind(rewardId, merchant.id, membership.id, membership.programId),
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
    return Response.json(result);
  } catch (error) {
    return safeApiError(error);
  }
}
