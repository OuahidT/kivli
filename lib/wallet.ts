import type { CardData } from "./types";

export type WalletPassPayload = {
  serialNumber: string;
  organizationName: string;
  description: string;
  progress: { current: number; goal: number };
  rewardText: string;
  barcodeValue: string;
  backgroundColor: string;
};

export function toWalletPassPayload(card: CardData): WalletPassPayload {
  return {
    serialNumber: card.code,
    organizationName: card.businessName,
    description: card.name,
    progress: { current: card.points, goal: card.goal },
    rewardText: card.rewardText,
    barcodeValue: card.code,
    backgroundColor: card.accentColor,
  };
}

// The Apple and Google signing adapters intentionally live beyond this shared payload.
// They can be connected later without changing customer, membership or reward data.
