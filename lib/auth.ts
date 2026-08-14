import { env } from "cloudflare:workers";
import { hash } from "bcryptjs";
import {
  randomToken,
  sha256Base64Url,
  type VerifiedGoogleProfile,
} from "./oauth";

export type CampusRole = "Student" | "Faculty" | "Coordinator" | "Admin";
export type CredentialKind = "password" | "google" | "password+google";
export type CampusProfile = {
  phone: string;
  rollNumber: string;
  department: string;
  semester: string;
  skills: string;
  linkedin: string;
  github: string;
  bio: string;
  darkTheme: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
};
export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: CampusRole;
  verified: boolean;
  credentialKind: CredentialKind;
  authProviders: string[];
  profile: CampusProfile;
};

const COOKIE_NAME = "campusone_session";
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 7;
const MOBILE_HANDOFF_AGE_MS = 3 * 60 * 1000;

async function ensureCredentialColumn() {
  const db = env.DB;
  const columns = await db.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  if (columns.results.some((column: { name: string }) => column.name === "credential_kind")) return;
  try {
    await db
      .prepare(
        "ALTER TABLE users ADD COLUMN credential_kind TEXT NOT NULL DEFAULT 'password'",
      )
      .run();
  } catch (error) {
    const refreshed = await db.prepare("PRAGMA table_info(users)").all<{ name: string }>();
    if (
      !refreshed.results.some(
        (column: { name: string }) => column.name === "credential_kind",
      )
    )
      throw error;
  }
}

export async function ensureAuthTables() {
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Student',
      verified INTEGER NOT NULL DEFAULT 0,
      verification_code TEXT,
      reset_code TEXT,
      credential_kind TEXT NOT NULL DEFAULT 'password',
      created_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS rate_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bucket TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS user_profiles (
      user_id INTEGER PRIMARY KEY,
      phone TEXT NOT NULL DEFAULT '',
      roll_number TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      semester TEXT NOT NULL DEFAULT '',
      skills TEXT NOT NULL DEFAULT '',
      linkedin TEXT NOT NULL DEFAULT '',
      github TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      dark_theme INTEGER NOT NULL DEFAULT 0,
      email_notifications INTEGER NOT NULL DEFAULT 1,
      push_notifications INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)"),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_rate_limits_bucket_time ON rate_limits(bucket, created_at)",
    ),
  ]);

  await ensureCredentialColumn();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS oauth_identities (
      provider TEXT NOT NULL,
      provider_subject TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      provider_email TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(provider, provider_subject),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_oauth_identities_user ON oauth_identities(user_id)",
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS oauth_handoffs (
      code_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      app_challenge TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_oauth_handoffs_expires ON oauth_handoffs(expires_at)",
    ),
  ]);

  const count = await db.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
  if (!count?.count) {
    const passwordHash = await hash("Campus@123", 10);
    const now = Date.now();
    await db.batch([
      db
        .prepare(
          "INSERT INTO users(name,email,password_hash,role,verified,created_at) VALUES(?,?,?,?,1,?)",
        )
        .bind(
          "Aarav Mehta",
          "student@campusone.dev",
          passwordHash,
          "Student",
          now,
        ),
      db
        .prepare(
          "INSERT INTO users(name,email,password_hash,role,verified,created_at) VALUES(?,?,?,?,1,?)",
        )
        .bind(
          "Dr. Maya Kapoor",
          "faculty@campusone.dev",
          passwordHash,
          "Faculty",
          now,
        ),
      db
        .prepare(
          "INSERT INTO users(name,email,password_hash,role,verified,created_at) VALUES(?,?,?,?,1,?)",
        )
        .bind(
          "Riya Sharma",
          "coordinator@campusone.dev",
          passwordHash,
          "Coordinator",
          now,
        ),
      db
        .prepare(
          "INSERT INTO users(name,email,password_hash,role,verified,created_at) VALUES(?,?,?,?,1,?)",
        )
        .bind(
          "Vikram Rao",
          "admin@campusone.dev",
          passwordHash,
          "Admin",
          now,
        ),
    ]);
  }
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(value.join("="));
    } catch {
      return null;
    }
  }
  return null;
}

