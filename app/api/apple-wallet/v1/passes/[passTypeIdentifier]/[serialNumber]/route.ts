import { cardForAppleWalletSerial, createSignedAppleWalletPass, markAppleWalletPassServed, verifyAppleWalletRequest } from "@/lib/apple-wallet";

export async function GET(request: Request, context: { params: Promise<{ passTypeIdentifier: string; serialNumber: string }> }) {
  const parameters = await context.params;
  const authorized = await verifyAppleWalletRequest(parameters.passTypeIdentifier, parameters.serialNumber, request.headers.get("Authorization"));
  if (!authorized) return new Response(null, { status: 401 });
  const record = await cardForAppleWalletSerial(parameters.passTypeIdentifier, parameters.serialNumber);
  if (!record) return new Response(null, { status: 404 });
  const pass = await createSignedAppleWalletPass(record.card, { voided: record.voided });
  await markAppleWalletPassServed(parameters.serialNumber);
  return new Response(pass as BodyInit, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/vnd.apple.pkpass",
      "Last-Modified": new Date().toUTCString(),
    },
  });
}
