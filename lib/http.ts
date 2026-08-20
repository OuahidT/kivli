export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function cleanText(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizePhone(value: unknown) {
  if (typeof value !== "string") return null;
  let phone = value.trim().replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (/^0\d{9}$/.test(phone)) phone = `+33${phone.slice(1)}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;
  return phone;
}

export function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export function safeApiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Une erreur inattendue est survenue.";
  if (message.includes("UNIQUE constraint failed: merchants.email")) return jsonError("Un compte existe déjà avec cet e-mail.", 409);
  if (message.includes("UNIQUE constraint failed: merchants.slug")) return jsonError("Ce nom de commerce est déjà utilisé. Réessaie avec un nom un peu différent.", 409);
  if (message.includes("UNIQUE constraint failed: employees.email")) return jsonError("Cette adresse e-mail est déjà utilisée.", 409);
  if (message.includes("UNIQUE constraint failed: employees.login_code")) return jsonError("L’identifiant généré existe déjà. Réessaie.", 409);
  if (message.includes("idx_customers_merchant_phone_unique") || message.includes("UNIQUE constraint failed: customers.merchant_id, customers.phone")) {
    return jsonError("Une carte existe déjà pour ce numéro de téléphone.", 409);
  }
  console.error(error);
  return jsonError("Impossible de terminer l’action pour le moment.", 500);
}
