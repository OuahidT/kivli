/** Cloudflare Worker entry point for Kivli. */
import handler from "vinext/server/app-router-entry";

export default {
  async fetch(request: Request, env: any, context: ExecutionContext) {
    const response = await handler.fetch(request, env, context);
    const headers = new Headers(response.headers);
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=()");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
