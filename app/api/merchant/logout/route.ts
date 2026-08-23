import { clearSessionCookie, destroySession } from "../../../../lib/auth";
import { isSameOrigin, jsonError } from "../../../../lib/http";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("Origine de la requête refusée.", 403);
  await destroySession(request);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie(request.url) } });
}
