import { ensureSchema, getD1, queryFirst } from "../../../../../db";
import { getMerchant } from "../../../../../lib/auth";
import { cleanText, jsonError, readJson, safeApiError } from "../../../../../lib/http";
import { makeId } from "../../../../../lib/ids";
import { syncWalletsSafely } from "../../../../../lib/wallet-sync";

type UndoPayload = { stampId?: string };
type RedemptionRow = {
  id: string;
  membershipId: string;
  rewardId: string;
  firstName: string;
  rewardText: string;
  pointsCost: number;
  currentPoints: number;
  code: string;
};

export async function POST(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    const payload = await readJson<UndoPayload>(request);
    const stampId = cleanText(payload?.stampId, 80);
    if (!stampId) return jsonError("Remise à annuler introuvable.");

    const employeeGuard = merchant.role === "employee"
      ? `AND EXISTS (SELECT 1 FROM employee_actions ea WHERE ea.stamp_id = s.id AND ea.employee_id = ?)
         AND s.created_at >= datetime('now', '-5 minutes')`
      : "";
    const redemption = await queryFirst<RedemptionRow>(
      `SELECT s.id, s.membership_id AS membershipId, s.reward_id AS rewardId,
        c.first_name AS firstName, COALESCE(r.reward_text, s.note, 'Récompense') AS rewardText,
        ABS(s.delta) AS pointsCost, mb.points AS currentPoints, mb.code
       FROM stamps s
       JOIN memberships mb ON mb.id = s.membership_id
       JOIN customers c ON c.id = mb.customer_id
       JOIN programs p ON p.id = mb.program_id AND p.earning_mode = 'spend'
       JOIN rewards r ON r.id = s.reward_id AND r.status = 'redeemed'
       WHERE s.id = ? AND s.merchant_id = ? AND s.reason = 'redeem' AND s.delta < 0
         AND s.reversed_at IS NULL ${employeeGuard}`,
      stampId,
      merchant.id,
      ...(merchant.role === "employee" ? [merchant.employeeId] : []),
    );
    if (!redemption) return jsonError(
      merchant.role === "employee"
        ? "Tu peux seulement annuler ta propre remise pendant 5 minutes."
        : "Cette remise a déjà été annulée ou ne peut plus l’être.",
      409,
    );

    await ensureSchema();
    const db = getD1();
    const undoId = makeId("stp");
    const pointsAfter = redemption.currentPoints + redemption.pointsCost;
    const statements = [
      db.prepare("UPDATE memberships SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(pointsAfter, redemption.membershipId),
      db.prepare("UPDATE stamps SET reversed_at = CURRENT_TIMESTAMP, reversed_by_role = ? WHERE id = ? AND reversed_at IS NULL")
        .bind(merchant.role, redemption.id),
      db.prepare("UPDATE rewards SET status = 'cancelled' WHERE id = ? AND status = 'redeemed'")
        .bind(redemption.rewardId),
      db.prepare(`INSERT INTO stamps
        (id, merchant_id, membership_id, delta, reason, actor_role, points_before, points_after, reverses_stamp_id, note)
        VALUES (?, ?, ?, ?, 'undo', ?, ?, ?, ?, ?)`)
        .bind(undoId, merchant.id, redemption.membershipId, redemption.pointsCost, merchant.role, redemption.currentPoints, pointsAfter, redemption.id, `reward_restore:${redemption.rewardText}`),
    ];
    if (merchant.role === "employee" && merchant.employeeId) {
      statements.push(db.prepare("INSERT INTO employee_actions (stamp_id, employee_id) VALUES (?, ?)").bind(undoId, merchant.employeeId));
    }
    await db.batch(statements);
    await syncWalletsSafely(redemption.code);
    return Response.json({ ok: true, firstName: redemption.firstName, rewardText: redemption.rewardText, pointsRestored: redemption.pointsCost, pointsAfter });
  } catch (error) {
    return safeApiError(error);
  }
}
