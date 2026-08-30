import { syncAppleWalletSafely } from "./apple-wallet";
import { syncGoogleWalletClassSafely, syncGoogleWalletSafely } from "./google-wallet";
import { queryAll } from "../db";

export async function syncWalletsSafely(code: string) {
  await Promise.all([
    syncGoogleWalletSafely(code),
    syncAppleWalletSafely(code),
  ]);
}

export async function syncMerchantWalletsSafely(merchantId: string) {
  const cards = await queryAll<{ code: string }>(`SELECT code FROM memberships
    WHERE merchant_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`, merchantId);
  if (cards[0]) await syncGoogleWalletClassSafely(cards[0].code);
  for (let index = 0; index < cards.length; index += 10) {
    await Promise.allSettled(cards.slice(index, index + 10).map((card) => syncAppleWalletSafely(card.code)));
  }
}
