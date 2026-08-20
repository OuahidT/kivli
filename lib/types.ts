export type Program = {
  id: string;
  merchantId: string;
  businessName: string;
  slug: string;
  accentColor: string;
  name: string;
  goal: number;
  rewardText: string;
  terms: string;
  earningMode: "visits" | "spend";
  spendAmountCents: number;
  rewardTiers: RewardTier[];
};

export type RewardTier = { id: string; threshold: number; rewardText: string; sortOrder: number };

export type CardData = Program & {
  code: string;
  firstName: string;
  points: number;
  totalPoints: number;
  availableRewards: number;
  joinedAt: string;
  availableRewardItems: Array<{ id: string; rewardText: string; threshold: number }>;
};
