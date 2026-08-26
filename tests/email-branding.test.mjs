import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminSource = await readFile(new URL("../admin/src/index.ts", import.meta.url), "utf8");

function functionBody(name, nextName) {
  const start = adminSource.indexOf(`async function ${name}`);
  const end = adminSource.indexOf(`async function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} should exist`);
  assert.notEqual(end, -1, `${nextName} should delimit ${name}`);
  return adminSource.slice(start, end);
}

test("transactional email template uses the Kivli brand and remains email-client friendly", () => {
  assert.match(adminSource, /const EMAIL_LOGO_URL = "https:\/\/kivli\.fr\/google-wallet-program-logo\.png"/);
  assert.match(adminSource, /function renderBrandedEmail/);
  assert.match(adminSource, /role="presentation"/);
  assert.match(adminSource, /bgcolor="#f05b3c"/);
  assert.match(adminSource, /alt="Logo Kivli"/);
  assert.match(adminSource, /meta name="viewport"/);
  assert.match(adminSource, /contact@kivli\.fr/);
});

test("new-device alert preserves its security action inside the shared branded template", () => {
  const source = functionBody("sendOwnerNewDevice", "sendResetEmail");
  assert.match(source, /renderBrandedEmail\(\{/);
  assert.match(source, /eyebrow: "Sécurité du compte"/);
  assert.match(source, /action: \{ label: "Ce n’était pas moi", url: securityUrl \}/);
  assert.match(source, /L’ouverture du bouton ne révoque rien automatiquement/);
  assert.match(source, /sendSmtpEmail\(env, email, "Nouvelle connexion à votre compte Kivli", textBody, htmlBody\)/);
});

test("merchant verification is multipart and uses the same branded template", () => {
  const source = functionBody("sendMerchantVerification", "sendPilotAcceptanceConfirmation");
  assert.match(source, /renderBrandedEmail\(\{/);
  assert.match(source, /eyebrow: "Bienvenue chez Kivli"/);
  assert.match(source, /action: \{ label: "Confirmer mon adresse e-mail", url: verificationUrl \}/);
  assert.match(source, /Ce lien expire dans 30 minutes/);
  assert.match(source, /sendSmtpEmail\(env, email, "Confirmez votre compte Kivli", message, htmlBody\)/);
});

test("pilot activation confirmation uses the same branded template and keeps legal references", () => {
  const source = functionBody("sendPilotAcceptanceConfirmation", "sendMerchantFeedback");
  assert.match(source, /renderBrandedEmail\(\{/);
  assert.match(source, /eyebrow: "Pilote activé"/);
  assert.match(source, /action: \{ label: "Accéder à mon espace Kivli", url: "https:\/\/kivli\.fr\/dashboard" \}/);
  assert.match(source, /https:\/\/kivli\.fr\/conditions-pilote/);
  assert.match(source, /https:\/\/kivli\.fr\/accord-traitement-donnees/);
  assert.match(source, /sendSmtpEmail\(env, email, "Votre pilote Kivli est activé", textBody, htmlBody\)/);
});
