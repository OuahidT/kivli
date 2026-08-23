/** Cloudflare Worker entry point for Kivli. */
import handler from "vinext/server/app-router-entry";

function withSecurityHeaders(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=()");
  if (!headers.has("Content-Security-Policy")) {
    headers.set("Content-Security-Policy", "base-uri 'self'; object-src 'none'; frame-ancestors 'none'");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Parameters<typeof handler.fetch>[1], ctx: ExecutionContext) {
    return withSecurityHeaders(await handler.fetch(request, env, ctx));
  },
  scheduled(_controller: ScheduledController, _env: unknown, ctx: ExecutionContext) {
    ctx.waitUntil(import("../lib/wallet-notifications")
      .then(({ runWalletNotificationSchedule }) => runWalletNotificationSchedule())
      .catch((error) => {
        console.error("Automatisation Wallet Kivli interrompue.", error instanceof Error ? error.message : error);
      }));
  },
};
