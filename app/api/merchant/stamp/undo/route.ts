import { ensureSchema, getD1, queryAll, queryFirst } from "../../../../../db";
import { getMerchant } from "../../../../../lib/auth";
import { cleanText, jsonError, readJson, safeApiError } from "../../../../../lib/http";
import { makeId } from "../../../../../lib/ids";

type UndoPayload = { stampId?: string };
type UndoableStamp = {
  id: string;
  membershipId: string;
  firstName: string;
  code: string;
  delta: number;
  pointsBefore: number;
};
type RewardRow = { id: string; status: string };

export async function POST(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    const payload = await readJson<UndoPayload>(request);
    const stampId = cleanText(payload?.stampId, 80);
    if (!stampId) return jsonError("Passage à annuler introuvable.");
    if (merchant.role === "employee" && !merchant.employeeId) return jsonError("Accès employé expiré.", 401);

    const employeeGuard = merchant.role === "employee"
      ? `AND EXISTS (SELECT 1 FROM employee_actions mine WHERE mine.stamp_id = s.id AND mine.employee_id = ?)
         AND s.created_at >= datetime('now', '-5 minutes')`
      : "";
    const stamp = await queryFirst<UndoableStamp>(
      `SELECT s.id, s.membership_id AS membershipId, c.first_name AS firstName, mb.code,
        s.delta, s.points_before AS pointsBefore
       FROM stamps s
       JOIN memberships mb ON mb.id = s.membership_id
       JOIN customers c ON c.id = mb.customer_id
       WHERE s.id = ? AND s.merchant_id = ? AND s.reason IN ('visit', 'purchase', 'bonus')
         ${merchant.role === "employee" ? "AND s.reason IN ('visit', 'purchase')" : ""}
         AND s.reversed_at IS NULL AND s.points_before IS NOT NULL
         ${employeeGuard}
         AND NOT EXISTS (
           SELECT 1 FROM stamps newer
           WHERE newer.membership_id = s.membership_id AND newer.reason IN ('visit', 'purchase', 'bonus')
             AND newer.reversed_at IS NULL AND newer.rowid > s.rowid
         )`,
      stampId,
      merchant.id,
      ...(merchant.role === "employee" ? [merchant.employeeId] : []),
    );
    if (!stamp) {
      return jsonError(
        merchant.role === "employee"
          ? "Tu peux seulement annuler ta propre dernière opération pendant 5 minutes."
          : "Seule la dernière opération de points de ce client peut être annulée.",
        409,
      );
    }

    const rewards = await queryAll<RewardRow>(
      `SELECT r.id, r.status FROM rewards r
       WHERE r.id IN (
         SELECT reward_id FROM stamp_reward_links WHERE stamp_id = ?
         UNION SELECT reward_id FROM stamps WHERE id = ? AND reward_id IS NOT NULL
       )`,
      stamp.id,
      stamp.id,
    );
    if (rewards.some((reward) => reward.status !== "available")) {
      return jsonError("Cette opération ne peut plus être annulée car une récompense a déjà été remise.", 409);
    }

    await ensureSchema();
    const db = getD1();
    const undoId = makeId("stp");
    const statements = [
      db.prepare(
        `UPDATE memberships SET points = ?, total_points = MAX(0, total_points - ?),
          updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(stamp.pointsBefore, stamp.delta, stamp.membershipId),
      db.prepare(
        `UPDATE stamps SET reversed_at = CURRENT_TIMESTAMP, reversed_by_role = ?
         WHERE id = ? AND reversed_at IS NULL`,
      ).bind(merchant.role, stamp.id),
      db.prepare(
        `INSERT INTO stamps
          (id, merchant_id, membership_id, delta, reason, actor_role, reverses_stamp_id)
         VALUES (?, ?, ?, ?, 'undo', ?, ?)`,
      ).bind(undoId, merchant.id, stamp.membershipId, -stamp.delta, merchant.role, stamp.id),
    ];
    if (merchant.role === "employee" && merchant.employeeId) {
      statements.push(
        db.prepare("INSERT INTO employee_actions (stamp_id, employee_id) VALUES (?, ?)")
          .bind(undoId, merchant.employeeId),
      );
    }
    for (const reward of rewards) {
      statements.push(
        db.prepare("UPDATE rewards SET status = 'cancelled' WHERE id = ? AND status = 'available'")
          .bind(reward.id),
      );
    }
    await db.batch(statements);
    return Response.json({ ok: true, firstName: stamp.firstName, code: stamp.code, points: stamp.pointsBefore });
  } catch (error) {
    return safeApiError(error);
  }
}
