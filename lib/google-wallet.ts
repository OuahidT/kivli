import { env } from "cloudflare:workers";
import { getCardByCode } from "./data";
import { walletRewardSnapshot } from "./google-wallet-content";
import type { CardData } from "./types";

const API_BASE = "https://walletobjects.googleapis.com/walletobjects/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const WALLET_SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";
const KIVLI_ORIGIN = "https://kivli.fr";

type GoogleCredentials = {
  client_email: string;
  private_key: string;
  private_key_id?: string;
  project_id?: string;
  token_uri?: string;
};

type WalletEnv = {
  GOOGLE_WALLET_CREDENTIALS_JSON?: string;
  GOOGLE_WALLET_ISSUER_ID?: string;
};

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

function runtimeConfig() {
  const runtimeEnv = env as unknown as WalletEnv;
  if (!runtimeEnv.GOOGLE_WALLET_CREDENTIALS_JSON || !runtimeEnv.GOOGLE_WALLET_ISSUER_ID) return null;
  const credentials = JSON.parse(runtimeEnv.GOOGLE_WALLET_CREDENTIALS_JSON) as GoogleCredentials;
  if (!credentials.client_email || !credentials.private_key) return null;
  return { credentials, issuerId: runtimeEnv.GOOGLE_WALLET_ISSUER_ID };
}

export function googleWalletConfigured() {
  try {
    return Boolean(runtimeConfig());
  } catch {
    return false;
  }
}

