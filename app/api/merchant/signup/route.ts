import { ensureSchema, getD1 } from "../../../../db";
import { createPasswordHash, createSession, validOwnerPassword } from "../../../../lib/auth";
import { cleanText, jsonError, readJson, safeApiError, validEmail } from "../../../../lib/http";
import { makeCode, makeId, slugify } from "../../../../lib/ids";

type SignupPayload = {
  firstName?: string;
  lastName?: string;
  businessName?: string;
  email?: string;
  phone?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
    const payload = await readJson<SignupPayload>(request);
    if (!payload) return jsonError("Les informations envoyées sont invalides.");

    const firstName = cleanText(payload.firstName, 60);
    const lastName = cleanText(payload.lastName, 60);
    const businessName = cleanText(payload.businessName, 80);
    const email = cleanText(payload.email, 160).toLowerCase();
    const phone = cleanText(payload.phone, 30);
    const password = typeof payload.password === "string" ? payload.password.slice(0, 128) : "";

    if (firstName.length < 2) return jsonError("Indique ton prénom.");
    if (lastName.length < 2) return jsonError("Indique ton nom.");
    if (businessName.length < 2) return jsonError("Indique le nom du commerce.");
    if (!validEmail(email)) return jsonError("Indique un e-mail valide.");
    if (phone && phone.replace(/\D/g, "").length < 8) return jsonError("Indique un numéro de téléphone valide ou laisse le champ vide.");
    if (!validOwnerPassword(password)) {
      return jsonError("Choisis un mot de passe d’au moins 8 caractères avec une majuscule, une minuscule et un chiffre.");
    }

    await ensureSchema();
    const merchantId = makeId("mer");
    const slug = `${slugify(businessName)}-${makeCode(4).toLowerCase()}`;
    const passwordHash = await createPasswordHash(password);
    const db = getD1();

    await db.prepare(
      "INSERT INTO merchants (id, first_name, last_name, business_name, slug, email, phone, pin_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(merchantId, firstName, lastName, businessName, slug, email, phone || null, passwordHash).run();

    const cookie = await createSession(merchantId, request.url);
    return Response.json(
      { merchant: { id: merchantId, firstName, lastName, businessName, slug, email, phone: phone || null, accentColor: "#f05b3c" } },
      { status: 201, headers: { "Set-Cookie": cookie } },
    );
  } catch (error) {
    return safeApiError(error);
  }
}
