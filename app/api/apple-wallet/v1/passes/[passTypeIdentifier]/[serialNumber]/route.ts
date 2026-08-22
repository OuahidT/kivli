import { cardForAppleWalletSerial, createSignedAppleWalletPass, markAppleWalletPassServed, verifyAppleWalletRequest } from "@/lib/apple-wallet";

export async function GET(request: Request, context: { params: Promise<{ passTypeIdentifier: string; serialNumber: string }> }) {
  const parameters = await context.params;
  const authorized = await verifyAppleWalletRequest(parameters.passTypeIdentifier, parameters.serialNumber, request.headers.get("Authorization"));
  if (!authorized) return new Response(null, { status: 401 });
  const card = await cardForAppleWalletSerial(parameters.passTypeIdentifier, parameters.serialNumber);
  if (!card) return new Response(null, { status: 404 });
  const pass = await createSignedAppleWalletPass(card);
  await markAppleWalletPassServed(parameters.serialNumber);
  return new Response(pass as BodyInit, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/vnd.apple.pkpass",
      "Last-Modified": new Date().toUTCString(),
    },
  });
}

