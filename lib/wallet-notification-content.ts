export const AUTOMATED_WALLET_MESSAGE_MAX = 160;
export const NEAR_REWARD_DEFAULT_MESSAGE = "Plus que {reste} {unité} avant votre prochaine récompense 🎁";
export const REACTIVATION_DEFAULT_MESSAGE = "Cela fait un moment — {commerce} serait ravi de vous revoir 🧡";
export const NEARBY_RELEVANT_TEXT_MAX = 80;
export const NEARBY_DEFAULT_TEXT = "Votre carte est disponible à proximité.";

const ALLOWED_TOKENS = new Set(["reste", "unité", "commerce", "jours"]);

export function validateWalletText(value: unknown, max: number, label: string) {
  if (typeof value !== "string") throw new Error(`${label} est requis.`);
  const normalized = value.trim().replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ");
  if (!normalized) throw new Error(`${label} ne peut pas être vide.`);
  if (normalized.length > max) throw new Error(`${label} ne doit pas dépasser ${max} caractères.`);
  if (/[<>]/.test(normalized) || /&(?:lt|gt);/i.test(normalized)) throw new Error("Le HTML n’est pas autorisé dans les messages Wallet.");
  for (const match of normalized.matchAll(/\{([^}]+)\}/g)) {
    if (!ALLOWED_TOKENS.has(match[1])) throw new Error(`La variable {${match[1]}} n’est pas reconnue.`);
  }
  return normalized;
}

export function renderWalletMessage(template: string, values: {
  remaining?: number;
  unit?: string;
  businessName: string;
  days?: number;
}) {
  return template
    .replaceAll("{reste}", String(values.remaining ?? ""))
    .replaceAll("{unité}", values.unit ?? "")
    .replaceAll("{commerce}", values.businessName)
    .replaceAll("{jours}", String(values.days ?? ""))
    .replace(/\s{2,}/g, " ")
    .trim();
}
