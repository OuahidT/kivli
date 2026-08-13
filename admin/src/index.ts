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
  TEAM_DOMAIN?: string;
  POLICY_AUD?: string;
}

type AdminIdentity = {
  email: string;
  subject: string;
};

type AccessPayload = {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  nbf?: number;
  sub?: string;
};

type Jwk = JsonWebKey & { kid?: string; alg?: string };

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, private",
};

let schemaReady = false;
let jwksCache: { expiresAt: number; keys: Jwk[] } | null = null;
const importedKeys = new Map<string, CryptoKey>();

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

function decodeBase64Url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  return bytes.buffer;
}

function decodeJsonSegment<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

function normalizeTeamDomain(value: string): string {
  return value.trim().replace(/\/$/, "");
}

async function getSigningKey(teamDomain: string, kid: string): Promise<CryptoKey> {
  const cacheKey = `${teamDomain}:${kid}`;
  const existing = importedKeys.get(cacheKey);
  if (existing) return existing;

  if (!jwksCache || jwksCache.expiresAt < Date.now()) {
    const response = await fetch(`${teamDomain}/cdn-cgi/access/certs`, {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 3600, cacheEverything: true },
    } as RequestInit);
    if (!response.ok) throw new Error("Impossible de charger les cles Access.");
    const body = (await response.json()) as { keys?: Jwk[] };
    if (!Array.isArray(body.keys)) throw new Error("Reponse de cles Access invalide.");
    jwksCache = { keys: body.keys, expiresAt: Date.now() + 60 * 60 * 1000 };
    importedKeys.clear();
  }

  const jwk = jwksCache.keys.find((candidate) => candidate.kid === kid);
  if (!jwk) throw new Error("Cle Access inconnue.");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  importedKeys.set(cacheKey, key);
  return key;
}

async function requireAdmin(request: Request, env: Env): Promise<AdminIdentity> {
  const teamDomainValue = env.TEAM_DOMAIN;
  const audience = env.POLICY_AUD;
  if (!teamDomainValue || !audience) throw new Response("Administration non configuree.", { status: 503 });

  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) throw new Response("Acces administrateur requis.", { status: 403 });
  const parts = token.split(".");
  if (parts.length !== 3) throw new Response("Jeton Access invalide.", { status: 403 });

  try {
    const header = decodeJsonSegment<{ alg?: string; kid?: string }>(parts[0]);
    const payload = decodeJsonSegment<AccessPayload>(parts[1]);
    if (header.alg !== "RS256" || !header.kid) throw new Error("Algorithme Access invalide.");
    const teamDomain = normalizeTeamDomain(teamDomainValue);
    const key = await getSigningKey(teamDomain, header.kid);
    const verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!verified) throw new Error("Signature Access invalide.");

    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (payload.iss !== teamDomain) throw new Error("Emetteur Access invalide.");
    if (!audiences.includes(audience)) throw new Error("Audience Access invalide.");
    if (!payload.exp || payload.exp <= now) throw new Error("Session Access expiree.");
    if (payload.nbf && payload.nbf > now + 30) throw new Error("Session Access prematuree.");
    if (!payload.email || !payload.sub) throw new Error("Identite Access incomplete.");
    return { email: payload.email.toLowerCase(), subject: payload.sub };
  } catch (error) {
    if (error instanceof Response) throw error;
    throw new Response("Session administrateur invalide.", { status: 403 });
  }
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
    db.prepare("CREATE INDEX IF NOT EXISTS idx_admin_state_status ON merchant_admin_state(status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_admin_audit_merchant ON admin_audit_log(merchant_id, created_at)"),
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

