import { env } from "cloudflare:workers";

let schemaReady: Promise<void> | null = null;

export function getD1(): D1Database {
  const runtimeEnv = env as unknown as { DB?: D1Database };
  if (!runtimeEnv.DB) throw new Error("La base de données est indisponible.");
  return runtimeEnv.DB;
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS merchants (
    id TEXT PRIMARY KEY, first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '',
    business_name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE, phone TEXT, pin_hash TEXT NOT NULL, employee_pin_hash TEXT,
    accent_color TEXT NOT NULL DEFAULT '#f05b3c',
    welcome_seen_at TEXT, terms_accepted_at TEXT, terms_version TEXT,
    pilot_started_at TEXT, pilot_ends_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS programs (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    goal INTEGER NOT NULL DEFAULT 10, reward_text TEXT NOT NULL,
    terms TEXT NOT NULL DEFAULT 'Un point est accordé par achat éligible. Le commerçant peut annuler tout point attribué par erreur ou de manière frauduleuse.', active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS program_reward_tiers (
    id TEXT PRIMARY KEY, program_id TEXT NOT NULL, threshold INTEGER NOT NULL,
    reward_text TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(program_id, threshold)
  )`,
  `CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, display_name TEXT NOT NULL,
    email TEXT UNIQUE, login_code TEXT NOT NULL UNIQUE, pin_hash TEXT NOT NULL,
    must_change_pin INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, first_name TEXT NOT NULL,
    email TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS merchant_email_verifications (
    id TEXT PRIMARY KEY, email TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
    payload_json TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT,
    last_sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS legal_document_versions (
    document_key TEXT NOT NULL, version TEXT NOT NULL, title TEXT NOT NULL,
    canonical_content TEXT NOT NULL, content_sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (document_key, version)
  )`,
  `CREATE TABLE IF NOT EXISTS merchant_pilot_acceptances (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, owner_id TEXT NOT NULL,
    owner_name TEXT NOT NULL, owner_email TEXT NOT NULL, business_name TEXT NOT NULL,
    declaration_text TEXT NOT NULL,
    pilot_terms_version TEXT NOT NULL, pilot_terms_sha256 TEXT NOT NULL,
    data_processing_version TEXT NOT NULL, data_processing_sha256 TEXT NOT NULL,
    accepted_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS memberships (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, program_id TEXT NOT NULL,
    customer_id TEXT NOT NULL, code TEXT NOT NULL UNIQUE, points INTEGER NOT NULL DEFAULT 0,
    total_points INTEGER NOT NULL DEFAULT 0, wallet_mode_ready INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  `CREATE TABLE IF NOT EXISTS owner_trusted_devices (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
    device_label TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TEXT NOT NULL,
    revoked_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS owner_security_tokens (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, trusted_device_id TEXT,
    purpose TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  `CREATE TABLE IF NOT EXISTS admin_sessions (
    id TEXT PRIMARY KEY, admin_email TEXT NOT NULL, token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS admin_login_attempts (
    key_hash TEXT PRIMARY KEY, failed_count INTEGER NOT NULL DEFAULT 0,
    window_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, locked_until TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS merchant_feedback (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, business_name TEXT NOT NULL,
    owner_name TEXT NOT NULL, email TEXT NOT NULL, feedback_type TEXT NOT NULL,
    message TEXT NOT NULL, program_name TEXT, status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS apple_wallet_passes (
    membership_id TEXT PRIMARY KEY, serial_number TEXT NOT NULL UNIQUE,
    pass_type_identifier TEXT NOT NULL, authentication_token_hash TEXT NOT NULL,
    last_updated_tag INTEGER NOT NULL, push_pending INTEGER NOT NULL DEFAULT 0,
    notification_delivery_id TEXT, layout_version INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS apple_wallet_devices (
    device_library_identifier TEXT PRIMARY KEY, push_token TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS apple_wallet_registrations (
    device_library_identifier TEXT NOT NULL, pass_type_identifier TEXT NOT NULL,
    serial_number TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (device_library_identifier, pass_type_identifier, serial_number)
  )`,
  `CREATE TABLE IF NOT EXISTS google_wallet_passes (
    membership_id TEXT PRIMARY KEY, object_id TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1, last_verified_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS wallet_notification_settings (
    merchant_id TEXT PRIMARY KEY,
    near_reward_enabled INTEGER NOT NULL DEFAULT 0,
    near_reward_threshold INTEGER NOT NULL DEFAULT 2,
    reactivation_enabled INTEGER NOT NULL DEFAULT 0,
    reactivation_days INTEGER NOT NULL DEFAULT 45,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS wallet_notification_campaigns (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, program_id TEXT NOT NULL,
    title TEXT NOT NULL, message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', target_count INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0, failed_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS wallet_notification_marketing_locks (
    merchant_id TEXT PRIMARY KEY,
    next_allowed_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS wallet_notification_deliveries (
    id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE,
    merchant_id TEXT NOT NULL, customer_id TEXT NOT NULL,
    membership_id TEXT NOT NULL, program_id TEXT NOT NULL,
    campaign_id TEXT, notification_type TEXT NOT NULL, cycle_key TEXT NOT NULL,
    platform TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', attempt_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT, next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_slug ON merchants(slug)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_email ON merchants(email)`,
  `CREATE INDEX IF NOT EXISTS idx_employees_merchant ON employees(merchant_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_email ON employees(email)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_login_code ON employees(login_code)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_merchant_email ON customers(merchant_id, email)`,
  `CREATE INDEX IF NOT EXISTS idx_program_reward_tiers_program ON program_reward_tiers(program_id, sort_order, threshold)`,
  `CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON merchant_email_verifications(email, created_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_pilot_acceptance_current ON merchant_pilot_acceptances(merchant_id, pilot_terms_version, pilot_terms_sha256, data_processing_version, data_processing_sha256)`,
  `CREATE INDEX IF NOT EXISTS idx_pilot_acceptance_merchant_date ON merchant_pilot_acceptances(merchant_id, accepted_at)`,
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
  `CREATE INDEX IF NOT EXISTS idx_owner_devices_merchant ON owner_trusted_devices(merchant_id, revoked_at, expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_owner_security_tokens_merchant ON owner_security_tokens(merchant_id, purpose, used_at)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_state_status ON merchant_admin_state(status)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_audit_merchant ON admin_audit_log(merchant_id, created_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_login_updated ON admin_login_attempts(updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_merchant_feedback_merchant_created ON merchant_feedback(merchant_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_merchant_feedback_status_created ON merchant_feedback(status, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_apple_wallet_pass_serial ON apple_wallet_passes(pass_type_identifier, serial_number)`,
  `CREATE INDEX IF NOT EXISTS idx_apple_wallet_registration_pass ON apple_wallet_registrations(pass_type_identifier, serial_number)`,
  `CREATE INDEX IF NOT EXISTS idx_google_wallet_pass_active ON google_wallet_passes(active, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_wallet_notification_campaigns_merchant ON wallet_notification_campaigns(merchant_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_wallet_notification_deliveries_retry ON wallet_notification_deliveries(status, next_attempt_at)`,
  `CREATE INDEX IF NOT EXISTS idx_wallet_notification_deliveries_merchant ON wallet_notification_deliveries(merchant_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_wallet_notification_deliveries_membership ON wallet_notification_deliveries(membership_id, notification_type, cycle_key)`,
  `CREATE INDEX IF NOT EXISTS idx_stamps_membership_activity ON stamps(membership_id, created_at)`,
  `CREATE TRIGGER IF NOT EXISTS legal_document_versions_no_update BEFORE UPDATE ON legal_document_versions BEGIN SELECT RAISE(ABORT, 'legal document versions are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS legal_document_versions_no_delete BEFORE DELETE ON legal_document_versions BEGIN SELECT RAISE(ABORT, 'legal document versions are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS merchant_pilot_acceptances_no_update BEFORE UPDATE ON merchant_pilot_acceptances BEGIN SELECT RAISE(ABORT, 'pilot acceptances are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS merchant_pilot_acceptances_no_delete BEFORE DELETE ON merchant_pilot_acceptances BEGIN SELECT RAISE(ABORT, 'pilot acceptances are immutable'); END`,
  `PRAGMA optimize`,
];

export async function ensureSchema() {
  if (!schemaReady) {
    const db = getD1();
    schemaReady = (async () => {
      await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
      const columns = await db.prepare("PRAGMA table_info(merchants)").all<{ name: string }>();
      const existing = new Set((columns.results ?? []).map((column) => column.name));
      const migrations = [
        ["welcome_seen_at", "ALTER TABLE merchants ADD COLUMN welcome_seen_at TEXT"],
        ["first_name", "ALTER TABLE merchants ADD COLUMN first_name TEXT NOT NULL DEFAULT ''"],
        ["last_name", "ALTER TABLE merchants ADD COLUMN last_name TEXT NOT NULL DEFAULT ''"],
        ["phone", "ALTER TABLE merchants ADD COLUMN phone TEXT"],
        ["email_verified_at", "ALTER TABLE merchants ADD COLUMN email_verified_at TEXT"],
        ["terms_accepted_at", "ALTER TABLE merchants ADD COLUMN terms_accepted_at TEXT"],
        ["terms_version", "ALTER TABLE merchants ADD COLUMN terms_version TEXT"],
        ["pilot_started_at", "ALTER TABLE merchants ADD COLUMN pilot_started_at TEXT"],
        ["pilot_ends_at", "ALTER TABLE merchants ADD COLUMN pilot_ends_at TEXT"],
        ["owner_pin_change_required", "ALTER TABLE merchants ADD COLUMN owner_pin_change_required INTEGER NOT NULL DEFAULT 0"],
      ] as const;
      for (const [column, statement] of migrations) {
        if (existing.has(column)) continue;
        try {
          await db.prepare(statement).run();
        } catch (error) {
          if (!String(error).toLowerCase().includes("duplicate column")) throw error;
        }
      }
      await db.prepare("UPDATE merchants SET email_verified_at = COALESCE(email_verified_at, created_at, CURRENT_TIMESTAMP)").run();
      await db.prepare(`UPDATE merchants SET
        pilot_started_at = COALESCE(pilot_started_at,
          (SELECT MIN(a.accepted_at) FROM merchant_pilot_acceptances a WHERE a.merchant_id = merchants.id),
          terms_accepted_at),
        pilot_ends_at = COALESCE(pilot_ends_at, datetime(COALESCE(
          (SELECT MIN(a.accepted_at) FROM merchant_pilot_acceptances a WHERE a.merchant_id = merchants.id),
          terms_accepted_at), '+60 days'))
        WHERE pilot_started_at IS NULL OR pilot_ends_at IS NULL`).run();

      const programColumns = await db.prepare("PRAGMA table_info(programs)").all<{ name: string }>();
      const existingProgramColumns = new Set((programColumns.results ?? []).map((column) => column.name));
      const programMigrations = [
        ["earning_mode", "ALTER TABLE programs ADD COLUMN earning_mode TEXT NOT NULL DEFAULT 'visits'"],
        ["spend_amount_cents", "ALTER TABLE programs ADD COLUMN spend_amount_cents INTEGER NOT NULL DEFAULT 100"],
      ] as const;
      for (const [column, statement] of programMigrations) {
        if (!existingProgramColumns.has(column)) {
          try { await db.prepare(statement).run(); } catch (error) {
            if (!String(error).toLowerCase().includes("duplicate column")) throw error;
          }
        }
      }

      const customerColumns = await db.prepare("PRAGMA table_info(customers)").all<{ name: string }>();
      const existingCustomerColumns = new Set((customerColumns.results ?? []).map((column) => column.name));
      const customerMigrations = [
        ["phone", "ALTER TABLE customers ADD COLUMN phone TEXT"],
        ["marketing_consent", "ALTER TABLE customers ADD COLUMN marketing_consent INTEGER NOT NULL DEFAULT 0"],
        ["marketing_consented_at", "ALTER TABLE customers ADD COLUMN marketing_consented_at TEXT"],
        ["marketing_consent_version", "ALTER TABLE customers ADD COLUMN marketing_consent_version TEXT"],
        ["marketing_consent_source", "ALTER TABLE customers ADD COLUMN marketing_consent_source TEXT"],
        ["marketing_withdrawn_at", "ALTER TABLE customers ADD COLUMN marketing_withdrawn_at TEXT"],
      ] as const;
      for (const [column, statement] of customerMigrations) {
        if (!existingCustomerColumns.has(column)) {
          try { await db.prepare(statement).run(); } catch (error) {
            if (!String(error).toLowerCase().includes("duplicate column")) throw error;
          }
        }
      }
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_customers_merchant_phone ON customers(merchant_id, phone)").run();
      await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_merchant_phone_unique ON customers(merchant_id, phone) WHERE phone IS NOT NULL").run();

      const membershipColumns = await db.prepare("PRAGMA table_info(memberships)").all<{ name: string }>();
      const existingMembershipColumns = new Set((membershipColumns.results ?? []).map((column) => column.name));
      if (!existingMembershipColumns.has("wallet_mode_ready")) {
        try { await db.prepare("ALTER TABLE memberships ADD COLUMN wallet_mode_ready INTEGER NOT NULL DEFAULT 0").run(); } catch (error) {
          if (!String(error).toLowerCase().includes("duplicate column")) throw error;
        }
      }

      const applePassColumns = await db.prepare("PRAGMA table_info(apple_wallet_passes)").all<{ name: string }>();
      if (!(applePassColumns.results ?? []).some((column) => column.name === "notification_delivery_id")) {
        try { await db.prepare("ALTER TABLE apple_wallet_passes ADD COLUMN notification_delivery_id TEXT").run(); } catch (error) {
          if (!String(error).toLowerCase().includes("duplicate column")) throw error;
        }
      }
      if (!(applePassColumns.results ?? []).some((column) => column.name === "layout_version")) {
        try { await db.prepare("ALTER TABLE apple_wallet_passes ADD COLUMN layout_version INTEGER NOT NULL DEFAULT 0").run(); } catch (error) {
          if (!String(error).toLowerCase().includes("duplicate column")) throw error;
        }
      }

      const stampColumns = await db.prepare("PRAGMA table_info(stamps)").all<{ name: string }>();
      const existingStampColumns = new Set((stampColumns.results ?? []).map((column) => column.name));
      const stampMigrations = [
        ["amount_cents", "ALTER TABLE stamps ADD COLUMN amount_cents INTEGER"],
        ["note", "ALTER TABLE stamps ADD COLUMN note TEXT"],
      ] as const;
      for (const [column, statement] of stampMigrations) {
        if (!existingStampColumns.has(column)) {
          try { await db.prepare(statement).run(); } catch (error) {
            if (!String(error).toLowerCase().includes("duplicate column")) throw error;
          }
        }
      }

      const rewardColumns = await db.prepare("PRAGMA table_info(rewards)").all<{ name: string }>();
      const existingRewardColumns = new Set((rewardColumns.results ?? []).map((column) => column.name));
      const rewardMigrations = [
        ["tier_id", "ALTER TABLE rewards ADD COLUMN tier_id TEXT"],
        ["reward_text", "ALTER TABLE rewards ADD COLUMN reward_text TEXT"],
        ["threshold", "ALTER TABLE rewards ADD COLUMN threshold INTEGER"],
      ] as const;
      for (const [column, statement] of rewardMigrations) {
        if (!existingRewardColumns.has(column)) {
          try { await db.prepare(statement).run(); } catch (error) {
            if (!String(error).toLowerCase().includes("duplicate column")) throw error;
          }
        }
      }
      await db.prepare(`UPDATE rewards SET
        reward_text = COALESCE(reward_text, (SELECT p.reward_text FROM programs p WHERE p.id = rewards.program_id)),
        threshold = COALESCE(threshold, (SELECT p.goal FROM programs p WHERE p.id = rewards.program_id))
        WHERE reward_text IS NULL OR threshold IS NULL`).run();
      await db.prepare(`UPDATE memberships SET
        points = points + COALESCE((SELECT SUM(COALESCE(r.threshold, 0)) FROM rewards r WHERE r.membership_id = memberships.id AND r.status = 'available'), 0),
        wallet_mode_ready = 1,
        updated_at = CURRENT_TIMESTAMP
        WHERE wallet_mode_ready = 0 AND program_id IN (SELECT id FROM programs WHERE earning_mode = 'spend')`).run();
      await db.prepare(`UPDATE rewards SET status = 'converted'
        WHERE status = 'available' AND membership_id IN (
          SELECT mb.id FROM memberships mb JOIN programs p ON p.id = mb.program_id WHERE p.earning_mode = 'spend' AND mb.wallet_mode_ready = 1
        )`).run();
      await db.prepare(`INSERT OR IGNORE INTO program_reward_tiers (id, program_id, threshold, reward_text, sort_order)
        SELECT 'tier_' || id, id, goal, reward_text, 0 FROM programs`).run();
      const employeeColumns = await db.prepare("PRAGMA table_info(employees)").all<{ name: string }>();
      const existingEmployeeColumns = new Set((employeeColumns.results ?? []).map((column) => column.name));
      if (!existingEmployeeColumns.has("must_change_pin")) {
        try {
          await db.prepare("ALTER TABLE employees ADD COLUMN must_change_pin INTEGER NOT NULL DEFAULT 0").run();
        } catch (error) {
          if (!String(error).toLowerCase().includes("duplicate column")) throw error;
        }
      }
      await db.batch([
        db.prepare("DELETE FROM merchant_sessions WHERE datetime(expires_at) <= CURRENT_TIMESTAMP"),
        db.prepare("DELETE FROM merchant_email_verifications WHERE datetime(expires_at) < datetime('now', '-1 day')"),
        db.prepare("DELETE FROM login_attempts WHERE datetime(updated_at) < datetime('now', '-30 days')"),
        db.prepare("DELETE FROM owner_security_tokens WHERE datetime(expires_at) < datetime('now', '-7 days')"),
        db.prepare("DELETE FROM owner_trusted_devices WHERE revoked_at IS NOT NULL AND datetime(revoked_at) < datetime('now', '-30 days')"),
        db.prepare("DELETE FROM stamp_requests WHERE datetime(created_at) < datetime('now', '-2 days')"),
        db.prepare("DELETE FROM admin_sessions WHERE datetime(expires_at) <= CURRENT_TIMESTAMP"),
        db.prepare("DELETE FROM admin_login_attempts WHERE datetime(updated_at) < datetime('now', '-30 days')"),
        db.prepare("DELETE FROM admin_audit_log WHERE datetime(created_at) < datetime('now', '-12 months')"),
        db.prepare("DELETE FROM merchant_feedback WHERE datetime(created_at) < datetime('now', '-24 months')"),
        db.prepare(`DELETE FROM apple_wallet_registrations WHERE serial_number IN (SELECT ap.serial_number FROM apple_wallet_passes ap JOIN memberships mb ON mb.id = ap.membership_id WHERE datetime(mb.updated_at) < datetime('now', '-3 years'))`),
        db.prepare(`DELETE FROM apple_wallet_passes WHERE membership_id IN (SELECT id FROM memberships WHERE datetime(updated_at) < datetime('now', '-3 years'))`),
        db.prepare(`DELETE FROM apple_wallet_devices WHERE NOT EXISTS (SELECT 1 FROM apple_wallet_registrations r WHERE r.device_library_identifier = apple_wallet_devices.device_library_identifier)`),
        db.prepare(`DELETE FROM wallet_notification_deliveries WHERE datetime(created_at) < datetime('now', '-24 months')`),
        db.prepare(`DELETE FROM wallet_notification_campaigns WHERE datetime(created_at) < datetime('now', '-24 months')`),
        db.prepare(`DELETE FROM stamp_reward_links WHERE stamp_id IN (SELECT s.id FROM stamps s JOIN memberships mb ON mb.id = s.membership_id WHERE datetime(mb.updated_at) < datetime('now', '-3 years')) OR reward_id IN (SELECT r.id FROM rewards r JOIN memberships mb ON mb.id = r.membership_id WHERE datetime(mb.updated_at) < datetime('now', '-3 years'))`),
        db.prepare(`DELETE FROM employee_actions WHERE stamp_id IN (SELECT s.id FROM stamps s JOIN memberships mb ON mb.id = s.membership_id WHERE datetime(mb.updated_at) < datetime('now', '-3 years'))`),
        db.prepare(`DELETE FROM rewards WHERE membership_id IN (SELECT id FROM memberships WHERE datetime(updated_at) < datetime('now', '-3 years'))`),
        db.prepare(`DELETE FROM stamps WHERE membership_id IN (SELECT id FROM memberships WHERE datetime(updated_at) < datetime('now', '-3 years'))`),
        db.prepare(`DELETE FROM memberships WHERE datetime(updated_at) < datetime('now', '-3 years')`),
        db.prepare(`DELETE FROM customers WHERE id NOT IN (SELECT customer_id FROM memberships) AND datetime(created_at) < datetime('now', '-3 years')`),
      ]);
    })();
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
