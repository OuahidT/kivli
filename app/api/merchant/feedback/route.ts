import { ensureSchema, getD1, queryFirst } from "../../../../db";
import { getMerchant, isOwner } from "../../../../lib/auth";
import { cleanText, jsonError, readJson, safeApiError } from "../../../../lib/http";
import { makeId } from "../../../../lib/ids";
import { sendMerchantFeedbackEmail } from "../../../../lib/mailer";

const FEEDBACK_TYPES = new Set(["Idée", "Amélioration", "Problème", "Autre"]);

export async function POST(request: Request) {
  try {
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Connecte-toi pour envoyer un retour.", 401);
    if (!isOwner(merchant)) return jsonError("Seul le propriétaire peut envoyer un retour.", 403);
    const body = await readJson<Record<string, unknown>>(request);
    const type = cleanText(body?.type, 40);
    const message = cleanText(body?.message, 2000);
    if (!FEEDBACK_TYPES.has(type)) return jsonError("Choisis un type de retour.", 400);
    if (message.length < 5) return jsonError("Ton message doit contenir au moins 5 caractères.", 400);

    await ensureSchema();
    const program = await queryFirst<{ name: string }>("SELECT name FROM programs WHERE merchant_id = ?", merchant.id);
    const id = makeId("fdb");
    const ownerName = `${merchant.firstName} ${merchant.lastName}`.trim() || merchant.businessName;
    const db = getD1();
    await db.prepare(`INSERT INTO merchant_feedback
      (id, merchant_id, business_name, owner_name, email, feedback_type, message, program_name, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`).bind(
      id, merchant.id, merchant.businessName, ownerName, merchant.email, type, message, program?.name ?? null,
    ).run();
    try {
      await sendMerchantFeedbackEmail({
        ownerName,
        businessName: merchant.businessName,
        email: merchant.email,
        merchantId: merchant.id,
        type,
        message,
        programName: program?.name ?? null,
      });
      await db.prepare("UPDATE merchant_feedback SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
    } catch (error) {
      await db.prepare("UPDATE merchant_feedback SET status = 'failed', error_message = ? WHERE id = ?").bind(String(error).slice(0, 500), id).run();
      throw error;
    }
    return Response.json({ ok: true });
  } catch (error) {
    return safeApiError(error);
  }
}
