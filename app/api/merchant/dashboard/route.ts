import { queryAll, queryFirst } from "../../../../db";
import { getMerchant } from "../../../../lib/auth";
import { jsonError, safeApiError } from "../../../../lib/http";

type ProgramRow = { id: string; name: string; goal: number; rewardText: string; terms: string; active: number; earningMode: "visits" | "spend"; spendAmountCents: number };
type RewardTierRow = { id: string; threshold: number; rewardText: string; sortOrder: number };
type CustomerRow = {
  code: string;
  firstName: string;
  phone: string | null;
  marketingConsent: number;
  points: number;
  totalPoints: number;
  availableRewards: number;
  undoableStampId: string | null;
  updatedAt: string;
  segment: "new" | "active" | "loyal" | "reactivate";
};
type ActivityRow = { id: string; code: string; firstName: string; delta: number; reason: string; actorName: string; createdAt: string; amountCents: number | null; note: string | null; rewardText: string | null; canUndoReward: number };
type StatsRow = { customers: number; visits: number; rewards: number; newMembers: number; returningCustomers: number; avgFrequencyDays: number | null; rewardsEarned: number; rewardsRedeemed: number };
type EmployeeRow = { id: string; displayName: string; email: string | null; loginCode: string; active: number; mustChangePin: number; createdAt: string };

