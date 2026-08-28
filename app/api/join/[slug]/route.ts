import { ensureSchema, getD1, queryFirst } from "../../../../db";
import { getProgramBySlug } from "../../../../lib/data";
import { cleanText, isSameOrigin, jsonError, normalizePhone, readJson, safeApiError } from "../../../../lib/http";
import { makeCode, makeId } from "../../../../lib/ids";
import { MARKETING_CONSENT_VERSION } from "../../../../lib/legal";

type JoinPayload = { firstName?: string; phone?: string; marketingConsent?: boolean | string };
type ExistingRow = { code: string; customerId: string; marketingConsent: number };

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    if (!isSameOrigin(request)) return jsonError("Origine de la requête refusée.", 403);
    const { slug } = await context.params;
    const program = await getProgramBySlug(slug);
    if (!program) return jsonError("Programme introuvable.", 404);
    const payload = await readJson<JoinPayload>(request);
    const firstName = cleanText(payload?.firstName, 50);
    const phone = normalizePhone(payload?.phone);
    const marketingConsent = payload?.marketingConsent === true || payload?.marketingConsent === "on";
    if (firstName.length < 2) return jsonError("Indique ton prénom.");
    if (!phone) return jsonError("Indique un numéro de téléphone valide.");

    const existing = await queryFirst<ExistingRow>(
      `SELECT mb.code, c.id AS customerId, c.marketing_consent AS marketingConsent FROM memberships mb JOIN customers c ON c.id = mb.customer_id
       WHERE mb.program_id = ? AND mb.deleted_at IS NULL AND c.phone = ? LIMIT 1`, program.id, phone,
    );
    if (existing) {
      if (marketingConsent && !existing.marketingConsent) {
        await getD1().prepare(`UPDATE customers SET marketing_consent = 1, marketing_consented_at = ?, marketing_consent_version = ?, marketing_consent_source = 'client_join', marketing_withdrawn_at = NULL WHERE id = ?`)
          .bind(new Date().toISOString(), MARKETING_CONSENT_VERSION, existing.customerId).run();
      }
      return Response.json({ code: existing.code, existing: true });
    }

    await ensureSchema();
    const customerId = makeId("cus");
    const membershipId = makeId("mem");
    const code = makeCode(10);
    const db = getD1();
    await db.batch([
      db.prepare(`INSERT INTO customers
        (id, merchant_id, first_name, phone, marketing_consent, marketing_consented_at, marketing_consent_version, marketing_consent_source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(customerId, program.merchantId, firstName, phone, marketingConsent ? 1 : 0, marketingConsent ? new Date().toISOString() : null, marketingConsent ? MARKETING_CONSENT_VERSION : null, marketingConsent ? "client_join" : null),
      db.prepare(
        "INSERT INTO memberships (id, merchant_id, program_id, customer_id, code) VALUES (?, ?, ?, ?, ?)",
      ).bind(membershipId, program.merchantId, program.id, customerId, code),
    ]);
    return Response.json({ code, existing: false }, { status: 201 });
  } catch (error) {
    return safeApiError(error);
  }
}
