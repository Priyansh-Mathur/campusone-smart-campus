import { env } from "cloudflare:workers";
import { hash } from "bcryptjs";
import {
  enforceRateLimit,
  getSessionUser,
  jsonError,
  trustedWriteOrigin,
  type CampusRole,
} from "../../../lib/auth";

type Payload = {
  action?: string;
  id?: number;
  kind?: string;
  title?: string;
  subtitle?: string;
  status?: string;
  meta?: Record<string, unknown>;
  actor?: string;
};

const creatable: Record<CampusRole, string[]> = {
  Student: ["message", "submission", "application"],
  Faculty: [
    "message",
    "assignment",
    "announcement",
    "attendance",
    "material",
    "feedback",
  ],
  Coordinator: ["message", "event", "announcement", "club"],
  Admin: [
    "message",
    "assignment",
    "announcement",
    "attendance",
    "material",
    "event",
    "club",
    "placement",
    "notification",
    "department",
    "course",
    "user",
  ],
};

async function ensureDatabase() {
  const db = env.DB;
  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS records (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', meta TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT NOT NULL, actor TEXT NOT NULL, created_at INTEGER NOT NULL)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS user_record_statuses (user_id INTEGER NOT NULL, record_id INTEGER NOT NULL, status TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(user_id,record_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(record_id) REFERENCES records(id) ON DELETE CASCADE)",
    ),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_records_kind ON records(kind)"),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_user_record_statuses_record ON user_record_statuses(record_id)",
    ),
  ]);
  const count = await db
    .prepare("SELECT COUNT(*) AS count FROM records")
    .first<{ count: number }>();
  if (!count?.count) {
    const now = Date.now();
    await db.batch([
      db
        .prepare(
          "INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          "assignment",
          "Neural Networks — Lab 04",
          "Machine Learning · Due today, 11:59 PM",
          "pending",
          JSON.stringify({ due: "Today", points: 100, submitted: false }),
          now,
        ),
      db
        .prepare(
          "INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          "assignment",
          "Database Normalization",
          "DBMS · Due 12 Aug",
          "pending",
          JSON.stringify({ due: "12 Aug", points: 50, submitted: false }),
          now,
        ),
      db
        .prepare(
          "INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          "assignment",
          "Socket Programming",
          "Computer Networks · Due 15 Aug",
          "submitted",
          JSON.stringify({ due: "15 Aug", points: 75, submitted: true }),
          now,
        ),
      db
        .prepare(
          "INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          "event",
          "DevFusion 4.0",
          "12 Aug · Main Auditorium · 10:00 AM",
          "registered",
          JSON.stringify({ category: "Hackathon", seats: 120 }),
          now,
        ),
      db
        .prepare(
          "INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          "event",
          "AI & Future of Work",
          "16 Aug · Seminar Hall B · 2:30 PM",
          "open",
          JSON.stringify({ category: "Seminar", seats: 60 }),
          now,
        ),
      db
        .prepare(
          "INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          "placement",
          "Frontend Engineer Intern",
          "Razorpay · ₹45K/month · Apply by 18 Aug",
          "eligible",
          JSON.stringify({ ctc: "₹45K/month", skills: "React, TypeScript" }),
          now,
        ),
      db
        .prepare(
          "INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          "placement",
          "Software Development Engineer",
          "Atlassian · ₹22 LPA · Apply by 21 Aug",
          "applied",
          JSON.stringify({ ctc: "₹22 LPA", skills: "DSA, Java" }),
          now,
        ),
      db
        .prepare(
          "INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          "club",
          "Google Developer Student Club",
          "Build, learn and ship with 642 members",
          "joined",
          JSON.stringify({ members: 642, category: "Technology" }),
          now,
        ),
      db
        .prepare(
          "INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          "club",
          "Photography Society",
          "Frames, stories and campus walks · 218 members",
          "open",
          JSON.stringify({ members: 218, category: "Creative" }),
          now,
        ),
      db
        .prepare(
          "INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          "message",
          "Dr. Maya Kapoor",
          "Reminder: bring your laptops to today’s ML lab.",
          "unread",
          JSON.stringify({ time: "9:12 AM" }),
          now,
        ),
      db
        .prepare(
          "INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          "announcement",
          "Mid-semester examination schedule",
          "The examination timetable is now available in the student portal.",
          "published",
          JSON.stringify({ priority: "Important" }),
          now,
        ),
      db
        .prepare(
          "INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          "notification",
          "Assignment due today",
          "Neural Networks Lab 04 is due at 11:59 PM",
          "unread",
          JSON.stringify({ type: "assignment" }),
          now,
        ),
      db
        .prepare(
          "INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          "notification",
          "Event reminder",
          "DevFusion 4.0 starts in two days",
          "unread",
          JSON.stringify({ type: "event" }),
          now,
        ),
      db
        .prepare(
          "INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          "department",
          "Computer Science & Engineering",
          "86 faculty · 1,284 students",
          "active",
          JSON.stringify({ code: "CSE" }),
          now,
        ),
      db
        .prepare(
          "INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          "course",
          "Machine Learning",
          "CS601 · Semester 6 · 4 credits",
          "active",
          JSON.stringify({ department: "CSE" }),
          now,
        ),
    ]);
  }
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("Authentication required", 401);
  await ensureDatabase();
  const [records, activity, users, personalStatuses] = await Promise.all([
    env.DB.prepare(
      "SELECT * FROM records ORDER BY created_at DESC, id DESC",
    ).all(),
    env.DB.prepare(
      "SELECT * FROM activity ORDER BY created_at DESC LIMIT 12",
    ).all(),
    user.role === "Admin"
      ? env.DB.prepare(
          "SELECT id,name,email,role,verified,created_at FROM users ORDER BY created_at DESC",
        ).all()
      : Promise.resolve({ results: [] }),
    env.DB.prepare(
      "SELECT record_id,status FROM user_record_statuses WHERE user_id=?",
    )
      .bind(user.id)
      .all(),
  ]);
  const userRecords = (users.results as Record<string, unknown>[]).map((u) => ({
    id: -Number(u.id),
    kind: "user",
    title: String(u.name),
    subtitle: `${u.email} · ${u.role}`,
    status: u.verified ? "verified" : "pending",
    meta: { userId: u.id, email: u.email, role: u.role },
    created_at: u.created_at,
  }));
  const statusMap = new Map(
    (personalStatuses.results as Record<string, unknown>[]).map((row) => [
      Number(row.record_id),
      String(row.status),
    ]),
  );
  const parsed = records.results.map((r: Record<string, unknown>) => ({
    ...r,
    id: Number(r.id),
    kind: String(r.kind),
    status: String(r.status),
    meta: JSON.parse(String(r.meta || "{}")) as Record<string, unknown>,
  }));
  const privateKinds = new Set([
    "submission",
    "application",
    "feedback",
    "upload",
    "message",
  ]);
  const visible = parsed.filter(
    (record) =>
      user.role === "Admin" ||
      !privateKinds.has(record.kind) ||
      Number(record.meta.ownerId) === user.id ||
      (user.role === "Faculty" &&
        ["submission", "feedback", "message"].includes(record.kind)) ||
      (record.kind === "message" && !record.meta.ownerId),
  );
  const resolved = visible.map((record) => {
    const personal = statusMap.get(record.id);
    if (personal) return { ...record, status: personal };
    if (record.kind === "notification") return { ...record, status: "unread" };
    if (user.role !== "Student") return record;
    if (record.kind === "event" || record.kind === "club")
      return { ...record, status: "open" };
    if (record.kind === "placement") return { ...record, status: "eligible" };
    if (record.kind === "assignment")
      return {
        ...record,
        status: record.meta.submitted
          ? "submitted"
          : record.status === "open"
            ? "open"
            : "pending",
      };
    return record;
  });
  return Response.json({
    user,
    records: [...userRecords, ...resolved],
    activity: activity.results,
  });
}

