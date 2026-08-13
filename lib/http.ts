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

export function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export function safeApiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Une erreur inattendue est survenue.";
  if (message.includes("UNIQUE constraint failed: merchants.email")) return jsonError("Un compte existe déjà avec cet e-mail.", 409);
  if (message.includes("UNIQUE constraint failed: merchants.slug")) return jsonError("Ce nom de commerce est déjà utilisé. Réessaie avec un nom un peu différent.", 409);
  if (message.includes("UNIQUE constraint failed: employees.email")) return jsonError("Cette adresse e-mail est déjà utilisée.", 409);
  if (message.includes("UNIQUE constraint failed: employees.login_code")) return jsonError("L’identifiant généré existe déjà. Réessaie.", 409);
  console.error(error);
  return jsonError("Impossible de terminer l’action pour le moment.", 500);
}
