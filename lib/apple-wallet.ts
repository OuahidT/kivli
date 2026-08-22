import { env } from "cloudflare:workers";
import { ensureSchema, getD1, queryAll, queryFirst } from "../db";
import { getCardByCode } from "./data";
import { walletRewardSnapshot } from "./google-wallet-content";
import { buildSignedPkpass } from "./apple-pass-signing";
import type { CardData } from "./types";

const KIVLI_ORIGIN = "https://kivli.fr";
const APPLE_WEB_SERVICE_URL = `${KIVLI_ORIGIN}/api/apple-wallet`;

type AppleWalletEnv = {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  APPLE_WALLET_APNS?: { fetch(request: Request): Promise<Response> };
  APPLE_WALLET_ENABLED?: string;
  APPLE_WALLET_PASS_TYPE_ID?: string;
  APPLE_WALLET_TEAM_ID?: string;
  APPLE_WALLET_AUTH_SECRET?: string;
  APPLE_WALLET_SIGNING_CERTIFICATE_PEM?: string;
  APPLE_WALLET_SIGNING_PRIVATE_KEY_PEM?: string;
  APPLE_WALLET_WWDR_CERTIFICATE_PEM?: string;
};

type AppleWalletCoreConfig = {
  passTypeIdentifier: string;
  teamIdentifier: string;
  authenticationSecret: string;
};

export type ApplePassField = {
  key: string;
  label?: string;
  value: string | number;
  changeMessage?: string;
  textAlignment?: "PKTextAlignmentLeft" | "PKTextAlignmentCenter" | "PKTextAlignmentRight";
};

export type AppleStoreCardSource = {
  formatVersion: 1;
  passTypeIdentifier: string;
  serialNumber: string;
  teamIdentifier: string;
  organizationName: string;
  description: string;
  logoText: string;
  foregroundColor: string;
  backgroundColor: string;
  labelColor: string;
  webServiceURL: string;
  authenticationToken: string;
  barcode: { format: "PKBarcodeFormatQR"; message: string; messageEncoding: "iso-8859-1"; altText: string };
  barcodes: Array<{ format: "PKBarcodeFormatQR"; message: string; messageEncoding: "iso-8859-1"; altText: string }>;
  storeCard: {
    headerFields: ApplePassField[];
    primaryFields: ApplePassField[];
    secondaryFields: ApplePassField[];
    auxiliaryFields: ApplePassField[];
    backFields: ApplePassField[];
  };
  userInfo: { membershipId: string; programId: string; cardCode: string };
};

function runtimeEnv() {
  return env as unknown as AppleWalletEnv;
}

function coreConfig(): AppleWalletCoreConfig | null {
  const current = runtimeEnv();
  if (!current.APPLE_WALLET_PASS_TYPE_ID || !current.APPLE_WALLET_TEAM_ID || !current.APPLE_WALLET_AUTH_SECRET) return null;
  return {
    passTypeIdentifier: current.APPLE_WALLET_PASS_TYPE_ID,
    teamIdentifier: current.APPLE_WALLET_TEAM_ID,
    authenticationSecret: current.APPLE_WALLET_AUTH_SECRET,
  };
}

export function appleWalletConfigured() {
  const current = runtimeEnv();
  return Boolean(
    current.APPLE_WALLET_ENABLED === "1"
      && coreConfig()
      && current.APPLE_WALLET_SIGNING_CERTIFICATE_PEM
      && current.APPLE_WALLET_SIGNING_PRIVATE_KEY_PEM
      && current.APPLE_WALLET_WWDR_CERTIFICATE_PEM,
  );
}

export function appleWalletSecretSlots() {
  return [
    "APPLE_WALLET_AUTH_SECRET",
    "APPLE_WALLET_PASS_TYPE_ID",
    "APPLE_WALLET_TEAM_ID",
    "APPLE_WALLET_SIGNING_CERTIFICATE_PEM",
    "APPLE_WALLET_SIGNING_PRIVATE_KEY_PEM",
    "APPLE_WALLET_WWDR_CERTIFICATE_PEM",
    "APPLE_WALLET_ENABLED",
  ] as const;
}

function safeSerial(value: string) {
  return `kivli-${value.replace(/[^a-zA-Z0-9.-]/g, "-").slice(0, 80)}`;
}

