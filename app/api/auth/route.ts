import { env } from "cloudflare:workers";
import { compare, hash } from "bcryptjs";
import { createSession, deleteUserAccount, destroySession, enforceRateLimit, ensureAuthTables, getSessionUser, getUserById, jsonError, trustedWriteOrigin } from "../../../lib/auth";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  return user ? Response.json({ user }) : jsonError("Authentication required", 401);
}

export async function POST(request: Request) {
  await ensureAuthTables();
  if (!trustedWriteOrigin(request)) return jsonError("Untrusted request origin",403);
  if (!(await enforceRateLimit(request, "auth"))) return jsonError("Too many requests. Please wait a minute.", 429);
  const payload = await request.json() as Record<string, unknown>;
  const action = String(payload.action ?? "login");
  const email = String(payload.email ?? "").trim().toLowerCase();

  if (["profile","preferences","password","delete"].includes(action)) {
    const user = await getSessionUser(request);
    if (!user) return jsonError("Authentication required",401);
    if (action === "profile") {
      const values = ["phone","rollNumber","department","semester","skills","linkedin","github","bio"].map(key=>String(payload[key]??"").trim());
      if (values.some(value=>value.length>1000)) return jsonError("Profile field is too long");
      const [phone,rollNumber,department,semester,skills,linkedin,github,bio]=values;
      for (const link of [linkedin,github]) if (link && !/^https:\/\//i.test(link)) return jsonError("Profile links must start with https://");
      await env.DB.prepare(`INSERT INTO user_profiles(user_id,phone,roll_number,department,semester,skills,linkedin,github,bio,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,roll_number=excluded.roll_number,
        department=excluded.department,semester=excluded.semester,skills=excluded.skills,linkedin=excluded.linkedin,github=excluded.github,bio=excluded.bio,updated_at=excluded.updated_at`)
        .bind(user.id,phone,rollNumber,department,semester,skills,linkedin,github,bio,Date.now()).run();
      return Response.json({user:await getSessionUser(request)});
    }
    if (action === "preferences") {
      await env.DB.prepare(`INSERT INTO user_profiles(user_id,dark_theme,email_notifications,push_notifications,updated_at) VALUES(?,?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET dark_theme=excluded.dark_theme,email_notifications=excluded.email_notifications,push_notifications=excluded.push_notifications,updated_at=excluded.updated_at`)
        .bind(user.id,payload.darkTheme?1:0,payload.emailNotifications===false?0:1,payload.pushNotifications===false?0:1,Date.now()).run();
      return Response.json({user:await getSessionUser(request)});
    }
    const currentPassword=String(payload.currentPassword??"");
    const row=await env.DB.prepare("SELECT password_hash,email,credential_kind FROM users WHERE id=?").bind(user.id).first<Record<string,unknown>>();
    if (row?.credential_kind === "google") return jsonError("Set a password through the reset flow before changing security settings or deleting this Google-only account.",403);
    if (!row || !(await compare(currentPassword,String(row.password_hash)))) return jsonError("Current password is incorrect",403);
    if (action === "password") {
      const newPassword=String(payload.newPassword??"");
      if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) return jsonError("New password needs 8+ characters, an uppercase letter and a number");
      await env.DB.prepare("UPDATE users SET password_hash=?,credential_kind=CASE WHEN credential_kind='google' THEN 'password+google' ELSE credential_kind END WHERE id=?").bind(await hash(newPassword,10),user.id).run();
      return Response.json({message:"Password changed successfully"});
    }
    if (String(row.email).endsWith("@campusone.dev")) return jsonError("Demo accounts cannot be deleted",403);
    const expiredCookie=await destroySession(request);
    if (!(await deleteUserAccount(user.id)))
      return jsonError("Account could not be found",404);
    return Response.json({deleted:true},{headers:{"Set-Cookie":expiredCookie}});
  }

  if (action === "login") {
    const password = String(payload.password ?? "");
    const row = await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(email).first<Record<string, unknown>>();
    if (!row || !(await compare(password, String(row.password_hash)))) return jsonError("Invalid email or password", 401);
    if (!row.verified) return jsonError("Verify your email before signing in", 403);
    const cookie = await createSession(Number(row.id));
    const user = await getUserById(Number(row.id));
    if (!user) return jsonError("Authentication failed",500);
    return Response.json({ user }, { headers:{ "Set-Cookie":cookie,"Cache-Control":"no-store" } });
  }

  if (action === "signup") {
    const name = String(payload.name ?? "").trim();
    const password = String(payload.password ?? "");
    if (name.length < 2) return jsonError("Enter your full name");
    if (!emailPattern.test(email)) return jsonError("Enter a valid email address");
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) return jsonError("Password needs 8+ characters, an uppercase letter and a number");
    const exists = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
    if (exists) return jsonError("An account already exists for this email", 409);
    const verificationCode = String(Math.floor(100000 + Math.random() * 900000));
    const passwordHash = await hash(password, 10);
    await env.DB.prepare("INSERT INTO users(name,email,password_hash,role,verified,verification_code,created_at) VALUES(?,?,?,?,0,?,?)")
      .bind(name,email,passwordHash,"Student",verificationCode,Date.now()).run();
    return Response.json({ verificationRequired:true, demoCode:verificationCode, message:"Verification code generated" }, { status:201 });
  }

  if (action === "verify") {
    const code = String(payload.code ?? "").trim();
    const row = await env.DB.prepare("UPDATE users SET verified=1,verification_code=NULL WHERE email=? AND verification_code=? RETURNING id,name,email,role").bind(email,code).first<Record<string, unknown>>();
    if (!row) return jsonError("Incorrect or expired verification code");
    const cookie = await createSession(Number(row.id));
    const user = await getUserById(Number(row.id));
    if (!user) return jsonError("Authentication failed",500);
    return Response.json({ user }, { headers:{"Set-Cookie":cookie,"Cache-Control":"no-store"} });
  }

  if (action === "forgot") {
    const resetCode = String(Math.floor(100000 + Math.random() * 900000));
    const row = await env.DB.prepare("UPDATE users SET reset_code=? WHERE email=? RETURNING id").bind(resetCode,email).first();
    return Response.json({ message:"If the account exists, a reset code was generated.", demoCode:row ? resetCode : undefined });
  }

  if (action === "reset") {
    const code = String(payload.code ?? "").trim();
    const password = String(payload.password ?? "");
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) return jsonError("Password needs 8+ characters, an uppercase letter and a number");
    const row = await env.DB.prepare("SELECT id FROM users WHERE email=? AND reset_code=?").bind(email,code).first<{id:number}>();
    if (!row) return jsonError("Incorrect or expired reset code");
    await env.DB.prepare("UPDATE users SET password_hash=?,reset_code=NULL,credential_kind=CASE WHEN credential_kind='google' THEN 'password+google' ELSE credential_kind END WHERE id=?").bind(await hash(password,10),row.id).run();
    return Response.json({ message:"Password reset successfully" });
  }

  return jsonError("Unsupported authentication action");
}

export async function DELETE(request: Request) {
  await ensureAuthTables();
  if (!trustedWriteOrigin(request)) return jsonError("Untrusted request origin",403);
  return Response.json({ ok:true }, { headers:{ "Set-Cookie":await destroySession(request) } });
}