async function getAuditLog(db: D1Database): Promise<Response> {
  const result = await db.prepare(`
    SELECT a.id, a.admin_email AS adminEmail, a.action, a.merchant_id AS merchantId,
      a.details_json AS detailsJson, a.created_at AS createdAt, m.business_name AS businessName
    FROM admin_audit_log a
    LEFT JOIN merchants m ON m.id = a.merchant_id
    ORDER BY a.created_at DESC LIMIT 100
  `).all();
  return json({ events: result.results ?? [] });
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
  <title>Administration · Tampo</title>
  <style nonce="${nonce}">
    :root{color-scheme:light;--ink:#17201d;--muted:#66706c;--paper:#f6f5f0;--card:#fff;--line:#e2e2da;--brand:#f05b3c;--brand-dark:#ce3f24;--green:#19734a;--green-bg:#e8f6ee;--red:#b52828;--red-bg:#fbeaea;--shadow:0 18px 60px rgba(30,39,35,.08);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);min-height:100vh}button,input,select,textarea{font:inherit}button{cursor:pointer}.shell{width:min(1220px,calc(100% - 32px));margin:0 auto;padding-bottom:64px}
    .topbar{position:sticky;top:0;z-index:20;background:rgba(246,245,240,.92);backdrop-filter:blur(18px);border-bottom:1px solid rgba(226,226,218,.85)}.topbar-inner{width:min(1220px,calc(100% - 32px));height:76px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:20px}.brand{display:flex;align-items:center;gap:11px;font-weight:850;font-size:22px;letter-spacing:-.04em}.brand-mark{display:grid;grid-template-columns:repeat(3,6px);align-items:end;gap:3px;width:24px;height:24px;padding:4px;background:var(--brand);border-radius:8px}.brand-mark i{display:block;background:#fff;border-radius:2px}.brand-mark i:nth-child(1){height:7px}.brand-mark i:nth-child(2){height:13px}.brand-mark i:nth-child(3){height:10px}.admin-chip{padding:5px 9px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.12em}.identity{display:flex;align-items:center;gap:14px;color:var(--muted);font-size:13px}.logout{color:var(--ink);text-decoration:none;font-weight:700}.logout:hover{text-decoration:underline}
    .hero{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding:48px 0 30px}.eyebrow{color:var(--brand-dark);font-size:12px;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.hero h1{font-size:clamp(34px,5vw,56px);letter-spacing:-.055em;line-height:1;margin:10px 0 12px}.hero p{color:var(--muted);font-size:16px;margin:0;max-width:620px;line-height:1.6}.sync{border:1px solid var(--line);background:var(--card);border-radius:12px;padding:11px 16px;font-weight:750;color:var(--ink)}.sync:hover{border-color:#babbb2}
    .metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:30px}.metric{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px;box-shadow:0 8px 28px rgba(30,39,35,.035)}.metric-label{font-size:12px;color:var(--muted);font-weight:750}.metric-value{display:block;font-size:34px;font-weight:850;letter-spacing:-.05em;margin-top:10px}.metric-note{font-size:12px;color:var(--muted);margin-top:4px}
    .section{background:var(--card);border:1px solid var(--line);border-radius:22px;box-shadow:var(--shadow);overflow:hidden;margin-bottom:22px}.section-head{padding:22px 24px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:18px}.section h2{margin:0;font-size:21px;letter-spacing:-.025em}.section-sub{color:var(--muted);font-size:13px;margin-top:5px}.tools{display:flex;gap:9px;flex-wrap:wrap}.field{height:42px;border:1px solid var(--line);border-radius:11px;background:#fafaf7;padding:0 12px;color:var(--ink);min-width:210px;font-size:16px}.field:focus,.note:focus{outline:3px solid rgba(240,91,60,.15);border-color:var(--brand)}select.field{min-width:150px}.merchant-list{display:grid}.merchant-row{display:grid;grid-template-columns:minmax(190px,1.5fr) minmax(130px,1fr) repeat(4,minmax(74px,.55fr)) 112px;gap:16px;align-items:center;padding:17px 24px;border-bottom:1px solid var(--line)}.merchant-row:last-child{border-bottom:0}.merchant-row:hover{background:#fbfbf8}.merchant-name{font-weight:800;letter-spacing:-.01em}.merchant-email,.muted{color:var(--muted);font-size:12px;margin-top:4px;overflow-wrap:anywhere}.program{font-size:13px;font-weight:700}.cell-number{font-weight:820;font-variant-numeric:tabular-nums}.cell-label{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-top:4px}.status{display:inline-flex;align-items:center;gap:6px;width:max-content;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:820}.status:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}.status-active{color:var(--green);background:var(--green-bg)}.status-suspended{color:var(--red);background:var(--red-bg)}.details-button{border:1px solid var(--line);background:#fff;border-radius:10px;padding:9px 12px;font-weight:750}.details-button:hover{border-color:var(--brand);color:var(--brand-dark)}.empty{padding:50px 24px;text-align:center;color:var(--muted)}
    .audit-list{display:grid}.audit-row{display:grid;grid-template-columns:150px 1fr minmax(180px,.6fr);gap:18px;padding:14px 24px;border-bottom:1px solid var(--line);font-size:13px}.audit-row:last-child{border-bottom:0}.audit-action{font-weight:760}.audit-time,.audit-admin{color:var(--muted)}
    .overlay{position:fixed;inset:0;z-index:50;background:rgba(15,22,19,.45);display:flex;justify-content:flex-end;opacity:0;pointer-events:none;transition:opacity .18s}.overlay.open{opacity:1;pointer-events:auto}.panel{width:min(560px,100%);height:100%;background:var(--paper);padding:26px;overflow:auto;transform:translateX(20px);transition:transform .18s}.overlay.open .panel{transform:none}.panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}.close{width:42px;height:42px;border:1px solid var(--line);background:#fff;border-radius:12px;font-size:22px}.panel h2{font-size:31px;letter-spacing:-.04em;margin:12px 0 4px}.panel-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:24px 0}.info{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px}.info span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:7px}.info strong{font-size:18px}.panel-section{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px;margin:14px 0}.panel-section h3{margin:0 0 13px;font-size:16px}.note{width:100%;min-height:100px;resize:vertical;border:1px solid var(--line);border-radius:12px;padding:12px;font-size:16px}.actions{display:flex;gap:10px;margin-top:12px}.primary,.danger{border:0;border-radius:11px;padding:11px 15px;font-weight:800}.primary{background:var(--ink);color:#fff}.danger{background:var(--red-bg);color:var(--red)}.activity{display:grid;gap:9px}.activity-item{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid var(--line);font-size:13px}.activity-item:last-child{border-bottom:0}.toast{position:fixed;left:50%;bottom:24px;z-index:80;transform:translate(-50%,20px);background:var(--ink);color:#fff;padding:12px 17px;border-radius:12px;opacity:0;pointer-events:none;transition:.2s;font-size:13px;box-shadow:var(--shadow)}.toast.show{opacity:1;transform:translate(-50%,0)}.toast.error{background:var(--red)}
    @media(max-width:940px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.merchant-row{grid-template-columns:1.3fr 1fr repeat(2,.55fr) 105px}.merchant-row>:nth-child(5),.merchant-row>:nth-child(6){display:none}}
    @media(max-width:680px){.shell,.topbar-inner{width:min(100% - 22px,1220px)}.topbar-inner{height:68px}.identity span{display:none}.admin-chip{display:none}.hero{padding-top:30px;align-items:flex-start;flex-direction:column}.hero h1{font-size:38px}.metrics{gap:9px}.metric{padding:16px;border-radius:15px}.metric-value{font-size:28px}.section{border-radius:17px}.section-head{align-items:flex-start;flex-direction:column;padding:18px}.tools{width:100%}.field{width:100%;min-width:0}.merchant-row{grid-template-columns:1fr auto;padding:16px 18px}.merchant-row>:nth-child(2),.merchant-row>:nth-child(3),.merchant-row>:nth-child(4),.merchant-row>:nth-child(5),.merchant-row>:nth-child(6){display:none}.audit-row{grid-template-columns:1fr;padding:13px 18px;gap:5px}.panel{padding:20px}.panel-grid{grid-template-columns:1fr 1fr}.panel h2{font-size:27px}}
  </style>
</head>
<body>
  <header class="topbar"><div class="topbar-inner"><div class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>Tampo</span><span class="admin-chip">Administration</span></div><div class="identity"><span id="admin-email"></span><a class="logout" href="/cdn-cgi/access/logout">Se deconnecter</a></div></div></header>
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
    const escapeHtml=(value)=>String(value??"").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
    const formatNumber=(value)=>new Intl.NumberFormat("fr-FR").format(Number(value||0));
    const formatDate=(value)=>value?new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(String(value).includes("T")?value:String(value).replace(" ","T")+"Z")):"—";
    const actionLabel=(action)=>({"merchant.suspended":"Commerce suspendu","merchant.reactivated":"Commerce reactive","merchant.note_updated":"Note interne modifiee"}[action]||action);
    function toast(message,error=false){const el=$("toast");el.textContent=message;el.className="toast show"+(error?" error":"");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.className="toast",3200)}
    async function api(path,options={}){const response=await fetch(path,{credentials:"same-origin",...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||"Une erreur est survenue.");return body}
    async function loadOverview(){const {overview}=await api("/api/overview");$("metric-merchants").textContent=formatNumber(overview.merchants);$("metric-active").textContent=formatNumber(overview.active_merchants)+" actifs · "+formatNumber(overview.suspended_merchants)+" suspendus";$("metric-customers").textContent=formatNumber(overview.customers);$("metric-passages").textContent=formatNumber(overview.passages);$("metric-rewards").textContent=formatNumber(overview.rewards);$("metric-points").textContent=formatNumber(overview.current_points)+" points en cours"}
    function renderMerchants(){const list=$("merchant-list");$("merchant-count").textContent=state.merchants.length+" commerce"+(state.merchants.length>1?"s":"")+" affiche"+(state.merchants.length>1?"s":"");if(!state.merchants.length){list.innerHTML='<div class="empty">Aucun commerce ne correspond a cette recherche.</div>';return}list.innerHTML=state.merchants.map((merchant)=>'<article class="merchant-row"><div><div class="merchant-name">'+escapeHtml(merchant.businessName)+'</div><div class="merchant-email">'+escapeHtml(merchant.email)+'</div></div><div><div class="program">'+escapeHtml(merchant.programName||"Sans programme")+'</div><span class="status status-'+escapeHtml(merchant.status)+'">'+(merchant.status==="suspended"?"Suspendu":"Actif")+'</span></div><div class="cell-number">'+formatNumber(merchant.customerCount)+'<span class="cell-label">Clients</span></div><div class="cell-number">'+formatNumber(merchant.passageCount)+'<span class="cell-label">Passages</span></div><div class="cell-number">'+formatNumber(merchant.employeeCount)+'<span class="cell-label">Equipe</span></div><div><div class="cell-number">'+formatDate(merchant.lastActivity)+'</div><span class="cell-label">Activite</span></div><button class="details-button" type="button" data-id="'+escapeHtml(merchant.id)+'">Ouvrir</button></article>').join("");list.querySelectorAll("[data-id]").forEach((button)=>button.addEventListener("click",()=>openMerchant(button.dataset.id)))}
    async function loadMerchants(){const query=encodeURIComponent($("search").value.trim());const status=encodeURIComponent($("status-filter").value);const {merchants}=await api("/api/merchants?q="+query+"&status="+status);state.merchants=merchants;renderMerchants()}
    async function loadAudit(){const {events}=await api("/api/audit");const list=$("audit-list");if(!events.length){list.innerHTML='<div class="empty">Aucune action pour le moment.</div>';return}list.innerHTML=events.map((event)=>'<div class="audit-row"><div class="audit-time">'+formatDate(event.createdAt)+'</div><div><div class="audit-action">'+escapeHtml(actionLabel(event.action))+'</div><div class="muted">'+escapeHtml(event.businessName||"Plateforme")+'</div></div><div class="audit-admin">'+escapeHtml(event.adminEmail)+'</div></div>').join("")}
    async function openMerchant(id){const data=await api("/api/merchants/"+encodeURIComponent(id));state.selected=data.merchant;$("panel-title").textContent=data.merchant.businessName;$("panel-email").textContent=data.merchant.email;const m=data.merchant;const activity=data.activity.length?data.activity.map((item)=>'<div class="activity-item"><span>'+(Number(item.delta)>0?"Passage ajoute":"Correction")+' · '+escapeHtml(item.actorRole)+'</span><span class="muted">'+formatDate(item.createdAt)+'</span></div>').join(""):'<div class="muted">Aucune activite enregistree.</div>';$("panel-content").innerHTML='<div class="panel-grid"><div class="info"><span>Statut</span><strong>'+(m.status==="suspended"?"Suspendu":"Actif")+'</strong></div><div class="info"><span>Clients</span><strong>'+formatNumber(m.customerCount)+'</strong></div><div class="info"><span>Passages</span><strong>'+formatNumber(m.passageCount)+'</strong></div><div class="info"><span>Recompenses</span><strong>'+formatNumber(m.rewardCount)+'</strong></div></div><section class="panel-section"><h3>Programme</h3><div class="program">'+escapeHtml(m.programName||"Sans programme")+'</div><div class="muted">Objectif : '+formatNumber(m.goal)+' · '+escapeHtml(m.rewardText||"")+'</div><div class="muted">Lien public : /join/'+escapeHtml(m.slug)+'</div></section><section class="panel-section"><h3>Note interne</h3><textarea class="note" id="merchant-note" maxlength="600" placeholder="Informations de support, suivi commercial…">'+escapeHtml(m.internalNote||"")+'</textarea><div class="actions"><button class="primary" id="save-note" type="button">Enregistrer la note</button></div></section><section class="panel-section"><h3>Gestion de l\'acces</h3><p class="muted">La suspension bloque le commercant et ses employes sans supprimer leurs donnees.</p><button class="'+(m.status==="suspended"?"primary":"danger")+'" id="toggle-status" type="button">'+(m.status==="suspended"?"Reactiver le commerce":"Suspendre le commerce")+'</button></section><section class="panel-section"><h3>Derniere activite</h3><div class="activity">'+activity+'</div></section>';$("overlay").classList.add("open");$("overlay").setAttribute("aria-hidden","false");$("close-panel").focus();$("save-note").onclick=saveNote;$("toggle-status").onclick=toggleStatus}
    function closePanel(){$("overlay").classList.remove("open");$("overlay").setAttribute("aria-hidden","true");state.selected=null}
    async function saveNote(){if(!state.selected)return;const note=$("merchant-note").value;await api("/api/merchants/"+encodeURIComponent(state.selected.id)+"/note",{method:"POST",body:JSON.stringify({note})});toast("Note enregistree.");await Promise.all([loadMerchants(),loadAudit()])}
    async function toggleStatus(){if(!state.selected)return;const next=state.selected.status==="suspended"?"active":"suspended";const verb=next==="suspended"?"suspendre":"reactiver";if(!confirm("Confirmer : "+verb+" "+state.selected.businessName+" ?"))return;await api("/api/merchants/"+encodeURIComponent(state.selected.id)+"/status",{method:"POST",body:JSON.stringify({status:next})});toast(next==="suspended"?"Commerce suspendu.":"Commerce reactive.");closePanel();await refreshAll()}
    async function refreshAll(){try{await Promise.all([loadOverview(),loadMerchants(),loadAudit()])}catch(error){toast(error.message||"Chargement impossible.",true)}}
    $("refresh").addEventListener("click",refreshAll);$("search").addEventListener("input",()=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(loadMerchants,250)});$("status-filter").addEventListener("change",loadMerchants);$("close-panel").addEventListener("click",closePanel);$("overlay").addEventListener("click",(event)=>{if(event.target===$("overlay"))closePanel()});document.addEventListener("keydown",(event)=>{if(event.key==="Escape")closePanel()});$("admin-email").textContent=${serializedEmail};refreshAll();
  </script>
</body>
</html>`;
  return new Response(html, { headers: securityHeaders(nonce) });
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const identity = await requireAdmin(request, env);
  await ensureAdminSchema(env.DB);
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "GET" && path === "/") return adminPage(identity);
  if (request.method === "GET" && path === "/api/me") return json({ identity });
  if (request.method === "GET" && path === "/api/overview") return getOverview(env.DB);
  if (request.method === "GET" && path === "/api/merchants") return listMerchants(env.DB, url);
  if (request.method === "GET" && path === "/api/audit") return getAuditLog(env.DB);

  const detailMatch = path.match(/^\/api\/merchants\/([^/]+)$/);
  if (request.method === "GET" && detailMatch) return getMerchant(env.DB, decodeURIComponent(detailMatch[1]));
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
      console.error("Tampo Admin error", error);
      return json({ error: "Erreur interne de l'administration." }, 500);
    }
  },
};
