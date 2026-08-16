import { connect, type Socket } from "cloudflare:sockets";

interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  success?: boolean;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

interface Env {
  DB: D1Database;
  ADMIN_EMAIL_V2?: string;
  ADMIN_PASSWORD_HASH_V2?: string;
  SESSION_PEPPER_V2?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USERNAME?: string;
  SMTP_PASSWORD?: string;
}

type AdminIdentity = {
  email: string;
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, private",
};

const ADMIN_COOKIE = "__Host-kivli_admin";
const SESSION_HOURS = 12;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const RESET_CODE_MINUTES = 10;
const PASSWORD_ITERATIONS = 210_000;
let schemaReady = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function securityHeaders(nonce: string): Headers {
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store, private",
    "Content-Security-Policy": [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      "connect-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  return headers;
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  const item = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

function hexToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2) return null;
  return new Uint8Array(value.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16)));
}

function safeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS },
    key,
    256,
  );
  return `pbkdf2$${PASSWORD_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(derived))}`;
}

function validateNewPassword(password: string): string | null {
  if (password.length < 12) return "Le mot de passe doit contenir au moins 12 caractères.";
  if (password.length > 200) return "Le mot de passe est trop long.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return "Ajoutez une majuscule, une minuscule, un chiffre et un symbole.";
  }
  return null;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [scheme, iterationValue, saltValue, expectedValue] = storedHash.split("$");
  const iterations = Number(iterationValue);
  const salt = hexToBytes(saltValue ?? "");
  const expected = hexToBytes(expectedValue ?? "");
  if (scheme !== "pbkdf2" || !salt || !expected || !Number.isInteger(iterations) || iterations < 100_000) {
    return false;
  }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    expected.byteLength * 8,
  );
  return safeEqual(new Uint8Array(derived), expected);
}

function requireAdminConfig(env: Env): { email: string; passwordHash: string; pepper: string } {
  if (!env.ADMIN_EMAIL_V2 || !env.ADMIN_PASSWORD_HASH_V2 || !env.SESSION_PEPPER_V2) {
    throw new Response("Administration non configuree.", { status: 503 });
  }
  return {
    email: env.ADMIN_EMAIL_V2.trim().toLowerCase(),
    passwordHash: env.ADMIN_PASSWORD_HASH_V2,
    pepper: env.SESSION_PEPPER_V2,
  };
}

async function getEffectivePasswordHash(env: Env): Promise<string> {
  const stored = await env.DB.prepare(
    "SELECT password_hash AS passwordHash FROM admin_credentials WHERE id = 'primary'",
  ).first<{ passwordHash: string }>();
  return stored?.passwordHash ?? requireAdminConfig(env).passwordHash;
}

async function getAdmin(request: Request, env: Env): Promise<AdminIdentity | null> {
  const config = requireAdminConfig(env);
  const token = readCookie(request, ADMIN_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(`${config.pepper}:${token}`);
  const session = await env.DB.prepare(
    "SELECT admin_email AS email FROM admin_sessions WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP",
  ).bind(tokenHash).first<{ email: string }>();
  return session ? { email: session.email.toLowerCase() } : null;
}

async function ensureAdminSchema(db: D1Database): Promise<void> {
  if (schemaReady) return;
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS merchant_admin_state (
        merchant_id TEXT PRIMARY KEY NOT NULL,
        status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'suspended')),
        internal_note TEXT DEFAULT '' NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_by TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS admin_audit_log (
        id TEXT PRIMARY KEY NOT NULL,
        admin_email TEXT NOT NULL,
        action TEXT NOT NULL,
        merchant_id TEXT,
        details_json TEXT DEFAULT '{}' NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        admin_email TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS admin_login_attempts (
        key_hash TEXT PRIMARY KEY NOT NULL,
        failed_count INTEGER DEFAULT 0 NOT NULL,
        window_started_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        locked_until TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS admin_credentials (
        id TEXT PRIMARY KEY NOT NULL CHECK (id = 'primary'),
        password_hash TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_by TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS admin_password_resets (
        id TEXT PRIMARY KEY NOT NULL,
        admin_email TEXT NOT NULL,
        network_hash TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        attempts INTEGER DEFAULT 0 NOT NULL,
        used_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_admin_state_status ON merchant_admin_state(status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_admin_audit_merchant ON admin_audit_log(merchant_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_admin_login_updated ON admin_login_attempts(updated_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_admin_reset_email ON admin_password_resets(admin_email, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_admin_reset_network ON admin_password_resets(network_hash, created_at)"),
  ]);
  await db.prepare("PRAGMA optimize").run();
  schemaReady = true;
}

function auditStatement(
  db: D1Database,
  identity: AdminIdentity,
  action: string,
  merchantId: string | null,
  details: Record<string, unknown>,
): D1PreparedStatement {
  return db.prepare(
    "INSERT INTO admin_audit_log (id, admin_email, action, merchant_id, details_json) VALUES (?, ?, ?, ?, ?)",
  ).bind(`adm_${crypto.randomUUID().replace(/-/g, "")}`, identity.email, action, merchantId, JSON.stringify(details));
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return {};
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new Response("Origine de la requete refusee.", { status: 403 });
  }
}

type AdminLoginAttempt = { failedCount: number; windowStartedAt: string; lockedUntil: string | null };

function parseDatabaseDate(value: string | null): Date | null {
  if (!value) return null;
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

async function getActiveLoginLock(db: D1Database, keys: string[]): Promise<Date | null> {
  for (const key of keys) {
    const row = await db.prepare(
      `SELECT failed_count AS failedCount, window_started_at AS windowStartedAt, locked_until AS lockedUntil
       FROM admin_login_attempts WHERE key_hash = ?`,
    ).bind(key).first<AdminLoginAttempt>();
    const lockedUntil = parseDatabaseDate(row?.lockedUntil ?? null);
    if (lockedUntil && lockedUntil.getTime() > Date.now()) return lockedUntil;
  }
  return null;
}

async function recordAdminLoginFailure(db: D1Database, key: string, limit: number): Promise<void> {
  const row = await db.prepare(
    `SELECT failed_count AS failedCount, window_started_at AS windowStartedAt, locked_until AS lockedUntil
     FROM admin_login_attempts WHERE key_hash = ?`,
  ).bind(key).first<AdminLoginAttempt>();
  const now = new Date();
  const windowStart = parseDatabaseDate(row?.windowStartedAt ?? null);
  const inWindow = Boolean(windowStart && now.getTime() - windowStart.getTime() < LOGIN_WINDOW_MS);
  const failedCount = inWindow ? (row?.failedCount ?? 0) + 1 : 1;
  const lockedUntil = failedCount >= limit ? new Date(now.getTime() + LOGIN_WINDOW_MS).toISOString() : null;
  await db.prepare(`
    INSERT INTO admin_login_attempts (key_hash, failed_count, window_started_at, locked_until, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key_hash) DO UPDATE SET
      failed_count = excluded.failed_count,
      window_started_at = excluded.window_started_at,
      locked_until = excluded.locked_until,
      updated_at = excluded.updated_at
  `).bind(key, failedCount, inWindow ? row!.windowStartedAt : now.toISOString(), lockedUntil, now.toISOString()).run();
}

async function loginAdmin(request: Request, env: Env): Promise<Response> {
  requireSameOrigin(request);
  const config = requireAdminConfig(env);
  const body = await readBody(request);
  const email = cleanText(body.email, 160).toLowerCase();
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  const network = request.headers.get("cf-connecting-ip") ?? "unknown";
  const networkKey = await sha256(`${config.pepper}:login:${email}:${network}`);
  const accountKey = await sha256(`${config.pepper}:login:${config.email}:account`);
  const lockedUntil = await getActiveLoginLock(env.DB, [networkKey, accountKey]);
  if (lockedUntil) {
    const seconds = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
    return new Response(JSON.stringify({ error: "Trop de tentatives. Reessaie dans quelques minutes." }), {
      status: 429,
      headers: { ...JSON_HEADERS, "Retry-After": String(seconds) },
    });
  }

  const passwordMatches = await verifyPassword(password, await getEffectivePasswordHash(env));
  if (email !== config.email || !passwordMatches) {
    await Promise.all([
      recordAdminLoginFailure(env.DB, networkKey, 5),
      recordAdminLoginFailure(env.DB, accountKey, 10),
    ]);
    return json({ error: "Adresse e-mail ou mot de passe incorrect." }, 401);
  }

  const token = `${crypto.randomUUID()}.${crypto.randomUUID()}`;
  const tokenHash = await sha256(`${config.pepper}:${token}`);
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_login_attempts WHERE key_hash IN (?, ?)").bind(networkKey, accountKey),
    env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= CURRENT_TIMESTAMP"),
    env.DB.prepare(
      "INSERT INTO admin_sessions (id, admin_email, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    ).bind(`as_${crypto.randomUUID().replace(/-/g, "")}`, config.email, tokenHash, expiresAt.toISOString()),
    auditStatement(env.DB, { email: config.email }, "admin.login", null, { network: "cloudflare" }),
  ]);
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      ...JSON_HEADERS,
      "Set-Cookie": `${ADMIN_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}`,
    },
  });
}

class SmtpConnection {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private buffer = "";
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();

  constructor(readonly socket: Socket) {
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
  }

  async readResponse(expected: number[]): Promise<string> {
    while (true) {
      const terminal = /(^|\r\n)(\d{3}) ([^\r\n]*)\r\n/.exec(this.buffer);
      if (terminal) {
        const end = terminal.index + terminal[0].length;
        const response = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end);
        const code = Number(terminal[2]);
        if (!expected.includes(code)) throw new Error(`SMTP ${code}: ${terminal[3]}`);
        return response;
      }
      const chunk = await this.reader.read();
      if (chunk.done) throw new Error("Connexion SMTP interrompue.");
      this.buffer += this.decoder.decode(chunk.value, { stream: true });
      if (this.buffer.length > 32_000) throw new Error("Réponse SMTP invalide.");
    }
  }

  async command(command: string, expected: number[]): Promise<string> {
    await this.writer.write(this.encoder.encode(`${command}\r\n`));
    return this.readResponse(expected);
  }

  release(): void {
    this.reader.releaseLock();
    this.writer.releaseLock();
  }
}

function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8_192) {
    binary += String.fromCharCode(...bytes.slice(index, index + 8_192));
  }
  return btoa(binary);
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

