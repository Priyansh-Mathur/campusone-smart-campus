"use client";

import { FormEvent, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Landing, type AuthProfile, type AuthUser } from "./Landing";

type Role = "Student" | "Faculty" | "Coordinator" | "Admin";
type RecordItem = {
  id: number;
  kind: string;
  title: string;
  subtitle: string;
  status: string;
  meta: Record<string, unknown>;
  created_at: number;
};
type Activity = {
  id: number;
  message: string;
  actor: string;
  created_at: number;
};
const modules = [
  ["Overview", "⌂"],
  ["Attendance", "✓"],
  ["Assignments", "▤"],
  ["Events", "◇"],
  ["Placements", "↗"],
  ["Clubs", "◎"],
  ["Calendar", "▱"],
  ["Messages", "♧"],
  ["Settings", "⚙"],
  ["Admin", "⚙"],
];
const people: Record<Role, { name: string; sub: string; initials: string }> = {
  Student: {
    name: "Aarav Mehta",
    sub: "B.Tech CSE · Semester 6",
    initials: "AM",
  },
  Faculty: {
    name: "Dr. Maya Kapoor",
    sub: "Computer Science Faculty",
    initials: "MK",
  },
  Coordinator: {
    name: "Riya Sharma",
    sub: "Campus Event Coordinator",
    initials: "RS",
  },
  Admin: { name: "Vikram Rao", sub: "Platform Administrator", initials: "VR" },
};
const schedule = [
  {
    time: "09:00",
    end: "10:00",
    title: "Machine Learning",
    place: "Lab 302",
    faculty: "Dr. Maya Kapoor",
    color: "blue",
  },
  {
    time: "11:00",
    end: "12:00",
    title: "Computer Networks",
    place: "Room 214",
    faculty: "Prof. Arjun Nair",
    color: "purple",
  },
  {
    time: "14:30",
    end: "15:30",
    title: "Database Systems",
    place: "Room 108",
    faculty: "Dr. Nisha Verma",
    color: "orange",
  },
];
const attendance = [
  {
    subject: "Machine Learning",
    code: "CS601",
    present: 22,
    total: 24,
    pct: 92,
  },
  {
    subject: "Database Systems",
    code: "CS603",
    present: 21,
    total: 24,
    pct: 88,
  },
  {
    subject: "Computer Networks",
    code: "CS605",
    present: 19,
    total: 24,
    pct: 79,
  },
  {
    subject: "Software Engineering",
    code: "CS607",
    present: 23,
    total: 25,
    pct: 92,
  },
];

