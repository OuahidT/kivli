import { queryFirst } from "../db";
import type { CardData, Program } from "./types";

export function getProgramBySlug(slug: string) {
  return queryFirst<Program>(
    `SELECT p.id, p.merchant_id AS merchantId, m.business_name AS businessName, m.slug,
      m.accent_color AS accentColor, p.name, p.goal, p.reward_text AS rewardText, p.terms
     FROM programs p JOIN merchants m ON m.id = p.merchant_id
     WHERE m.slug = ? AND p.active = 1`,
    slug,
  );
}

export function getCardByCode(code: string) {
  return queryFirst<CardData>(
    `SELECT p.id, p.merchant_id AS merchantId, m.business_name AS businessName, m.slug,
      m.accent_color AS accentColor, p.name, p.goal, p.reward_text AS rewardText, p.terms,
      mb.code, c.first_name AS firstName, mb.points, mb.total_points AS totalPoints,
      mb.created_at AS joinedAt,
      (SELECT COUNT(*) FROM rewards r WHERE r.membership_id = mb.id AND r.status = 'available') AS availableRewards
     FROM memberships mb
     JOIN customers c ON c.id = mb.customer_id
     JOIN programs p ON p.id = mb.program_id
     JOIN merchants m ON m.id = mb.merchant_id
     WHERE mb.code = ? AND p.active = 1`,
    code,
  );
}
