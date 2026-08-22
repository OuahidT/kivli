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

// This neutral payload remains the bridge between Kivli/D1 and external Wallet renderers.
