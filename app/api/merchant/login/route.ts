import { ensureSchema, getD1, queryFirst } from "../../../../db";
import { createSessionDetails, verifyPassword } from "../../../../lib/auth";
import { cleanText, isSameOrigin, jsonError, readJson, safeApiError, validEmail } from "../../../../lib/http";
import { clearSuccessfulLoginFailures, loginThrottle, recordLoginFailure } from "../../../../lib/login-throttle";
import { registerOrRecognizeOwnerDevice } from "../../../../lib/owner-security";

type LoginPayload = { identifier?: string; email?: string; password?: string; pin?: string };
type MerchantRow = {
  id: string;
  firstName: string;
  businessName: string;
  slug: string;
  email: string;
  pinHash: string;
  accentColor: string;
  ownerPinChangeRequired: number;
};
type EmployeeRow = MerchantRow & {
  employeeId: string;
  employeeName: string;
  employeePinHash: string;
};

const DUMMY_PIN_HASH = "pbkdf2$100000$7f3a2c119de847b65a0c91d426eb7221$0e17ede6a26dea337ba670a0d79ef3af1e4b8d3785274eb7facd3f7ff2ac46f3";
export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Origine de la requête refusée.", 403);
    const payload = await readJson<LoginPayload>(request);
    const identifier = cleanText(payload?.identifier ?? payload?.email, 160);
    const normalizedIdentifier = identifier.toLowerCase();
    const credentialValue = payload?.password ?? payload?.pin;
    const credential = typeof credentialValue === "string" ? credentialValue.slice(0, 128) : "";
    const identifierIsEmail = validEmail(normalizedIdentifier);
    const identifierIsCode = /^[a-z0-9-]{4,40}$/i.test(identifier);
    if ((!identifierIsEmail && !identifierIsCode) || !credential) {
      return jsonError("Identifiant ou accès incorrect.", 401);
    }

    const throttle = await loginThrottle(request, normalizedIdentifier);
    if (throttle.lockedUntil) {
      const seconds = Math.max(1, Math.ceil((throttle.lockedUntil.getTime() - Date.now()) / 1000));
      return Response.json(
        { error: "Trop de tentatives. Réessaie un peu plus tard." },
        { status: 429, headers: { "Retry-After": String(seconds) } },
      );
    }

    const [owner, employee] = await Promise.all([
      identifierIsEmail
        ? queryFirst<MerchantRow>(
          `SELECT id, first_name AS firstName, business_name AS businessName, slug, email,
            pin_hash AS pinHash, accent_color AS accentColor,
            COALESCE(owner_pin_change_required, 0) AS ownerPinChangeRequired
           FROM merchants WHERE email = ?`,
          normalizedIdentifier,
        )
        : Promise.resolve(null),
      queryFirst<EmployeeRow>(
        `SELECT m.id, m.first_name AS firstName, m.business_name AS businessName, m.slug, m.email,
          m.pin_hash AS pinHash, m.accent_color AS accentColor,
          COALESCE(m.owner_pin_change_required, 0) AS ownerPinChangeRequired,
          e.id AS employeeId, e.display_name AS employeeName,
          e.pin_hash AS employeePinHash
         FROM employees e JOIN merchants m ON m.id = e.merchant_id
         WHERE e.active = 1 AND (LOWER(e.email) = ? OR UPPER(e.login_code) = ?)
         LIMIT 1`,
        normalizedIdentifier,
        identifier.toUpperCase(),
      ),
    ]);
    const candidateHash = owner?.pinHash ?? employee?.employeePinHash ?? DUMMY_PIN_HASH;
    const credentialMatch = await verifyPassword(/^\d{6}$/.test(credential) ? credential : "000000", candidateHash);
    const ownerMatch = Boolean(owner && credentialMatch);
    const employeeMatch = Boolean(employee && credentialMatch);
    const merchant = ownerMatch ? owner : employeeMatch ? employee : null;
    if (!merchant) {
      await recordLoginFailure(throttle);
      return jsonError("Identifiant ou accès incorrect.", 401);
    }

    if (ownerMatch && owner?.ownerPinChangeRequired) {
      return jsonError("Une modification de ton code confidentiel est requise. Utilise le lien de sécurité reçu par e-mail.", 403);
    }

    const adminState = await queryFirst<{ status: string }>(
      "SELECT status FROM merchant_admin_state WHERE merchant_id = ?",
      merchant.id,
    );
    if (adminState?.status === "suspended") {
      return jsonError("Ce compte est temporairement suspendu. Contacte l’assistance Kivli.", 403);
    }

    await ensureSchema();
    await clearSuccessfulLoginFailures(throttle);

    const role = ownerMatch ? "owner" : "employee";
    const employeeId = role === "employee" ? employee!.employeeId : null;
    const session = await createSessionDetails(merchant.id, request.url, role, employeeId);
    let deviceCookie: string | null = null;
    if (role === "owner") {
      try {
        deviceCookie = (await registerOrRecognizeOwnerDevice(request, {
          id: merchant.id,
          email: merchant.email,
          firstName: merchant.firstName,
          businessName: merchant.businessName,
        })).cookie;
      } catch (error) {
        await getD1().prepare("DELETE FROM merchant_sessions WHERE id = ? AND merchant_id = ?")
          .bind(session.sessionId, merchant.id)
          .run();
        throw error;
      }
    }
    const safeMerchant = {
      id: merchant.id,
      businessName: merchant.businessName,
      slug: merchant.slug,
      email: merchant.email,
      accentColor: merchant.accentColor,
    };
    const headers = new Headers();
    headers.append("Set-Cookie", session.cookie);
    if (deviceCookie) headers.append("Set-Cookie", deviceCookie);
    return Response.json(
      { merchant: { ...safeMerchant, role, employeeName: role === "employee" ? employee!.employeeName : null } },
      { headers },
    );
  } catch (error) {
    return safeApiError(error);
  }
}
