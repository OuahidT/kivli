import { env } from "cloudflare:workers";

let schemaReady: Promise<void> | null = null;

export function getD1(): D1Database {
  const runtimeEnv = env as unknown as { DB?: D1Database };
  if (!runtimeEnv.DB) throw new Error("La base de données est indisponible.");
  return runtimeEnv.DB;
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS merchants (
    id TEXT PRIMARY KEY, business_name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE, pin_hash TEXT NOT NULL, employee_pin_hash TEXT,
    accent_color TEXT NOT NULL DEFAULT '#f05b3c',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS programs (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    goal INTEGER NOT NULL DEFAULT 10, reward_text TEXT NOT NULL,
    terms TEXT NOT NULL DEFAULT 'Une visite par jour et par client.', active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, display_name TEXT NOT NULL,
    email TEXT UNIQUE, login_code TEXT NOT NULL UNIQUE, pin_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, first_name TEXT NOT NULL,
    email TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS memberships (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, program_id TEXT NOT NULL,
    customer_id TEXT NOT NULL, code TEXT NOT NULL UNIQUE, points INTEGER NOT NULL DEFAULT 0,
    total_points INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(program_id, customer_id)
  )`,
  `CREATE TABLE IF NOT EXISTS stamps (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, membership_id TEXT NOT NULL,
    delta INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT 'visit',
    actor_role TEXT NOT NULL DEFAULT 'owner', points_before INTEGER, points_after INTEGER,
    reward_id TEXT, reverses_stamp_id TEXT, reversed_at TEXT, reversed_by_role TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS rewards (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, membership_id TEXT NOT NULL,
    program_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'available',
    earned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, redeemed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS merchant_sessions (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'owner', expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS employee_sessions (
    session_id TEXT PRIMARY KEY, employee_id TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS employee_actions (
    stamp_id TEXT PRIMARY KEY, employee_id TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS stamp_requests (
    request_key TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, response_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS stamp_reward_links (
    stamp_id TEXT NOT NULL, reward_id TEXT NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    key_hash TEXT PRIMARY KEY, failed_count INTEGER NOT NULL DEFAULT 0,
    window_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, locked_until TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS merchant_admin_state (
    merchant_id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'active',
    internal_note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY, admin_email TEXT NOT NULL, action TEXT NOT NULL,
    merchant_id TEXT, details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_slug ON merchants(slug)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_email ON merchants(email)`,
  `CREATE INDEX IF NOT EXISTS idx_employees_merchant ON employees(merchant_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_email ON employees(email)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_login_code ON employees(login_code)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_merchant_email ON customers(merchant_id, email)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_code ON memberships(code)`,
  `CREATE INDEX IF NOT EXISTS idx_memberships_merchant_updated ON memberships(merchant_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_stamps_merchant_created ON stamps(merchant_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_rewards_membership_status ON rewards(membership_id, status)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON merchant_sessions(token_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_merchant ON merchant_sessions(merchant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_employee_sessions_employee ON employee_sessions(employee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_employee_actions_employee ON employee_actions(employee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_stamp_requests_merchant_created ON stamp_requests(merchant_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_stamp_reward_links_stamp ON stamp_reward_links(stamp_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_stamp_reward_links_reward ON stamp_reward_links(reward_id)`,
  `CREATE INDEX IF NOT EXISTS idx_login_attempts_updated ON login_attempts(updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_state_status ON merchant_admin_state(status)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_audit_merchant ON admin_audit_log(merchant_id, created_at)`,
  `PRAGMA optimize`,
];

export async function ensureSchema() {
  if (!schemaReady) {
    const db = getD1();
    schemaReady = db.batch(schemaStatements.map((statement) => db.prepare(statement))).then(() => undefined);
  }
  return schemaReady;
}

export async function queryFirst<T>(sql: string, ...values: unknown[]): Promise<T | null> {
  await ensureSchema();
  return (await getD1().prepare(sql).bind(...values).first<T>()) ?? null;
}

export async function queryAll<T>(sql: string, ...values: unknown[]): Promise<T[]> {
  await ensureSchema();
  const result = await getD1().prepare(sql).bind(...values).all<T>();
  return result.results ?? [];
}
