import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AUTOMATED_WALLET_MESSAGE_MAX,
  NEAR_REWARD_DEFAULT_MESSAGE,
  renderWalletMessage,
  validateWalletText,
} from "../lib/wallet-notification-content.ts";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("automated Wallet messages render the documented variables", () => {
  assert.equal(
    renderWalletMessage(NEAR_REWARD_DEFAULT_MESSAGE, { remaining: 2, unit: "passages", businessName: "Kivli Demo" }),
    "Plus que 2 passages avant votre prochaine récompense 🎁",
  );
  assert.equal(renderWalletMessage("{commerce} vous attend après {jours} jours.", { businessName: "Kivli Demo", days: 45 }), "Kivli Demo vous attend après 45 jours.");
});

test("automated Wallet messages reject empty, HTML, unknown variables and oversize content", () => {
  assert.throws(() => validateWalletText("", AUTOMATED_WALLET_MESSAGE_MAX, "Le message"), /vide/);
  assert.throws(() => validateWalletText("<b>Promotion</b>", AUTOMATED_WALLET_MESSAGE_MAX, "Le message"), /HTML/);
  assert.throws(() => validateWalletText("Bonjour {client}", AUTOMATED_WALLET_MESSAGE_MAX, "Le message"), /pas reconnue/);
  assert.throws(() => validateWalletText("a".repeat(AUTOMATED_WALLET_MESSAGE_MAX + 1), AUTOMATED_WALLET_MESSAGE_MAX, "Le message"), /dépasser/);
});

test("the notification engine logs and dispatches the rendered custom text without weakening campaign cooldown", async () => {
  const notifications = await source("lib/wallet-notifications.ts");
  assert.match(notifications, /s\.near_reward_message AS notificationMessage/);
  assert.match(notifications, /s\.reactivation_message AS notificationMessage/);
  assert.match(notifications, /renderWalletMessage\(candidate\.notificationMessage/);
  assert.match(notifications, /event\.message/);
  assert.match(notifications, /datetime\('now', '\+7 days'\)/);
  assert.match(notifications, /idempotencyKey = `\$\{event\.type\}:\$\{event\.cycleKey\}:\$\{target\.membershipId\}:\$\{platform\}`/);
});

test("settings remain owner-only and validate address confirmation server-side", async () => {
  const route = await source("app/api/merchant/wallet-notifications/route.ts");
  const service = await source("lib/wallet-notifications.ts");
  assert.match(route, /if \(!isOwner\(merchant\)\).*403/);
  assert.match(route, /isSameOrigin\(request\)/);
  assert.match(service, /values\.nearbyEnabled.*nearbyLocationConfirmed/s);
  assert.match(service, /latitude < -90 \|\| latitude > 90/);
  assert.match(service, /longitude < -180 \|\| longitude > 180/);
});

test("Apple and Google use only the merchant location and can clear proximity", async () => {
  const apple = await source("lib/apple-wallet.ts");
  const google = await source("lib/google-wallet.ts");
  const data = await source("lib/data.ts");
  assert.match(apple, /locations: \[\{/);
  assert.match(apple, /relevantText: card\.nearbyRelevantText/);
  assert.match(google, /merchantLocations: card\.nearbyEnabled/);
  assert.match(google, /: \[\],/);
  assert.match(data, /wallet_notification_settings wns/);
  assert.doesNotMatch(data, /client_(?:latitude|longitude)|customer_(?:latitude|longitude)/);
});

test("admin note is persistent, visible, clearable and isolated from merchant APIs", async () => {
  const admin = await source("admin/src/index.ts");
  const dashboard = await source("app/api/merchant/dashboard/route.ts");
  assert.match(admin, /<h3>Notes internes<\/h3>/);
  assert.match(admin, /merchant-note-preview/);
  assert.match(admin, /id="clear-note"/);
  assert.match(admin, /state\.selected\.internalNote=result\.note/);
  assert.match(admin, /white-space:pre-wrap/);
  assert.doesNotMatch(dashboard, /internal_note|internalNote/);
});
