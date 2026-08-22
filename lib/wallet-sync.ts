import { syncAppleWalletSafely } from "./apple-wallet";
import { syncGoogleWalletSafely } from "./google-wallet";

export async function syncWalletsSafely(code: string) {
  await Promise.all([
    syncGoogleWalletSafely(code),
    syncAppleWalletSafely(code),
  ]);
}

