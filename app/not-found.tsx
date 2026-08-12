import Link from "next/link";

export default function NotFound(){return <main className="error-screen"><span className="brand-mark">C</span><p>404 · PAGE NOT FOUND</p><h1>This campus page doesn’t exist.</h1><span>The link may have changed or you may not have access.</span><Link className="primary" href="/">Return to CampusOne</Link></main>}
