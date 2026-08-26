import { ensureSchema, getD1, queryFirst } from "../db";
import type { MerchantIdentity } from "./auth";
import { currentPilotDocumentProofs, pilotDeclarationForBusiness } from "./legal";
import { makeId } from "./ids";

type AcceptanceRow = {
  id: string;
  acceptedAt: string;
};

export async function merchantHasCurrentPilotAcceptance(merchantId: string) {
  const proofs = await currentPilotDocumentProofs();
  const acceptance = await queryFirst<{ id: string }>(
    `SELECT id FROM merchant_pilot_acceptances
     WHERE merchant_id = ?
       AND pilot_terms_version = ? AND pilot_terms_sha256 = ?
       AND data_processing_version = ? AND data_processing_sha256 = ?
     LIMIT 1`,
    merchantId,
    proofs.pilotTerms.version,
    proofs.pilotTerms.sha256,
    proofs.dataProcessing.version,
    proofs.dataProcessing.sha256,
  );
  return Boolean(acceptance);
}

export async function requireCurrentPilotAcceptance(merchantId: string) {
  if (await merchantHasCurrentPilotAcceptance(merchantId)) return null;
  return Response.json(
    { error: "Le propriétaire doit d’abord activer gratuitement le pilote Kivli.", code: "pilot_acceptance_required" },
    { status: 428 },
  );
}

async function persistDocumentVersions() {
  const proofs = await currentPilotDocumentProofs();
  const db = getD1();
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO legal_document_versions
      (document_key, version, title, canonical_content, content_sha256)
      VALUES (?, ?, ?, ?, ?)`).bind(
      proofs.pilotTerms.key,
      proofs.pilotTerms.version,
      proofs.pilotTerms.title,
      proofs.pilotTerms.content,
      proofs.pilotTerms.sha256,
    ),
    db.prepare(`INSERT OR IGNORE INTO legal_document_versions
      (document_key, version, title, canonical_content, content_sha256)
      VALUES (?, ?, ?, ?, ?)`).bind(
      proofs.dataProcessing.key,
      proofs.dataProcessing.version,
      proofs.dataProcessing.title,
      proofs.dataProcessing.content,
      proofs.dataProcessing.sha256,
    ),
  ]);
  const [storedPilotTerms, storedDataProcessing] = await Promise.all([
    queryFirst<{ contentSha256: string }>(
      "SELECT content_sha256 AS contentSha256 FROM legal_document_versions WHERE document_key = ? AND version = ?",
      proofs.pilotTerms.key,
      proofs.pilotTerms.version,
    ),
    queryFirst<{ contentSha256: string }>(
      "SELECT content_sha256 AS contentSha256 FROM legal_document_versions WHERE document_key = ? AND version = ?",
      proofs.dataProcessing.key,
      proofs.dataProcessing.version,
    ),
  ]);
  if (storedPilotTerms?.contentSha256 !== proofs.pilotTerms.sha256 || storedDataProcessing?.contentSha256 !== proofs.dataProcessing.sha256) {
    throw new Error("Une version juridique existante porte une empreinte différente.");
  }
  return proofs;
}

export async function acceptCurrentPilotDocuments(owner: MerchantIdentity & { role: "owner" }) {
  await ensureSchema();
  const proofs = await persistDocumentVersions();
  const declarationText = pilotDeclarationForBusiness(owner.businessName);
  const acceptedAt = new Date().toISOString();
  const acceptanceId = makeId("pac");
  const db = getD1();
  const result = await db.prepare(`INSERT OR IGNORE INTO merchant_pilot_acceptances
    (id, merchant_id, owner_id, owner_name, owner_email, business_name, declaration_text,
     pilot_terms_version, pilot_terms_sha256, data_processing_version, data_processing_sha256, accepted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      acceptanceId,
      owner.id,
      owner.id,
      `${owner.firstName} ${owner.lastName}`.trim(),
      owner.email,
      owner.businessName,
      declarationText,
      proofs.pilotTerms.version,
      proofs.pilotTerms.sha256,
      proofs.dataProcessing.version,
      proofs.dataProcessing.sha256,
      acceptedAt,
    ).run();
  const inserted = Number(result.meta.changes ?? 0) > 0;
  const acceptance = await queryFirst<AcceptanceRow>(
    `SELECT id, accepted_at AS acceptedAt FROM merchant_pilot_acceptances
     WHERE merchant_id = ?
       AND pilot_terms_version = ? AND pilot_terms_sha256 = ?
       AND data_processing_version = ? AND data_processing_sha256 = ?
     LIMIT 1`,
    owner.id,
    proofs.pilotTerms.version,
    proofs.pilotTerms.sha256,
    proofs.dataProcessing.version,
    proofs.dataProcessing.sha256,
  );
  if (!acceptance) throw new Error("L’acceptation du pilote n’a pas pu être enregistrée.");
  await db.prepare(`UPDATE merchants SET
    terms_accepted_at = COALESCE(terms_accepted_at, ?), terms_version = ?,
    welcome_seen_at = COALESCE(welcome_seen_at, CURRENT_TIMESTAMP)
    WHERE id = ?`).bind(acceptance.acceptedAt, proofs.pilotTerms.version, owner.id).run();
  return {
    acceptanceId: acceptance.id,
    acceptedAt: acceptance.acceptedAt,
    declarationText,
    inserted,
    pilotTermsVersion: proofs.pilotTerms.version,
    pilotTermsSha256: proofs.pilotTerms.sha256,
    dataProcessingVersion: proofs.dataProcessing.version,
    dataProcessingSha256: proofs.dataProcessing.sha256,
  };
}