async function sendResetEmail(env: Env, code: string): Promise<void> {
  const config = requireAdminConfig(env);
  const host = env.SMTP_HOST?.trim() || "smtp.mail.ovh.net";
  const port = Number(env.SMTP_PORT || "587");
  const username = env.SMTP_USERNAME?.trim() || config.email;
  const password = env.SMTP_PASSWORD;
  if (!password || !Number.isInteger(port)) {
    throw new Response("L’envoi du code n’est pas encore configuré.", { status: 503 });
  }

  let socket = connect({ hostname: host, port }, { secureTransport: "starttls", allowHalfOpen: true });
  await socket.opened;
  let smtp = new SmtpConnection(socket);
  try {
    await smtp.readResponse([220]);
    await smtp.command("EHLO admin.kivli.fr", [250]);
    await smtp.command("STARTTLS", [220]);
    smtp.release();
    socket = socket.startTls();
    await socket.opened;
    smtp = new SmtpConnection(socket);
    await smtp.command("EHLO admin.kivli.fr", [250]);
    await smtp.command("AUTH LOGIN", [334]);
    await smtp.command(base64Utf8(username), [334]);
    await smtp.command(base64Utf8(password), [235]);
    await smtp.command(`MAIL FROM:<${username}>`, [250]);
    await smtp.command(`RCPT TO:<${config.email}>`, [250, 251]);
    await smtp.command("DATA", [354]);

    const body = [
      "Bonjour,",
      "",
      `Votre code de récupération Kivli est : ${code}`,
      "",
      `Ce code expire dans ${RESET_CODE_MINUTES} minutes et ne peut être utilisé qu’une fois.`,
      "Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.",
      "",
      "Kivli — La fidélité, simplement.",
    ].join("\r\n");
    const message = [
      `From: Kivli Securite <${username}>`,
      `To: ${config.email}`,
      "Subject: Code de recuperation Kivli",
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@kivli.fr>`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(base64Utf8(body)),
      "",
      ".",
    ].join("\r\n");
    await smtp.command(message, [250]);
    await smtp.command("QUIT", [221]);
  } finally {
    await socket.close().catch(() => undefined);
  }
}

function generateResetCode(): string {
  const random = crypto.getRandomValues(new Uint32Array(1))[0];
  return String(random % 1_000_000).padStart(6, "0");
}

async function requestPasswordReset(request: Request, env: Env): Promise<Response> {
  requireSameOrigin(request);
  const config = requireAdminConfig(env);
  const body = await readBody(request);
  const email = cleanText(body.email, 160).toLowerCase();
  const network = request.headers.get("cf-connecting-ip") ?? "unknown";
  const networkHash = await sha256(`${config.pepper}:reset-network:${network}`);
  const recent = await env.DB.prepare(
    "SELECT created_at AS createdAt FROM admin_password_resets WHERE network_hash = ? ORDER BY created_at DESC LIMIT 1",
  ).bind(networkHash).first<{ createdAt: string }>();
  const lastRequest = parseDatabaseDate(recent?.createdAt ?? null);
  if (lastRequest && Date.now() - lastRequest.getTime() < 60_000) {
    return json({ error: "Un code vient déjà d’être envoyé. Patientez une minute." }, 429);
  }
  const volume = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM admin_password_resets WHERE network_hash = ? AND created_at > datetime('now', '-1 hour')",
  ).bind(networkHash).first<{ count: number }>();
  if (Number(volume?.count ?? 0) >= 5) {
    return json({ error: "Trop de demandes. Réessayez dans une heure." }, 429);
  }
  if (email !== config.email) {
    return json({ ok: true, message: "Si cette adresse correspond au compte, un code vient d’être envoyé." });
  }

  const id = `apr_${crypto.randomUUID().replace(/-/g, "")}`;
  const code = generateResetCode();
  const codeHash = await sha256(`${config.pepper}:reset-code:${id}:${code}`);
  const expiresAt = new Date(Date.now() + RESET_CODE_MINUTES * 60_000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_password_resets WHERE datetime(expires_at) < datetime('now', '-1 day')"),
    env.DB.prepare("UPDATE admin_password_resets SET used_at = CURRENT_TIMESTAMP WHERE admin_email = ? AND used_at IS NULL")
      .bind(config.email),
    env.DB.prepare(
      "INSERT INTO admin_password_resets (id, admin_email, network_hash, code_hash, expires_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(id, config.email, networkHash, codeHash, expiresAt),
  ]);
  try {
    await sendResetEmail(env, code);
  } catch (error) {
    await env.DB.prepare("DELETE FROM admin_password_resets WHERE id = ?").bind(id).run();
    if (error instanceof Response) throw error;
    console.error("Kivli reset email error", error);
    throw new Response("Impossible d’envoyer le code pour le moment.", { status: 503 });
  }
  return json({ ok: true, message: `Un code à 6 chiffres a été envoyé à ${config.email}.` });
}

async function confirmPasswordReset(request: Request, env: Env): Promise<Response> {
  requireSameOrigin(request);
  const config = requireAdminConfig(env);
  const body = await readBody(request);
  const email = cleanText(body.email, 160).toLowerCase();
  const code = cleanText(body.code, 12).replace(/\s/g, "");
  const password = typeof body.password === "string" ? body.password : "";
  if (email !== config.email || !/^\d{6}$/.test(code)) {
    return json({ error: "Le code est invalide ou a expiré." }, 400);
  }
  const passwordError = validateNewPassword(password);
  if (passwordError) return json({ error: passwordError }, 400);

  const reset = await env.DB.prepare(`
    SELECT id, code_hash AS codeHash, attempts
    FROM admin_password_resets
    WHERE admin_email = ? AND used_at IS NULL AND datetime(expires_at) > CURRENT_TIMESTAMP
    ORDER BY created_at DESC LIMIT 1
  `).bind(config.email).first<{ id: string; codeHash: string; attempts: number }>();
  if (!reset || reset.attempts >= 5) return json({ error: "Le code est invalide ou a expiré." }, 400);
  const candidate = await sha256(`${config.pepper}:reset-code:${reset.id}:${code}`);
  const expectedBytes = hexToBytes(reset.codeHash);
  const candidateBytes = hexToBytes(candidate);
  if (!expectedBytes || !candidateBytes || !safeEqual(expectedBytes, candidateBytes)) {
    await env.DB.prepare("UPDATE admin_password_resets SET attempts = attempts + 1 WHERE id = ?").bind(reset.id).run();
    return json({ error: "Le code est invalide ou a expiré." }, 400);
  }

  const passwordHash = await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO admin_credentials (id, password_hash, updated_by)
      VALUES ('primary', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        password_hash = excluded.password_hash,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = excluded.updated_by
    `).bind(passwordHash, config.email),
    env.DB.prepare("UPDATE admin_password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL")
      .bind(reset.id),
    env.DB.prepare("DELETE FROM admin_sessions"),
    env.DB.prepare("DELETE FROM admin_login_attempts"),
    auditStatement(env.DB, { email: config.email }, "admin.password_reset", null, { method: "email_code" }),
  ]);
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      ...JSON_HEADERS,
      "Set-Cookie": `${ADMIN_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`,
    },
  });
}