export default function Home() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [active, setActive] = useState("Overview");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dark, setDark] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const role = (user?.role ?? "Student") as Role;
  const fallbackPerson = people[role];
  const person = {
    name: user?.name ?? fallbackPerson.name,
    sub: user?.profile?.department || fallbackPerson.sub,
    initials: (user?.name ?? fallbackPerson.name)
      .split(" ")
      .map((x) => x[0])
      .slice(0, 2)
      .join("")
      .toUpperCase(),
  };

  async function reloadData() {
    try {
      const r = await fetch("/api/campus");
      if (r.status === 401) {
        setUser(null);
        return;
      }
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setRecords(data.records || []);
      setActivity(data.activity || []);
    } catch {
      setToast("Could not load campus data");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth")
      .then(async (r) => ({ ok: r.ok, data: await r.json() }))
      .then(({ ok, data }) => {
        if (!cancelled) {
          setUser(ok ? data.user : null);
          if (ok && data.user?.profile)
            setDark(Boolean(data.user.profile.darkTheme));
        }
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch("/api/campus")
      .then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json() }))
      .then(({ ok, status, data }) => {
        if (cancelled) return;
        if (status === 401) {
          setUser(null);
          return;
        }
        if (!ok) throw new Error(data.error);
        setRecords(data.records || []);
        setActivity(data.activity || []);
      })
      .catch(() => {
        if (!cancelled) setToast("Could not load campus data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const timer = window.setInterval(() => {
      void reloadData();
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user]);
  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  }
  async function changeStatus(item: RecordItem, status: string) {
    setRecords((v) => v.map((x) => (x.id === item.id ? { ...x, status } : x)));
    const r = await fetch("/api/campus", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: item.id, status, actor: person.name }),
    });
    if (!r.ok) {
      const data = await r.json();
      flash(data.error || "Update failed");
      await reloadData();
    } else flash(`Successfully ${status}`);
  }
  async function createRecord(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const kind = String(fd.get("kind"));
    const body = {
      kind,
      title: String(fd.get("title")),
      subtitle: String(fd.get("subtitle")),
      status: kind === "announcement" ? "published" : "open",
      meta: {
        category: fd.get("category") || "Campus",
        email: fd.get("email"),
        role: fd.get("role"),
        password: fd.get("password"),
      },
    };
    const r = await fetch("/api/campus", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setModal(null);
      flash(`${kind} created`);
      await reloadData();
    } else {
      const data = await r.json();
      flash(data.error || "Please complete all fields");
    }
  }
  const byKind = (kind: string) =>
    records.filter(
      (r) =>
        r.kind === kind &&
        (!search ||
          `${r.title} ${r.subtitle}`
            .toLowerCase()
            .includes(search.toLowerCase())),
    );
  const canCreate = (kind: string) =>
    Boolean(kind) &&
    (role === "Admin" ||
      (kind === "assignment" && role === "Faculty") ||
      (kind === "event" && role === "Coordinator") ||
      (kind === "announcement" && ["Faculty", "Coordinator"].includes(role)));

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    setUser(null);
    setRecords([]);
    setActivity([]);
    setActive("Overview");
  }
  async function authUpdate(body: Record<string, unknown>) {
    const r = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Update failed");
    if (data.user) setUser(data.user);
    return data;
  }
  async function uploadFile(file: File, purpose: string) {
    const form = new FormData();
    form.set("file", file);
    form.set("purpose", purpose);
    const r = await fetch("/api/uploads", { method: "POST", body: form });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Upload failed");
    return data.file;
  }
  const globalResults = search.trim()
    ? records
        .filter((r) =>
          `${r.title} ${r.subtitle} ${r.kind}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .slice(0, 7)
    : [];
  const notificationItems = records.filter((r) => r.kind === "notification");

  if (user === undefined)
    return (
      <div className="boot-screen">
        <span className="brand-mark">C</span>
        <p>Opening CampusOne…</p>
      </div>
    );
  if (user === null)
    return (
      <Landing
        onAuthenticated={(u) => {
          setLoading(true);
          setUser(u);
        }}
      />
    );

  return (
    <main className={dark ? "app-shell dark" : "app-shell"}>
      <aside className="sidebar">
        <button className="brand" onClick={() => setActive("Overview")}>
          <span className="brand-mark">C</span>
          <span>
            Campus<b>One</b>
          </span>
        </button>
        <nav>
          <p className="nav-label">CAMPUS WORKSPACE</p>
          {modules.map(([name, icon]) => (
            <button
              key={name}
              className={`nav-item ${active === name ? "active" : ""} ${name === "Admin" && role !== "Admin" ? "role-hidden" : ""}`}
              onClick={() => setActive(name)}
            >
              <span className="nav-icon">{icon}</span>
              {name}
              {name === "Assignments" && (
                <b>
                  {
                    byKind("assignment").filter((x) => x.status === "pending")
                      .length
                  }
                </b>
              )}
            </button>
          ))}
        </nav>
        <div className="help-card">
          <span>?</span>
          <strong>Campus help desk</strong>
          <p>
            Questions or technical trouble? We usually reply in under 5 minutes.
          </p>
          <button
            onClick={() => {
              setActive("Messages");
              flash("Help desk conversation opened");
            }}
          >
            Contact support →
          </button>
        </div>
        <button className="profile-mini" onClick={() => setModal("profile")}>
          <span className="avatar">{person.initials}</span>
          <span>
            <strong>{person.name}</strong>
            <small>{role}</small>
          </span>
          <span className="dots">•••</span>
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button
            className="mobile-logo"
            onClick={() => flash("Use bottom navigation")}
          >
            C
          </button>
          <label className="search">
            <span>⌕</span>
            <input
              aria-label="Global campus search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search students, events, assignments..."
            />
            <kbd>⌘ K</kbd>
            {search && (
              <div className="global-results">
                {globalResults.length ? (
                  globalResults.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        const destination = moduleForKind(r.kind);
                        setActive(
                          destination === "Admin" && role !== "Admin"
                            ? "Overview"
                            : destination,
                        );
                        setSearch("");
                      }}
                    >
                      <span>{iconForKind(r.kind)}</span>
                      <p>
                        <strong>{r.title}</strong>
                        <small>
                          {r.kind} · {r.subtitle}
                        </small>
                      </p>
                    </button>
                  ))
                ) : (
                  <p className="no-results">No campus records found</p>
                )}
              </div>
            )}
          </label>
          <div className="top-actions">
            <span className="role-pill">{role}</span>
            <button
              className="icon-btn"
              onClick={() => setDark(!dark)}
              aria-label="Toggle theme"
            >
              {dark ? "☀" : "◐"}
            </button>
            <button
              className="icon-btn notification"
              aria-label="Open notifications"
              onClick={() => setNotificationsOpen((v) => !v)}
            >
              ♢{notificationItems.some((n) => n.status === "unread") && <i />}
            </button>
            <span className="top-avatar">{person.initials}</span>
            <button className="logout-button" onClick={logout}>
              Sign out
            </button>
          </div>
          {notificationsOpen && (
            <div className="notice-pop">
              <div>
                <strong>Notifications</strong>
                <button
                  aria-label="Close notifications"
                  onClick={() => setNotificationsOpen(false)}
                >
                  ×
                </button>
              </div>
              {notificationItems.length ? (
                notificationItems.map((n) => (
                  <button
                    className="notice-item"
                    key={n.id}
                    onClick={() => {
                      void changeStatus(n, "read");
                      setNotificationsOpen(false);
                    }}
                  >
                    <b>{n.title}</b>
                    <span>{n.subtitle}</span>
                  </button>
                ))
              ) : (
                <p className="no-results">You’re all caught up.</p>
              )}
            </div>
          )}
        </header>
        <div className="content">
          {loading ? (
            <Loading />
          ) : (
            <>
              <div className="module-header">
                <div>
                  <p className="eyebrow">NORTHBRIDGE INSTITUTE OF TECHNOLOGY</p>
                  <h1>{active}</h1>
                  <p>{subtitle(active, role, person.name)}</p>
                </div>
                {canCreate(kindFor(active)) && (
                  <button
                    className="primary"
                    onClick={() => setModal(kindFor(active))}
                  >
                    ＋ Create {singular(active)}
                  </button>
                )}
              </div>
              {active === "Overview" && (
                <Overview
                  role={role}
                  name={person.name}
                  records={records}
                  activity={activity}
                  setActive={setActive}
                />
              )}
              {active === "Attendance" && (
                <AttendanceView
                  role={role}
                  flash={flash}
                  save={async (count) => {
                    const r = await fetch("/api/campus", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        kind: "attendance",
                        title: "Machine Learning attendance",
                        subtitle: `${count} students marked present`,
                        status: "completed",
                        meta: { count, date: new Date().toISOString() },
                      }),
                    });
                    if (r.ok) {
                      flash("Attendance session saved");
                      await reloadData();
                    } else {
                      const d = await r.json();
                      flash(d.error);
                    }
                  }}
                />
              )}
              {active === "Assignments" && (
                <RecordView
                  title="Course assignments"
                  items={byKind("assignment")}
                  empty="No assignments found"
                  render={(x) => (
                    <AssignmentCard
                      key={x.id}
                      item={x}
                      role={role}
                      open={setModal}
                    />
                  )}
                />
              )}
              {active === "Events" && (
                <RecordView
                  title="Campus events"
                  items={byKind("event")}
                  empty="No events found"
                  render={(x) => (
                    <EventCard
                      key={x.id}
                      item={x}
                      role={role}
                      action={changeStatus}
                      open={setModal}
                    />
                  )}
                />
              )}
              {active === "Placements" && (
                <Placements
                  items={byKind("placement")}
                  role={role}
                  open={setModal}
                />
              )}
              {active === "Clubs" && (
                <RecordView
                  title="Student clubs"
                  items={byKind("club")}
                  empty="No clubs found"
                  render={(x) => (
                    <ClubCard key={x.id} item={x} action={changeStatus} />
                  )}
                />
              )}
              {active === "Calendar" && <CalendarView records={records} />}
              {active === "Messages" && (
                <Messages
                  items={byKind("message")}
                  role={role}
                  create={async (text) => {
                    const r = await fetch("/api/campus", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        kind: "message",
                        title: person.name,
                        subtitle: text,
                        status: "sent",
                      }),
                    });
                    if (r.ok) {
                      flash("Message sent");
                      await reloadData();
                    } else {
                      const d = await r.json();
                      flash(d.error);
                    }
                  }}
                />
              )}
              {active === "Settings" && (
                <SettingsView
                  user={user}
                  dark={dark}
                  update={async (values) => {
                    try {
                      const data = await authUpdate({
                        action: "preferences",
                        ...values,
                      });
                      setDark(Boolean(data.user?.profile?.darkTheme));
                      flash("Preferences saved");
                    } catch (e) {
                      flash(e instanceof Error ? e.message : "Update failed");
                    }
                  }}
                  changePassword={async (currentPassword, newPassword) => {
                    try {
                      const data = await authUpdate({
                        action: "password",
                        currentPassword,
                        newPassword,
                      });
                      flash(data.message);
                    } catch (e) {
                      flash(
                        e instanceof Error
                          ? e.message
                          : "Password change failed",
                      );
                    }
                  }}
                  deleteAccount={async (currentPassword) => {
                    try {
                      await authUpdate({ action: "delete", currentPassword });
                      setUser(null);
                      flash("Account deleted");
                    } catch (e) {
                      flash(
                        e instanceof Error
                          ? e.message
                          : "Account deletion failed",
                      );
                    }
                  }}
                  logout={logout}
                />
              )}
              {active === "Admin" && (
                <AdminView
                  records={records}
                  activity={activity}
                  setModal={setModal}
                  remove={async (item) => {
                    const query =
                      item.kind === "user"
                        ? `userId=${String(item.meta.userId)}`
                        : `id=${item.id}`;
                    const r = await fetch(`/api/campus?${query}`, {
                      method: "DELETE",
                    });
                    if (r.ok) {
                      flash(
                        item.kind === "user"
                          ? "User deleted"
                          : "Record deleted",
                      );
                      await reloadData();
                    } else {
                      const d = await r.json();
                      flash(d.error);
                    }
                  }}
                />
              )}
            </>
          )}
          <footer>
            <span>CampusOne · Northbridge Institute of Technology</span>
            <span>
              System status: <b>● All services operational</b>
            </span>
          </footer>
        </div>
      </section>
      <nav className="mobile-nav">
        {modules
          .filter(([name]) => name !== "Admin" || role === "Admin")
          .map(([name, icon]) => (
            <button
              key={name}
              className={active === name ? "active" : ""}
              onClick={() => setActive(name)}
            >
              <span>{icon}</span>
              {name}
            </button>
          ))}
      </nav>
      {modal && (
        <Modal
          type={modal}
          close={() => setModal(null)}
          person={person}
          user={user}
          saveProfile={async (profile) => {
            try {
              await authUpdate({ action: "profile", ...profile });
              setModal(null);
              flash("Profile saved securely");
            } catch (e) {
              flash(e instanceof Error ? e.message : "Profile update failed");
            }
          }}
          submit={createRecord}
          upload={uploadFile}
          finishSubmission={async (id, file, link) => {
            const r = await fetch("/api/campus", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                kind: "submission",
                title: `Assignment submission #${id}`,
                subtitle: file?.name || link || "Online submission",
                status: "submitted",
                meta: { assignmentId: id, file, link },
              }),
            });
            if (r.ok) {
              const assignment = records.find((x) => x.id === id);
              if (assignment) await changeStatus(assignment, "submitted");
              setModal(null);
              flash("Assignment submitted successfully");
              await reloadData();
            } else {
              const d = await r.json();
              flash(d.error);
            }
          }}
          finishReview={async (id, marks, feedback) => {
            const r = await fetch("/api/campus", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                kind: "feedback",
                title: `Review for assignment #${id}`,
                subtitle: feedback,
                status: "published",
                meta: { assignmentId: id, marks },
              }),
            });
            if (r.ok) {
              const assignment = records.find((x) => x.id === id);
              if (assignment) await changeStatus(assignment, "graded");
              setModal(null);
              flash("Marks and feedback published");
              await reloadData();
            } else {
              const d = await r.json();
              flash(d.error);
            }
          }}
          finishApplication={async (id, file) => {
            const r = await fetch("/api/campus", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                kind: "application",
                title: `Placement application #${id}`,
                subtitle: file?.name || "Profile resume",
                status: "applied",
                meta: { placementId: id, file },
              }),
            });
            if (r.ok) {
              const placement = records.find((x) => x.id === id);
              if (placement) await changeStatus(placement, "applied");
              setModal(null);
              flash("Application submitted");
              await reloadData();
            } else {
              const d = await r.json();
              flash(d.error);
            }
          }}
        />
      )}
      {toast && (
        <div className="toast">
          <span>✓</span>
          {toast}
        </div>
      )}
    </main>
  );
}

