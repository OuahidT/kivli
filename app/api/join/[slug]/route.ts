import { ensureSchema, getD1, queryFirst } from "../../../../db";
import { getProgramBySlug } from "../../../../lib/data";
import { cleanText, jsonError, readJson, safeApiError, validEmail } from "../../../../lib/http";
import { makeCode, makeId } from "../../../../lib/ids";

type JoinPayload = { firstName?: string; email?: string };
type ExistingRow = { code: string };

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const program = await getProgramBySlug(slug);
    if (!program) return jsonError("Programme introuvable.", 404);
    const payload = await readJson<JoinPayload>(request);
    const firstName = cleanText(payload?.firstName, 50);
    const email = cleanText(payload?.email, 160).toLowerCase();
    if (firstName.length < 2) return jsonError("Indique ton prénom.");
    if (email && !validEmail(email)) return jsonError("L’e-mail n’est pas valide.");

    if (email) {
      const existing = await queryFirst<ExistingRow>(
        `SELECT mb.code FROM memberships mb JOIN customers c ON c.id = mb.customer_id
         WHERE mb.program_id = ? AND c.email = ? LIMIT 1`,
        program.id,
        email,
      );
      if (existing) return Response.json({ code: existing.code, existing: true });
    }

    await ensureSchema();
    const customerId = makeId("cus");
    const membershipId = makeId("mem");
    const code = makeCode(10);
    const db = getD1();
    await db.batch([
      db.prepare("INSERT INTO customers (id, merchant_id, first_name, email) VALUES (?, ?, ?, ?)")
        .bind(customerId, program.merchantId, firstName, email || null),
      db.prepare(
        "INSERT INTO memberships (id, merchant_id, program_id, customer_id, code) VALUES (?, ?, ?, ?, ?)",
      ).bind(membershipId, program.merchantId, program.id, customerId, code),
    ]);
    return Response.json({ code, existing: false }, { status: 201 });
  } catch (error) {
    return safeApiError(error);
  }
}
