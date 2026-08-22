import * as asn1js from "asn1js";
import { zipSync } from "fflate";
import {
  Attribute,
  Certificate,
  ContentInfo,
  CryptoEngine,
  EncapsulatedContentInfo,
  IssuerAndSerialNumber,
  SignedAndUnsignedAttributes,
  SignedData,
  SignerInfo,
} from "pkijs";

const DATA_CONTENT_TYPE = "1.2.840.113549.1.7.1";
const SIGNED_DATA_CONTENT_TYPE = "1.2.840.113549.1.7.2";
const CONTENT_TYPE_ATTRIBUTE = "1.2.840.113549.1.9.3";
const SIGNING_TIME_ATTRIBUTE = "1.2.840.113549.1.9.5";
const MESSAGE_DIGEST_ATTRIBUTE = "1.2.840.113549.1.9.4";

function exactBuffer(bytes: Uint8Array) {
  return Uint8Array.from(bytes).buffer;
}

function pemBytes(pem: string, label: "CERTIFICATE" | "PRIVATE KEY") {
  const match = pem.match(new RegExp(`-----BEGIN ${label}-----([\\s\\S]+?)-----END ${label}-----`));
  if (!match) throw new Error(`Le secret Apple Wallet ne contient pas un bloc ${label} valide.`);
  const binary = atob(match[1].replace(/\s/g, ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function certificateFromPem(pem: string) {
  return Certificate.fromBER(exactBuffer(pemBytes(pem, "CERTIFICATE")));
}

function cryptoEngine() {
  return new CryptoEngine({ name: "Kivli Apple Wallet", crypto, subtle: crypto.subtle });
}

async function sha1Hex(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", exactBuffer(bytes)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function manifestFor(files: Record<string, Uint8Array>) {
  const manifest: Record<string, string> = {};
  for (const name of Object.keys(files).sort()) manifest[name] = await sha1Hex(files[name]);
  return new TextEncoder().encode(JSON.stringify(manifest));
}

async function detachedSignature(
  manifest: Uint8Array,
  signingCertificatePem: string,
  signingPrivateKeyPem: string,
  wwdrCertificatePem: string,
) {
  const engine = cryptoEngine();
  const signingCertificate = certificateFromPem(signingCertificatePem);
  const wwdrCertificate = certificateFromPem(wwdrCertificatePem);
  const privateKey = await engine.importKey(
    "pkcs8",
    exactBuffer(pemBytes(signingPrivateKeyPem, "PRIVATE KEY")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await engine.digest({ name: "SHA-256" }, exactBuffer(manifest));
  const signedData = new SignedData({
    version: 1,
    encapContentInfo: new EncapsulatedContentInfo({ eContentType: DATA_CONTENT_TYPE }),
    certificates: [signingCertificate, wwdrCertificate],
    signerInfos: [new SignerInfo({
      version: 1,
      sid: new IssuerAndSerialNumber({
        issuer: signingCertificate.issuer,
        serialNumber: signingCertificate.serialNumber,
      }),
      signedAttrs: new SignedAndUnsignedAttributes({
        type: 0,
        attributes: [
          new Attribute({
            type: CONTENT_TYPE_ATTRIBUTE,
            values: [new asn1js.ObjectIdentifier({ value: DATA_CONTENT_TYPE })],
          }),
          new Attribute({
            type: SIGNING_TIME_ATTRIBUTE,
            values: [new asn1js.UTCTime({ valueDate: new Date() })],
          }),
          new Attribute({
            type: MESSAGE_DIGEST_ATTRIBUTE,
            values: [new asn1js.OctetString({ valueHex: digest })],
          }),
        ],
      }),
    })],
  });
  await signedData.sign(privateKey, 0, "SHA-256", exactBuffer(manifest), engine);
  const contentInfo = new ContentInfo({
    contentType: SIGNED_DATA_CONTENT_TYPE,
    content: signedData.toSchema(true),
  });
  return new Uint8Array(contentInfo.toSchema().toBER(false));
}

export async function buildSignedPkpass(
  sourceFiles: Record<string, Uint8Array>,
  certificates: {
    signingCertificatePem: string;
    signingPrivateKeyPem: string;
    wwdrCertificatePem: string;
  },
) {
  const manifest = await manifestFor(sourceFiles);
  const signature = await detachedSignature(
    manifest,
    certificates.signingCertificatePem,
    certificates.signingPrivateKeyPem,
    certificates.wwdrCertificatePem,
  );
  return zipSync({ ...sourceFiles, "manifest.json": manifest, signature }, { level: 9 });
}
