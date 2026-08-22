import type { CardData } from "./types";

export function walletRewardSnapshot(card: CardData) {
  const tiers = card.rewardTiers.length
    ? card.rewardTiers
    : [{ id: "default", threshold: card.goal, rewardText: card.rewardText, sortOrder: 0 }];
  const available = [...card.availableRewardItems].sort((left, right) => left.threshold - right.threshold);
  const locked = tiers.filter((tier) => tier.threshold > card.points);
  const next = locked[0];
  const missing = next ? Math.max(0, next.threshold - card.points) : 0;
  const availableCount = available.length;
  const unit = card.earningMode === "spend" ? "pt" : "passage";
  const formatUnit = (value: number) => `${unit}${value > 1 ? "s" : ""}`;
  const availableLabel = availableCount === 0
    ? "0"
    : `${availableCount} disponible${availableCount > 1 ? "s" : ""}`;

  return {
    availableCount,
    availableLabel,
    nextTier: next
      ? `Encore ${missing} ${formatUnit(missing)}`
      : "Tous atteints",
    allTiers: tiers.map((tier) => `${tier.threshold} ${formatUnit(tier.threshold)} · ${tier.rewardText}`).join("\n"),
    availableTiers: availableCount
      ? available.map((tier) => `${tier.threshold} ${formatUnit(tier.threshold)} · ${tier.rewardText}`).join("\n")
      : "Aucune récompense accessible pour le moment.",
    lockedTiers: locked.length
      ? locked.map((tier) => {
        const tierMissing = Math.max(0, tier.threshold - card.points);
        return `${tier.threshold} ${formatUnit(tier.threshold)} · ${tier.rewardText} · encore ${tierMissing} ${formatUnit(tierMissing)}`;
      }).join("\n")
      : "Tous les paliers sont atteints.",
  };
}