export async function GET(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Connecte-toi pour accéder au tableau de bord.", 401);

    const owner = merchant.role === "owner";
    let welcomePending = false;
    if (owner) {
      const marker = await queryFirst<{ welcomeSeenAt: string | null }>(
        "SELECT welcome_seen_at AS welcomeSeenAt FROM merchants WHERE id = ?",
        merchant.id,
      );
      if (!marker?.welcomeSeenAt) {
        welcomePending = true;
      }
    }
    const [program, customers, activity, stats, employees] = await Promise.all([
      queryFirst<ProgramRow>(
        `SELECT id, name, goal, reward_text AS rewardText, terms, active,
          earning_mode AS earningMode, spend_amount_cents AS spendAmountCents
         FROM programs WHERE merchant_id = ?`,
        merchant.id,
      ),
      owner ? queryAll<CustomerRow>(
        `SELECT mb.code, c.first_name AS firstName, c.phone, c.marketing_consent AS marketingConsent,
          mb.points, mb.total_points AS totalPoints,
          mb.updated_at AS updatedAt,
          CASE WHEN p.earning_mode = 'spend'
            THEN (SELECT COUNT(*) FROM program_reward_tiers pt WHERE pt.program_id = mb.program_id AND pt.active = 1 AND pt.threshold <= mb.points)
            ELSE (SELECT COUNT(*) FROM rewards r WHERE r.membership_id = mb.id AND r.status = 'available') END AS availableRewards,
          CASE
            WHEN c.created_at >= datetime('now', '-30 days') THEN 'new'
            WHEN mb.total_points >= MAX(10, COALESCE((SELECT MAX(threshold) FROM program_reward_tiers pt WHERE pt.program_id = mb.program_id AND pt.active = 1), 10) * 2) THEN 'loyal'
            WHEN COALESCE((SELECT MAX(rs.created_at) FROM stamps rs WHERE rs.membership_id = mb.id AND rs.reason IN ('visit', 'purchase', 'bonus') AND rs.reversed_at IS NULL), c.created_at) < datetime('now', '-45 days') THEN 'reactivate'
            ELSE 'active' END AS segment,
          (SELECT CASE
             WHEN s.points_before IS NOT NULL AND NOT EXISTS (
               SELECT 1 FROM rewards rr
               WHERE rr.status != 'available' AND (
                 rr.id = s.reward_id OR rr.id IN (
                   SELECT reward_id FROM stamp_reward_links WHERE stamp_id = s.id
                 )
               )
             ) AND NOT EXISTS (
               SELECT 1 FROM stamps newer
               WHERE newer.membership_id = s.membership_id AND newer.rowid > s.rowid
                 AND newer.reason IN ('visit', 'purchase', 'bonus', 'redeem', 'undo')
                 AND newer.delta != 0 AND newer.reversed_at IS NULL
             )
             THEN s.id ELSE NULL END
           FROM stamps s
           WHERE s.membership_id = mb.id AND s.reason IN ('visit', 'purchase', 'bonus') AND s.reversed_at IS NULL
           ORDER BY s.rowid DESC LIMIT 1) AS undoableStampId
         FROM memberships mb JOIN customers c ON c.id = mb.customer_id JOIN programs p ON p.id = mb.program_id
         WHERE mb.merchant_id = ? ORDER BY mb.updated_at DESC LIMIT 60`,
        merchant.id,
      ) : Promise.resolve([]),
      queryAll<ActivityRow>(
        `SELECT s.id, mb.code, c.first_name AS firstName, s.delta, s.reason, s.amount_cents AS amountCents, s.note,
          r.reward_text AS rewardText,
          CASE WHEN s.reason = 'redeem' AND s.delta < 0 AND s.reversed_at IS NULL AND r.status = 'redeemed' AND p.earning_mode = 'spend'
            AND ${owner ? "1 = 1" : "s.created_at >= datetime('now', '-5 minutes')"} THEN 1 ELSE 0 END AS canUndoReward,
          CASE WHEN s.actor_role = 'employee' THEN COALESCE(e.display_name, 'Employé') ELSE 'Propriétaire' END AS actorName,
          s.created_at AS createdAt
         FROM stamps s
         JOIN memberships mb ON mb.id = s.membership_id
         JOIN customers c ON c.id = mb.customer_id
         JOIN programs p ON p.id = mb.program_id
         LEFT JOIN rewards r ON r.id = s.reward_id
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
          (SELECT COALESCE(SUM(delta), 0) FROM stamps WHERE merchant_id = ? AND reason IN ('visit', 'purchase') AND reversed_at IS NULL) AS visits,
          (SELECT COUNT(*) FROM rewards WHERE merchant_id = ? AND status IN ('available', 'redeemed')) AS rewards,
          (SELECT COUNT(*) FROM memberships WHERE merchant_id = ? AND created_at >= datetime('now', '-30 days')) AS newMembers,
          (SELECT COUNT(*) FROM (SELECT membership_id FROM stamps WHERE merchant_id = ? AND reason IN ('visit','purchase') AND reversed_at IS NULL GROUP BY membership_id HAVING COUNT(*) >= 2)) AS returningCustomers,
          (SELECT ROUND(AVG(frequency), 1) FROM (SELECT (julianday(MAX(created_at)) - julianday(MIN(created_at))) / (COUNT(*) - 1) AS frequency FROM stamps WHERE merchant_id = ? AND reason IN ('visit','purchase') AND reversed_at IS NULL GROUP BY membership_id HAVING COUNT(*) >= 2)) AS avgFrequencyDays,
          (SELECT COUNT(*) FROM rewards WHERE merchant_id = ? AND status IN ('available', 'redeemed') AND earned_at >= datetime('now', '-30 days')) AS rewardsEarned,
          (SELECT COUNT(*) FROM rewards WHERE merchant_id = ? AND status = 'redeemed' AND redeemed_at >= datetime('now', '-30 days')) AS rewardsRedeemed`,
        merchant.id,
        merchant.id,
        merchant.id,
        merchant.id,
        merchant.id,
        merchant.id,
        merchant.id,
        merchant.id,
      ) : Promise.resolve({ customers: 0, visits: 0, rewards: 0, newMembers: 0, returningCustomers: 0, avgFrequencyDays: null, rewardsEarned: 0, rewardsRedeemed: 0 }),
      owner ? queryAll<EmployeeRow>(
        `SELECT id, display_name AS displayName, email, login_code AS loginCode,
          active, must_change_pin AS mustChangePin, created_at AS createdAt
         FROM employees WHERE merchant_id = ? ORDER BY active DESC, display_name`,
        merchant.id,
      ) : Promise.resolve([]),
    ]);

    return Response.json({
      merchant,
      welcomePending,
      program,
      customers,
      activity,
      employees,
      stats: stats ?? { customers: 0, visits: 0, rewards: 0, newMembers: 0, returningCustomers: 0, avgFrequencyDays: null, rewardsEarned: 0, rewardsRedeemed: 0 },
      rewardTiers: program ? await queryAll<RewardTierRow>(`SELECT id, threshold, reward_text AS rewardText, sort_order AS sortOrder FROM program_reward_tiers WHERE program_id = ? AND active = 1 ORDER BY threshold`, program.id) : [],
      segmentCounts: owner ? {
        new: customers.filter((customer) => customer.segment === "new").length,
        active: customers.filter((customer) => customer.segment === "active").length,
        loyal: customers.filter((customer) => customer.segment === "loyal").length,
        reactivate: customers.filter((customer) => customer.segment === "reactivate").length,
        reward: customers.filter((customer) => customer.availableRewards > 0).length,
      } : { new: 0, active: 0, loyal: 0, reactivate: 0, reward: 0 },
    });
  } catch (error) {
    return safeApiError(error);
  }
}
