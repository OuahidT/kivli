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
  membershipId: string;
  code: string;
  firstName: string;
  points: number;
  totalPoints: number;
  availableRewards: number;
  joinedAt: string;
  marketingConsent: number;
  availableRewardItems: Array<{ id: string; rewardText: string; threshold: number }>;
};

export type PublicCardData = Omit<
  CardData,
  "id" | "merchantId" | "membershipId" | "slug" | "joinedAt" | "rewardTiers" | "availableRewardItems"
> & {
  rewardTiers: Array<Omit<RewardTier, "id">>;
  availableRewardItems: Array<{ rewardText: string; threshold: number }>;
};