function hexToRgb(value: string) {
  const safe = /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : "f05b3c";
  return `rgb(${Number.parseInt(safe.slice(0, 2), 16)}, ${Number.parseInt(safe.slice(2, 4), 16)}, ${Number.parseInt(safe.slice(4, 6), 16)})`;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmac(value: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function hash(value: string) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function appleRewardDetails(card: CardData) {
  const snapshot = walletRewardSnapshot(card);
  const unit = card.earningMode === "spend" ? "pts" : "passages";
  const tiers = card.rewardTiers.length
    ? card.rewardTiers
    : [{ id: "default", threshold: card.goal, rewardText: card.rewardText, sortOrder: 0 }];
  const available = card.availableRewardItems;
  const locked = tiers.filter((tier) => tier.threshold > card.points);
  return {
    snapshot,
    allTiers: tiers.map((tier) => `${tier.threshold} ${unit} · ${tier.rewardText}`).join("\n"),
    available: available.length
      ? available.map((tier) => `${tier.threshold} ${unit} · ${tier.rewardText}`).join("\n")
      : "Aucune récompense accessible pour le moment.",
    locked: locked.length
      ? locked.map((tier) => `${tier.threshold} ${unit} · ${tier.rewardText} · encore ${tier.threshold - card.points}`).join("\n")
      : "Tous les paliers sont atteints.",
  };
}

export function appleStoreCardPreview(card: CardData) {
  const details = appleRewardDetails(card);
  const balanceLabel = card.earningMode === "spend" ? "POINTS" : "PASSAGES";
  return {
    headerFields: [
      {
        key: "balance",
        label: balanceLabel,
        value: card.points,
        changeMessage: card.earningMode === "spend"
          ? "Votre solde est maintenant de %@ points."
          : "Votre progression est maintenant de %@ passages.",
        textAlignment: "PKTextAlignmentRight",
      },
    ],
    primaryFields: [
      {
        key: "rewards",
        label: "RÉCOMPENSES",
        value: details.snapshot.availableLabel,
        textAlignment: "PKTextAlignmentCenter",
      },
    ],
    secondaryFields: [
      { key: "next-tier", label: "PROCHAIN PALIER", value: details.snapshot.nextTier },
      {
        key: "reward-details-hint",
        label: "DÉTAILS DES RÉCOMPENSES",
        value: "Au dos •••",
      },
    ],
    auxiliaryFields: [],
    backFields: [
      { key: "customer", label: "Carte de fidélité de", value: card.firstName },
      { key: "all-tiers", label: "Tous les paliers", value: details.allTiers },
      { key: "available-tiers", label: "Récompenses accessibles", value: details.available },
      { key: "locked-tiers", label: "À débloquer", value: details.locked },
      { key: "conditions", label: "Conditions du programme", value: card.terms || "Les conditions sont définies par le professionnel." },
      { key: "kivli", label: "Kivli", value: "Carte de fidélité propulsée par Kivli 🧡" },
    ],
  } satisfies AppleStoreCardSource["storeCard"];
}

export async function createAppleStoreCardSource(card: CardData): Promise<AppleStoreCardSource> {
  const config = coreConfig();
  if (!config) throw new Error("La configuration Apple Wallet sera finalisée après l’inscription Apple Developer.");
  const serialNumber = safeSerial(card.membershipId);
  const authenticationToken = await hmac(`${config.passTypeIdentifier}:${card.membershipId}`, config.authenticationSecret);
  const cardUrl = `${KIVLI_ORIGIN}/c/${encodeURIComponent(card.code)}`;
  return {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeIdentifier,
    serialNumber,
    teamIdentifier: config.teamIdentifier,
    organizationName: card.businessName,
    description: card.name,
    logoText: card.businessName,
    foregroundColor: "rgb(255, 255, 255)",
    backgroundColor: hexToRgb(card.accentColor),
    labelColor: "rgb(255, 255, 255)",
    webServiceURL: APPLE_WEB_SERVICE_URL,
    authenticationToken,
    barcode: { format: "PKBarcodeFormatQR", message: cardUrl, messageEncoding: "iso-8859-1", altText: card.code },
    barcodes: [{ format: "PKBarcodeFormatQR", message: cardUrl, messageEncoding: "iso-8859-1", altText: card.code }],
    storeCard: appleStoreCardPreview(card),
    userInfo: { membershipId: card.membershipId, programId: card.id, cardCode: card.code },
  };
}

export async function rememberAppleWalletPass(card: CardData, source: AppleStoreCardSource) {
  await ensureSchema();
  const tokenHash = await hash(source.authenticationToken);
  const tag = Math.floor(Date.now() / 1000);
  await getD1().prepare(`INSERT INTO apple_wallet_passes
    (membership_id, serial_number, pass_type_identifier, authentication_token_hash, last_updated_tag)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(membership_id) DO UPDATE SET
      serial_number = excluded.serial_number,
      pass_type_identifier = excluded.pass_type_identifier,
      authentication_token_hash = excluded.authentication_token_hash,
      updated_at = CURRENT_TIMESTAMP`)
    .bind(card.membershipId, source.serialNumber, source.passTypeIdentifier, tokenHash, tag).run();
}

export async function verifyAppleWalletRequest(passTypeIdentifier: string, serialNumber: string, authorization: string | null) {
  const config = coreConfig();
  if (!config || passTypeIdentifier !== config.passTypeIdentifier) return false;
  const token = authorization?.match(/^ApplePass\s+(.+)$/i)?.[1] ?? "";
  if (!token) return false;
  const record = await queryFirst<{ tokenHash: string }>(
    "SELECT authentication_token_hash AS tokenHash FROM apple_wallet_passes WHERE pass_type_identifier = ? AND serial_number = ?",
    passTypeIdentifier,
    serialNumber,
  );
  return Boolean(record && secureEqual(record.tokenHash, await hash(token)));
}

export async function registerAppleWalletDevice(deviceId: string, passTypeId: string, serialNumber: string, pushToken: string) {
  await ensureSchema();
  const db = getD1();
  const existing = await db.prepare(`SELECT 1 FROM apple_wallet_registrations
    WHERE device_library_identifier = ? AND pass_type_identifier = ? AND serial_number = ?`)
    .bind(deviceId, passTypeId, serialNumber).first();
  await db.batch([
    db.prepare(`INSERT INTO apple_wallet_devices (device_library_identifier, push_token)
      VALUES (?, ?) ON CONFLICT(device_library_identifier) DO UPDATE SET push_token = excluded.push_token, updated_at = CURRENT_TIMESTAMP`)
      .bind(deviceId, pushToken),
    db.prepare(`INSERT OR IGNORE INTO apple_wallet_registrations
      (device_library_identifier, pass_type_identifier, serial_number) VALUES (?, ?, ?)`)
      .bind(deviceId, passTypeId, serialNumber),
  ]);
  return existing ? 200 : 201;
}

export async function unregisterAppleWalletDevice(deviceId: string, passTypeId: string, serialNumber: string) {
  await ensureSchema();
  const db = getD1();
  await db.batch([
    db.prepare(`DELETE FROM apple_wallet_registrations
      WHERE device_library_identifier = ? AND pass_type_identifier = ? AND serial_number = ?`)
      .bind(deviceId, passTypeId, serialNumber),
    db.prepare(`DELETE FROM apple_wallet_devices WHERE device_library_identifier = ?
      AND NOT EXISTS (SELECT 1 FROM apple_wallet_registrations WHERE device_library_identifier = ?)`)
      .bind(deviceId, deviceId),
  ]);
}

export async function updatedAppleWalletSerials(deviceId: string, passTypeId: string, since: number | null) {
  const config = coreConfig();
  if (!config || config.passTypeIdentifier !== passTypeId) return null;
  const rows = await queryAll<{ serialNumber: string; updatedTag: number }>(`SELECT p.serial_number AS serialNumber, p.last_updated_tag AS updatedTag
    FROM apple_wallet_registrations r JOIN apple_wallet_passes p ON p.serial_number = r.serial_number
    WHERE r.device_library_identifier = ? AND r.pass_type_identifier = ? AND (? IS NULL OR p.last_updated_tag > ?)
    ORDER BY p.last_updated_tag`, deviceId, passTypeId, since, since);
  if (!rows.length) return { serialNumbers: [] as string[], lastUpdated: String(since ?? 0) };
  return {
    serialNumbers: rows.map((row) => row.serialNumber),
    lastUpdated: String(Math.max(...rows.map((row) => row.updatedTag))),
  };
}

export async function cardForAppleWalletSerial(passTypeId: string, serialNumber: string) {
  const config = coreConfig();
  if (!config || config.passTypeIdentifier !== passTypeId) return null;
  const record = await queryFirst<{ code: string }>(`SELECT mb.code
    FROM apple_wallet_passes ap JOIN memberships mb ON mb.id = ap.membership_id
    WHERE ap.pass_type_identifier = ? AND ap.serial_number = ?`, passTypeId, serialNumber);
  return record ? getCardByCode(record.code) : null;
}

export async function markAppleWalletPassServed(serialNumber: string) {
  await ensureSchema();
  await getD1().prepare("UPDATE apple_wallet_passes SET push_pending = 0, updated_at = CURRENT_TIMESTAMP WHERE serial_number = ?")
    .bind(serialNumber).run();
}

export async function pendingAppleWalletPushTargets(serialNumber: string) {
  return queryAll<{ pushToken: string }>(`SELECT DISTINCT d.push_token AS pushToken
    FROM apple_wallet_registrations r JOIN apple_wallet_devices d ON d.device_library_identifier = r.device_library_identifier
    WHERE r.serial_number = ?`, serialNumber);
}

export async function touchAppleWalletPassByCode(code: string) {
  const card = await getCardByCode(code.toUpperCase());
  if (!card) return false;
  await ensureSchema();
  const result = await getD1().prepare(`UPDATE apple_wallet_passes SET
    last_updated_tag = MAX(last_updated_tag + 1, unixepoch()), push_pending = 1, updated_at = CURRENT_TIMESTAMP
    WHERE membership_id = ?`).bind(card.membershipId).run();
  return Number(result.meta.changes ?? 0) > 0;
}

export async function syncAppleWalletSafely(code: string) {
  try {
    const changed = await touchAppleWalletPassByCode(code);
    if (!changed) return;
    const card = await getCardByCode(code.toUpperCase());
    if (!card) return;
    const serialNumber = safeSerial(card.membershipId);
    const targets = await pendingAppleWalletPushTargets(serialNumber);
    const current = runtimeEnv();
    const config = coreConfig();
    if (!targets.length || !current.APPLE_WALLET_APNS || !config) return;
    await Promise.allSettled(targets.map(async ({ pushToken }) => {
      if (!/^[a-f0-9]{32,256}$/i.test(pushToken)) return;
      const response = await current.APPLE_WALLET_APNS!.fetch(new Request(`https://api.push.apple.com/3/device/${pushToken}`, {
        method: "POST",
        headers: {
          "apns-priority": "10",
          "apns-topic": config.passTypeIdentifier,
          "content-type": "application/json",
        },
        body: "{}",
      }));
      if (!response.ok) console.error("Notification Apple Wallet refusée.", response.status, await response.text());
    }));
  } catch (error) {
    console.error("Synchronisation Apple Wallet différée.", error instanceof Error ? error.message : "Erreur inconnue");
  }
}

async function applePassAssets() {
  const assets = runtimeEnv().ASSETS;
  if (!assets) throw new Error("Les ressources visuelles Apple Wallet sont indisponibles.");
  const files: Record<string, Uint8Array> = {};
  for (const name of ["icon.png", "icon@2x.png", "icon@3x.png"]) {
    const response = await assets.fetch(new Request(`https://assets.kivli.local/apple-pass/${name}`));
    if (!response.ok) throw new Error(`La ressource Apple Wallet ${name} est introuvable.`);
    files[name] = new Uint8Array(await response.arrayBuffer());
  }
  return files;
}

export async function createSignedAppleWalletPass(card: CardData): Promise<Uint8Array> {
  const current = runtimeEnv();
  if (!appleWalletConfigured()
    || !current.APPLE_WALLET_SIGNING_CERTIFICATE_PEM
    || !current.APPLE_WALLET_SIGNING_PRIVATE_KEY_PEM
    || !current.APPLE_WALLET_WWDR_CERTIFICATE_PEM) {
    throw new Error("La signature Apple Wallet n’est pas encore configurée.");
  }
  const source = await createAppleStoreCardSource(card);
  const sourceFiles = {
    "pass.json": new TextEncoder().encode(JSON.stringify(source)),
    ...await applePassAssets(),
  };
  return buildSignedPkpass(sourceFiles, {
    signingCertificatePem: current.APPLE_WALLET_SIGNING_CERTIFICATE_PEM,
    signingPrivateKeyPem: current.APPLE_WALLET_SIGNING_PRIVATE_KEY_PEM,
    wwdrCertificatePem: current.APPLE_WALLET_WWDR_CERTIFICATE_PEM,
  });
}
