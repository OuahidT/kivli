import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

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
    termsAcceptedAt: text("terms_accepted_at"),
    termsVersion: text("terms_version"),
    pilotStartedAt: text("pilot_started_at"),
    pilotEndsAt: text("pilot_ends_at"),
    pinHash: text("pin_hash").notNull(),
    employeePinHash: text("employee_pin_hash"),
    ownerPinChangeRequired: integer("owner_pin_change_required", { mode: "boolean" }).notNull().default(false),
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
    marketingConsentVersion: text("marketing_consent_version"),
    marketingConsentSource: text("marketing_consent_source"),
    marketingWithdrawnAt: text("marketing_withdrawn_at"),
    anonymizedAt: text("anonymized_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_customers_merchant_email").on(table.merchantId, table.email),
    index("idx_customers_merchant_phone").on(table.merchantId, table.phone),
    uniqueIndex("idx_customers_merchant_phone_unique").on(table.merchantId, table.phone).where(sql`${table.phone} IS NOT NULL`),
  ],
);

export const merchantEmailVerifications = sqliteTable(
  "merchant_email_verifications",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    payloadJson: text("payload_json").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    lastSentAt: text("last_sent_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_email_verifications_token").on(table.tokenHash),
    index("idx_email_verifications_email").on(table.email, table.createdAt),
  ],
);

