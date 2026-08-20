import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const merchants = sqliteTable(
  "merchants",
  {
    id: text("id").primaryKey(),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    businessName: text("business_name").notNull(),
    slug: text("slug").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    emailVerifiedAt: text("email_verified_at"),
    pinHash: text("pin_hash").notNull(),
    employeePinHash: text("employee_pin_hash"),
    accentColor: text("accent_color").notNull().default("#f05b3c"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_merchants_slug").on(table.slug),
    uniqueIndex("idx_merchants_email").on(table.email),
  ],
);

export const employees = sqliteTable(
  "employees",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    loginCode: text("login_code").notNull(),
    pinHash: text("pin_hash").notNull(),
    mustChangePin: integer("must_change_pin", { mode: "boolean" }).notNull().default(true),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_employees_merchant").on(table.merchantId),
    uniqueIndex("idx_employees_email").on(table.email),
    uniqueIndex("idx_employees_login_code").on(table.loginCode),
  ],
);

export const programs = sqliteTable(
  "programs",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    name: text("name").notNull(),
    goal: integer("goal").notNull().default(10),
    rewardText: text("reward_text").notNull(),
    terms: text("terms").notNull().default("Un point est accordé par achat éligible. Le commerçant peut annuler tout point attribué par erreur ou de manière frauduleuse."),
    earningMode: text("earning_mode").notNull().default("visits"),
    spendAmountCents: integer("spend_amount_cents").notNull().default(100),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_programs_merchant").on(table.merchantId)],
);

export const programRewardTiers = sqliteTable(
  "program_reward_tiers",
  {
    id: text("id").primaryKey(),
    programId: text("program_id").notNull(),
    threshold: integer("threshold").notNull(),
    rewardText: text("reward_text").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_program_reward_tiers_unique").on(table.programId, table.threshold), index("idx_program_reward_tiers_program").on(table.programId)],
);

export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    firstName: text("first_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    marketingConsent: integer("marketing_consent", { mode: "boolean" }).notNull().default(false),
    marketingConsentedAt: text("marketing_consented_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_customers_merchant_email").on(table.merchantId, table.email)],
);

export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    programId: text("program_id").notNull(),
    customerId: text("customer_id").notNull(),
    code: text("code").notNull(),
    points: integer("points").notNull().default(0),
    totalPoints: integer("total_points").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_memberships_code").on(table.code),
    uniqueIndex("idx_memberships_program_customer").on(table.programId, table.customerId),
    index("idx_memberships_merchant_updated").on(table.merchantId, table.updatedAt),
  ],
);

export const stamps = sqliteTable(
  "stamps",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    membershipId: text("membership_id").notNull(),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull().default("visit"),
    actorRole: text("actor_role").notNull().default("owner"),
    pointsBefore: integer("points_before"),
    pointsAfter: integer("points_after"),
    rewardId: text("reward_id"),
    reversesStampId: text("reverses_stamp_id"),
    reversedAt: text("reversed_at"),
    reversedByRole: text("reversed_by_role"),
    amountCents: integer("amount_cents"),
    note: text("note"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_stamps_merchant_created").on(table.merchantId, table.createdAt)],
);

export const rewards = sqliteTable(
  "rewards",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    membershipId: text("membership_id").notNull(),
    programId: text("program_id").notNull(),
    status: text("status").notNull().default("available"),
    earnedAt: text("earned_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    redeemedAt: text("redeemed_at"),
    tierId: text("tier_id"),
    rewardText: text("reward_text"),
    threshold: integer("threshold"),
  },
  (table) => [index("idx_rewards_membership_status").on(table.membershipId, table.status)],
);

export const merchantSessions = sqliteTable(
  "merchant_sessions",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    role: text("role").notNull().default("owner"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_sessions_token").on(table.tokenHash),
    index("idx_sessions_merchant").on(table.merchantId),
  ],
);

export const employeeSessions = sqliteTable(
  "employee_sessions",
  {
    sessionId: text("session_id").primaryKey(),
    employeeId: text("employee_id").notNull(),
  },
  (table) => [index("idx_employee_sessions_employee").on(table.employeeId)],
);

export const employeeActions = sqliteTable(
  "employee_actions",
  {
    stampId: text("stamp_id").primaryKey(),
    employeeId: text("employee_id").notNull(),
  },
  (table) => [index("idx_employee_actions_employee").on(table.employeeId)],
);

export const stampRequests = sqliteTable(
  "stamp_requests",
  {
    requestKey: text("request_key").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    responseJson: text("response_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_stamp_requests_merchant_created").on(table.merchantId, table.createdAt)],
);

export const stampRewardLinks = sqliteTable(
  "stamp_reward_links",
  {
    stampId: text("stamp_id").notNull(),
    rewardId: text("reward_id").notNull(),
  },
  (table) => [
    index("idx_stamp_reward_links_stamp").on(table.stampId),
    uniqueIndex("idx_stamp_reward_links_reward").on(table.rewardId),
  ],
);

export const loginAttempts = sqliteTable(
  "login_attempts",
  {
    keyHash: text("key_hash").primaryKey(),
    failedCount: integer("failed_count").notNull().default(0),
    windowStartedAt: text("window_started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lockedUntil: text("locked_until"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_login_attempts_updated").on(table.updatedAt)],
);

export const merchantAdminState = sqliteTable(
  "merchant_admin_state",
  {
    merchantId: text("merchant_id").primaryKey(),
    status: text("status").notNull().default("active"),
    internalNote: text("internal_note").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedBy: text("updated_by").notNull().default(""),
  },
  (table) => [index("idx_admin_state_status").on(table.status)],
);

export const adminAuditLog = sqliteTable(
  "admin_audit_log",
  {
    id: text("id").primaryKey(),
    adminEmail: text("admin_email").notNull(),
    action: text("action").notNull(),
    merchantId: text("merchant_id"),
    detailsJson: text("details_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_admin_audit_created").on(table.createdAt),
    index("idx_admin_audit_merchant").on(table.merchantId, table.createdAt),
  ],
);

export const adminSessions = sqliteTable(
  "admin_sessions",
  {
    id: text("id").primaryKey(),
    adminEmail: text("admin_email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_admin_sessions_token").on(table.tokenHash),
    index("idx_admin_sessions_expires").on(table.expiresAt),
  ],
);

export const adminLoginAttempts = sqliteTable(
  "admin_login_attempts",
  {
    keyHash: text("key_hash").primaryKey(),
    failedCount: integer("failed_count").notNull().default(0),
    windowStartedAt: text("window_started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lockedUntil: text("locked_until"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_admin_login_updated").on(table.updatedAt)],
);
