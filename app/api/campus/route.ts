import { env } from "cloudflare:workers";

type Payload = { action?: string; id?: number; kind?: string; title?: string; subtitle?: string; status?: string; meta?: Record<string, unknown>; actor?: string };

async function ensureDatabase() {
  const db = env.DB;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS records (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', meta TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT NOT NULL, actor TEXT NOT NULL, created_at INTEGER NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_records_kind ON records(kind)"),
  ]);
  const count = await db.prepare("SELECT COUNT(*) AS count FROM records").first<{ count: number }>();
  if (!count?.count) {
    const now = Date.now();
    await db.batch([
      db.prepare("INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)").bind("assignment","Neural Networks — Lab 04","Machine Learning · Due today, 11:59 PM","pending",JSON.stringify({due:"Today",points:100,submitted:false}),now),
      db.prepare("INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)").bind("assignment","Database Normalization","DBMS · Due 12 Aug","pending",JSON.stringify({due:"12 Aug",points:50,submitted:false}),now),
      db.prepare("INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)").bind("assignment","Socket Programming","Computer Networks · Due 15 Aug","submitted",JSON.stringify({due:"15 Aug",points:75,submitted:true}),now),
      db.prepare("INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)").bind("event","DevFusion 4.0","12 Aug · Main Auditorium · 10:00 AM","registered",JSON.stringify({category:"Hackathon",seats:120}),now),
      db.prepare("INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)").bind("event","AI & Future of Work","16 Aug · Seminar Hall B · 2:30 PM","open",JSON.stringify({category:"Seminar",seats:60}),now),
      db.prepare("INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)").bind("placement","Frontend Engineer Intern","Razorpay · ₹45K/month · Apply by 18 Aug","eligible",JSON.stringify({ctc:"₹45K/month",skills:"React, TypeScript"}),now),
      db.prepare("INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)").bind("placement","Software Development Engineer","Atlassian · ₹22 LPA · Apply by 21 Aug","applied",JSON.stringify({ctc:"₹22 LPA",skills:"DSA, Java"}),now),
      db.prepare("INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)").bind("club","Google Developer Student Club","Build, learn and ship with 642 members","joined",JSON.stringify({members:642,category:"Technology"}),now),
      db.prepare("INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)").bind("club","Photography Society","Frames, stories and campus walks · 218 members","open",JSON.stringify({members:218,category:"Creative"}),now),
      db.prepare("INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)").bind("message","Dr. Maya Kapoor","Reminder: bring your laptops to today’s ML lab.","unread",JSON.stringify({time:"9:12 AM"}),now),
      db.prepare("INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)").bind("announcement","Mid-semester examination schedule","The examination timetable is now available in the student portal.","published",JSON.stringify({priority:"Important"}),now),
    ]);
  }
}

export async function GET() {
  await ensureDatabase();
  const [records, activity] = await Promise.all([
    env.DB.prepare("SELECT * FROM records ORDER BY created_at DESC, id DESC").all(),
    env.DB.prepare("SELECT * FROM activity ORDER BY created_at DESC LIMIT 12").all(),
  ]);
  return Response.json({ records: records.results.map((r: Record<string, unknown>) => ({ ...r, meta: JSON.parse(String(r.meta || "{}")) })), activity: activity.results });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const p = await request.json() as Payload;
  if (!p.kind || !p.title) return Response.json({ error: "kind and title are required" }, { status: 400 });
  const result = await env.DB.prepare("INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?) RETURNING *").bind(p.kind,p.title.trim(),p.subtitle?.trim() || "",p.status || "active",JSON.stringify(p.meta || {}),Date.now()).first();
  await env.DB.prepare("INSERT INTO activity(message,actor,created_at) VALUES(?,?,?)").bind(`Created ${p.kind}: ${p.title}`,p.actor || "CampusOne user",Date.now()).run();
  return Response.json({ record: result }, { status: 201 });
}

export async function PATCH(request: Request) {
  await ensureDatabase();
  const p = await request.json() as Payload;
  if (!p.id || !p.status) return Response.json({ error: "id and status are required" }, { status: 400 });
  await env.DB.prepare("UPDATE records SET status=? WHERE id=?").bind(p.status,p.id).run();
  await env.DB.prepare("INSERT INTO activity(message,actor,created_at) VALUES(?,?,?)").bind(`Updated record #${p.id} to ${p.status}`,p.actor || "CampusOne user",Date.now()).run();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  await ensureDatabase();
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  await env.DB.prepare("DELETE FROM records WHERE id=?").bind(id).run();
  return Response.json({ ok: true });
}
