export type WalletEnvironment = "ios" | "android" | "other";

export function detectWalletEnvironment(userAgent: string, platform = "", maxTouchPoints = 0): WalletEnvironment {
  const normalizedUserAgent = userAgent.toLowerCase();
  const isIPadOS = platform === "MacIntel" && maxTouchPoints > 1;
  if (/iphone|ipad|ipod/.test(normalizedUserAgent) || isIPadOS) return "ios";
  if (/android/.test(normalizedUserAgent)) return "android";
  return "other";
}
