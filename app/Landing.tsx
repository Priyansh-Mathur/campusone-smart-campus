"use client";

import { FormEvent, useEffect, useState } from "react";

export type AuthProfile = { phone:string;rollNumber:string;department:string;semester:string;skills:string;linkedin:string;github:string;bio:string;darkTheme:boolean;emailNotifications:boolean;pushNotifications:boolean };
export type AuthUser = { id:number; name:string; email:string; role:"Student"|"Faculty"|"Coordinator"|"Admin"; verified:boolean; profile?:AuthProfile };

const demos = [
  {role:"Student",email:"student@campusone.dev",icon:"ST"},
  {role:"Faculty",email:"faculty@campusone.dev",icon:"FC"},
  {role:"Coordinator",email:"coordinator@campusone.dev",icon:"CO"},
  {role:"Admin",email:"admin@campusone.dev",icon:"AD"},
];

export function Landing({onAuthenticated}:{onAuthenticated:(user:AuthUser)=>void}) {
  const [authOpen,setAuthOpen]=useState(false);
  const [mode,setMode]=useState<"login"|"signup"|"verify"|"forgot"|"reset">("login");
  const [email,setEmail]=useState("");
  const [name,setName]=useState("");
  const [password,setPassword]=useState("");
  const [code,setCode]=useState("");
  const [demoCode,setDemoCode]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  useEffect(()=>{const issue=new URLSearchParams(window.location.search).get("oauth");if(!issue)return;const timer=window.setTimeout(()=>{setMode("login");setAuthOpen(true);setError(issue==="unconfigured"?"Google sign-in needs deployment credentials. Use a demo account for now.":"Google sign-in could not be completed. Please try again.");window.history.replaceState({},"",window.location.pathname)},0);return()=>window.clearTimeout(timer)},[]);

  async function authenticate(action:string,extra:Record<string,string>={}) {
    setBusy(true); setError("");
    try {
      const response=await fetch("/api/auth",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,email,password,name,code,...extra})});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||"Authentication failed");
      if(data.user){onAuthenticated(data.user);return}
      if(action==="signup"){setDemoCode(data.demoCode||"");setMode("verify")}
      else if(action==="forgot"){setDemoCode(data.demoCode||"");setMode("reset")}
      else if(action==="reset"){setMode("login");setCode("");setPassword("");setError("Password updated. Sign in with your new password.")}
    } catch(e){setError(e instanceof Error?e.message:"Something went wrong")} finally{setBusy(false)}
  }
  async function submit(e:FormEvent){e.preventDefault();await authenticate(mode)}
  async function demoLogin(d:{email:string}){setEmail(d.email);setPassword("Campus@123");await authenticate("login",{email:d.email,password:"Campus@123"})}

  return <main className="landing-shell">
    <header className="landing-nav"><button className="brand landing-brand" onClick={()=>window.scrollTo({top:0,behavior:"smooth"})}><span className="brand-mark">C</span><span>Campus<b>One</b></span></button><nav><a href="#features">Features</a><a href="#impact">Impact</a><a href="#faq">FAQ</a></nav><div><button className="text-button" onClick={()=>{setMode("login");setAuthOpen(true)}}>Sign in</button><button className="primary" onClick={()=>{setMode("signup");setAuthOpen(true)}}>Get started</button></div></header>
    <section className="landing-hero"><div className="hero-copy"><span className="hero-kicker">SMARTER CAMPUS · STRONGER COMMUNITY</span><h1>One campus.<br/><em>Every possibility.</em></h1><p>CampusOne brings attendance, assignments, events, placements, clubs and campus communication into one secure workspace built for everyone.</p><div className="hero-actions"><button className="primary large" onClick={()=>{setMode("login");setAuthOpen(true)}}>Open your dashboard →</button><a href="#features">Explore the platform</a></div><div className="hero-trust"><span>✓ Role-based access</span><span>✓ Secure sessions</span><span>✓ Mobile ready</span></div></div><div className="hero-product"><div className="hero-window"><div className="window-top"><i/><i/><i/><span>campusone.edu/dashboard</span></div><div className="window-body"><div className="window-side"><b>C</b><i/><i/><i/><i/></div><div className="window-main"><span>Good morning, Aarav</span><strong>Your campus at a glance.</strong><div className="window-stats"><i>86%<small>Attendance</small></i><i>03<small>Assignments</small></i><i>06<small>Events</small></i></div><div className="window-panels"><i/><i/></div></div></div></div><div className="floating-card fc-one"><b>✓ Attendance marked</b><span>Machine Learning · Present</span></div><div className="floating-card fc-two"><b>◇ DevFusion 4.0</b><span>Registration confirmed</span></div></div></section>
    <section className="logo-strip"><span>Built for modern institutions</span><b>NORTHBRIDGE</b><b>INNOVATE U</b><b>TECHNOVA</b><b>EDUCORE</b></section>
    <section className="landing-section" id="features"><div className="section-heading"><span>ONE CONNECTED PLATFORM</span><h2>Everything campus life needs.</h2><p>Purpose-built experiences for students, faculty, coordinators and administrators.</p></div><div className="feature-grid">{[["✓","Attendance intelligence","Live subject analytics, faculty attendance sessions and downloadable reports."],["▤","Academic workflow","Create assignments, upload solutions, review submissions and share feedback."],["◇","Events that connect","Discover events, reserve seats, cancel registrations and access digital passes."],["↗","Career launchpad","Matched opportunities, eligibility details, applications and resume management."],["◎","Clubs & community","Find your people, join societies and manage campus participation."],["♧","Campus communication","Notifications, announcements and direct faculty-student conversations."]].map(([icon,title,copy])=><article key={title}><span>{icon}</span><h3>{title}</h3><p>{copy}</p><a href="#auth" onClick={e=>{e.preventDefault();setAuthOpen(true)}}>Explore feature →</a></article>)}</div></section>
    <section className="impact-section" id="impact"><div><span>MEASURABLE IMPACT</span><h2>A campus that moves<br/>at the speed of its people.</h2><p>Replace fragmented tools and noisy groups with one reliable source of truth.</p></div><div className="impact-stats"><article><strong>86%</strong><span>less administrative follow-up</span></article><article><strong>4.8×</strong><span>faster campus communication</span></article><article><strong>99.9%</strong><span>service availability</span></article><article><strong>1</strong><span>connected workspace</span></article></div></section>
    <section className="testimonial"><blockquote>“CampusOne finally gives students and faculty the same clear picture. Attendance, coursework and campus opportunities no longer get lost across five different tools.”</blockquote><div><span className="avatar">NK</span><p><strong>Dr. Neha Khanna</strong><small>Dean of Student Experience</small></p></div></section>
    <section className="faq-section" id="faq"><div className="section-heading"><span>FREQUENTLY ASKED</span><h2>Questions, answered.</h2></div>{[["Who can use CampusOne?","Students, faculty, event coordinators and platform administrators each receive a dashboard with role-appropriate permissions."],["Is campus data persistent?","Yes. Campus records, actions, submissions and messages are stored in a managed Cloudflare D1 database."],["Does it work on phones?","Yes. Every workspace is responsive, keyboard accessible and includes a dedicated touch navigation experience."],["How do I try each role?","Use one of the four demo accounts in the sign-in panel. Every demo account uses the password Campus@123."]].map(([q,a])=><details key={q}><summary>{q}<span>＋</span></summary><p>{a}</p></details>)}</section>
    <footer className="landing-footer"><div className="brand"><span className="brand-mark">C</span><span>Campus<b>One</b></span></div><p>Your campus, connected.</p><span>© 2026 CampusOne · DevFusion 4.0</span></footer>
    {authOpen&&<dialog open className="auth-backdrop"><section className="auth-card"><button className="modal-close" aria-label="Close authentication" onClick={()=>setAuthOpen(false)}>×</button><span className="auth-logo">C</span><h2>{mode==="login"?"Welcome back":mode==="signup"?"Create your account":mode==="verify"?"Verify your email":mode==="forgot"?"Reset your password":"Choose a new password"}</h2><p>{mode==="login"?"Sign in to your secure campus workspace.":mode==="signup"?"Student accounts require email verification.":mode==="verify"?"Enter the six-digit code generated for this demo.":mode==="forgot"?"We’ll generate a secure reset code.":"Enter the code and a strong new password."}</p>
      {mode==="login"&&<a className="google-button" href="/api/auth/google"><b>G</b> Continue with Google</a>}<form onSubmit={submit}>{mode==="signup"&&<label>Full name<input value={name} onChange={e=>setName(e.target.value)} required autoComplete="name" placeholder="Your full name"/></label>}{mode!=="verify"&&mode!=="reset"&&<label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" placeholder="you@college.edu"/></label>}{(mode==="login"||mode==="signup"||mode==="reset")&&<label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete={mode==="login"?"current-password":"new-password"} placeholder="Minimum 8 characters"/></label>}{(mode==="verify"||mode==="reset")&&<label>Six-digit code<input inputMode="numeric" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} required placeholder="000000"/></label>}{demoCode&&<div className="demo-code">Demo code: <strong>{demoCode}</strong></div>}{error&&<div className={error.startsWith("Password updated")?"auth-success":"auth-error"}>{error}</div>}<button className="primary full" disabled={busy}>{busy?"Please wait…":mode==="login"?"Sign in":mode==="signup"?"Create account":mode==="verify"?"Verify & continue":mode==="forgot"?"Generate reset code":"Update password"}</button></form>
      {mode==="login"&&<><button className="forgot-link" onClick={()=>{setMode("forgot");setError("")}}>Forgot password?</button><div className="auth-divider"><span>Demo accounts</span></div><div className="demo-users">{demos.map(d=><button key={d.role} onClick={()=>demoLogin(d)} disabled={busy}><span>{d.icon}</span><p><strong>{d.role}</strong><small>{d.email}</small></p></button>)}</div><p className="demo-password">Password for all demo accounts: <b>Campus@123</b></p></>}
      <div className="auth-switch">{mode==="login"?<>New to CampusOne? <button onClick={()=>setMode("signup")}>Create account</button></>:<>Already registered? <button onClick={()=>setMode("login")}>Back to sign in</button></>}</div>
    </section></dialog>}
  </main>
}
