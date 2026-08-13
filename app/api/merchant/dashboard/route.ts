import { queryAll, queryFirst } from "../../../../db";
import { getMerchant } from "../../../../lib/auth";
import { jsonError, safeApiError } from "../../../../lib/http";

type ProgramRow = { id: string; name: string; goal: number; rewardText: string; terms: string; active: number };
type CustomerRow = {
  code: string;
  firstName: string;
  points: number;
  totalPoints: number;
  availableRewards: number;
  undoableStampId: string | null;
  updatedAt: string;
};
type ActivityRow = { id: string; firstName: string; delta: number; reason: string; actorName: string; createdAt: string };
type StatsRow = { customers: number; visits: number; rewards: number };
type EmployeeRow = { id: string; displayName: string; email: string | null; loginCode: string; active: number; createdAt: string };

export async function GET(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Connecte-toi pour accéder au tableau de bord.", 401);

    const owner = merchant.role === "owner";
    const [program, customers, activity, stats, employees] = await Promise.all([
      queryFirst<ProgramRow>(
        `SELECT id, name, goal, reward_text AS rewardText, terms, active FROM programs WHERE merchant_id = ?`,
        merchant.id,
      ),
      owner ? queryAll<CustomerRow>(
        `SELECT mb.code, c.first_name AS firstName, mb.points, mb.total_points AS totalPoints,
          mb.updated_at AS updatedAt,
          (SELECT COUNT(*) FROM rewards r WHERE r.membership_id = mb.id AND r.status = 'available') AS availableRewards,
          (SELECT CASE
             WHEN s.points_before IS NOT NULL AND NOT EXISTS (
               SELECT 1 FROM rewards rr
               WHERE rr.status != 'available' AND (
                 rr.id = s.reward_id OR rr.id IN (
                   SELECT reward_id FROM stamp_reward_links WHERE stamp_id = s.id
                 )
               )
             )
             THEN s.id ELSE NULL END
           FROM stamps s
           WHERE s.membership_id = mb.id AND s.reason = 'visit' AND s.reversed_at IS NULL
           ORDER BY s.rowid DESC LIMIT 1) AS undoableStampId
         FROM memberships mb JOIN customers c ON c.id = mb.customer_id
         WHERE mb.merchant_id = ? ORDER BY mb.updated_at DESC LIMIT 60`,
        merchant.id,
      ) : Promise.resolve([]),
      queryAll<ActivityRow>(
        `SELECT s.id, c.first_name AS firstName, s.delta, s.reason,
          CASE WHEN s.actor_role = 'employee' THEN COALESCE(e.display_name, 'Employé') ELSE 'Propriétaire' END AS actorName,
          s.created_at AS createdAt
         FROM stamps s
         JOIN memberships mb ON mb.id = s.membership_id
         JOIN customers c ON c.id = mb.customer_id
         LEFT JOIN employee_actions ea ON ea.stamp_id = s.id
         LEFT JOIN employees e ON e.id = ea.employee_id
         WHERE s.merchant_id = ? ${owner ? "" : "AND ea.employee_id = ?"}
         ORDER BY s.created_at DESC LIMIT 12`,
        merchant.id,
        ...(!owner ? [merchant.employeeId] : []),
      ),
      owner ? queryFirst<StatsRow>(
        `SELECT
          (SELECT COUNT(*) FROM memberships WHERE merchant_id = ?) AS customers,
          (SELECT COALESCE(SUM(delta), 0) FROM stamps WHERE merchant_id = ? AND reason = 'visit' AND reversed_at IS NULL) AS visits,
          (SELECT COUNT(*) FROM rewards WHERE merchant_id = ? AND status != 'cancelled') AS rewards`,
        merchant.id,
        merchant.id,
        merchant.id,
      ) : Promise.resolve({ customers: 0, visits: 0, rewards: 0 }),
      owner ? queryAll<EmployeeRow>(
        `SELECT id, display_name AS displayName, email, login_code AS loginCode,
          active, created_at AS createdAt
         FROM employees WHERE merchant_id = ? ORDER BY active DESC, display_name`,
        merchant.id,
      ) : Promise.resolve([]),
    ]);

    return Response.json({
      merchant,
      program,
      customers,
      activity,
      employees,
      stats: stats ?? { customers: 0, visits: 0, rewards: 0 },
    });
  } catch (error) {
    return safeApiError(error);
  }
}