async function logoutAdmin(request: Request, env: Env, identity: AdminIdentity): Promise<Response> {
  requireSameOrigin(request);
  const config = requireAdminConfig(env);
  const token = readCookie(request, ADMIN_COOKIE);
  if (token) {
    const tokenHash = await sha256(`${config.pepper}:${token}`);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(tokenHash),
      auditStatement(env.DB, identity, "admin.logout", null, {}),
    ]);
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      ...JSON_HEADERS,
      "Set-Cookie": `${ADMIN_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`,
    },
  });
}

async function getOverview(db: D1Database): Promise<Response> {
  const overview = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM merchants) AS merchants,
      (SELECT COUNT(*) FROM merchants m LEFT JOIN merchant_admin_state s ON s.merchant_id = m.id
        WHERE COALESCE(s.status, 'active') = 'active') AS active_merchants,
      (SELECT COUNT(*) FROM merchant_admin_state WHERE status = 'suspended') AS suspended_merchants,
      (SELECT COUNT(*) FROM customers) AS customers,
      (SELECT COUNT(*) FROM employees WHERE active = 1) AS active_employees,
      (SELECT COUNT(*) FROM stamps WHERE delta > 0) AS passages,
      (SELECT COUNT(*) FROM rewards) AS rewards,
      (SELECT COALESCE(SUM(points), 0) FROM memberships) AS current_points
  `).first();
  return json({ overview });
}

async function listMerchants(db: D1Database, url: URL): Promise<Response> {
  const query = cleanText(url.searchParams.get("q"), 80).toLowerCase();
  const requestedStatus = url.searchParams.get("status");
  const status = requestedStatus === "active" || requestedStatus === "suspended" ? requestedStatus : "all";
  const like = `%${query}%`;
  const result = await db.prepare(`
    SELECT
      m.id,
      m.business_name AS businessName,
      m.email,
      m.slug,
      m.accent_color AS accentColor,
      m.created_at AS createdAt,
      p.name AS programName,
      p.goal,
      p.reward_text AS rewardText,
      COALESCE(s.status, 'active') AS status,
      COALESCE(s.internal_note, '') AS internalNote,
      COALESCE(cc.customerCount, 0) AS customerCount,
      COALESCE(ec.employeeCount, 0) AS employeeCount,
      COALESCE(sc.passageCount, 0) AS passageCount,
      COALESCE(rc.rewardCount, 0) AS rewardCount,
      COALESCE(mc.currentPoints, 0) AS currentPoints,
      COALESCE(sc.lastActivity, m.created_at) AS lastActivity
    FROM merchants m
    LEFT JOIN programs p ON p.merchant_id = m.id
    LEFT JOIN merchant_admin_state s ON s.merchant_id = m.id
    LEFT JOIN (SELECT merchant_id, COUNT(*) AS customerCount FROM customers GROUP BY merchant_id) cc ON cc.merchant_id = m.id
    LEFT JOIN (SELECT merchant_id, COUNT(*) AS employeeCount FROM employees WHERE active = 1 GROUP BY merchant_id) ec ON ec.merchant_id = m.id
    LEFT JOIN (
      SELECT merchant_id, SUM(CASE WHEN delta > 0 THEN 1 ELSE 0 END) AS passageCount, MAX(created_at) AS lastActivity
      FROM stamps GROUP BY merchant_id
    ) sc ON sc.merchant_id = m.id
    LEFT JOIN (SELECT merchant_id, COUNT(*) AS rewardCount FROM rewards GROUP BY merchant_id) rc ON rc.merchant_id = m.id
    LEFT JOIN (SELECT merchant_id, SUM(points) AS currentPoints FROM memberships GROUP BY merchant_id) mc ON mc.merchant_id = m.id
    WHERE (? = '' OR LOWER(m.business_name) LIKE ? OR LOWER(m.email) LIKE ? OR LOWER(m.slug) LIKE ?)
      AND (? = 'all' OR COALESCE(s.status, 'active') = ?)
    ORDER BY COALESCE(sc.lastActivity, m.created_at) DESC, m.business_name COLLATE NOCASE
    LIMIT 250
  `).bind(query, like, like, like, status, status).all();
  return json({ merchants: result.results ?? [] });
}

async function getMerchant(db: D1Database, merchantId: string): Promise<Response> {
  const merchant = await db.prepare(`
    SELECT
      m.id, m.business_name AS businessName, m.email, m.slug, m.accent_color AS accentColor,
      m.created_at AS createdAt, p.name AS programName, p.goal, p.reward_text AS rewardText,
      p.terms, p.active AS programActive, COALESCE(s.status, 'active') AS status,
      COALESCE(s.internal_note, '') AS internalNote, s.updated_at AS adminUpdatedAt,
      (SELECT COUNT(*) FROM customers WHERE merchant_id = m.id) AS customerCount,
      (SELECT COUNT(*) FROM employees WHERE merchant_id = m.id AND active = 1) AS employeeCount,
      (SELECT COUNT(*) FROM stamps WHERE merchant_id = m.id AND delta > 0) AS passageCount,
      (SELECT COUNT(*) FROM rewards WHERE merchant_id = m.id) AS rewardCount,
      (SELECT COALESCE(SUM(points), 0) FROM memberships WHERE merchant_id = m.id) AS currentPoints
    FROM merchants m
    LEFT JOIN programs p ON p.merchant_id = m.id
    LEFT JOIN merchant_admin_state s ON s.merchant_id = m.id
    WHERE m.id = ?
  `).bind(merchantId).first();
  if (!merchant) return json({ error: "Commerce introuvable." }, 404);

  const [employees, activity] = await Promise.all([
    db.prepare(`
      SELECT id, display_name AS displayName, email, active, created_at AS createdAt, updated_at AS updatedAt
      FROM employees WHERE merchant_id = ? ORDER BY active DESC, display_name COLLATE NOCASE LIMIT 100
    `).bind(merchantId).all(),
    db.prepare(`
      SELECT id, delta, reason, actor_role AS actorRole, created_at AS createdAt, reversed_at AS reversedAt
      FROM stamps WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 20
    `).bind(merchantId).all(),
  ]);
  return json({ merchant, employees: employees.results ?? [], activity: activity.results ?? [] });
}

async function setMerchantStatus(
  request: Request,
  env: Env,
  identity: AdminIdentity,
  merchantId: string,
): Promise<Response> {
  requireSameOrigin(request);
  const merchant = await env.DB.prepare("SELECT id, business_name AS businessName FROM merchants WHERE id = ?")
    .bind(merchantId).first<{ id: string; businessName: string }>();
  if (!merchant) return json({ error: "Commerce introuvable." }, 404);
  const body = await readBody(request);
  const status = body.status === "active" || body.status === "suspended" ? body.status : null;
  if (!status) return json({ error: "Statut invalide." }, 400);

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO merchant_admin_state (merchant_id, status, internal_note, updated_by)
      VALUES (?, ?, '', ?)
      ON CONFLICT(merchant_id) DO UPDATE SET
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = excluded.updated_by
    `).bind(merchantId, status, identity.email),
    auditStatement(env.DB, identity, status === "suspended" ? "merchant.suspended" : "merchant.reactivated", merchantId, {
      businessName: merchant.businessName,
      status,
    }),
  ]);
  return json({ ok: true, status });
}