function base64Url(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signingKey(privateKey: string) {
  const body = privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(body);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    bytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function signJwt(header: Record<string, unknown>, claims: Record<string, unknown>, privateKey: string) {
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedClaims = base64Url(JSON.stringify(claims));
  const unsigned = `${encodedHeader}.${encodedClaims}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await signingKey(privateKey),
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

async function accessToken(credentials: GoogleCredentials) {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expiresAt > now + 60) return tokenCache.token;
  const assertion = await signJwt(
    { alg: "RS256", typ: "JWT", ...(credentials.private_key_id ? { kid: credentials.private_key_id } : {}) },
    {
      iss: credentials.client_email,
      scope: WALLET_SCOPE,
      aud: credentials.token_uri || TOKEN_URL,
      iat: now,
      exp: now + 3600,
    },
    credentials.private_key,
  );
  const response = await fetch(credentials.token_uri || TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const result = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !result.access_token) throw new Error(result.error_description || "Authentification Google Wallet impossible.");
  tokenCache = { token: result.access_token, expiresAt: now + (result.expires_in || 3600) };
  return result.access_token;
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 96);
}

function walletIds(card: CardData, issuerId: string) {
  return {
    classId: `${issuerId}.kivli_program_${safeId(card.id)}`,
    objectId: `${issuerId}.kivli_member_${safeId(card.membershipId)}`,
  };
}

function normalizedColor(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) || /^#[0-9a-f]{3}$/i.test(color) ? color : "#f05b3c";
}

function truncate(value: string, length: number) {
  return value.length <= length ? value : `${value.slice(0, Math.max(1, length - 1)).trim()}…`;
}

function field(path: string) {
  return { firstValue: { fields: [{ fieldPath: path }] } };
}

function loyaltyClass(card: CardData, issuerId: string) {
  const { classId } = walletIds(card, issuerId);
  return {
    id: classId,
    issuerName: truncate(card.businessName, 20),
    programName: truncate(card.name, 20),
    programLogo: {
      sourceUri: { uri: `${KIVLI_ORIGIN}/google-wallet-transparent-logo.png` },
      contentDescription: { defaultValue: { language: "fr-FR", value: "Élément visuel temporaire" } },
    },
    accountNameLabel: "Client",
    accountIdLabel: "Code client",
    rewardsTierLabel: "Programme",
    rewardsTier: card.earningMode === "spend" ? "Points" : "Passages",
    reviewStatus: "UNDER_REVIEW",
    countryCode: "FR",
    hexBackgroundColor: normalizedColor(card.accentColor),
    homepageUri: { uri: KIVLI_ORIGIN, description: "Kivli" },
    linksModuleData: {
      uris: [{ id: "kivli_home", uri: KIVLI_ORIGIN, description: "Ouvrir Kivli" }],
    },
    classTemplateInfo: {
      cardTemplateOverride: {
        cardRowTemplateInfos: [
          {
            twoItems: {
              startItem: field("object.loyaltyPoints.balance"),
              endItem: field("object.textModulesData['kivli_rewards_count']"),
            },
          },
          {
            twoItems: {
              startItem: field("object.textModulesData['kivli_next_tier']"),
              endItem: field("object.textModulesData['kivli_member_name']"),
            },
          },
          {
            oneItem: {
              item: field("object.textModulesData['kivli_rewards_hint']"),
            },
          },
        ],
      },
      detailsTemplateOverride: {
        detailsItemInfos: [
          { item: field("object.textModulesData['kivli_all_tiers']") },
          { item: field("object.textModulesData['kivli_available_tiers']") },
          { item: field("object.textModulesData['kivli_locked_tiers']") },
          { item: field("object.textModulesData['kivli_conditions']") },
          { item: field("object.textModulesData['kivli_signature']") },
        ],
      },
    },
    multipleDevicesAndHoldersAllowedStatus: "ONE_USER_ALL_DEVICES",
  };
}

function loyaltyObject(card: CardData, issuerId: string) {
  const { classId, objectId } = walletIds(card, issuerId);
  const rewardSnapshot = walletRewardSnapshot(card);
  const cardUrl = `${KIVLI_ORIGIN}/c/${encodeURIComponent(card.code)}`;
  return {
    id: objectId,
    classId,
    state: "ACTIVE",
    accountName: truncate(card.firstName, 20),
    accountId: card.code,
    loyaltyPoints: { label: card.earningMode === "spend" ? "Points" : "Passages", balance: { int: card.points } },
    secondaryLoyaltyPoints: { label: "Récomp.", balance: { int: rewardSnapshot.availableCount } },
    barcode: { type: "QR_CODE", value: cardUrl, alternateText: card.code },
    textModulesData: [
      { id: "kivli_rewards_count", header: "Récompenses", body: rewardSnapshot.availableLabel },
      { id: "kivli_next_tier", header: "Prochain palier", body: rewardSnapshot.nextTier },
      { id: "kivli_member_name", header: "Bonjour", body: truncate(card.firstName, 20) },
      { id: "kivli_rewards_hint", body: "Détails des récompenses ⋮" },
      { id: "kivli_all_tiers", header: "Tous les paliers", body: rewardSnapshot.allTiers },
      { id: "kivli_available_tiers", header: "Récompenses accessibles", body: rewardSnapshot.availableTiers },
      { id: "kivli_locked_tiers", header: "À débloquer", body: rewardSnapshot.lockedTiers },
      { id: "kivli_conditions", header: "Conditions du programme", body: card.terms || "Les conditions sont définies par le professionnel." },
      { id: "kivli_signature", header: "Kivli", body: "Carte de fidélité propulsée par Kivli 🧡" },
    ],
    linksModuleData: {
      uris: [{ id: "kivli_card", uri: cardUrl, description: "Ouvrir ma carte Kivli" }],
    },
  };
}

async function walletRequest(path: string, init: RequestInit = {}) {
  const config = runtimeConfig();
  if (!config) throw new Error("Google Wallet n’est pas encore configuré.");
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await accessToken(config.credentials)}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  return response;
}

async function upsertClass(card: CardData, issuerId: string) {
  const body = loyaltyClass(card, issuerId);
  const existing = await walletRequest(`/loyaltyClass/${encodeURIComponent(body.id)}`);
  if (existing.status === 404) {
    const created = await walletRequest("/loyaltyClass", { method: "POST", body: JSON.stringify(body) });
    if (!created.ok) throw new Error(`Création de la classe Google Wallet impossible (${created.status}).`);
    return;
  }
  if (!existing.ok) throw new Error(`Lecture de la classe Google Wallet impossible (${existing.status}).`);
  const updates: Record<string, unknown> = { ...body };
  delete updates.id;
  const patched = await walletRequest(`/loyaltyClass/${encodeURIComponent(body.id)}`, { method: "PATCH", body: JSON.stringify(updates) });
  if (!patched.ok) throw new Error(`Mise à jour de la classe Google Wallet impossible (${patched.status}).`);
}

async function upsertObject(card: CardData, issuerId: string, createWhenMissing: boolean) {
  const body = loyaltyObject(card, issuerId);
  const existing = await walletRequest(`/loyaltyObject/${encodeURIComponent(body.id)}`);
  if (existing.status === 404) {
    if (!createWhenMissing) return false;
    const created = await walletRequest("/loyaltyObject", { method: "POST", body: JSON.stringify(body) });
    if (!created.ok) throw new Error(`Création de la carte Google Wallet impossible (${created.status}).`);
    return true;
  }
  if (!existing.ok) throw new Error(`Lecture de la carte Google Wallet impossible (${existing.status}).`);
  const updates: Record<string, unknown> = { ...body };
  delete updates.id;
  delete updates.classId;
  const patched = await walletRequest(`/loyaltyObject/${encodeURIComponent(body.id)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  if (!patched.ok) throw new Error(`Synchronisation Google Wallet impossible (${patched.status}).`);
  return true;
}

export async function createGoogleWalletSaveUrl(card: CardData) {
  const config = runtimeConfig();
  if (!config) throw new Error("Google Wallet n’est pas encore configuré.");
  await upsertClass(card, config.issuerId);
  await upsertObject(card, config.issuerId, true);
  const now = Math.floor(Date.now() / 1000);
  const object = loyaltyObject(card, config.issuerId);
  const jwt = await signJwt(
    { alg: "RS256", typ: "JWT", ...(config.credentials.private_key_id ? { kid: config.credentials.private_key_id } : {}) },
    {
      iss: config.credentials.client_email,
      aud: "google",
      origins: [KIVLI_ORIGIN],
      typ: "savetowallet",
      iat: now,
      exp: now + 3600,
      payload: { loyaltyObjects: [object] },
    },
    config.credentials.private_key,
  );
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

export async function syncGoogleWalletByCode(code: string) {
  const config = runtimeConfig();
  if (!config) return false;
  const card = await getCardByCode(code.toUpperCase());
  if (!card) return false;
  await upsertClass(card, config.issuerId);
  return upsertObject(card, config.issuerId, false);
}

export async function syncGoogleWalletSafely(code: string) {
  try {
    await syncGoogleWalletByCode(code);
  } catch (error) {
    console.error("Synchronisation Google Wallet différée.", error instanceof Error ? error.message : "Erreur inconnue");
  }
}