function Overview({
  role,
  name,
  records,
  activity,
  setActive,
}: {
  role: Role;
  name: string;
  records: RecordItem[];
  activity: Activity[];
  setActive: (x: string) => void;
}) {
  const assignments = records.filter((x) => x.kind === "assignment"),
    events = records.filter((x) => x.kind === "event"),
    placements = records.filter((x) => x.kind === "placement");
  return (
    <>
      <div className="welcome-banner">
        <div>
          <span>MONDAY, 10 AUGUST</span>
          <h2>Good morning, {name.split(" ")[0]} 👋</h2>
          <p>
            {role === "Student"
              ? "You have 3 classes and 1 assignment due today."
              : `Manage today’s ${role.toLowerCase()} responsibilities from one place.`}
          </p>
        </div>
        <div className="banner-art">
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className="stat-grid">
        <Stat
          icon="✓"
          color="blue"
          label="Overall attendance"
          value={role === "Student" ? "86.4%" : "91.2%"}
          detail="↑ 2.4% this month"
        />
        <Stat
          icon="▤"
          color="purple"
          label={
            role === "Student" ? "Pending assignments" : "Open submissions"
          }
          value={String(
            assignments.filter((x) => x.status === "pending").length || 3,
          )}
          detail="1 due today"
        />
        <Stat
          icon="◇"
          color="orange"
          label="Upcoming events"
          value={String(events.length)}
          detail={`${events.filter((x) => x.status === "registered").length} registered`}
        />
        <Stat
          icon="↗"
          color="green"
          label="Placement opportunities"
          value={String(placements.length + 12)}
          detail="8 new this week"
        />
      </div>
      <div className="main-grid">
        <section className="panel schedule-panel">
          <PanelTitle
            title="Today’s schedule"
            sub="Monday, 10 August"
            action="View calendar →"
            click={() => setActive("Calendar")}
          />
          <div className="timeline">
            {schedule.map((s) => (
              <div className="class-row" key={s.title}>
                <div className="time">
                  <strong>{s.time}</strong>
                  <span>{s.end}</span>
                </div>
                <i className={s.color} />
                <div className="class-info">
                  <strong>{s.title}</strong>
                  <span>
                    {s.faculty} · {s.place}
                  </span>
                </div>
                <span className="live-pill">
                  {s.time === "09:00" ? "NEXT" : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <PanelTitle
            title="Pending work"
            sub="Stay ahead of deadlines"
            action="View all →"
            click={() => setActive("Assignments")}
          />
          {assignments.slice(0, 3).map((a, i) => (
            <div className="mini-record" key={a.id}>
              <span className={`doc-icon d${i}`}>▤</span>
              <div>
                <strong>{a.title}</strong>
                <small>{a.subtitle}</small>
              </div>
              <b className={a.status}>{a.status}</b>
            </div>
          ))}
        </section>
        <section className="panel">
          <PanelTitle
            title="Attendance overview"
            sub="August performance"
            action="Full report →"
            click={() => setActive("Attendance")}
          />
          <div className="chart-area">
            <div className="donut">
              <div>
                <strong>86.4%</strong>
                <span>Present</span>
              </div>
            </div>
            <div className="legend">
              <p>
                <i className="present" />
                Present <b>38</b>
              </p>
              <p>
                <i className="absent" />
                Absent <b>4</b>
              </p>
              <p>
                <i className="leave" />
                On leave <b>2</b>
              </p>
            </div>
          </div>
        </section>
        <section className="panel">
          <PanelTitle
            title="Recent activity"
            sub="Live campus updates"
            action=""
            click={() => {}}
          />
          <div className="activity-list">
            {(activity.length
              ? activity
              : [
                  {
                    id: 1,
                    message: "Attendance marked for Machine Learning",
                    actor: "Dr. Maya Kapoor",
                    created_at: 0,
                  },
                ]
            )
              .slice(0, 4)
              .map((a) => (
                <div key={a.id}>
                  <span>●</span>
                  <p>
                    <strong>{a.message}</strong>
                    <small>{a.actor} · recently</small>
                  </p>
                </div>
              ))}
          </div>
        </section>
      </div>
    </>
  );
}
function AttendanceView({
  role,
  flash,
  save,
}: {
  role: Role;
  flash: (x: string) => void;
  save: (count: number) => void;
}) {
  const [marked, setMarked] = useState<string[]>([]);
  function download() {
    const rows = [
      "Subject,Code,Present,Total,Attendance",
      ...attendance.map(
        (a) => `${a.subject},${a.code},${a.present},${a.total},${a.pct}%`,
      ),
    ];
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([rows.join("\n")], { type: "text/csv" }),
    );
    link.download = "campusone-attendance.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    flash("Attendance CSV downloaded");
  }
  return (
    <div className="two-column">
      <section className="panel wide">
        <PanelTitle
          title="Subject-wise attendance"
          sub="Academic year 2026–27"
          action="Download CSV"
          click={download}
        />
        <div className="data-table">
          <div className="table-head">
            <span>Subject</span>
            <span>Classes</span>
            <span>Attendance</span>
            <span>Status</span>
          </div>
          {attendance.map((a) => (
            <div className="table-row" key={a.code}>
              <span>
                <strong>{a.subject}</strong>
                <small>{a.code}</small>
              </span>
              <span>
                {a.present} / {a.total}
              </span>
              <span>
                <div className="inline-progress">
                  <i style={{ width: `${a.pct}%` }} />
                </div>
                <b>{a.pct}%</b>
              </span>
              <span className={a.pct >= 75 ? "status-good" : "status-bad"}>
                {a.pct >= 75 ? "On track" : "At risk"}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <PanelTitle
          title={role === "Faculty" ? "Take attendance" : "Monthly summary"}
          sub={
            role === "Faculty"
              ? "Machine Learning · Lab 302"
              : "Your attendance trend"
          }
          action=""
          click={() => {}}
        />
        {role === "Faculty" ? (
          <div className="roster">
            {[
              "Aarav Mehta",
              "Diya Singh",
              "Kabir Khan",
              "Meera Joshi",
              "Vivaan Shah",
            ].map((n) => (
              <label key={n}>
                <span className="avatar">
                  {n
                    .split(" ")
                    .map((x) => x[0])
                    .join("")}
                </span>
                <strong>{n}</strong>
                <input
                  aria-label={`Mark ${n} present`}
                  type="checkbox"
                  checked={marked.includes(n)}
                  onChange={() =>
                    setMarked((v) =>
                      v.includes(n) ? v.filter((x) => x !== n) : [...v, n],
                    )
                  }
                />
              </label>
            ))}
            <button
              className="primary full"
              disabled={!marked.length}
              onClick={() => save(marked.length)}
            >
              Save attendance session
            </button>
          </div>
        ) : (
          <div className="month-grid">
            {Array.from({ length: 31 }, (_, i) => (
              <span
                className={
                  i % 7 === 5 || i % 11 === 0 ? "absent-day" : "present-day"
                }
                key={i}
              >
                {i + 1}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
function RecordView({
  title,
  items,
  empty,
  render,
}: {
  title: string;
  items: RecordItem[];
  empty: string;
  render: (x: RecordItem) => React.ReactNode;
}) {
  return (
    <section className="panel module-panel">
      <PanelTitle
        title={title}
        sub={`${items.length} records`}
        action=""
        click={() => {}}
      />
      <div className="card-list">
        {items.length ? items.map(render) : <Empty text={empty} />}
      </div>
    </section>
  );
}
function AssignmentCard({
  item,
  role,
  open,
}: {
  item: RecordItem;
  role: Role;
  open: (x: string) => void;
}) {
  return (
    <article className="record-card">
      <span className="large-icon purple">▤</span>
      <div className="record-copy">
        <span className="category">ASSIGNMENT</span>
        <h3>{item.title}</h3>
        <p>{item.subtitle}</p>
        <div className="meta-row">
          <span>◷ {String(item.meta.due || "Upcoming")}</span>
          <span>★ {String(item.meta.points || 100)} points</span>
          <span>Rubric included</span>
        </div>
      </div>
      <div className="record-actions">
        <span className={`state ${item.status}`}>{item.status}</span>
        {role === "Student" && (
          <button
            className="primary"
            onClick={() => open(`submission:${item.id}`)}
          >
            {item.status === "submitted" ? "View / resubmit" : "Submit work"}
          </button>
        )}
        {role === "Faculty" && (
          <button className="outline" onClick={() => open(`review:${item.id}`)}>
            Review & grade
          </button>
        )}
      </div>
    </article>
  );
}
function EventCard({
  item,
  role,
  action,
  open,
}: {
  item: RecordItem;
  role: Role;
  action: (x: RecordItem, s: string) => void;
  open: (x: string) => void;
}) {
  return (
    <article className="record-card">
      <div className="date-block">
        <strong>{item.subtitle.slice(0, 2)}</strong>
        <span>AUG</span>
      </div>
      <div className="record-copy">
        <span className="category">
          {String(item.meta.category || "CAMPUS EVENT")}
        </span>
        <h3>{item.title}</h3>
        <p>{item.subtitle}</p>
        <div className="meta-row">
          <span>◎ {String(item.meta.seats || 80)} seats</span>
          <span>Free entry</span>
          <span>Digital QR pass</span>
        </div>
      </div>
      <div className="record-actions">
        <span className={`state ${item.status}`}>{item.status}</span>
        {role === "Student" && (
          <div className="button-row">
            {item.status === "registered" && (
              <button
                className="outline"
                onClick={() => open(`ticket:${item.id}`)}
              >
                View pass
              </button>
            )}
            <button
              className={item.status === "registered" ? "outline" : "primary"}
              onClick={() =>
                action(
                  item,
                  item.status === "registered" ? "open" : "registered",
                )
              }
            >
              {item.status === "registered" ? "Cancel" : "Register"}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
function ClubCard({
  item,
  action,
}: {
  item: RecordItem;
  action: (x: RecordItem, s: string) => void;
}) {
  return (
    <article className="record-card">
      <span className="large-icon blue">◎</span>
      <div className="record-copy">
        <span className="category">
          {String(item.meta.category || "STUDENT CLUB")}
        </span>
        <h3>{item.title}</h3>
        <p>{item.subtitle}</p>
      </div>
      <div className="record-actions">
        <button
          className={item.status === "joined" ? "outline" : "primary"}
          onClick={() =>
            action(item, item.status === "joined" ? "open" : "joined")
          }
        >
          {item.status === "joined" ? "✓ Joined" : "Join club"}
        </button>
      </div>
    </article>
  );
}
function Placements({
  items,
  role,
  open,
}: {
  items: RecordItem[];
  role: Role;
  open: (x: string) => void;
}) {
  return (
    <>
      <div className="placement-hero">
        <div>
          <span>CAREER SERVICES</span>
          <h2>Your next opportunity starts here.</h2>
          <p>Curated roles matched to your skills and academic profile.</p>
        </div>
        <div>
          <strong>87%</strong>
          <span>Profile strength</span>
        </div>
      </div>
      <RecordView
        title="Recommended opportunities"
        items={items}
        empty="No roles match your search"
        render={(x) => (
          <article className="record-card" key={x.id}>
            <span className="company-logo">{x.title[0]}</span>
            <div className="record-copy">
              <span className="category">RECOMMENDED · ELIGIBLE</span>
              <h3>{x.title}</h3>
              <p>{x.subtitle}</p>
              <div className="skill-row">
                {String(x.meta.skills || "")
                  .split(", ")
                  .map((s) => (
                    <span key={s}>{s}</span>
                  ))}
              </div>
            </div>
            <div className="record-actions">
              <span className={`state ${x.status}`}>{x.status}</span>
              {role === "Student" && (
                <button
                  className="primary"
                  onClick={() => open(`application:${x.id}`)}
                >
                  {x.status === "applied"
                    ? "View / update"
                    : "Apply with resume"}
                </button>
              )}
            </div>
          </article>
        )}
      />
    </>
  );
}
function CalendarView({ records }: { records: RecordItem[] }) {
  const days = Array.from({ length: 35 }, (_, i) => i - 2);
  return (
    <div className="two-column calendar-layout">
      <section className="panel wide">
        <PanelTitle
          title="August 2026"
          sub="Academic calendar"
          action="Today"
          click={() => {}}
        />
        <div className="calendar">
          <div className="weekdays">
            {"MON TUE WED THU FRI SAT SUN".split(" ").map((x) => (
              <b key={x}>{x}</b>
            ))}
          </div>
          <div className="days">
            {days.map((d, i) => (
              <div
                className={d === 10 ? "today" : d < 1 ? "muted-day" : ""}
                key={i}
              >
                <span>{d < 1 ? 30 + d : d}</span>
                {d === 10 && <i>ML Lab</i>}
                {d === 12 && <i className="event-dot">DevFusion</i>}
                {d === 16 && <i className="event-dot">AI Seminar</i>}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="panel">
        <PanelTitle
          title="Upcoming"
          sub="Next 7 days"
          action=""
          click={() => {}}
        />
        {records
          .filter((x) => x.kind === "event" || x.kind === "assignment")
          .slice(0, 5)
          .map((x) => (
            <div className="agenda" key={x.id}>
              <span className={x.kind}>{x.kind === "event" ? "◇" : "▤"}</span>
              <div>
                <strong>{x.title}</strong>
                <small>{x.subtitle}</small>
              </div>
            </div>
          ))}
      </section>
    </div>
  );
}
function Messages({
  items,
  role,
  create,
}: {
  items: RecordItem[];
  role: Role;
  create: (x: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="messages-layout">
      <aside className="panel conversations">
        <div className="conversation-search">⌕ Search conversations</div>
        {items.map((x, i) => (
          <button key={x.id} className={i === 0 ? "selected" : ""}>
            <span className="avatar">
              {x.title
                .split(" ")
                .map((y) => y[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span>
              <strong>{x.title}</strong>
              <small>{x.subtitle}</small>
            </span>
          </button>
        ))}
      </aside>
      <section className="panel chat">
        <div className="chat-head">
          <span className="avatar">MK</span>
          <div>
            <strong>Dr. Maya Kapoor</strong>
            <small>● Online · Machine Learning</small>
          </div>
        </div>
        <div className="chat-body">
          <div className="bubble theirs">
            Hi {people[role].name.split(" ")[0]}, remember to bring your laptop
            to today’s lab.<small>9:12 AM</small>
          </div>
          <div className="bubble mine">
            Sure, thank you for the reminder!<small>9:18 AM</small>
          </div>
          {items
            .filter((x) => x.status === "sent")
            .map((x) => (
              <div className="bubble mine" key={x.id}>
                {x.subtitle}
                <small>Just now</small>
              </div>
            ))}
        </div>
        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) {
              create(text);
              setText("");
            }
          }}
        >
          <button type="button">＋</button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a message..."
          />
          <button type="submit">Send</button>
        </form>
      </section>
    </div>
  );
}
function SettingsView({
  user,
  dark,
  update,
  changePassword,
  deleteAccount,
  logout,
}: {
  user: AuthUser;
  dark: boolean;
  update: (x: {
    darkTheme: boolean;
    emailNotifications: boolean;
    pushNotifications: boolean;
  }) => void;
  changePassword: (current: string, next: string) => void;
  deleteAccount: (current: string) => void;
  logout: () => void;
}) {
  const profile = user.profile;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const prefs = (
    patch: Partial<{
      darkTheme: boolean;
      emailNotifications: boolean;
      pushNotifications: boolean;
    }>,
  ) =>
    update({
      darkTheme: dark,
      emailNotifications: profile?.emailNotifications ?? true,
      pushNotifications: profile?.pushNotifications ?? true,
      ...patch,
    });
  return (
    <div className="settings-grid">
      <section className="panel">
        <PanelTitle
          title="Appearance & notifications"
          sub="Preferences are saved to your account"
          action=""
          click={() => {}}
        />
        <div className="setting-row">
          <div>
            <strong>Dark theme</strong>
            <span>Use a lower-light campus workspace.</span>
          </div>
          <input
            aria-label="Dark theme"
            type="checkbox"
            checked={dark}
            onChange={(e) => prefs({ darkTheme: e.target.checked })}
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>Email notifications</strong>
            <span>Important announcements and deadlines.</span>
          </div>
          <input
            aria-label="Email notifications"
            type="checkbox"
            checked={profile?.emailNotifications ?? true}
            onChange={(e) => prefs({ emailNotifications: e.target.checked })}
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>Push notifications</strong>
            <span>Real-time campus updates.</span>
          </div>
          <input
            aria-label="Push notifications"
            type="checkbox"
            checked={profile?.pushNotifications ?? true}
            onChange={(e) => prefs({ pushNotifications: e.target.checked })}
          />
        </div>
      </section>
      <section className="panel">
        <PanelTitle
          title="Password & sessions"
          sub="Keep your campus account protected"
          action=""
          click={() => {}}
        />
        <form
          className="settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            changePassword(current, next);
            setCurrent("");
            setNext("");
          }}
        >
          <label>
            Current password
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <button className="primary" type="submit">
            Change password
          </button>
          <button className="outline" type="button" onClick={logout}>
            Sign out of this session
          </button>
        </form>
      </section>
      <section className="panel danger-zone">
        <PanelTitle
          title="Delete account"
          sub="Permanently remove your own account and profile"
          action=""
          click={() => {}}
        />
        <p>
          Demo accounts are protected. A verified personal account can be
          removed after password confirmation.
        </p>
        <label>
          Confirm current password
          <input
            type="password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
          />
        </label>
        <button
          disabled={!deletePassword}
          onClick={() => deleteAccount(deletePassword)}
        >
          Delete my account
        </button>
      </section>
    </div>
  );
}
function AdminView({
  records,
  activity,
  setModal,
  remove,
}: {
  records: RecordItem[];
  activity: Activity[];
  setModal: (x: string) => void;
  remove: (item: RecordItem) => void;
}) {
  const managed = records.filter((r) =>
    [
      "user",
      "department",
      "course",
      "event",
      "assignment",
      "announcement",
      "placement",
    ].includes(r.kind),
  );
  return (
    <>
      <div className="stat-grid">
        <Stat
          icon="♙"
          color="blue"
          label="Registered users"
          value={String(records.filter((r) => r.kind === "user").length)}
          detail="Across all roles"
        />
        <Stat
          icon="♙"
          color="purple"
          label="Faculty members"
          value={String(
            records.filter(
              (r) => r.kind === "user" && r.meta.role === "Faculty",
            ).length,
          )}
          detail="Verified accounts"
        />
        <Stat
          icon="◇"
          color="orange"
          label="Active records"
          value={String(records.length)}
          detail="Across all modules"
        />
        <Stat
          icon="✓"
          color="green"
          label="System health"
          value="99.9%"
          detail="All services online"
        />
      </div>
      <div className="main-grid">
        <section className="panel">
          <PanelTitle
            title="Quick administration"
            sub="Manage campus operations"
            action=""
            click={() => {}}
          />
          <div className="admin-actions">
            {[
              ["user", "Create user account", "Assign a secure campus role"],
              [
                "announcement",
                "Publish announcement",
                "Notify the entire campus",
              ],
              ["event", "Create campus event", "Schedule and manage seats"],
              ["assignment", "Add assignment", "Create coursework"],
              ["department", "Add department", "Manage campus structure"],
              ["course", "Add course", "Configure academic catalog"],
              ["placement", "Post placement", "Publish a career opportunity"],
            ].map(([type, title, sub]) => (
              <button key={type} onClick={() => setModal(type)}>
                <span>＋</span>
                <div>
                  <strong>{title}</strong>
                  <small>{sub}</small>
                </div>
                <b>→</b>
              </button>
            ))}
          </div>
        </section>
        <section className="panel">
          <PanelTitle
            title="Audit activity"
            sub="Latest protected actions"
            action=""
            click={() => {}}
          />
          <div className="activity-list">
            {activity.slice(0, 8).map((a) => (
              <div key={a.id}>
                <span>●</span>
                <p>
                  <strong>{a.message}</strong>
                  <small>{a.actor}</small>
                </p>
              </div>
            ))}
          </div>
        </section>
        <section className="panel admin-records">
          <PanelTitle
            title="Content & user management"
            sub="Accounts, departments, courses and published records"
            action=""
            click={() => {}}
          />
          {managed.slice(0, 12).map((r) => (
            <div className="managed-row" key={`${r.kind}-${r.id}`}>
              <span>{iconForKind(r.kind)}</span>
              <p>
                <strong>{r.title}</strong>
                <small>
                  {r.kind} · {r.subtitle}
                </small>
              </p>
              <button
                aria-label={`Delete ${r.title}`}
                onClick={() => remove(r)}
              >
                Delete
              </button>
            </div>
          ))}
        </section>
        <section className="panel">
          <PanelTitle
            title="Permissions"
            sub="Role policy overview"
            action=""
            click={() => {}}
          />
          <div className="permission-list">
            {Object.entries({
              Student: "View, submit, register, apply",
              Faculty: "Assignments, attendance, notices",
              Coordinator: "Events, clubs, announcements",
              Admin: "Full platform management",
            }).map(([r, p]) => (
              <div key={r}>
                <b>{r}</b>
                <span>{p}</span>
                <i>Active</i>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
function Modal({
  type,
  close,
  person,
  user,
  saveProfile,
  submit,
  upload,
  finishSubmission,
  finishReview,
  finishApplication,
}: {
  type: string;
  close: () => void;
  person: { name: string; sub: string; initials: string };
  user: AuthUser;
  saveProfile: (profile: Partial<AuthProfile>) => Promise<void>;
  submit: (e: FormEvent<HTMLFormElement>) => void;
  upload: (
    file: File,
    purpose: string,
  ) => Promise<{ name: string; key: string; size: number }>;
  finishSubmission: (
    id: number,
    file: { name: string; key: string; size: number } | null,
    link: string,
  ) => Promise<void>;
  finishReview: (id: number, marks: number, feedback: string) => Promise<void>;
  finishApplication: (
    id: number,
    file: { name: string; key: string; size: number } | null,
  ) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [marks, setMarks] = useState("85");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [kind, idText] = type.split(":");
  const id = Number(idText || 0);
  async function withUpload(purpose: string) {
    if (!file) return null;
    setBusy(true);
    try {
      return await upload(file, purpose);
    } finally {
      setBusy(false);
    }
  }
  const frame = (content: React.ReactNode) => (
    <dialog open className="modal-backdrop">
      <section className="modal">
        <button
          type="button"
          className="modal-close"
          aria-label="Close dialog"
          onClick={close}
        >
          ×
        </button>
        {content}
      </section>
    </dialog>
  );
  if (kind === "ticket")
    return frame(
      <div className="ticket-modal">
        <span className="form-icon">◇</span>
        <h2>Your event pass</h2>
        <p>DevFusion 4.0 · Main Auditorium · 12 August</p>
        <div className="qr-code" aria-label="Scannable event ticket QR code">
          <QRCodeSVG
            value={`campusone://event/${id}?user=${user.id}`}
            size={128}
            level="H"
            title="CampusOne event pass"
            style={{ gridColumn: "1 / -1", placeSelf: "center" }}
          />
        </div>
        <strong>
          CAMPUS-{id}-{user.id}
        </strong>
        <button className="primary full" onClick={() => window.print()}>
          Print / download pass
        </button>
      </div>,
    );
  if (kind === "submission")
    return frame(
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            const stored = await withUpload("assignment");
            await finishSubmission(id, stored, link);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Submission failed");
          }
        }}
      >
        <span className="form-icon">▤</span>
        <h2>Submit assignment</h2>
        <p>Upload a PDF/ZIP solution or include a public GitHub link.</p>
        <label>
          Solution file
          <input
            type="file"
            accept=".pdf,.zip"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <label>
          GitHub link
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://github.com/you/project"
          />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button
          className="primary full"
          disabled={busy || (!file && !link.trim())}
        >
          {busy ? "Uploading…" : "Submit solution"}
        </button>
      </form>,
    );
  if (kind === "review")
    return frame(
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await finishReview(id, Number(marks), feedback);
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="form-icon">✓</span>
        <h2>Review submission</h2>
        <p>Publish marks and constructive feedback for the student.</p>
        <label>
          Marks out of 100
          <input
            type="number"
            min="0"
            max="100"
            value={marks}
            onChange={(e) => setMarks(e.target.value)}
            required
          />
        </label>
        <label>
          Feedback
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            required
            placeholder="Explain strengths and areas to improve"
          />
        </label>
        <button className="primary full" disabled={busy}>
          {busy ? "Publishing…" : "Publish review"}
        </button>
      </form>,
    );
  if (kind === "application")
    return frame(
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            const stored = await withUpload("resume");
            await finishApplication(id, stored);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Application failed");
          }
        }}
      >
        <span className="form-icon">↗</span>
        <h2>Submit application</h2>
        <p>Upload your latest PDF or DOCX resume for this opportunity.</p>
        <label>
          Resume
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            required
          />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button className="primary full" disabled={busy || !file}>
          {busy ? "Uploading…" : "Apply now"}
        </button>
      </form>,
    );
  if (kind === "profile")
    return frame(
      <form
        className="profile-modal"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await saveProfile(
              Object.fromEntries(
                [
                  "phone",
                  "rollNumber",
                  "department",
                  "semester",
                  "skills",
                  "linkedin",
                  "github",
                  "bio",
                ].map((key) => [key, String(fd.get(key) ?? "")]),
              ),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="profile-avatar">{person.initials}</span>
        <h2>{person.name}</h2>
        <p>{person.sub}</p>
        <div className="profile-fields">
          <label>
            Email
            <input value={user.email} readOnly />
          </label>
          <label>
            Phone
            <input
              name="phone"
              defaultValue={user.profile?.phone || ""}
              placeholder="+91 98765 43210"
            />
          </label>
          <label>
            Roll number
            <input
              name="rollNumber"
              defaultValue={user.profile?.rollNumber || ""}
              placeholder="NBT26CSE1042"
            />
          </label>
          <label>
            Department
            <input
              name="department"
              defaultValue={user.profile?.department || ""}
              placeholder="Computer Science & Engineering"
            />
          </label>
          <label>
            Semester
            <input
              name="semester"
              defaultValue={user.profile?.semester || ""}
              placeholder="6"
            />
          </label>
          <label>
            Skills
            <input
              name="skills"
              defaultValue={user.profile?.skills || ""}
              placeholder="React, TypeScript, Machine Learning"
            />
          </label>
          <label>
            LinkedIn
            <input
              type="url"
              name="linkedin"
              defaultValue={user.profile?.linkedin || ""}
              placeholder="https://linkedin.com/in/you"
            />
          </label>
          <label>
            GitHub
            <input
              type="url"
              name="github"
              defaultValue={user.profile?.github || ""}
              placeholder="https://github.com/you"
            />
          </label>
          <label>
            Bio
            <textarea
              name="bio"
              defaultValue={user.profile?.bio || ""}
              placeholder="Tell the campus community about yourself."
            />
          </label>
        </div>
        <button className="primary full" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>,
    );
  return (
    <dialog open className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <button
          type="button"
          className="modal-close"
          aria-label="Close dialog"
          onClick={close}
        >
          ×
        </button>
        <span className="form-icon">＋</span>
        <h2>Create {kind}</h2>
        <p>Add a new {kind} to the campus workspace.</p>
        <input type="hidden" name="kind" value={kind} />
        <label>
          {kind === "user" ? "Full name" : "Title"}
          <input
            name="title"
            required
            maxLength={120}
            placeholder={
              kind === "user" ? "User’s full name" : `Enter ${kind} title`
            }
          />
        </label>
        {kind === "user" ? (
          <>
            <input type="hidden" name="subtitle" value="Campus account" />
            <label>
              Email address
              <input
                type="email"
                name="email"
                required
                placeholder="user@northbridge.edu"
              />
            </label>
            <label>
              Role
              <select name="role">
                <option>Student</option>
                <option>Faculty</option>
                <option>Coordinator</option>
                <option>Admin</option>
              </select>
            </label>
            <label>
              Temporary password
              <input
                type="password"
                name="password"
                required
                minLength={8}
                defaultValue="Campus@123"
              />
            </label>
          </>
        ) : (
          <>
            <label>
              Description / details
              <textarea
                name="subtitle"
                required
                maxLength={1000}
                placeholder="Add deadline, venue, eligibility or useful details"
              />
            </label>
            <label>
              Category
              <select name="category">
                <option>Campus</option>
                <option>Academic</option>
                <option>Technology</option>
                <option>Important</option>
                <option>Placement</option>
              </select>
            </label>
          </>
        )}
        <button className="primary full" type="submit">
          {kind === "user" ? "Create secure account" : `Publish ${kind}`}
        </button>
      </form>
    </dialog>
  );
}
function Stat({
  icon,
  color,
  label,
  value,
  detail,
}: {
  icon: string;
  color: string;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-head">
        <span className={`tile-icon ${color}`}>{icon}</span>
        <span className="trend up">↗ live</span>
      </div>
      <p>{label}</p>
      <h2>{value}</h2>
      <small>{detail}</small>
    </article>
  );
}
function PanelTitle({
  title,
  sub,
  action,
  click,
}: {
  title: string;
  sub: string;
  action: string;
  click: () => void;
}) {
  return (
    <div className="panel-title">
      <div>
        <h3>{title}</h3>
        <p>{sub}</p>
      </div>
      {action && <button onClick={click}>{action}</button>}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <span>⌕</span>
      <h3>{text}</h3>
      <p>Try changing your search or create a new record.</p>
    </div>
  );
}
function Loading() {
  return (
    <div className="loading">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}
function kindFor(active: string) {
  return (
    (
      {
        Assignments: "assignment",
        Events: "event",
        Admin: "announcement",
      } as Record<string, string>
    )[active] || ""
  );
}
function singular(active: string) {
  return (
    (
      {
        Assignments: "assignment",
        Events: "event",
        Admin: "announcement",
      } as Record<string, string>
    )[active] || "record"
  );
}
function moduleForKind(kind: string) {
  return (
    (
      {
        assignment: "Assignments",
        submission: "Assignments",
        feedback: "Assignments",
        event: "Events",
        placement: "Placements",
        application: "Placements",
        club: "Clubs",
        message: "Messages",
        notification: "Overview",
        attendance: "Attendance",
        announcement: "Admin",
        department: "Admin",
        course: "Admin",
        user: "Admin",
      } as Record<string, string>
    )[kind] || "Overview"
  );
}
function iconForKind(kind: string) {
  return (
    (
      {
        assignment: "▤",
        submission: "▤",
        event: "◇",
        placement: "↗",
        application: "↗",
        club: "◎",
        message: "♧",
        notification: "♢",
        attendance: "✓",
        announcement: "!",
        department: "⌂",
        course: "▱",
        user: "♙",
      } as Record<string, string>
    )[kind] || "•"
  );
}
function subtitle(active: string, role: Role, name: string) {
  const map: Record<string, string> = {
    Overview: `Welcome back, ${name.split(" ")[0]}. Here’s your campus at a glance.`,
    Attendance: "Track presence, subject performance and monthly trends.",
    Assignments: "Create, submit and review academic coursework.",
    Events: "Discover and manage everything happening on campus.",
    Placements: "Explore roles, check eligibility and track applications.",
    Clubs: "Find your community and grow beyond the classroom.",
    Calendar: "Classes, deadlines and events in one academic calendar.",
    Messages: "Secure conversations with faculty and campus teams.",
    Settings: "Control your profile preferences, password and account.",
    Admin: "Manage people, content, permissions and system activity.",
  };
  return map[active];
}
