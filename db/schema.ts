import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const merchants = sqliteTable(
  "merchants",
  {
    id: text("id").primaryKey(),
    businessName: text("business_name").notNull(),
    slug: text("slug").notNull(),
    email: text("email").notNull(),
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
    terms: text("terms").notNull().default("Une visite par jour et par client."),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_programs_merchant").on(table.merchantId)],
);

export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    firstName: text("first_name").notNull(),
    email: text("email"),
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