export async function POST(request: Request) {
  if (!trustedWriteOrigin(request))
    return jsonError("Untrusted request origin", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("Authentication required", 401);
  await ensureDatabase();
  if (!(await enforceRateLimit(request, "campus-write", 30)))
    return jsonError("Too many updates. Try again shortly.", 429);
  const p = (await request.json()) as Payload;
  if (!p.kind || !p.title?.trim())
    return jsonError("kind and title are required");
  if (!creatable[user.role].includes(p.kind))
    return jsonError(`${user.role} cannot create ${p.kind} records`, 403);
  if (p.title.trim().length > 120 || (p.subtitle?.length ?? 0) > 1000)
    return jsonError("Content exceeds the allowed length");
  if (p.kind === "user") {
    const email = String(p.meta?.email ?? "")
      .trim()
      .toLowerCase();
    const role = String(p.meta?.role ?? "Student");
    const password = String(p.meta?.password ?? "");
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !(["Student", "Faculty", "Coordinator", "Admin"] as string[]).includes(
        role,
      ) ||
      password.length < 8
    )
      return jsonError("Valid email, role and temporary password are required");
    try {
      const created = await env.DB.prepare(
        "INSERT INTO users(name,email,password_hash,role,verified,created_at) VALUES(?,?,?,?,1,?) RETURNING id,name,email,role",
      )
        .bind(p.title.trim(), email, await hash(password, 10), role, Date.now())
        .first();
      await env.DB.prepare(
        "INSERT INTO activity(message,actor,created_at) VALUES(?,?,?)",
      )
        .bind(`Created ${role} account: ${email}`, user.name, Date.now())
        .run();
      return Response.json({ record: created }, { status: 201 });
    } catch {
      return jsonError("A user with this email already exists", 409);
    }
  }
  const result = await env.DB.prepare(
    "INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?) RETURNING *",
  )
    .bind(
      p.kind,
      p.title.trim(),
      p.subtitle?.trim() || "",
      p.status || "active",
      JSON.stringify({ ...p.meta, ownerId: user.id }),
      Date.now(),
    )
    .first();
  await env.DB.prepare(
    "INSERT INTO activity(message,actor,created_at) VALUES(?,?,?)",
  )
    .bind(`Created ${p.kind}: ${p.title}`, user.name, Date.now())
    .run();
  return Response.json({ record: result }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!trustedWriteOrigin(request))
    return jsonError("Untrusted request origin", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("Authentication required", 401);
  await ensureDatabase();
  if (!(await enforceRateLimit(request, "campus-write", 30)))
    return jsonError("Too many updates. Try again shortly.", 429);
  const p = (await request.json()) as Payload;
  if (!p.id || !p.status) return jsonError("id and status are required");
  const record = await env.DB.prepare(
    "SELECT kind,status FROM records WHERE id=?",
  )
    .bind(p.id)
    .first<{ kind: string; status: string }>();
  if (!record) return jsonError("Record not found", 404);
  const personalUpdate =
    (record.kind === "notification" && p.status === "read") ||
    (user.role === "Student" &&
      ((record.kind === "assignment" && p.status === "submitted") ||
        (record.kind === "event" &&
          ["registered", "open"].includes(p.status)) ||
        (record.kind === "placement" && p.status === "applied") ||
        (record.kind === "club" && ["joined", "open"].includes(p.status))));
  if (personalUpdate) {
    await env.DB.prepare(
      "INSERT INTO user_record_statuses(user_id,record_id,status,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,record_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at",
    )
      .bind(user.id, p.id, p.status, Date.now())
      .run();
    await env.DB.prepare(
      "INSERT INTO activity(message,actor,created_at) VALUES(?,?,?)",
    )
      .bind(
        `Updated personal ${record.kind} #${p.id} to ${p.status}`,
        user.name,
        Date.now(),
      )
      .run();
    return Response.json({ ok: true });
  }
  const allowed =
    user.role === "Admin" ||
    (user.role === "Faculty" &&
      record.kind === "assignment" &&
      p.status === "graded") ||
    (user.role === "Coordinator" && ["event", "club"].includes(record.kind));
  if (!allowed)
    return jsonError(`${user.role} is not allowed to perform this update`, 403);
  await env.DB.prepare("UPDATE records SET status=? WHERE id=?")
    .bind(p.status, p.id)
    .run();
  await env.DB.prepare(
    "INSERT INTO activity(message,actor,created_at) VALUES(?,?,?)",
  )
    .bind(
      `Updated ${record.kind} #${p.id} to ${p.status}`,
      user.name,
      Date.now(),
    )
    .run();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!trustedWriteOrigin(request))
    return jsonError("Untrusted request origin", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("Authentication required", 401);
  if (user.role !== "Admin") return jsonError("Admin access required", 403);
  await ensureDatabase();
  const id = Number(new URL(request.url).searchParams.get("id"));
  const userId = Number(new URL(request.url).searchParams.get("userId"));
  if (userId) {
    if (userId === user.id)
      return jsonError("You cannot delete your own account");
    await env.DB.prepare("DELETE FROM users WHERE id=?").bind(userId).run();
    await env.DB.prepare(
      "INSERT INTO activity(message,actor,created_at) VALUES(?,?,?)",
    )
      .bind(`Deleted user #${userId}`, user.name, Date.now())
      .run();
    return Response.json({ ok: true });
  }
  if (!id) return jsonError("id is required");
  await env.DB.prepare("DELETE FROM records WHERE id=?").bind(id).run();
  await env.DB.prepare(
    "INSERT INTO activity(message,actor,created_at) VALUES(?,?,?)",
  )
    .bind(`Deleted record #${id}`, user.name, Date.now())
    .run();
  return Response.json({ ok: true });
}