export const legalDocumentVersions = sqliteTable(
  "legal_document_versions",
  {
    documentKey: text("document_key").notNull(),
    version: text("version").notNull(),
    title: text("title").notNull(),
    canonicalContent: text("canonical_content").notNull(),
    contentSha256: text("content_sha256").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_legal_document_version").on(table.documentKey, table.version)],
);

export const merchantPilotAcceptances = sqliteTable(
  "merchant_pilot_acceptances",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    ownerId: text("owner_id").notNull(),
    ownerName: text("owner_name").notNull(),
    ownerEmail: text("owner_email").notNull(),
    businessName: text("business_name").notNull(),
    declarationText: text("declaration_text").notNull(),
    pilotTermsVersion: text("pilot_terms_version").notNull(),
    pilotTermsSha256: text("pilot_terms_sha256").notNull(),
    dataProcessingVersion: text("data_processing_version").notNull(),
    dataProcessingSha256: text("data_processing_sha256").notNull(),
    acceptedAt: text("accepted_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_pilot_acceptance_current").on(
      table.merchantId,
      table.pilotTermsVersion,
      table.pilotTermsSha256,
      table.dataProcessingVersion,
      table.dataProcessingSha256,
    ),
    index("idx_pilot_acceptance_merchant_date").on(table.merchantId, table.acceptedAt),
  ],
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
    walletModeReady: integer("wallet_mode_ready", { mode: "boolean" }).notNull().default(false),
    deletedAt: text("deleted_at"),
    deletedByRole: text("deleted_by_role"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_memberships_code").on(table.code),
    uniqueIndex("idx_memberships_program_customer").on(table.programId, table.customerId),
    index("idx_memberships_merchant_updated").on(table.merchantId, table.updatedAt),
    index("idx_memberships_merchant_active").on(table.merchantId, table.deletedAt, table.updatedAt),
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

export const ownerTrustedDevices = sqliteTable(
  "owner_trusted_devices",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    deviceLabel: text("device_label").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    uniqueIndex("idx_owner_devices_token").on(table.tokenHash),
    index("idx_owner_devices_merchant").on(table.merchantId, table.revokedAt, table.expiresAt),
  ],
);

export const ownerSecurityTokens = sqliteTable(
  "owner_security_tokens",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    trustedDeviceId: text("trusted_device_id"),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_owner_security_tokens_hash").on(table.tokenHash),
    index("idx_owner_security_tokens_merchant").on(table.merchantId, table.purpose, table.usedAt),
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

export const appleWalletPasses = sqliteTable(
  "apple_wallet_passes",
  {
    membershipId: text("membership_id").primaryKey(),
    serialNumber: text("serial_number").notNull(),
    passTypeIdentifier: text("pass_type_identifier").notNull(),
    authenticationTokenHash: text("authentication_token_hash").notNull(),
    lastUpdatedTag: integer("last_updated_tag").notNull(),
    pushPending: integer("push_pending", { mode: "boolean" }).notNull().default(false),
    notificationDeliveryId: text("notification_delivery_id"),
    layoutVersion: integer("layout_version").notNull().default(0),
    voidedAt: text("voided_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_apple_wallet_pass_serial_unique").on(table.serialNumber),
    index("idx_apple_wallet_pass_serial").on(table.passTypeIdentifier, table.serialNumber),
  ],
);

export const appleWalletDevices = sqliteTable("apple_wallet_devices", {
  deviceLibraryIdentifier: text("device_library_identifier").primaryKey(),
  pushToken: text("push_token").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const appleWalletRegistrations = sqliteTable(
  "apple_wallet_registrations",
  {
    deviceLibraryIdentifier: text("device_library_identifier").notNull(),
    passTypeIdentifier: text("pass_type_identifier").notNull(),
    serialNumber: text("serial_number").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_apple_wallet_registration_unique").on(table.deviceLibraryIdentifier, table.passTypeIdentifier, table.serialNumber),
    index("idx_apple_wallet_registration_pass").on(table.passTypeIdentifier, table.serialNumber),
  ],
);

export const googleWalletPasses = sqliteTable(
  "google_wallet_passes",
  {
    membershipId: text("membership_id").primaryKey(),
    objectId: text("object_id").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    lastVerifiedAt: text("last_verified_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_google_wallet_pass_object").on(table.objectId), index("idx_google_wallet_pass_active").on(table.active, table.updatedAt)],
);

export const walletNotificationSettings = sqliteTable("wallet_notification_settings", {
  merchantId: text("merchant_id").primaryKey(),
  nearRewardEnabled: integer("near_reward_enabled", { mode: "boolean" }).notNull().default(false),
  nearRewardThreshold: integer("near_reward_threshold").notNull().default(2),
  reactivationEnabled: integer("reactivation_enabled", { mode: "boolean" }).notNull().default(false),
  reactivationDays: integer("reactivation_days").notNull().default(45),
  nearRewardMessage: text("near_reward_message").notNull().default("Plus que {reste} {unité} avant votre prochaine récompense 🎁"),
  reactivationMessage: text("reactivation_message").notNull().default("Cela fait un moment — {commerce} serait ravi de vous revoir 🧡"),
  nearbyEnabled: integer("nearby_enabled", { mode: "boolean" }).notNull().default(false),
  nearbyAddress: text("nearby_address"),
  nearbyLatitude: real("nearby_latitude"),
  nearbyLongitude: real("nearby_longitude"),
  nearbyRelevantText: text("nearby_relevant_text").notNull().default("Votre carte est disponible à proximité."),
  nearbyLocationConfirmedAt: text("nearby_location_confirmed_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const walletGeocodingRateLimit = sqliteTable("wallet_geocoding_rate_limit", {
  id: integer("id").primaryKey(),
  nextAllowedAt: text("next_allowed_at").notNull().default("1970-01-01 00:00:00"),
});

export const walletNotificationCampaigns = sqliteTable(
  "wallet_notification_campaigns",
  {
    id: text("id").primaryKey(), merchantId: text("merchant_id").notNull(), programId: text("program_id").notNull(),
    title: text("title").notNull(), message: text("message").notNull(), status: text("status").notNull().default("pending"),
    targetCount: integer("target_count").notNull().default(0), sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0), skippedCount: integer("skipped_count").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), sentAt: text("sent_at"),
  },
  (table) => [index("idx_wallet_notification_campaigns_merchant").on(table.merchantId, table.createdAt)],
);

export const walletNotificationMarketingLocks = sqliteTable("wallet_notification_marketing_locks", {
  merchantId: text("merchant_id").primaryKey(),
  nextAllowedAt: text("next_allowed_at").notNull().default("1970-01-01 00:00:00"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const walletNotificationDeliveries = sqliteTable(
  "wallet_notification_deliveries",
  {
    id: text("id").primaryKey(), idempotencyKey: text("idempotency_key").notNull(), merchantId: text("merchant_id").notNull(),
    customerId: text("customer_id").notNull(), membershipId: text("membership_id").notNull(), programId: text("program_id").notNull(),
    campaignId: text("campaign_id"), notificationType: text("notification_type").notNull(), cycleKey: text("cycle_key").notNull(),
    platform: text("platform").notNull(), title: text("title").notNull(), message: text("message").notNull(),
    status: text("status").notNull().default("pending"), attemptCount: integer("attempt_count").notNull().default(0),
    errorMessage: text("error_message"), nextAttemptAt: text("next_attempt_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    sentAt: text("sent_at"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_wallet_notification_delivery_idempotency").on(table.idempotencyKey),
    index("idx_wallet_notification_deliveries_retry").on(table.status, table.nextAttemptAt),
    index("idx_wallet_notification_deliveries_merchant").on(table.merchantId, table.createdAt),
    index("idx_wallet_notification_deliveries_membership").on(table.membershipId, table.notificationType, table.cycleKey),
  ],
);

export const walletInvalidationJobs = sqliteTable(
  "wallet_invalidation_jobs",
  {
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    merchantId: text("merchant_id").notNull(),
    membershipId: text("membership_id").notNull(),
    platform: text("platform").notNull(),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    errorMessage: text("error_message"),
    nextAttemptAt: text("next_attempt_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_wallet_invalidation_jobs_idempotency").on(table.idempotencyKey),
    index("idx_wallet_invalidation_jobs_retry").on(table.status, table.nextAttemptAt),
    index("idx_wallet_invalidation_jobs_membership").on(table.membershipId, table.platform),
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
