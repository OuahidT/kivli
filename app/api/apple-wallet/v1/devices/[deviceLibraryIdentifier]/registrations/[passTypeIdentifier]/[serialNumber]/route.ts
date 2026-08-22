import { registerAppleWalletDevice, unregisterAppleWalletDevice, verifyAppleWalletRequest } from "@/lib/apple-wallet";
import { cleanText, readJson } from "@/lib/http";

type Parameters = { deviceLibraryIdentifier: string; passTypeIdentifier: string; serialNumber: string };

export async function POST(request: Request, context: { params: Promise<Parameters> }) {
  const parameters = await context.params;
  const authorized = await verifyAppleWalletRequest(parameters.passTypeIdentifier, parameters.serialNumber, request.headers.get("Authorization"));
  if (!authorized) return new Response(null, { status: 401 });
  const body = await readJson<{ pushToken?: string }>(request);
  const pushToken = cleanText(body?.pushToken, 240);
  const deviceId = cleanText(parameters.deviceLibraryIdentifier, 240);
  if (!deviceId || !pushToken) return new Response(null, { status: 400 });
  const status = await registerAppleWalletDevice(deviceId, parameters.passTypeIdentifier, parameters.serialNumber, pushToken);
  return new Response(null, { status });
}

export async function DELETE(request: Request, context: { params: Promise<Parameters> }) {
  const parameters = await context.params;
  const authorized = await verifyAppleWalletRequest(parameters.passTypeIdentifier, parameters.serialNumber, request.headers.get("Authorization"));
  if (!authorized) return new Response(null, { status: 401 });
  await unregisterAppleWalletDevice(cleanText(parameters.deviceLibraryIdentifier, 240), parameters.passTypeIdentifier, parameters.serialNumber);
  return new Response(null, { status: 200 });
}

