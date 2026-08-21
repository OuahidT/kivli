import { env } from "cloudflare:workers";

type MailerBinding = { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };

export async function sendMerchantVerificationEmail(input: {
  email: string;
  firstName: string;
  businessName: string;
  verificationUrl: string;
}) {
  const runtimeEnv = env as unknown as { ADMIN_MAILER?: MailerBinding };
  if (!runtimeEnv.ADMIN_MAILER) throw new Error("Le service d’e-mail est indisponible.");
  const response = await runtimeEnv.ADMIN_MAILER.fetch("https://kivli-admin.internal/internal/merchant-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("L’e-mail de confirmation n’a pas pu être envoyé.");
}

export async function sendMerchantFeedbackEmail(input: {
  ownerName: string;
  businessName: string;
  email: string;
  merchantId: string;
  merchantCreatedAt?: string | null;
  type: string;
  message: string;
  programName?: string | null;
}) {
  const runtimeEnv = env as { ADMIN_MAILER?: MailerBinding };
  if (!runtimeEnv.ADMIN_MAILER) throw new Error("Le service d’e-mail est indisponible.");
  const response = await runtimeEnv.ADMIN_MAILER.fetch("https://kivli-admin.internal/internal/merchant-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Le retour n’a pas pu être envoyé.");
}
