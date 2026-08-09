"use client";

import { useMemo, useState } from "react";

const nav = ["Overview", "Attendance", "Assignments", "Events", "Placements"];
const roleCopy: Record<string, { name: string; subtitle: string }> = {
  Student: { name: "Aarav Mehta", subtitle: "B.Tech CSE · Semester 6" },
  Faculty: { name: "Dr. Maya Kapoor", subtitle: "Computer Science Faculty" },
  Coordinator: { name: "Riya Sharma", subtitle: "Campus Event Coordinator" },
  Admin: { name: "Vikram Rao", subtitle: "Platform Administrator" },
};

const assignments = [
  { title: "Neural Networks — Lab 04", subject: "Machine Learning", due: "Today, 11:59 PM", tone: "urgent" },
  { title: "Database Normalization", subject: "DBMS", due: "12 Aug", tone: "normal" },
  { title: "Socket Programming", subject: "Computer Networks", due: "15 Aug", tone: "normal" },
];

const events = [
  { day: "12", mon: "AUG", title: "DevFusion 4.0", meta: "Main Auditorium · 10:00 AM", tag: "Hackathon" },
  { day: "16", mon: "AUG", title: "AI & Future of Work", meta: "Seminar Hall B · 2:30 PM", tag: "Seminar" },
  { day: "21", mon: "AUG", title: "Founders Mixer", meta: "Innovation Hub · 5:00 PM", tag: "Networking" },
];

