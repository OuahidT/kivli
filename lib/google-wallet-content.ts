import type { CardData } from "./types";

function truncate(value: string, length: number) {
  return value.length <= length ? value : `${value.slice(0, Math.max(1, length - 1)).trim()}…`;
}

function compactRewardLabel(value: string) {
  return truncate(value.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim(), 18);
}

export function walletRewardSnapshot(card: CardData) {
  const tiers = card.rewardTiers.length
    ? card.rewardTiers
    : [{ id: "default", threshold: card.goal, rewardText: card.rewardText, sortOrder: 0 }];
  const available = [...card.availableRewardItems].sort((left, right) => left.threshold - right.threshold);
  const locked = tiers.filter((tier) => tier.threshold > card.points);
  const next = locked[0];
  const missing = next ? Math.max(0, next.threshold - card.points) : 0;
  const availableCount = available.length;
  const availableLabel = availableCount === 0
    ? "Aucune disponible · voir les détails"
    : `${availableCount} disponible${availableCount > 1 ? "s" : ""} · voir les détails`;

  return {
    availableCount,
    availableLabel,
    nextTier: next
      ? `${compactRewardLabel(next.rewardText)} · encore ${missing} pt${missing > 1 ? "s" : ""}`
      : "Dernier palier atteint",
    allTiers: tiers.map((tier) => `${tier.threshold} pts · ${tier.rewardText}`).join("\n"),
    availableTiers: availableCount
      ? available.map((tier) => `${tier.threshold} pts · ${tier.rewardText}`).join("\n")
      : "Aucune récompense accessible pour le moment.",
    lockedTiers: locked.length
      ? locked.map((tier) => {
        const tierMissing = Math.max(0, tier.threshold - card.points);
        return `${tier.threshold} pts · ${tier.rewardText} · encore ${tierMissing} pt${tierMissing > 1 ? "s" : ""}`;
      }).join("\n")
      : "Tous les paliers sont atteints.",
  };
}