async function hydrateUser(userId: number): Promise<SessionUser | null> {
  const row = await env.DB.prepare(
    "SELECT id,name,email,role,verified,credential_kind FROM users WHERE id=?",
  )
    .bind(userId)
    .first<Record<string, unknown>>();
  if (!row) return null;
  const stored = await env.DB.prepare("SELECT * FROM user_profiles WHERE user_id=?")
    .bind(userId)
    .first<Record<string, unknown>>();
  const providers = await env.DB.prepare(
    "SELECT provider FROM oauth_identities WHERE user_id=? ORDER BY provider",
  )
    .bind(userId)
    .all<{ provider: string }>();
  const profile: CampusProfile = {
    phone: String(stored?.phone ?? ""),
    rollNumber: String(stored?.roll_number ?? ""),
    department: String(stored?.department ?? ""),
    semester: String(stored?.semester ?? ""),
    skills: String(stored?.skills ?? ""),
    linkedin: String(stored?.linkedin ?? ""),
    github: String(stored?.github ?? ""),
    bio: String(stored?.bio ?? ""),
    darkTheme: Boolean(stored?.dark_theme),
    emailNotifications: stored ? Boolean(stored.email_notifications) : true,
    pushNotifications: stored ? Boolean(stored.push_notifications) : true,
  };
  return {
    id: Number(row.id),
    name: String(row.name),
    email: String(row.email),
    role: String(row.role) as CampusRole,
    verified: Boolean(row.verified),
    credentialKind: String(row.credential_kind) as CredentialKind,
    authProviders: providers.results.map(
      (identity: { provider: string }) => identity.provider,
    ),
    profile,
  };
}

export async function getUserById(userId: number) {
  await ensureAuthTables();
  return hydrateUser(userId);
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  await ensureAuthTables();
  const token = cookieValue(request, COOKIE_NAME);
  if (!token) return null;
  const row = await env.DB.prepare(
    "SELECT user_id FROM sessions WHERE token=? AND expires_at>?",
  )
    .bind(token, Date.now())
    .first<{ user_id: number }>();
  return row ? hydrateUser(Number(row.user_id)) : null;
}

