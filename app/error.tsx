"use client";

export default function ErrorPage({reset}:{error:Error&{digest?:string};reset:()=>void}) {
  return <main className="error-screen"><span className="brand-mark">C</span><p>500 · SOMETHING WENT WRONG</p><h1>CampusOne hit an unexpected problem.</h1><span>Your data is safe. Try loading this workspace again.</span><button className="primary" onClick={reset}>Try again</button></main>;
}