async function setMerchantNote(
  request: Request,
  env: Env,
  identity: AdminIdentity,
  merchantId: string,
): Promise<Response> {
  requireSameOrigin(request);
  const merchant = await env.DB.prepare("SELECT id FROM merchants WHERE id = ?").bind(merchantId).first();
  if (!merchant) return json({ error: "Commerce introuvable." }, 404);
  const body = await readBody(request);
  const note = cleanText(body.note, 600);
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO merchant_admin_state (merchant_id, status, internal_note, updated_by)
      VALUES (?, 'active', ?, ?)
      ON CONFLICT(merchant_id) DO UPDATE SET
        internal_note = excluded.internal_note,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = excluded.updated_by
    `).bind(merchantId, note, identity.email),
    auditStatement(env.DB, identity, "merchant.note_updated", merchantId, { noteLength: note.length }),
  ]);
  return json({ ok: true, note });
}

type MerchantDeletionSummary = {
  id: string;
  businessName: string;
  slug: string;
  customerCount: number;
  employeeCount: number;
  stampCount: number;
  rewardCount: number;
};

async function deleteMerchantAccount(
  request: Request,
  env: Env,
  identity: AdminIdentity,
  merchantId: string,
): Promise<Response> {
  requireSameOrigin(request);
  const merchant = await env.DB.prepare(`
    SELECT
      m.id,
      m.business_name AS businessName,
      m.slug,
      (SELECT COUNT(*) FROM customers WHERE merchant_id = m.id) AS customerCount,
      (SELECT COUNT(*) FROM employees WHERE merchant_id = m.id) AS employeeCount,
      (SELECT COUNT(*) FROM stamps WHERE merchant_id = m.id) AS stampCount,
      (SELECT COUNT(*) FROM rewards WHERE merchant_id = m.id) AS rewardCount
    FROM merchants m
    WHERE m.id = ?
  `).bind(merchantId).first<MerchantDeletionSummary>();
  if (!merchant) return json({ error: "Commerce introuvable." }, 404);

  const body = await readBody(request);
  const confirmation = typeof body.confirmation === "string" ? body.confirmation.trim() : "";
  if (confirmation !== merchant.businessName) {
    return json({ error: "Le nom saisi ne correspond pas au commerce." }, 400);
  }

  await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM employee_sessions
      WHERE employee_id IN (SELECT id FROM employees WHERE merchant_id = ?)
    `).bind(merchantId),
    env.DB.prepare(`
      DELETE FROM employee_actions
      WHERE employee_id IN (SELECT id FROM employees WHERE merchant_id = ?)
         OR stamp_id IN (SELECT id FROM stamps WHERE merchant_id = ?)
    `).bind(merchantId, merchantId),
    env.DB.prepare(`
      DELETE FROM stamp_reward_links
      WHERE stamp_id IN (SELECT id FROM stamps WHERE merchant_id = ?)
         OR reward_id IN (SELECT id FROM rewards WHERE merchant_id = ?)
    `).bind(merchantId, merchantId),
    env.DB.prepare("DELETE FROM merchant_sessions WHERE merchant_id = ?").bind(merchantId),
    env.DB.prepare("DELETE FROM stamp_requests WHERE merchant_id = ?").bind(merchantId),
    env.DB.prepare("DELETE FROM rewards WHERE merchant_id = ?").bind(merchantId),
    env.DB.prepare("DELETE FROM stamps WHERE merchant_id = ?").bind(merchantId),
    env.DB.prepare("DELETE FROM memberships WHERE merchant_id = ?").bind(merchantId),
    env.DB.prepare("DELETE FROM customers WHERE merchant_id = ?").bind(merchantId),
    env.DB.prepare("DELETE FROM programs WHERE merchant_id = ?").bind(merchantId),
    env.DB.prepare("DELETE FROM employees WHERE merchant_id = ?").bind(merchantId),
    env.DB.prepare("DELETE FROM merchant_admin_state WHERE merchant_id = ?").bind(merchantId),
    env.DB.prepare("DELETE FROM merchants WHERE id = ?").bind(merchantId),
    auditStatement(env.DB, identity, "merchant.deleted", merchantId, {
      businessName: merchant.businessName,
      slug: merchant.slug,
      customerCount: merchant.customerCount,
      employeeCount: merchant.employeeCount,
      stampCount: merchant.stampCount,
      rewardCount: merchant.rewardCount,
    }),
  ]);
  return json({ ok: true, deleted: { id: merchant.id, businessName: merchant.businessName } });
}

async function getAuditLog(db: D1Database): Promise<Response> {
  const result = await db.prepare(`
    SELECT a.id, a.admin_email AS adminEmail, a.action, a.merchant_id AS merchantId,
      a.details_json AS detailsJson, a.created_at AS createdAt,
      COALESCE(m.business_name, json_extract(a.details_json, '$.businessName')) AS businessName
    FROM admin_audit_log a
    LEFT JOIN merchants m ON m.id = a.merchant_id
    ORDER BY a.created_at DESC LIMIT 100
  `).all();
  return json({ events: result.results ?? [] });
}