export async function createSession(userId: number) {
  const token = randomToken(48);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO sessions(token,user_id,expires_at,created_at) VALUES(?,?,?,?)",
  )
    .bind(token, userId, now + SESSION_AGE_SECONDS * 1000, now)
    .run();
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_AGE_SECONDS}`;
}

export async function destroySession(request: Request) {
  const token = cookieValue(request, COOKIE_NAME);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token=?").bind(token).run();
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function addGoogleCredential(credential: unknown) {
  return credential === "google" ? "google" : "password+google";
}

export async function linkGoogleIdentity(profile: VerifiedGoogleProfile) {
  await ensureAuthTables();
  const db = env.DB;
  const now = Date.now();
  const linked = await db
    .prepare(`SELECT u.id,u.email,u.credential_kind
      FROM oauth_identities i JOIN users u ON u.id=i.user_id
      WHERE i.provider='google' AND i.provider_subject=?`)
    .bind(profile.subject)
    .first<Record<string, unknown>>();

  if (linked) {
    const userId = Number(linked.id);
    const collision = await db
      .prepare("SELECT id FROM users WHERE email=? AND id<>?")
      .bind(profile.email, userId)
      .first<{ id: number }>();
    await db
      .prepare(
        collision
          ? "UPDATE users SET verified=1,credential_kind=? WHERE id=?"
          : "UPDATE users SET email=?,verified=1,credential_kind=? WHERE id=?",
      )
      .bind(
        ...(collision
          ? [addGoogleCredential(linked.credential_kind), userId]
          : [profile.email, addGoogleCredential(linked.credential_kind), userId]),
      )
      .run();
    await db
      .prepare(
        "UPDATE oauth_identities SET provider_email=?,updated_at=? WHERE provider='google' AND provider_subject=?",
      )
      .bind(profile.email, now, profile.subject)
      .run();
    return userId;
  }

  let account = await db
    .prepare("SELECT id,credential_kind FROM users WHERE email=?")
    .bind(profile.email)
    .first<Record<string, unknown>>();
  if (!account) {
    const passwordHash = await hash(randomToken(32), 10);
    try {
      account = await db
        .prepare(
          "INSERT INTO users(name,email,password_hash,role,verified,credential_kind,created_at) VALUES(?,?,?,?,1,'google',?) RETURNING id,credential_kind",
        )
        .bind(profile.name, profile.email, passwordHash, "Student", now)
        .first<Record<string, unknown>>();
    } catch (error) {
      account = await db
        .prepare("SELECT id,credential_kind FROM users WHERE email=?")
        .bind(profile.email)
        .first<Record<string, unknown>>();
      if (!account) throw error;
    }
  }
  if (!account) throw new Error("Unable to create Google account");

  await db
    .prepare("UPDATE users SET verified=1,credential_kind=? WHERE id=?")
    .bind(addGoogleCredential(account.credential_kind), Number(account.id))
    .run();

  await db
    .prepare(`INSERT INTO oauth_identities(provider,provider_subject,user_id,provider_email,created_at,updated_at)
      VALUES('google',?,?,?,?,?)
      ON CONFLICT(provider,provider_subject) DO UPDATE SET provider_email=excluded.provider_email,updated_at=excluded.updated_at`)
    .bind(profile.subject, Number(account.id), profile.email, now, now)
    .run();
  const identity = await db
    .prepare(
      "SELECT user_id FROM oauth_identities WHERE provider='google' AND provider_subject=?",
    )
    .bind(profile.subject)
    .first<{ user_id: number }>();
  if (!identity) throw new Error("Unable to link Google identity");
  return Number(identity.user_id);
}

export async function createOAuthHandoff(userId: number, appChallenge: string) {
  await ensureAuthTables();
  const now = Date.now();
  const code = randomToken(32);
  const codeHash = await sha256Base64Url(code);
  await env.DB.batch([
    env.DB
      .prepare("DELETE FROM oauth_handoffs WHERE expires_at<? OR (used_at IS NOT NULL AND used_at<?)")
      .bind(now, now - MOBILE_HANDOFF_AGE_MS),
    env.DB
      .prepare(
        "INSERT INTO oauth_handoffs(code_hash,user_id,app_challenge,expires_at,created_at) VALUES(?,?,?,?,?)",
      )
      .bind(codeHash, userId, appChallenge, now + MOBILE_HANDOFF_AGE_MS, now),
  ]);
  return code;
}

export async function consumeOAuthHandoff(code: string, verifier: string) {
  await ensureAuthTables();
  const now = Date.now();
  const [codeHash, challenge] = await Promise.all([
    sha256Base64Url(code),
    sha256Base64Url(verifier),
  ]);
  const handoff = await env.DB.prepare(`UPDATE oauth_handoffs SET used_at=?
    WHERE code_hash=? AND app_challenge=? AND used_at IS NULL AND expires_at>?
    RETURNING user_id`)
    .bind(now, codeHash, challenge, now)
    .first<{ user_id: number }>();
  return handoff ? Number(handoff.user_id) : null;
}

export async function deleteUserAccount(userId: number) {
  await ensureAuthTables();
  const account = await env.DB.prepare("SELECT id,name FROM users WHERE id=?")
    .bind(userId)
    .first<{ id: number; name: string }>();
  if (!account) return false;

  const ownedUploads = await env.DB.prepare(
    "SELECT meta FROM records WHERE kind='upload' AND CAST(json_extract(meta,'$.ownerId') AS INTEGER)=?",
  )
    .bind(userId)
    .all<{ meta: string }>();
  const objectKeys = [
    ...new Set(
      ownedUploads.results.flatMap((row) => {
        try {
          const key = (JSON.parse(row.meta) as { key?: unknown }).key;
          return typeof key === "string" && key ? [key] : [];
        } catch {
          return [];
        }
      }),
    ),
  ];
  if (objectKeys.length) await env.FILES.delete(objectKeys);

  const ownedCondition =
    "CAST(json_extract(meta,'$.ownerId') AS INTEGER)=? OR CAST(json_extract(meta,'$.recipientId') AS INTEGER)=?";
  await env.DB.batch([
    env.DB
      .prepare(
        `DELETE FROM user_record_statuses
         WHERE user_id=?
            OR record_id IN (SELECT id FROM records WHERE ${ownedCondition})`,
      )
      .bind(userId, userId, userId),
    env.DB
      .prepare(`DELETE FROM records WHERE ${ownedCondition}`)
      .bind(userId, userId),
    env.DB.prepare("DELETE FROM oauth_handoffs WHERE user_id=?").bind(userId),
    env.DB.prepare("DELETE FROM oauth_identities WHERE user_id=?").bind(userId),
    env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(userId),
    env.DB.prepare("DELETE FROM user_profiles WHERE user_id=?").bind(userId),
    env.DB.prepare("DELETE FROM activity WHERE actor=?").bind(account.name),
    env.DB.prepare("DELETE FROM users WHERE id=?").bind(userId),
  ]);
  return true;
}

export async function enforceRateLimit(
  request: Request,
  action: string,
  max = 12,
  windowSeconds = 60,
) {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    "local";
  const bucket = `${action}:${ip}`;
  const since = Date.now() - windowSeconds * 1000;
  await env.DB.prepare("DELETE FROM rate_limits WHERE created_at<?").bind(since).run();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM rate_limits WHERE bucket=? AND created_at>=?",
  )
    .bind(bucket, since)
    .first<{ count: number }>();
  if ((row?.count ?? 0) >= max) return false;
  await env.DB.prepare("INSERT INTO rate_limits(bucket,created_at) VALUES(?,?)")
    .bind(bucket, Date.now())
    .run();
  return true;
}

export function jsonError(message: string, status = 400) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function trustedWriteOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
