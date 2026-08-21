import { queryFirst } from "../db";
import type { CardData, Program, RewardTier } from "./types";

export async function getProgramBySlug(slug: string) {
  const program = await queryFirst<Omit<Program, "rewardTiers">>(
    `SELECT p.id, p.merchant_id AS merchantId, m.business_name AS businessName, m.slug,
      m.accent_color AS accentColor, p.name, p.goal, p.reward_text AS rewardText, p.terms,
      p.earning_mode AS earningMode, p.spend_amount_cents AS spendAmountCents
     FROM programs p JOIN merchants m ON m.id = p.merchant_id
     WHERE m.slug = ? AND p.active = 1`,
    slug,
  );
  if (!program) return null;
  const { queryAll } = await import("../db");
  const rewardTiers = await queryAll<RewardTier>(
    `SELECT id, threshold, reward_text AS rewardText, sort_order AS sortOrder
     FROM program_reward_tiers WHERE program_id = ? AND active = 1 ORDER BY threshold, sort_order`,
    program.id,
  );
  return { ...program, rewardTiers };
}

export async function getCardByCode(code: string) {
  const card = await queryFirst<Omit<CardData, "rewardTiers" | "availableRewardItems">>(
    `SELECT p.id, p.merchant_id AS merchantId, m.business_name AS businessName, m.slug,
      m.accent_color AS accentColor, p.name, p.goal, p.reward_text AS rewardText, p.terms,
      p.earning_mode AS earningMode, p.spend_amount_cents AS spendAmountCents,
      mb.code, c.first_name AS firstName, c.marketing_consent AS marketingConsent, mb.points, mb.total_points AS totalPoints,
      mb.created_at AS joinedAt,
      (SELECT COUNT(*) FROM rewards r WHERE r.membership_id = mb.id AND r.status = 'available') AS availableRewards
     FROM memberships mb
     JOIN customers c ON c.id = mb.customer_id
     JOIN programs p ON p.id = mb.program_id
     JOIN merchants m ON m.id = mb.merchant_id
     WHERE mb.code = ? AND p.active = 1`,
    code,
  );
  if (!card) return null;
  const { queryAll } = await import("../db");
  const [rewardTiers, availableRewardItems] = await Promise.all([
    queryAll<RewardTier>(`SELECT id, threshold, reward_text AS rewardText, sort_order AS sortOrder FROM program_reward_tiers WHERE program_id = ? AND active = 1 ORDER BY threshold`, card.id),
    queryAll<{ id: string; rewardText: string; threshold: number }>(`SELECT id, COALESCE(reward_text, ?) AS rewardText, COALESCE(threshold, ?) AS threshold FROM rewards WHERE membership_id = (SELECT id FROM memberships WHERE code = ?) AND status = 'available' ORDER BY earned_at`, card.rewardText, card.goal, code),
  ]);
  return { ...card, rewardTiers, availableRewardItems };
}