export default function Home() {
  const [active, setActive] = useState("Overview");
  const [role, setRole] = useState("Student");
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [registered, setRegistered] = useState<string[]>(["DevFusion 4.0"]);
  const person = roleCopy[role];
  const greeting = useMemo(() => new Date().getHours() < 12 ? "Good morning" : "Good afternoon", []);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  function toggleEvent(title: string) {
    setRegistered((items) => items.includes(title) ? items.filter((x) => x !== title) : [...items, title]);
    notify(registered.includes(title) ? "Registration cancelled" : "You’re registered — see you there!");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">C</span><span>Campus<span>One</span></span></div>
        <nav aria-label="Main navigation">
          <p className="nav-label">WORKSPACE</p>
          {nav.map((item, i) => <button key={item} className={active === item ? "nav-item active" : "nav-item"} onClick={() => setActive(item)}><span className="nav-icon">{["⌂", "✓", "▤", "◇", "↗"][i]}</span>{item}{item === "Assignments" && <b>3</b>}</button>)}
          <p className="nav-label second">CAMPUS</p>
          {[["◎", "Clubs"], ["▱", "Calendar"], ["♧", "Messages"]].map(([icon, item]) => <button key={item} className="nav-item" onClick={() => notify(`${item} module opened`)}><span className="nav-icon">{icon}</span>{item}</button>)}
        </nav>
        <div className="help-card"><span>?</span><strong>Need a hand?</strong><p>Reach the campus help desk anytime.</p><button onClick={() => notify("Support request started")}>Get support</button></div>
        <button className="profile-mini" onClick={() => notify("Profile opened")}><span className="avatar">{person.name.split(" ").map(x => x[0]).slice(0,2).join("")}</span><span><strong>{person.name}</strong><small>{role}</small></span><span className="dots">•••</span></button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-logo" aria-label="Open navigation">C</button>
          <label className="search"><span>⌕</span><input aria-label="Search campus" placeholder="Search anything..."/><kbd>⌘ K</kbd></label>
          <div className="top-actions">
            <select aria-label="Preview role" value={role} onChange={(e) => setRole(e.target.value)}>{Object.keys(roleCopy).map(r => <option key={r}>{r}</option>)}</select>
            <button className="icon-btn" aria-label="Messages" onClick={() => notify("No unread messages")}>◌</button>
            <button className="icon-btn notification" aria-label="Notifications" onClick={() => setNoticeOpen(!noticeOpen)}>♢<i /></button>
            <span className="top-avatar">{person.name.split(" ").map(x => x[0]).slice(0,2).join("")}</span>
          </div>
          {noticeOpen && <div className="notice-pop"><div><strong>Notifications</strong><button onClick={() => setNoticeOpen(false)}>×</button></div><p><b>Assignment due today</b><span>Neural Networks · 11:59 PM</span></p><p><b>Attendance marked</b><span>Computer Networks · Present</span></p><p><b>Event reminder</b><span>DevFusion starts in 3 days</span></p></div>}
        </header>

        <div className="content">
          <div className="welcome-row"><div><p className="eyebrow">MONDAY, 9 AUGUST</p><h1>{greeting}, {person.name.split(" ")[0]} <span>👋</span></h1><p>{role === "Student" ? "Here’s what’s happening with your campus life today." : `You’re viewing the ${role.toLowerCase()} workspace.`}</p></div><button className="primary" onClick={() => notify(role === "Student" ? "Quick actions opened" : "Create menu opened")}>＋ {role === "Student" ? "Quick action" : "Create new"}</button></div>

          <div className="stat-grid">
            <article className="stat-card attendance"><div className="stat-head"><span className="tile-icon">✓</span><span className="trend up">↗ 2.4%</span></div><p>Overall attendance</p><h2>{role === "Student" ? "86.4%" : "91.2%"}</h2><div className="progress"><i style={{width: role === "Student" ? "86.4%" : "91.2%"}} /></div><small>Minimum required: 75%</small></article>
            <article className="stat-card"><div className="stat-head"><span className="tile-icon purple">▤</span><span className="muted">This week</span></div><p>{role === "Student" ? "Pending assignments" : "Open submissions"}</p><h2>{role === "Student" ? "3" : "28"}</h2><small><b className="red">1 due today</b> · 2 upcoming</small></article>
            <article className="stat-card"><div className="stat-head"><span className="tile-icon orange">◇</span><span className="muted">August</span></div><p>Upcoming events</p><h2>6</h2><small><b className="blue">2 registered</b> · 4 discover</small></article>
            <article className="stat-card"><div className="stat-head"><span className="tile-icon green">↗</span><span className="trend up">+8 new</span></div><p>{role === "Student" ? "Placement opportunities" : "Active students"}</p><h2>{role === "Student" ? "14" : "1,284"}</h2><small>{role === "Student" ? "Based on your profile" : "Across 8 departments"}</small></article>
          </div>

          <div className="main-grid">
            <section className="panel schedule-panel"><div className="panel-title"><div><h3>Today’s schedule</h3><p>Monday, 9 August</p></div><button onClick={() => notify("Calendar opened")}>View calendar →</button></div>
              <div className="timeline">
                {[["09:00", "10:00", "Machine Learning", "Dr. Maya Kapoor · Lab 302", "blue"], ["11:00", "12:00", "Computer Networks", "Prof. Arjun Nair · Room 214", "purple"], ["14:30", "15:30", "Database Systems", "Dr. Nisha Verma · Room 108", "orange"]].map(([from,to,title,meta,color]) => <div className="class-row" key={title}><div className="time"><strong>{from}</strong><span>{to}</span></div><i className={color}/><div className="class-info"><strong>{title}</strong><span>{meta}</span></div><button aria-label={`Options for ${title}`} onClick={() => notify(`${title} details opened`)}>•••</button></div>)}
              </div>
              <div className="next-class"><span>●</span><div><small>NEXT CLASS IN 24 MIN</small><strong>Machine Learning · Lab 302</strong></div><button onClick={() => notify("Classroom directions opened")}>View details</button></div>
            </section>

            <section className="panel assignments-panel"><div className="panel-title"><div><h3>Assignments</h3><p>Keep up the momentum</p></div><button onClick={() => setActive("Assignments")}>View all →</button></div>
              <div className="assignment-list">{assignments.map((a, i) => <button className="assignment" key={a.title} onClick={() => notify(`${a.title} opened`)}><span className={`doc-icon d${i}`}>▤</span><span><strong>{a.title}</strong><small>{a.subject}</small></span><span className={a.tone === "urgent" ? "due urgent" : "due"}>{a.due}</span></button>)}</div>
              <div className="completion"><div><span>Weekly completion</span><strong>7 of 10</strong></div><div className="progress"><i style={{width:"70%"}} /></div></div>
            </section>

            <section className="panel performance-panel"><div className="panel-title"><div><h3>Attendance overview</h3><p>August performance</p></div><button onClick={() => notify("Attendance report opened")}>Full report →</button></div>
              <div className="chart-area"><div className="donut"><div><strong>86.4%</strong><span>Present</span></div></div><div className="legend"><p><i className="present"/>Present <b>38</b></p><p><i className="absent"/>Absent <b>4</b></p><p><i className="leave"/>On leave <b>2</b></p></div></div>
              <div className="subject-bars">{[["Machine Learning",92], ["Database Systems",88], ["Computer Networks",79]].map(([name,n]) => <div key={name as string}><span>{name}</span><b>{n}%</b><div className="progress"><i style={{width:`${n}%`}} /></div></div>)}</div>
            </section>

            <section className="panel events-panel"><div className="panel-title"><div><h3>Upcoming events</h3><p>Discover what’s happening</p></div><button onClick={() => setActive("Events")}>Explore all →</button></div>
              <div className="event-list">{events.map((e) => <div className="event" key={e.title}><div className="event-date"><strong>{e.day}</strong><span>{e.mon}</span></div><div className="event-copy"><span>{e.tag}</span><strong>{e.title}</strong><small>{e.meta}</small></div><button className={registered.includes(e.title) ? "registered" : ""} onClick={() => toggleEvent(e.title)}>{registered.includes(e.title) ? "✓ Registered" : "Register"}</button></div>)}</div>
            </section>
          </div>

          <footer><span>CampusOne · Northbridge Institute of Technology</span><span>System status: <b>● All services operational</b></span></footer>
        </div>
      </section>
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
      <nav className="mobile-nav">{nav.slice(0,4).map((item,i) => <button key={item} className={active===item?"active":""} onClick={() => setActive(item)}><span>{["⌂","✓","▤","◇"][i]}</span>{item}</button>)}</nav>
    </main>
  );
}
