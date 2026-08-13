import { ensureSchema, getD1 } from "../../../../db";
import { createPinHash, createSession } from "../../../../lib/auth";
import { cleanText, isHexColor, jsonError, readJson, safeApiError, validEmail } from "../../../../lib/http";
import { makeCode, makeId, slugify } from "../../../../lib/ids";
import { DEFAULT_PROGRAM_TERMS } from "../../../../lib/program-style";

type SignupPayload = {
  businessName?: string;
  email?: string;
  pin?: string;
  programName?: string;
  goal?: number;
  rewardText?: string;
  accentColor?: string;
};

export async function POST(request: Request) {
  try {
    const payload = await readJson<SignupPayload>(request);
    if (!payload) return jsonError("Les informations envoyées sont invalides.");

    const businessName = cleanText(payload.businessName, 80);
    const email = cleanText(payload.email, 160).toLowerCase();
    const pin = cleanText(payload.pin, 12);
    const programName = cleanText(payload.programName, 80) || "Ma carte fidélité";
    const rewardText = cleanText(payload.rewardText, 120);
    const goal = Math.max(3, Math.min(20, Math.round(Number(payload.goal) || 10)));
    const accentColor = isHexColor(payload.accentColor ?? "") ? payload.accentColor! : "#f05b3c";

    if (businessName.length < 2) return jsonError("Indique le nom du commerce.");
    if (!validEmail(email)) return jsonError("Indique un e-mail valide.");
    if (!/^\d{6}$/.test(pin)) return jsonError("Le code d’accès doit contenir 6 chiffres.");
    if (rewardText.length < 3) return jsonError("Indique la récompense promise au client.");

    await ensureSchema();
    const merchantId = makeId("mer");
    const programId = makeId("prg");
    const slug = `${slugify(businessName)}-${makeCode(4).toLowerCase()}`;
    const pinHash = await createPinHash(pin);
    const db = getD1();

    await db.batch([
      db.prepare(
        "INSERT INTO merchants (id, business_name, slug, email, pin_hash, accent_color) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(merchantId, businessName, slug, email, pinHash, accentColor),
      db.prepare(
        "INSERT INTO programs (id, merchant_id, name, goal, reward_text, terms) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(programId, merchantId, programName, goal, rewardText, DEFAULT_PROGRAM_TERMS),
    ]);

    const cookie = await createSession(merchantId, request.url);
    return Response.json(
      { merchant: { id: merchantId, businessName, slug, email, accentColor } },
      { status: 201, headers: { "Set-Cookie": cookie } },
    );
  } catch (error) {
    return safeApiError(error);
  }
}
