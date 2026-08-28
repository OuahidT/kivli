import { getMerchant, isOwner } from "@/lib/auth";
import { deleteCustomerMembership } from "@/lib/customer-deletion";
import { cleanText, isSameOrigin, jsonError, readJson, safeApiError } from "@/lib/http";
import { requireCurrentPilotAcceptance } from "@/lib/pilot-acceptance";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ membershipId: string }> },
) {
  try {
    if (!isSameOrigin(request)) return jsonError("Origine de la requête refusée.", 403);
    const merchant = await getMerchant(request);
    if (!merchant) return jsonError("Session expirée.", 401);
    if (!isOwner(merchant)) return jsonError("Seul le propriétaire peut supprimer un client.", 403);
    const acceptanceError = await requireCurrentPilotAcceptance(merchant.id);
    if (acceptanceError) return acceptanceError;

    const { membershipId: rawMembershipId } = await context.params;
    const membershipId = cleanText(rawMembershipId, 100);
    const body = await readJson<{ confirmed?: boolean }>(request);
    if (!membershipId || body?.confirmed !== true) {
      return jsonError("Confirme explicitement la suppression du client.", 400);
    }

    const result = await deleteCustomerMembership(merchant.id, membershipId);
    if (!result) return jsonError("Client introuvable.", 404);
    return Response.json({
      ...result,
      message: result.alreadyDeleted ? "Ce client était déjà supprimé." : "Le client a été supprimé du programme.",
    });
  } catch (error) {
    return safeApiError(error);
  }
}
