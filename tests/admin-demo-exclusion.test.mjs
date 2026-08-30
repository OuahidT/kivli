import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { ADMIN_OVERVIEW_SQL } from "../admin/src/admin-statistics.ts";

const migrationUrl = new URL("../drizzle/0013_demo_merchants.sql", import.meta.url);

function createAdminStatsDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE merchants (
      id TEXT PRIMARY KEY,
      business_name TEXT NOT NULL,
      email TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE merchant_admin_state (merchant_id TEXT PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE customers (id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL);
    CREATE TABLE employees (id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE stamps (id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, delta INTEGER NOT NULL);
    CREATE TABLE rewards (id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL);
    CREATE TABLE memberships (id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0);
  `);
  return db;
}

function insertRows(db, table, columns, rows) {
  const placeholders = columns.map(() => "?").join(", ");
  const statement = db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`);
  for (const row of rows) statement.run(...row);
}

test("the additive migration marks only Kivli Demo and future merchants remain non-demo by default", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE merchants (
    id TEXT PRIMARY KEY, business_name TEXT NOT NULL, email TEXT NOT NULL
  );`);
  insertRows(db, "merchants", ["id", "business_name", "email"], [
    ["m_demo_kivli", "Kivli Demo", "demo@kivli.fr"],
    ["m_real", "Commerce pilote", "pilote@example.test"],
  ]);
  const migration = await readFile(migrationUrl, "utf8");
  assert.doesNotMatch(migration, /\b(?:DELETE|DROP|TRUNCATE)\b/i);
  db.exec(migration);
  assert.deepEqual(db.prepare("SELECT id, is_demo AS isDemo FROM merchants ORDER BY id").all().map((row) => ({ ...row })), [
    { id: "m_demo_kivli", isDemo: 1 },
    { id: "m_real", isDemo: 0 },
  ]);
  db.prepare("INSERT INTO merchants (id, business_name, email) VALUES (?, ?, ?)")
    .run("m_future", "Nouveau commerce", "futur@example.test");
  assert.equal(db.prepare("SELECT is_demo AS isDemo FROM merchants WHERE id = ?").get("m_future").isDemo, 0);
});

test("global administration statistics fully exclude demo activity but preserve real merchant aggregates", () => {
  const db = createAdminStatsDatabase();
  db.prepare("INSERT INTO merchants (id, business_name, email, is_demo) VALUES (?, ?, ?, 1)")
    .run("demo", "Kivli Demo", "demo@kivli.fr");
  insertRows(db, "customers", ["id", "merchant_id"], Array.from({ length: 20 }, (_, index) => [`demo-c-${index}`, "demo"]));
  insertRows(db, "stamps", ["id", "merchant_id", "delta"], Array.from({ length: 152 }, (_, index) => [`demo-s-${index}`, "demo", 1]));
  insertRows(db, "memberships", ["id", "merchant_id", "points"], [["demo-mb", "demo", 87]]);
  insertRows(db, "rewards", ["id", "merchant_id"], [["demo-r", "demo"]]);
  insertRows(db, "employees", ["id", "merchant_id", "active"], [["demo-e", "demo", 1]]);

  assert.deepEqual({ ...db.prepare(ADMIN_OVERVIEW_SQL).get() }, {
    merchants: 0,
    active_merchants: 0,
    suspended_merchants: 0,
    customers: 0,
    active_employees: 0,
    passages: 0,
    rewards: 0,
    current_points: 0,
  });

  db.prepare("INSERT INTO merchants (id, business_name, email) VALUES (?, ?, ?)")
    .run("real", "Commerce pilote", "pilote@example.test");
  insertRows(db, "customers", ["id", "merchant_id"], [["real-c-1", "real"], ["real-c-2", "real"]]);
  insertRows(db, "stamps", ["id", "merchant_id", "delta"], [["real-s-1", "real", 1], ["real-s-2", "real", 3], ["real-s-3", "real", -1]]);
  insertRows(db, "memberships", ["id", "merchant_id", "points"], [["real-mb", "real", 14]]);
  insertRows(db, "rewards", ["id", "merchant_id"], [["real-r-1", "real"], ["real-r-2", "real"]]);
  insertRows(db, "employees", ["id", "merchant_id", "active"], [["real-e-1", "real", 1], ["real-e-2", "real", 0]]);

  assert.deepEqual({ ...db.prepare(ADMIN_OVERVIEW_SQL).get() }, {
    merchants: 1,
    active_merchants: 1,
    suspended_merchants: 0,
    customers: 2,
    active_employees: 1,
    passages: 2,
    rewards: 2,
    current_points: 14,
  });
});

test("demo exclusion is stable after renaming and the account remains visible and manageable", async () => {
  const db = createAdminStatsDatabase();
  db.prepare("INSERT INTO merchants (id, business_name, email, is_demo) VALUES (?, ?, ?, 1)")
    .run("demo", "Kivli Demo", "demo@kivli.fr");
  db.prepare("UPDATE merchants SET business_name = ?, email = ? WHERE id = ?")
    .run("Présentation Kivli", "presentation@example.test", "demo");
  assert.equal(db.prepare(ADMIN_OVERVIEW_SQL).get().merchants, 0);

  const admin = await readFile(new URL("../admin/src/index.ts", import.meta.url), "utf8");
  assert.match(admin, /m\.is_demo AS isDemo/g);
  assert.match(admin, /demo-badge/);
  assert.match(admin, />Démo</);
  assert.match(admin, /Exclu des statistiques globales/);
  assert.match(admin, /Télécharger le QR d’inscription/);
  assert.match(admin, /Notes internes/);
  assert.match(admin, /pilot-add/);
  assert.match(admin, /toggle-status/);
});
