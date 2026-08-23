/** Cloudflare Worker entry point for Kivli. */
import handler from "vinext/server/app-router-entry";

export default {
  fetch(request: Request, env: Parameters<typeof handler.fetch>[1], ctx: ExecutionContext) {
    return handler.fetch(request, env, ctx);
  },
  scheduled(_controller: ScheduledController, _env: unknown, ctx: ExecutionContext) {
    ctx.waitUntil(import("../lib/wallet-notifications")
      .then(({ runWalletNotificationSchedule }) => runWalletNotificationSchedule())
      .catch((error) => {
        console.error("Automatisation Wallet Kivli interrompue.", error instanceof Error ? error.message : error);
      }));
  },
};
