import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const workerPromise = import(workerUrl.href).then((module) => module.default);

test("publishes the Tampo product routes", async () => {
  const worker = await workerPromise;
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html", host: "localhost" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Tampo/);
  assert.match(html, /La fidélité qui fait revenir/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("publishes individual employee access and protected stamp controls", async () => {
  const worker = await workerPromise;
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };

  for (const path of ["/merchant", "/dashboard"]) {
    const response = await worker.fetch(
      new Request(`http://localhost${path}`, { headers: { accept: "text/html", host: "localhost" } }),
      env,
      context,
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Tampo/);
  }

  const [employeesRoute, stampRoute, undoRoute, dashboard] = await Promise.all([
    readFile(new URL("../app/api/merchant/employees/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/merchant/stamp/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/merchant/stamp/undo/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/DashboardApp.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(employeesRoute, /isOwner\(merchant\)/);
  assert.match(stampRoute, /stamp_requests/);
  assert.match(stampRoute, /recent_scan/);
  assert.match(undoRoute, /employee_actions/);
  assert.match(undoRoute, /-5 minutes/);
  assert.match(dashboard, /item\.id === "scan"/);
});
