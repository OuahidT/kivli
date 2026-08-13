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
};

export type CardData = Program & {
  code: string;
  firstName: string;
  points: number;
  totalPoints: number;
  availableRewards: number;
  joinedAt: string;
};