function loginPage(): Response {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Connexion administrateur · Kivli</title>
  <style nonce="${nonce}">
    :root{color-scheme:light;--ink:#17201d;--muted:#66706c;--paper:#f6f5f0;--card:#fff;--line:#e2e2da;--brand:#f05b3c;--brand-dark:#ce3f24;--success:#19734a;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box}html,body{margin:0;min-width:0;overflow-x:hidden}body{min-height:100vh;background:var(--paper);color:var(--ink);display:grid;place-items:center;padding:max(22px,env(safe-area-inset-top)) 18px max(22px,env(safe-area-inset-bottom))}
    .card{width:min(440px,100%);background:var(--card);border:1px solid var(--line);border-radius:24px;padding:clamp(24px,6vw,38px);box-shadow:0 24px 70px rgba(30,39,35,.1)}.brand{display:flex;align-items:center;gap:11px;font-weight:850;font-size:22px;letter-spacing:-.04em}.brand-mark{display:grid;grid-template-columns:repeat(3,6px);align-items:end;gap:3px;width:24px;height:24px;padding:4px;background:var(--brand);border-radius:8px}.brand-mark i{display:block;background:#fff;border-radius:2px}.brand-mark i:nth-child(1){height:7px}.brand-mark i:nth-child(2){height:13px}.brand-mark i:nth-child(3){height:10px}.chip{margin-left:auto;padding:5px 9px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.1em}
    .view[hidden]{display:none}h1{font-size:34px;line-height:1.05;letter-spacing:-.045em;margin:38px 0 10px}p{margin:0 0 26px;color:var(--muted);line-height:1.55}.field{display:grid;gap:7px;margin:15px 0}.field span{font-size:12px;font-weight:780}.input{width:100%;min-width:0;height:50px;border:1px solid var(--line);border-radius:12px;background:#fafaf7;padding:0 14px;color:var(--ink);font-size:16px}.input:focus{outline:3px solid rgba(240,91,60,.15);border-color:var(--brand)}.code{font-size:22px;letter-spacing:.28em;text-align:center;font-variant-numeric:tabular-nums}.submit{width:100%;height:50px;border:0;border-radius:12px;background:var(--ink);color:#fff;font-weight:820;font-size:15px;margin-top:12px;cursor:pointer}.submit:hover{background:#29332f}.submit:disabled{opacity:.65;cursor:wait}.link{display:block;width:100%;border:0;background:transparent;color:var(--brand-dark);font-weight:760;font-size:13px;padding:13px 8px 4px;cursor:pointer}.link:hover{text-decoration:underline}.feedback{min-height:22px;margin-top:14px;font-size:13px;text-align:center;color:#b52828;line-height:1.45}.feedback.success{color:var(--success)}.hint{color:var(--muted);font-size:11px;line-height:1.5;margin-top:-5px}.secure{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:20px;color:var(--muted);font-size:11px}.secure:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--success)}
  </style>
</head>
<body>
  <main class="card">
    <div class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>Kivli</span><span class="chip">Administration</span></div>
    <section class="view" id="login-view">
      <h1>Bienvenue.</h1>
      <p>Connectez-vous à l’espace privé de pilotage de la plateforme.</p>
      <form id="login-form">
        <label class="field"><span>Adresse e-mail</span><input class="input" id="email" name="email" type="email" inputmode="email" autocomplete="username" required></label>
        <label class="field"><span>Mot de passe</span><input class="input" id="password" name="password" type="password" autocomplete="current-password" required></label>
        <button class="submit" id="login-submit" type="submit">Se connecter</button>
        <button class="link" id="forgot-password" type="button">Mot de passe oublié ?</button>
        <div class="feedback" id="login-feedback" role="alert" aria-live="polite"></div>
      </form>
    </section>
    <section class="view" id="request-view" hidden>
      <h1>Récupérer l’accès.</h1>
      <p>Nous enverrons un code temporaire à l’adresse administrateur.</p>
      <form id="request-form">
        <label class="field"><span>Adresse e-mail administrateur</span><input class="input" id="reset-email" type="email" inputmode="email" autocomplete="email" required></label>
        <button class="submit" id="request-submit" type="submit">Envoyer le code</button>
        <button class="link back-login" type="button">Retour à la connexion</button>
        <div class="feedback" id="request-feedback" role="alert" aria-live="polite"></div>
      </form>
    </section>
    <section class="view" id="confirm-view" hidden>
      <h1>Nouveau mot de passe.</h1>
      <p>Saisissez le code reçu par e-mail, puis choisissez votre nouveau mot de passe.</p>
      <form id="confirm-form">
        <label class="field"><span>Code à 6 chiffres</span><input class="input code" id="reset-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></label>
        <label class="field"><span>Nouveau mot de passe</span><input class="input" id="new-password" type="password" autocomplete="new-password" minlength="12" required></label>
        <div class="hint">12 caractères minimum, avec majuscule, minuscule, chiffre et symbole.</div>
        <label class="field"><span>Confirmer le mot de passe</span><input class="input" id="confirm-password" type="password" autocomplete="new-password" minlength="12" required></label>
        <button class="submit" id="confirm-submit" type="submit">Enregistrer le nouveau mot de passe</button>
        <button class="link" id="resend-code" type="button">Renvoyer un code</button>
        <button class="link back-login" type="button">Retour à la connexion</button>
        <div class="feedback" id="confirm-feedback" role="alert" aria-live="polite"></div>
      </form>
    </section>
    <div class="secure">Connexion chiffrée et session privée de 12 heures</div>
  </main>
  <script nonce="${nonce}">
    const $=(id)=>document.getElementById(id);let resetEmail="";
    const show=(id)=>{document.querySelectorAll(".view").forEach((view)=>view.hidden=view.id!==id)};
    const feedback=(id,message,success=false)=>{const el=$(id);el.textContent=message;el.className="feedback"+(success?" success":"")};
    const post=async(path,data)=>{const response=await fetch(path,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||"Action impossible pour le moment.");return body};
    $("login-form").addEventListener("submit",async(event)=>{event.preventDefault();const button=$("login-submit");feedback("login-feedback","");button.disabled=true;button.textContent="Connexion…";try{await post("/api/login",{email:$("email").value,password:$("password").value});location.replace("/")}catch(reason){feedback("login-feedback",reason.message||"Connexion impossible.");button.disabled=false;button.textContent="Se connecter"}});
    $("forgot-password").addEventListener("click",()=>{$("reset-email").value=$("email").value.trim();feedback("request-feedback","");show("request-view");$("reset-email").focus()});
    document.querySelectorAll(".back-login").forEach((button)=>button.addEventListener("click",()=>{feedback("login-feedback","");show("login-view");$("email").focus()}));
    $("request-form").addEventListener("submit",async(event)=>{event.preventDefault();const button=$("request-submit");resetEmail=$("reset-email").value.trim();feedback("request-feedback","");button.disabled=true;button.textContent="Envoi…";try{const body=await post("/api/password-reset/request",{email:resetEmail});show("confirm-view");feedback("confirm-feedback",body.message||"Code envoyé.",true);$("reset-code").focus()}catch(reason){feedback("request-feedback",reason.message||"Envoi impossible.")}finally{button.disabled=false;button.textContent="Envoyer le code"}});
    $("confirm-form").addEventListener("submit",async(event)=>{event.preventDefault();const button=$("confirm-submit"),password=$("new-password").value;if(password!==$("confirm-password").value){feedback("confirm-feedback","Les deux mots de passe ne correspondent pas.");return}feedback("confirm-feedback","");button.disabled=true;button.textContent="Enregistrement…";try{await post("/api/password-reset/confirm",{email:resetEmail,code:$("reset-code").value,password});$("email").value=resetEmail;$("password").value="";show("login-view");feedback("login-feedback","Mot de passe modifié. Vous pouvez maintenant vous connecter.",true);$("password").focus()}catch(reason){feedback("confirm-feedback",reason.message||"Modification impossible.")}finally{button.disabled=false;button.textContent="Enregistrer le nouveau mot de passe"}});
    $("resend-code").addEventListener("click",()=>{show("request-view");$("reset-email").value=resetEmail;feedback("request-feedback","");$("reset-email").focus()});
  </script>
</body>
</html>`;
  return new Response(html, { headers: securityHeaders(nonce) });
}

function adminPage(identity: AdminIdentity): Response {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const serializedEmail = JSON.stringify(identity.email).replace(/</g, "\\u003c");
  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Administration · Kivli</title>
  <style nonce="${nonce}">
    :root{color-scheme:light;--ink:#17201d;--muted:#66706c;--paper:#f6f5f0;--card:#fff;--line:#e2e2da;--brand:#f05b3c;--brand-dark:#ce3f24;--green:#19734a;--green-bg:#e8f6ee;--red:#b52828;--red-bg:#fbeaea;--shadow:0 18px 60px rgba(30,39,35,.08);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);min-height:100vh}button,input,select,textarea{font:inherit}button{cursor:pointer}.shell{width:min(1220px,calc(100% - 32px));margin:0 auto;padding-bottom:64px}
    .topbar{position:sticky;top:0;z-index:20;background:rgba(246,245,240,.92);backdrop-filter:blur(18px);border-bottom:1px solid rgba(226,226,218,.85)}.topbar-inner{width:min(1220px,calc(100% - 32px));height:76px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:20px}.brand{display:flex;align-items:center;gap:11px;font-weight:850;font-size:22px;letter-spacing:-.04em}.brand-mark{display:grid;grid-template-columns:repeat(3,6px);align-items:end;gap:3px;width:24px;height:24px;padding:4px;background:var(--brand);border-radius:8px}.brand-mark i{display:block;background:#fff;border-radius:2px}.brand-mark i:nth-child(1){height:7px}.brand-mark i:nth-child(2){height:13px}.brand-mark i:nth-child(3){height:10px}.admin-chip{padding:5px 9px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.12em}.identity{display:flex;align-items:center;gap:14px;color:var(--muted);font-size:13px}.logout{color:var(--ink);font-weight:700;border:0;background:transparent;padding:0;cursor:pointer}.logout:hover{text-decoration:underline}
    .hero{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding:48px 0 30px}.eyebrow{color:var(--brand-dark);font-size:12px;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.hero h1{font-size:clamp(34px,5vw,56px);letter-spacing:-.055em;line-height:1;margin:10px 0 12px}.hero p{color:var(--muted);font-size:16px;margin:0;max-width:620px;line-height:1.6}.sync{border:1px solid var(--line);background:var(--card);border-radius:12px;padding:11px 16px;font-weight:750;color:var(--ink)}.sync:hover{border-color:#babbb2}
    .metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:30px}.metric{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px;box-shadow:0 8px 28px rgba(30,39,35,.035)}.metric-label{font-size:12px;color:var(--muted);font-weight:750}.metric-value{display:block;font-size:34px;font-weight:850;letter-spacing:-.05em;margin-top:10px}.metric-note{font-size:12px;color:var(--muted);margin-top:4px}
    .section{background:var(--card);border:1px solid var(--line);border-radius:22px;box-shadow:var(--shadow);overflow:hidden;margin-bottom:22px}.section-head{padding:22px 24px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:18px}.section h2{margin:0;font-size:21px;letter-spacing:-.025em}.section-sub{color:var(--muted);font-size:13px;margin-top:5px}.tools{display:flex;gap:9px;flex-wrap:wrap}.field{height:42px;border:1px solid var(--line);border-radius:11px;background:#fafaf7;padding:0 12px;color:var(--ink);min-width:210px;font-size:16px}.field:focus,.note:focus{outline:3px solid rgba(240,91,60,.15);border-color:var(--brand)}select.field{min-width:150px}.merchant-list{display:grid}.merchant-row{display:grid;grid-template-columns:minmax(190px,1.5fr) minmax(130px,1fr) repeat(4,minmax(74px,.55fr)) 112px;gap:16px;align-items:center;padding:17px 24px;border-bottom:1px solid var(--line)}.merchant-row:last-child{border-bottom:0}.merchant-row:hover{background:#fbfbf8}.merchant-name{font-weight:800;letter-spacing:-.01em}.merchant-email,.muted{color:var(--muted);font-size:12px;margin-top:4px;overflow-wrap:anywhere}.program{font-size:13px;font-weight:700}.cell-number{font-weight:820;font-variant-numeric:tabular-nums}.cell-label{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-top:4px}.status{display:inline-flex;align-items:center;gap:6px;width:max-content;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:820}.status:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}.status-active{color:var(--green);background:var(--green-bg)}.status-suspended{color:var(--red);background:var(--red-bg)}.details-button{border:1px solid var(--line);background:#fff;border-radius:10px;padding:9px 12px;font-weight:750}.details-button:hover{border-color:var(--brand);color:var(--brand-dark)}.empty{padding:50px 24px;text-align:center;color:var(--muted)}
    .audit-list{display:grid}.audit-row{display:grid;grid-template-columns:150px 1fr minmax(180px,.6fr);gap:18px;padding:14px 24px;border-bottom:1px solid var(--line);font-size:13px}.audit-row:last-child{border-bottom:0}.audit-action{font-weight:760}.audit-time,.audit-admin{color:var(--muted)}
    .overlay{position:fixed;inset:0;z-index:50;background:rgba(15,22,19,.45);display:flex;justify-content:flex-end;opacity:0;pointer-events:none;transition:opacity .18s}.overlay.open{opacity:1;pointer-events:auto}.panel{width:min(560px,100%);height:100%;background:var(--paper);padding:26px;overflow:auto;transform:translateX(20px);transition:transform .18s}.overlay.open .panel{transform:none}.panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}.close{width:42px;height:42px;border:1px solid var(--line);background:#fff;border-radius:12px;font-size:22px}.panel h2{font-size:31px;letter-spacing:-.04em;margin:12px 0 4px}.panel-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:24px 0}.info{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px}.info span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:7px}.info strong{font-size:18px}.panel-section{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px;margin:14px 0}.panel-section h3{margin:0 0 13px;font-size:16px}.delete-zone{border-color:#efb9b9;background:#fffafa}.note{width:100%;min-height:100px;resize:vertical;border:1px solid var(--line);border-radius:12px;padding:12px;font-size:16px}.actions{display:flex;gap:10px;margin-top:12px}.primary,.danger{border:0;border-radius:11px;padding:11px 15px;font-weight:800}.primary{background:var(--ink);color:#fff}.danger{background:var(--red-bg);color:var(--red)}.danger-strong{background:var(--red);color:#fff}.danger-strong:disabled{opacity:.65;cursor:wait}.activity{display:grid;gap:9px}.activity-item{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid var(--line);font-size:13px}.activity-item:last-child{border-bottom:0}.toast{position:fixed;left:50%;bottom:24px;z-index:80;transform:translate(-50%,20px);background:var(--ink);color:#fff;padding:12px 17px;border-radius:12px;opacity:0;pointer-events:none;transition:.2s;font-size:13px;box-shadow:var(--shadow)}.toast.show{opacity:1;transform:translate(-50%,0)}.toast.error{background:var(--red)}
    @media(max-width:940px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.merchant-row{grid-template-columns:1.3fr 1fr repeat(2,.55fr) 105px}.merchant-row>:nth-child(5),.merchant-row>:nth-child(6){display:none}}
    @media(max-width:680px){.shell,.topbar-inner{width:min(100% - 22px,1220px)}.topbar-inner{height:68px}.identity span{display:none}.admin-chip{display:none}.hero{padding-top:30px;align-items:flex-start;flex-direction:column}.hero h1{font-size:38px}.metrics{gap:9px}.metric{padding:16px;border-radius:15px}.metric-value{font-size:28px}.section{border-radius:17px}.section-head{align-items:flex-start;flex-direction:column;padding:18px}.tools{width:100%}.field{width:100%;min-width:0}.merchant-row{grid-template-columns:1fr auto;padding:16px 18px}.merchant-row>:nth-child(2),.merchant-row>:nth-child(3),.merchant-row>:nth-child(4),.merchant-row>:nth-child(5),.merchant-row>:nth-child(6){display:none}.audit-row{grid-template-columns:1fr;padding:13px 18px;gap:5px}.panel{padding:20px}.panel-grid{grid-template-columns:1fr 1fr}.panel h2{font-size:27px}}
  </style>
</head>
<body>
  <header class="topbar"><div class="topbar-inner"><div class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>Kivli</span><span class="admin-chip">Administration</span></div><div class="identity"><span id="admin-email"></span><button class="logout" id="logout" type="button">Se deconnecter</button></div></div></header>
  <main class="shell">
    <section class="hero"><div><div class="eyebrow">Pilotage de la plateforme</div><h1>Vue d'ensemble.</h1><p>Surveille les commerces, leur activite et leur acces sans exposer les donnees personnelles des clients.</p></div><button class="sync" id="refresh" type="button">Actualiser</button></section>
    <section class="metrics" aria-label="Indicateurs principaux">
      <article class="metric"><span class="metric-label">Commerces</span><strong class="metric-value" id="metric-merchants">—</strong><div class="metric-note" id="metric-active">— actifs</div></article>
      <article class="metric"><span class="metric-label">Clients fidelises</span><strong class="metric-value" id="metric-customers">—</strong><div class="metric-note">Toutes enseignes</div></article>
      <article class="metric"><span class="metric-label">Passages ajoutes</span><strong class="metric-value" id="metric-passages">—</strong><div class="metric-note">Historique total</div></article>
      <article class="metric"><span class="metric-label">Recompenses</span><strong class="metric-value" id="metric-rewards">—</strong><div class="metric-note" id="metric-points">— points en cours</div></article>
    </section>
    <section class="section">
      <div class="section-head"><div><h2>Commercants</h2><div class="section-sub" id="merchant-count">Chargement…</div></div><div class="tools"><input class="field" id="search" type="search" placeholder="Rechercher un commerce" autocomplete="off"><select class="field" id="status-filter" aria-label="Filtrer par statut"><option value="all">Tous les statuts</option><option value="active">Actifs</option><option value="suspended">Suspendus</option></select></div></div>
      <div class="merchant-list" id="merchant-list"><div class="empty">Chargement des commerces…</div></div>
    </section>
    <section class="section">
      <div class="section-head"><div><h2>Journal d'administration</h2><div class="section-sub">Les actions sensibles sont conservees pour la tracabilite.</div></div></div>
      <div class="audit-list" id="audit-list"><div class="empty">Aucune action pour le moment.</div></div>
    </section>
  </main>
  <div class="overlay" id="overlay" aria-hidden="true"><aside class="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title"><div class="panel-head"><div><div class="eyebrow">Fiche commercant</div><h2 id="panel-title">Commerce</h2><div class="muted" id="panel-email"></div></div><button class="close" id="close-panel" type="button" aria-label="Fermer">×</button></div><div id="panel-content"></div></aside></div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <script nonce="${nonce}">
    const state={merchants:[],selected:null,searchTimer:null};
    const $=(id)=>document.getElementById(id);
    const escapeHtml=(value)=>String(value??"").replace(/[&<>"']/g,(char)=>({38:"&amp;",60:"&lt;",62:"&gt;",34:"&quot;",39:"&#39;"}[char.charCodeAt(0)]));
    const formatNumber=(value)=>new Intl.NumberFormat("fr-FR").format(Number(value||0));
    const formatDate=(value)=>value?new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(String(value).includes("T")?value:String(value).replace(" ","T")+"Z")):"—";
    const actionLabel=(action)=>({"merchant.suspended":"Commerce suspendu","merchant.reactivated":"Commerce reactive","merchant.note_updated":"Note interne modifiee","merchant.deleted":"Compte commercant supprime","admin.login":"Connexion administrateur","admin.logout":"Deconnexion administrateur","admin.password_reset":"Mot de passe administrateur modifie"}[action]||action);
    function toast(message,error=false){const el=$("toast");el.textContent=message;el.className="toast show"+(error?" error":"");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.className="toast",3200)}
    async function api(path,options={}){const response=await fetch(path,{credentials:"same-origin",...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});const body=await response.json().catch(()=>({}));if(response.status===401){location.replace("/login");throw new Error("Session expiree.")}if(!response.ok)throw new Error(body.error||"Une erreur est survenue.");return body}
    async function loadOverview(){const {overview}=await api("/api/overview");$("metric-merchants").textContent=formatNumber(overview.merchants);$("metric-active").textContent=formatNumber(overview.active_merchants)+" actifs · "+formatNumber(overview.suspended_merchants)+" suspendus";$("metric-customers").textContent=formatNumber(overview.customers);$("metric-passages").textContent=formatNumber(overview.passages);$("metric-rewards").textContent=formatNumber(overview.rewards);$("metric-points").textContent=formatNumber(overview.current_points)+" points en cours"}
    function renderMerchants(){const list=$("merchant-list");$("merchant-count").textContent=state.merchants.length+" commerce"+(state.merchants.length>1?"s":"")+" affiche"+(state.merchants.length>1?"s":"");if(!state.merchants.length){list.innerHTML='<div class="empty">Aucun commerce ne correspond a cette recherche.</div>';return}list.innerHTML=state.merchants.map((merchant)=>'<article class="merchant-row"><div><div class="merchant-name">'+escapeHtml(merchant.businessName)+'</div><div class="merchant-email">'+escapeHtml(merchant.email)+'</div></div><div><div class="program">'+escapeHtml(merchant.programName||"Sans programme")+'</div><span class="status status-'+escapeHtml(merchant.status)+'">'+(merchant.status==="suspended"?"Suspendu":"Actif")+'</span></div><div class="cell-number">'+formatNumber(merchant.customerCount)+'<span class="cell-label">Clients</span></div><div class="cell-number">'+formatNumber(merchant.passageCount)+'<span class="cell-label">Passages</span></div><div class="cell-number">'+formatNumber(merchant.employeeCount)+'<span class="cell-label">Equipe</span></div><div><div class="cell-number">'+formatDate(merchant.lastActivity)+'</div><span class="cell-label">Activite</span></div><button class="details-button" type="button" data-id="'+escapeHtml(merchant.id)+'">Ouvrir</button></article>').join("");list.querySelectorAll("[data-id]").forEach((button)=>button.addEventListener("click",()=>openMerchant(button.dataset.id)))}
    async function loadMerchants(){const query=encodeURIComponent($("search").value.trim());const status=encodeURIComponent($("status-filter").value);const {merchants}=await api("/api/merchants?q="+query+"&status="+status);state.merchants=merchants;renderMerchants()}
    async function loadAudit(){const {events}=await api("/api/audit");const list=$("audit-list");if(!events.length){list.innerHTML='<div class="empty">Aucune action pour le moment.</div>';return}list.innerHTML=events.map((event)=>'<div class="audit-row"><div class="audit-time">'+formatDate(event.createdAt)+'</div><div><div class="audit-action">'+escapeHtml(actionLabel(event.action))+'</div><div class="muted">'+escapeHtml(event.businessName||"Plateforme")+'</div></div><div class="audit-admin">'+escapeHtml(event.adminEmail)+'</div></div>').join("")}
    async function openMerchant(id){const data=await api("/api/merchants/"+encodeURIComponent(id));state.selected=data.merchant;$("panel-title").textContent=data.merchant.businessName;$("panel-email").textContent=data.merchant.email;const m=data.merchant;const activity=data.activity.length?data.activity.map((item)=>'<div class="activity-item"><span>'+(Number(item.delta)>0?"Passage ajoute":"Correction")+' · '+escapeHtml(item.actorRole)+'</span><span class="muted">'+formatDate(item.createdAt)+'</span></div>').join(""):'<div class="muted">Aucune activite enregistree.</div>';$("panel-content").innerHTML='<div class="panel-grid"><div class="info"><span>Statut</span><strong>'+(m.status==="suspended"?"Suspendu":"Actif")+'</strong></div><div class="info"><span>Clients</span><strong>'+formatNumber(m.customerCount)+'</strong></div><div class="info"><span>Passages</span><strong>'+formatNumber(m.passageCount)+'</strong></div><div class="info"><span>Recompenses</span><strong>'+formatNumber(m.rewardCount)+'</strong></div></div><section class="panel-section"><h3>Programme</h3><div class="program">'+escapeHtml(m.programName||"Sans programme")+'</div><div class="muted">Objectif : '+formatNumber(m.goal)+' · '+escapeHtml(m.rewardText||"")+'</div><div class="muted">Lien public : /join/'+escapeHtml(m.slug)+'</div></section><section class="panel-section"><h3>Note interne</h3><textarea class="note" id="merchant-note" maxlength="600" placeholder="Informations de support, suivi commercial…">'+escapeHtml(m.internalNote||"")+'</textarea><div class="actions"><button class="primary" id="save-note" type="button">Enregistrer la note</button></div></section><section class="panel-section"><h3>Gestion de l’acces</h3><p class="muted">La suspension bloque le commercant et ses employes sans supprimer leurs donnees.</p><button class="'+(m.status==="suspended"?"primary":"danger")+'" id="toggle-status" type="button">'+(m.status==="suspended"?"Reactiver le commerce":"Suspendre le commerce")+'</button></section><section class="panel-section delete-zone"><h3>Suppression definitive</h3><p class="muted">Supprime le compte commercant, ses employes, ses clients, ses cartes, ses points et ses historiques. Cette action est irreversible.</p><button class="danger danger-strong" id="delete-merchant" type="button">Supprimer definitivement</button></section><section class="panel-section"><h3>Derniere activite</h3><div class="activity">'+activity+'</div></section>';$("overlay").classList.add("open");$("overlay").setAttribute("aria-hidden","false");$("close-panel").focus();$("save-note").onclick=saveNote;$("toggle-status").onclick=toggleStatus;$("delete-merchant").onclick=deleteMerchant}
    function closePanel(){$("overlay").classList.remove("open");$("overlay").setAttribute("aria-hidden","true");state.selected=null}
    async function saveNote(){if(!state.selected)return;const note=$("merchant-note").value;await api("/api/merchants/"+encodeURIComponent(state.selected.id)+"/note",{method:"POST",body:JSON.stringify({note})});toast("Note enregistree.");await Promise.all([loadMerchants(),loadAudit()])}
    async function toggleStatus(){if(!state.selected)return;const next=state.selected.status==="suspended"?"active":"suspended";const verb=next==="suspended"?"suspendre":"reactiver";if(!confirm("Confirmer : "+verb+" "+state.selected.businessName+" ?"))return;await api("/api/merchants/"+encodeURIComponent(state.selected.id)+"/status",{method:"POST",body:JSON.stringify({status:next})});toast(next==="suspended"?"Commerce suspendu.":"Commerce reactive.");closePanel();await refreshAll()}
    async function deleteMerchant(){if(!state.selected)return;const merchant={id:state.selected.id,businessName:state.selected.businessName};const confirmation=prompt('Suppression definitive : saisis exactement "'+merchant.businessName+'" pour confirmer.');if(confirmation===null)return;if(confirmation.trim()!==merchant.businessName){toast("Le nom saisi ne correspond pas. Le compte n’a pas ete supprime.",true);return}const button=$("delete-merchant");button.disabled=true;button.textContent="Suppression…";try{await api("/api/merchants/"+encodeURIComponent(merchant.id),{method:"DELETE",body:JSON.stringify({confirmation:confirmation.trim()})});closePanel();toast("Compte "+merchant.businessName+" supprime definitivement.");await refreshAll()}catch(error){button.disabled=false;button.textContent="Supprimer definitivement";toast(error.message||"Suppression impossible.",true)}}
    async function refreshAll(){try{await Promise.all([loadOverview(),loadMerchants(),loadAudit()])}catch(error){toast(error.message||"Chargement impossible.",true)}}
    $("refresh").addEventListener("click",refreshAll);$("search").addEventListener("input",()=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(loadMerchants,250)});$("status-filter").addEventListener("change",loadMerchants);$("close-panel").addEventListener("click",closePanel);$("overlay").addEventListener("click",(event)=>{if(event.target===$("overlay"))closePanel()});document.addEventListener("keydown",(event)=>{if(event.key==="Escape")closePanel()});$("logout").addEventListener("click",async()=>{try{await api("/api/logout",{method:"POST",body:"{}"})}finally{location.replace("/login")}});$("admin-email").textContent=${serializedEmail};refreshAll();
  </script>
</body>
</html>`;
  return new Response(html, { headers: securityHeaders(nonce) });
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  await ensureAdminSchema(env.DB);
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "POST" && path === "/api/login") return loginAdmin(request, env);
  if (request.method === "POST" && path === "/api/password-reset/request") return requestPasswordReset(request, env);
  if (request.method === "POST" && path === "/api/password-reset/confirm") return confirmPasswordReset(request, env);
  if (request.method === "GET" && path === "/login") {
    const existingIdentity = await getAdmin(request, env);
    return existingIdentity
      ? new Response(null, { status: 303, headers: { Location: "/", "Cache-Control": "no-store" } })
      : loginPage();
  }

  const identity = await getAdmin(request, env);
  if (!identity) {
    if (request.method === "GET" && !path.startsWith("/api/")) {
      return new Response(null, { status: 303, headers: { Location: "/login", "Cache-Control": "no-store" } });
    }
    return json({ error: "Session administrateur requise." }, 401);
  }

  if (request.method === "GET" && path === "/") return adminPage(identity);
  if (request.method === "GET" && path === "/api/me") return json({ identity });
  if (request.method === "POST" && path === "/api/logout") return logoutAdmin(request, env, identity);
  if (request.method === "GET" && path === "/api/overview") return getOverview(env.DB);
  if (request.method === "GET" && path === "/api/merchants") return listMerchants(env.DB, url);
  if (request.method === "GET" && path === "/api/audit") return getAuditLog(env.DB);

  const detailMatch = path.match(/^\/api\/merchants\/([^/]+)$/);
  if (request.method === "GET" && detailMatch) return getMerchant(env.DB, decodeURIComponent(detailMatch[1]));
  if (request.method === "DELETE" && detailMatch) {
    return deleteMerchantAccount(request, env, identity, decodeURIComponent(detailMatch[1]));
  }
  const statusMatch = path.match(/^\/api\/merchants\/([^/]+)\/status$/);
  if (request.method === "POST" && statusMatch) {
    return setMerchantStatus(request, env, identity, decodeURIComponent(statusMatch[1]));
  }
  const noteMatch = path.match(/^\/api\/merchants\/([^/]+)\/note$/);
  if (request.method === "POST" && noteMatch) {
    return setMerchantNote(request, env, identity, decodeURIComponent(noteMatch[1]));
  }
  return json({ error: "Route introuvable." }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      if (error instanceof Response) return error;
      console.error("Kivli Admin error", error);
      return json({ error: "Erreur interne de l'administration." }, 500);
    }
  },
};
