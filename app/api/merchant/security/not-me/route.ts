import { isSameOrigin, jsonError, readJson, safeApiError } from "../../../../../lib/http";
import {
  claimUnknownDeviceIncident,
  clearOwnerDeviceCookie,
  clearOwnerRecoveryCookie,
} from "../../../../../lib/owner-security";
import { clearSessionCookie } from "../../../../../lib/auth";

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Origine de la requête refusée.", 403);
    const body = await readJson<{ token?: string }>(request);
    const token = typeof body?.token === "string" ? body.token.trim().slice(0, 300) : "";
    if (!token) return jsonError("Ce lien de sécurité n’est plus valide.", 410);
    const incident = await claimUnknownDeviceIncident(token);
    if (!incident) return jsonError("Ce lien de sécurité a expiré ou a déjà été utilisé.", 410);
    const headers = new Headers();
    headers.append("Set-Cookie", clearSessionCookie(request.url));
    headers.append("Set-Cookie", clearOwnerDeviceCookie());
    headers.append("Set-Cookie", clearOwnerRecoveryCookie());
    headers.append("Set-Cookie", incident.recoveryCookie);
    return Response.json({ ok: true, pinChangeRequired: true }, { headers });
  } catch (error) {
    return safeApiError(error);
  }
}
