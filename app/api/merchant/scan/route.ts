import { queryAll, queryFirst } from "../../../../db";
import { getMerchant } from "../../../../lib/auth";
import { cleanText, isSameOrigin, jsonError, readJson, safeApiError } from "../../../../lib/http";
import { requireCurrentPilotAcceptance } from "../../../../lib/pilot-acceptance";

type CardRow = { membershipId: string; firstName: string; code: string; points: number; goal: number; earningMode: "visits" | "spend"; spendAmountCents: number };
type RewardRow = { id: string; rewardText: string; threshold: number };

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Origine de la requête refusée.", 403);
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    const acceptanceError = await requireCurrentPilotAcceptance(merchant.id);
    if (acceptanceError) return acceptanceError;
    const body = await readJson<{ code?: string }>(request);
    const code = cleanText(body?.code, 80).toUpperCase();
    const card = await queryFirst<CardRow>(`SELECT mb.id AS membershipId, c.first_name AS firstName, mb.code, mb.points, p.goal,
      p.earning_mode AS earningMode, p.spend_amount_cents AS spendAmountCents
      FROM memberships mb JOIN customers c ON c.id = mb.customer_id JOIN programs p ON p.id = mb.program_id
      WHERE mb.code = ? AND mb.merchant_id = ? AND mb.deleted_at IS NULL`, code, merchant.id);
    if (!card) return jsonError("Cette carte n’appartient pas à ton programme.", 404);
    const rewards = card.earningMode === "spend"
      ? await queryAll<RewardRow>(`SELECT id, reward_text AS rewardText, threshold
          FROM program_reward_tiers WHERE program_id = (SELECT program_id FROM memberships WHERE id = ?) AND active = 1 AND threshold <= ? ORDER BY threshold`, card.membershipId, card.points)
      : await queryAll<RewardRow>(`SELECT id, COALESCE(reward_text, (SELECT reward_text FROM programs WHERE id = r.program_id)) AS rewardText,
          COALESCE(threshold, (SELECT goal FROM programs WHERE id = r.program_id)) AS threshold
          FROM rewards r WHERE membership_id = ? AND status = 'available' ORDER BY earned_at`, card.membershipId);
    return Response.json({ customer: { firstName: card.firstName, code: card.code, points: card.points, goal: card.goal }, earningMode: card.earningMode, spendAmountCents: card.spendAmountCents, rewards });
  } catch (error) { return safeApiError(error); }
}
