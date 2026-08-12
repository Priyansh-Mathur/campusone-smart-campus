import { env } from "cloudflare:workers";
import { hash } from "bcryptjs";

export type CampusRole = "Student" | "Faculty" | "Coordinator" | "Admin";
export type CampusProfile = {
  phone:string; rollNumber:string; department:string; semester:string; skills:string;
  linkedin:string; github:string; bio:string; darkTheme:boolean;
  emailNotifications:boolean; pushNotifications:boolean;
};
export type SessionUser = { id: number; name: string; email: string; role: CampusRole; verified: boolean; profile: CampusProfile };

const COOKIE_NAME = "campusone_session";
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 7;

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
    db.prepare("CREATE INDEX IF NOT EXISTS idx_rate_limits_bucket_time ON rate_limits(bucket, created_at)"),
  ]);

  const count = await db.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
  if (!count?.count) {
    const passwordHash = await hash("Campus@123", 10);
    const now = Date.now();
    await db.batch([
      db.prepare("INSERT INTO users(name,email,password_hash,role,verified,created_at) VALUES(?,?,?,?,1,?)").bind("Aarav Mehta", "student@campusone.dev", passwordHash, "Student", now),
      db.prepare("INSERT INTO users(name,email,password_hash,role,verified,created_at) VALUES(?,?,?,?,1,?)").bind("Dr. Maya Kapoor", "faculty@campusone.dev", passwordHash, "Faculty", now),
      db.prepare("INSERT INTO users(name,email,password_hash,role,verified,created_at) VALUES(?,?,?,?,1,?)").bind("Riya Sharma", "coordinator@campusone.dev", passwordHash, "Coordinator", now),
      db.prepare("INSERT INTO users(name,email,password_hash,role,verified,created_at) VALUES(?,?,?,?,1,?)").bind("Vikram Rao", "admin@campusone.dev", passwordHash, "Admin", now),
    ]);
  }
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  await ensureAuthTables();
  const token = cookieValue(request, COOKIE_NAME);
  if (!token) return null;
  const now = Date.now();
  const row = await env.DB.prepare(`SELECT u.id,u.name,u.email,u.role,u.verified
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND s.expires_at>?`).bind(token, now).first<Record<string, unknown>>();
  if (!row) return null;
  const stored = await env.DB.prepare("SELECT * FROM user_profiles WHERE user_id=?").bind(Number(row.id)).first<Record<string, unknown>>();
  const profile: CampusProfile = {
    phone:String(stored?.phone??""), rollNumber:String(stored?.roll_number??""), department:String(stored?.department??""),
    semester:String(stored?.semester??""), skills:String(stored?.skills??""), linkedin:String(stored?.linkedin??""),
    github:String(stored?.github??""), bio:String(stored?.bio??""), darkTheme:Boolean(stored?.dark_theme),
    emailNotifications:stored?Boolean(stored.email_notifications):true, pushNotifications:stored?Boolean(stored.push_notifications):true,
  };
  return { id:Number(row.id), name:String(row.name), email:String(row.email), role:String(row.role) as CampusRole, verified:Boolean(row.verified), profile };
}

export async function createSession(userId: number) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare("INSERT INTO sessions(token,user_id,expires_at,created_at) VALUES(?,?,?,?)")
    .bind(token, userId, now + SESSION_AGE_SECONDS * 1000, now).run();
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_AGE_SECONDS}`;
}

export async function destroySession(request: Request) {
  const token = cookieValue(request, COOKIE_NAME);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token=?").bind(token).run();
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function enforceRateLimit(request: Request, action: string, max = 12, windowSeconds = 60) {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local";
  const bucket = `${action}:${ip}`;
  const since = Date.now() - windowSeconds * 1000;
  await env.DB.prepare("DELETE FROM rate_limits WHERE created_at<?").bind(since).run();
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM rate_limits WHERE bucket=? AND created_at>=?").bind(bucket, since).first<{ count:number }>();
  if ((row?.count ?? 0) >= max) return false;
  await env.DB.prepare("INSERT INTO rate_limits(bucket,created_at) VALUES(?,?)").bind(bucket, Date.now()).run();
  return true;
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function trustedWriteOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}
