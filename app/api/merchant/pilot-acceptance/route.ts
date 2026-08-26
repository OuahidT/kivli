import { getMerchant, isOwner } from "../../../../lib/auth";
import { acceptedCheckbox } from "../../../../lib/legal";
import { isSameOrigin, jsonError, readJson, safeApiError } from "../../../../lib/http";
import { sendPilotAcceptanceConfirmationEmail } from "../../../../lib/mailer";
import { acceptCurrentPilotDocuments } from "../../../../lib/pilot-acceptance";

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Origine de la requête refusée.", 403);
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    if (!isOwner(merchant)) return jsonError("Seul le propriétaire peut activer le pilote.", 403);
    const payload = await readJson<{ accepted?: boolean | string }>(request);
    if (!acceptedCheckbox(payload?.accepted)) return jsonError("Confirme l’acceptation des deux documents pour activer le pilote.");

    const acceptance = await acceptCurrentPilotDocuments(merchant);
    let emailSent = !acceptance.inserted;
    if (acceptance.inserted) {
      try {
        await sendPilotAcceptanceConfirmationEmail({
          email: merchant.email,
          firstName: merchant.firstName,
          businessName: merchant.businessName,
          acceptedAt: acceptance.acceptedAt,
          pilotTermsVersion: acceptance.pilotTermsVersion,
          dataProcessingVersion: acceptance.dataProcessingVersion,
        });
        emailSent = true;
      } catch (error) {
        console.error("Confirmation d’acceptation du pilote non envoyée.", error instanceof Error ? error.message : "Erreur inconnue");
      }
    }
    return Response.json({ ok: true, acceptedAt: acceptance.acceptedAt, emailSent });
  } catch (error) {
    return safeApiError(error);
  }
}
