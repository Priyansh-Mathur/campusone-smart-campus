import { env } from "cloudflare:workers";
import { hash } from "bcryptjs";
import {
  deleteUserAccount,
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
  recipientId?: number;
  submissionId?: number;
  marks?: number;
  feedback?: string;
  subject?: string;
  date?: string;
  presentUserIds?: unknown[];
};

type DirectoryEntry = { id: number; name: string; role: CampusRole };
type StoredRecord = {
  id: number;
  kind: string;
  title: string;
  subtitle: string;
  status: string;
  meta: string;
  created_at: number;
};
type ParsedRecord = Omit<StoredRecord, "meta"> & {
  meta: Record<string, unknown>;
};

function parseMeta(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function uniquePositiveIntegers(value: unknown) {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(positiveInteger);
  if (parsed.some((id) => !id)) return null;
  return [...new Set(parsed)];
}

function eventCapacity(meta: Record<string, unknown>) {
  const seats = positiveInteger(meta.seats);
  return seats || 80;
}

function registeredPassToken(status: string | undefined) {
  return status?.startsWith("registered:") ? status.slice("registered:".length) : "";
}

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
    "feedback",
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
  const [records, activity, users, personalStatuses, directoryRows, eventRegistrations] =
    await Promise.all([
    env.DB.prepare(
      "SELECT * FROM records ORDER BY created_at DESC, id DESC",
    ).all<StoredRecord>(),
    user.role === "Admin"
      ? env.DB.prepare(
          "SELECT * FROM activity ORDER BY created_at DESC LIMIT 12",
        ).all<Record<string, unknown>>()
      : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    user.role === "Admin"
      ? env.DB.prepare(
          "SELECT id,name,email,role,verified,created_at FROM users ORDER BY created_at DESC",
        ).all<Record<string, unknown>>()
      : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    env.DB.prepare(
      "SELECT record_id,status FROM user_record_statuses WHERE user_id=?",
    )
      .bind(user.id)
      .all<{ record_id: number; status: string }>(),
    env.DB.prepare(
      "SELECT id,name,role FROM users WHERE verified=1 ORDER BY name COLLATE NOCASE",
    ).all<DirectoryEntry>(),
    env.DB.prepare(
      "SELECT record_id,COUNT(*) AS count FROM user_record_statuses WHERE status='registered' OR status LIKE 'registered:%' GROUP BY record_id",
    ).all<{ record_id: number; count: number }>(),
  ]);
  const directory = directoryRows.results.map((entry: DirectoryEntry) => ({
    id: Number(entry.id),
    name: String(entry.name),
    role: String(entry.role) as CampusRole,
  }));
  const roster = ["Faculty", "Admin"].includes(user.role)
    ? directory.filter((entry: DirectoryEntry) => entry.role === "Student")
    : [];
  const userRecords = users.results.map((u: Record<string, unknown>) => ({
    id: -Number(u.id),
    kind: "user",
    title: String(u.name),
    subtitle: `${u.email} · ${u.role}`,
    status: u.verified ? "verified" : "pending",
    meta: { userId: u.id, email: u.email, role: u.role },
    created_at: u.created_at,
  }));
  const statusMap = new Map<number, string>(
    personalStatuses.results.map((row: { record_id: number; status: string }) => [
      Number(row.record_id),
      String(row.status),
    ]),
  );
  const registrationCounts = new Map<number, number>(
    eventRegistrations.results.map((row: { record_id: number; count: number }) => [
      Number(row.record_id),
      Number(row.count),
    ]),
  );
  const parsed: ParsedRecord[] = records.results.map((r: StoredRecord) => ({
    ...r,
    id: Number(r.id),
    kind: String(r.kind),
    status: String(r.status),
    meta: parseMeta(r.meta),
  }));
  const visible = parsed.filter((record: ParsedRecord) => {
    if (user.role === "Admin") return true;
    const ownerId = positiveInteger(record.meta.ownerId);
    const recipientId = positiveInteger(record.meta.recipientId);
    if (record.kind === "message" || record.kind === "feedback")
      return ownerId === user.id || recipientId === user.id;
    if (record.kind === "submission")
      return ownerId === user.id || user.role === "Faculty";
    if (record.kind === "application" || record.kind === "upload")
      return ownerId === user.id;
    return true;
  });
  const resolved = visible.map((record: ParsedRecord) => {
    const personal = statusMap.get(record.id);
    let status = personal || record.status;
    let meta = { ...record.meta };

    if (record.kind === "notification") status = personal || "unread";
    if (user.role === "Student") {
      if (record.kind === "event") {
        const registered =
          personal === "registered" || personal?.startsWith("registered:");
        status = registered
          ? personal!
          : ["closed", "cancelled", "archived"].includes(record.status)
            ? "closed"
            : "open";
      }
      if (record.kind === "club")
        status =
          personal === "joined"
            ? "joined"
            : ["closed", "cancelled", "archived"].includes(record.status)
              ? "closed"
              : "open";
      if (record.kind === "placement") status = personal || "eligible";
      if (record.kind === "assignment" && !personal)
        status = record.meta.submitted
          ? "submitted"
          : record.status === "closed"
            ? "closed"
            : "pending";
    }

    if (record.kind === "event") {
      const passToken = registeredPassToken(personal);
      if (status === "registered" || status.startsWith("registered:"))
        status = "registered";
      meta = {
        ...meta,
        seats: eventCapacity(meta),
        registeredCount: registrationCounts.get(record.id) || 0,
        registrationStatus: status,
      };
      delete meta.passToken;
      if (passToken) meta.passToken = passToken;
    }

    if (record.kind === "attendance") {
      const presentUserIds = uniquePositiveIntegers(meta.presentUserIds) || [];
      const { presentUserIds: _privateRoster, ...safeMeta } = meta;
      void _privateRoster;
      meta = ["Faculty", "Admin"].includes(user.role)
        ? { ...safeMeta, presentUserIds, presentCount: presentUserIds.length }
        : { ...safeMeta, presentCount: presentUserIds.length };
      if (user.role === "Student")
        meta.present = presentUserIds.includes(user.id);
    }

    return { ...record, status, meta };
  });
  return Response.json({
    user,
    records: [...userRecords, ...resolved],
    activity: activity.results,
    directory,
    roster,
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
  if (!p.kind) return jsonError("kind is required");
  if (!creatable[user.role].includes(p.kind))
    return jsonError(`${user.role} cannot create ${p.kind} records`, 403);
  if ((p.title?.trim().length ?? 0) > 120 || (p.subtitle?.length ?? 0) > 1000)
    return jsonError("Content exceeds the allowed length");

  if (p.kind === "message") {
    const recipientId = positiveInteger(p.recipientId ?? p.meta?.recipientId);
    const message = String(p.subtitle ?? p.meta?.message ?? "").trim();
    if (!recipientId) return jsonError("A valid message recipient is required");
    if (recipientId === user.id)
      return jsonError("You cannot send a message to yourself");
    if (!message || message.length > 1000)
      return jsonError("Message must be between 1 and 1000 characters");
    const recipient = await env.DB.prepare(
      "SELECT id,name,role FROM users WHERE id=? AND verified=1",
    )
      .bind(recipientId)
      .first<DirectoryEntry>();
    if (!recipient) return jsonError("Message recipient not found", 404);
    const result = await env.DB.prepare(
      "INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES('message',?,?,?,?,?) RETURNING *",
    )
      .bind(
        p.title?.trim() || recipient.name,
        message,
        "sent",
        JSON.stringify({
          ...p.meta,
          ownerId: user.id,
          senderName: user.name,
          recipientId,
          recipientName: recipient.name,
        }),
        Date.now(),
      )
      .first();
    await env.DB.prepare(
      "INSERT INTO activity(message,actor,created_at) VALUES(?,?,?)",
    )
      .bind(`Sent message to ${recipient.name}`, user.name, Date.now())
      .run();
    return Response.json({ record: result }, { status: 201 });
  }

  if (p.kind === "feedback") {
    const submissionId = positiveInteger(
      p.submissionId ?? p.meta?.submissionId,
    );
    const marks = Number(p.marks ?? p.meta?.marks);
    const feedback = String(
      p.feedback ?? p.meta?.feedback ?? p.subtitle ?? "",
    ).trim();
    if (!submissionId)
      return jsonError("A valid submission is required for feedback");
    if (!Number.isFinite(marks) || marks < 0 || marks > 100)
      return jsonError("Marks must be between 0 and 100");
    if (!feedback || feedback.length > 1000)
      return jsonError("Feedback must be between 1 and 1000 characters");
    const submission = await env.DB.prepare(
      "SELECT id,meta FROM records WHERE id=? AND kind='submission'",
    )
      .bind(submissionId)
      .first<{ id: number; meta: string }>();
    if (!submission) return jsonError("Submission not found", 404);
    const submissionMeta = parseMeta(submission.meta);
    const assignmentId = positiveInteger(submissionMeta.assignmentId);
    const recipientId = positiveInteger(submissionMeta.ownerId);
    if (!assignmentId || !recipientId)
      return jsonError("Submission is missing its assignment or student", 409);
    const [assignment, recipient] = await Promise.all([
      env.DB.prepare("SELECT id,title FROM records WHERE id=? AND kind='assignment'")
        .bind(assignmentId)
        .first<{ id: number; title: string }>(),
      env.DB.prepare("SELECT id FROM users WHERE id=? AND role='Student'")
        .bind(recipientId)
        .first<{ id: number }>(),
    ]);
    if (!assignment) return jsonError("Assignment not found", 404);
    if (!recipient) return jsonError("Submission student not found", 404);
    const result = await env.DB.prepare(
      "INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES('feedback',?,?,?,?,?) RETURNING *",
    )
      .bind(
        p.title?.trim() || `Feedback: ${assignment.title}`,
        feedback,
        "published",
        JSON.stringify({
          submissionId,
          assignmentId,
          marks,
          feedback,
          recipientId,
          ownerId: user.id,
        }),
        Date.now(),
      )
      .first();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO user_record_statuses(user_id,record_id,status,updated_at) VALUES(?,?,'graded',?) ON CONFLICT(user_id,record_id) DO UPDATE SET status='graded',updated_at=excluded.updated_at",
      ).bind(recipientId, assignmentId, Date.now()),
      env.DB.prepare(
        "INSERT INTO activity(message,actor,created_at) VALUES(?,?,?)",
      ).bind(
        `Published feedback for submission #${submissionId}`,
        user.name,
        Date.now(),
      ),
    ]);
    return Response.json({ record: result }, { status: 201 });
  }

  if (p.kind === "attendance") {
    const subject = String(p.subject ?? p.meta?.subject ?? p.title ?? "").trim();
    const date = String(p.date ?? p.meta?.date ?? "").trim();
    const presentUserIds = uniquePositiveIntegers(
      p.presentUserIds ?? p.meta?.presentUserIds,
    );
    if (!subject || subject.length > 120)
      return jsonError("Attendance subject is required");
    if (!date || date.length > 50 || Number.isNaN(Date.parse(date)))
      return jsonError("A valid attendance date is required");
    if (!presentUserIds)
      return jsonError("presentUserIds must be an array of student IDs");
    if (presentUserIds.length) {
      const placeholders = presentUserIds.map(() => "?").join(",");
      const students = await env.DB.prepare(
        `SELECT id FROM users WHERE role='Student' AND verified=1 AND id IN (${placeholders})`,
      )
        .bind(...presentUserIds)
        .all<{ id: number }>();
      if (students.results.length !== presentUserIds.length)
        return jsonError("Attendance contains an invalid student ID");
    }
    const rosterCount = Number(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM users WHERE role='Student' AND verified=1",
        ).first<{ count: number }>()
      )?.count || 0,
    );
    const result = await env.DB.prepare(
      "INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES('attendance',?,?,?,?,?) RETURNING *",
    )
      .bind(
        p.title?.trim() || `${subject} attendance`,
        `${presentUserIds.length} students marked present`,
        "completed",
        JSON.stringify({
          ...p.meta,
          subject,
          date,
          presentUserIds,
          rosterCount,
          ownerId: user.id,
        }),
        Date.now(),
      )
      .first();
    await env.DB.prepare(
      "INSERT INTO activity(message,actor,created_at) VALUES(?,?,?)",
    )
      .bind(`Saved ${subject} attendance for ${date}`, user.name, Date.now())
      .run();
    return Response.json({ record: result }, { status: 201 });
  }

  if (!p.title?.trim()) return jsonError("kind and title are required");
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
  if (p.kind === "event") {
    const seats = positiveInteger(p.meta?.seats);
    const date = String(p.meta?.date ?? "").trim();
    const venue = String(p.meta?.venue ?? "").trim();
    if (!seats || seats > 10_000)
      return jsonError("Event capacity must be between 1 and 10000");
    if (!date || Number.isNaN(Date.parse(date)))
      return jsonError("A valid event date is required");
    if (!venue || venue.length > 200)
      return jsonError("Event venue is required");
    p.meta = { ...p.meta, seats, date, venue };
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
  const requestedStatus = String(p.status).trim().toLowerCase();
  if (!requestedStatus || requestedStatus.length > 40)
    return jsonError("Invalid record status");
  const record = await env.DB.prepare(
    "SELECT kind,status,meta FROM records WHERE id=?",
  )
    .bind(p.id)
    .first<{ kind: string; status: string; meta: string }>();
  if (!record) return jsonError("Record not found", 404);

  if (user.role === "Student" && record.kind === "event") {
    if (!(["registered", "open"] as string[]).includes(requestedStatus))
      return jsonError("Students can only register for or cancel an event");
    if (requestedStatus === "registered") {
      if (
        !["open", "published", "active", "registered"].includes(record.status)
      )
        return jsonError("Registration is closed for this event", 409);
      const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll(
        "-",
        "",
      );
      const storedStatus = `registered:${token}`;
      const capacity = eventCapacity(parseMeta(record.meta));
      const registration = await env.DB.prepare(
        `INSERT INTO user_record_statuses(user_id,record_id,status,updated_at)
         SELECT ?,?,?,?
         WHERE EXISTS (
           SELECT 1 FROM user_record_statuses
           WHERE user_id=? AND record_id=? AND (status='registered' OR status LIKE 'registered:%')
         ) OR (
           SELECT COUNT(*) FROM user_record_statuses
           WHERE record_id=? AND (status='registered' OR status LIKE 'registered:%')
         ) < ?
         ON CONFLICT(user_id,record_id) DO UPDATE SET
           status=CASE WHEN user_record_statuses.status LIKE 'registered:%' THEN user_record_statuses.status ELSE excluded.status END,
           updated_at=excluded.updated_at
         RETURNING status`,
      )
        .bind(
          user.id,
          p.id,
          storedStatus,
          Date.now(),
          user.id,
          p.id,
          p.id,
          capacity,
        )
        .first<{ status: string }>();
      if (!registration)
        return jsonError("This event has reached its seat capacity", 409);
      const passToken = registeredPassToken(registration.status);
      await env.DB.prepare(
        "INSERT INTO activity(message,actor,created_at) VALUES(?,?,?)",
      )
        .bind(`Registered for event #${p.id}`, user.name, Date.now())
        .run();
      return Response.json({
        ok: true,
        status: "registered",
        passToken: passToken || undefined,
      });
    }
    await env.DB.prepare(
      "INSERT INTO user_record_statuses(user_id,record_id,status,updated_at) VALUES(?,?,'open',?) ON CONFLICT(user_id,record_id) DO UPDATE SET status='open',updated_at=excluded.updated_at",
    )
      .bind(user.id, p.id, Date.now())
      .run();
    await env.DB.prepare(
      "INSERT INTO activity(message,actor,created_at) VALUES(?,?,?)",
    )
      .bind(`Cancelled event registration #${p.id}`, user.name, Date.now())
      .run();
    return Response.json({ ok: true, status: "open" });
  }

  const personalUpdate =
    (record.kind === "notification" && requestedStatus === "read") ||
    (user.role === "Student" &&
      ((record.kind === "assignment" && requestedStatus === "submitted") ||
        (record.kind === "placement" && requestedStatus === "applied") ||
        (record.kind === "club" &&
          ["joined", "open"].includes(requestedStatus))));
  if (personalUpdate) {
    if (
      user.role === "Student" &&
      record.kind === "club" &&
      requestedStatus === "joined" &&
      !["open", "active", "joined"].includes(record.status)
    )
      return jsonError("Membership is closed for this club", 409);
    const updateSql =
      record.kind === "assignment"
        ? "INSERT INTO user_record_statuses(user_id,record_id,status,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,record_id) DO UPDATE SET status=CASE WHEN user_record_statuses.status='graded' THEN 'graded' ELSE excluded.status END,updated_at=excluded.updated_at RETURNING status"
        : "INSERT INTO user_record_statuses(user_id,record_id,status,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,record_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at RETURNING status";
    const updated = await env.DB.prepare(updateSql)
      .bind(user.id, p.id, requestedStatus, Date.now())
      .first<{ status: string }>();
    const resolvedStatus = updated?.status || requestedStatus;
    await env.DB.prepare(
      "INSERT INTO activity(message,actor,created_at) VALUES(?,?,?)",
    )
      .bind(
        `Updated personal ${record.kind} #${p.id} to ${resolvedStatus}`,
        user.name,
        Date.now(),
      )
      .run();
    return Response.json({ ok: true, status: resolvedStatus });
  }

  let allowed = user.role === "Admin";
  if (["event", "club"].includes(record.kind)) {
    const allowedStatuses =
      record.kind === "event"
        ? ["open", "published", "closed", "cancelled"]
        : ["open", "active", "closed", "archived"];
    if (!allowedStatuses.includes(requestedStatus))
      return jsonError(`Invalid ${record.kind} status`);
    if (user.role === "Coordinator") {
      const ownerId = positiveInteger(parseMeta(record.meta).ownerId);
      if (ownerId !== user.id)
        return jsonError(
          `Coordinators can only manage their own ${record.kind} records`,
          403,
        );
      allowed = true;
    }
  }
  if (!allowed)
    return jsonError(`${user.role} is not allowed to perform this update`, 403);
  await env.DB.prepare("UPDATE records SET status=? WHERE id=?")
    .bind(requestedStatus, p.id)
    .run();
  await env.DB.prepare(
    "INSERT INTO activity(message,actor,created_at) VALUES(?,?,?)",
  )
    .bind(
      `Updated ${record.kind} #${p.id} to ${requestedStatus}`,
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
    const target = await env.DB.prepare("SELECT email FROM users WHERE id=?")
      .bind(userId)
      .first<{ email: string }>();
    if (!target) return jsonError("User not found", 404);
    if (String(target.email).toLowerCase().endsWith("@campusone.dev"))
      return jsonError("Demo accounts cannot be deleted", 403);
    if (!(await deleteUserAccount(userId)))
      return jsonError("User not found", 404);
    await env.DB.prepare(
      "INSERT INTO activity(message,actor,created_at) VALUES(?,?,?)",
    )
      .bind(`Deleted user #${userId}`, user.name, Date.now())
      .run();
    return Response.json({ ok: true });
  }
  if (!id) return jsonError("id is required");
  const targetRecord = await env.DB.prepare(
    "SELECT kind,meta FROM records WHERE id=?",
  )
    .bind(id)
    .first<{ kind: string; meta: string }>();
  if (!targetRecord) return jsonError("Record not found", 404);
  if (targetRecord.kind === "upload") {
    const key = parseMeta(targetRecord.meta).key;
    if (typeof key === "string" && key) await env.FILES.delete(key);
  }
  await env.DB.batch([
    env.DB
      .prepare("DELETE FROM user_record_statuses WHERE record_id=?")
      .bind(id),
    env.DB.prepare("DELETE FROM records WHERE id=?").bind(id),
  ]);
  await env.DB.prepare(
    "INSERT INTO activity(message,actor,created_at) VALUES(?,?,?)",
  )
    .bind(`Deleted record #${id}`, user.name, Date.now())
    .run();
  return Response.json({ ok: true });
}
