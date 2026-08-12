import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the branded CampusOne bootstrap and landing source", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>CampusOne — Your campus, connected<\/title>/i);
  assert.match(html, /Opening CampusOne/i);
  assert.doesNotMatch(
    html,
    /codex-preview|Starter Project|Your site is taking shape/i,
  );
  const landing = await readFile(
    new URL("../app/Landing.tsx", import.meta.url),
    "utf8",
  );
  assert.match(landing, /One campus\./i);
  assert.match(landing, /Every possibility\./i);
  assert.match(landing, /Everything campus life needs\./i);
});

test("ships protected APIs, role policies and durable storage configuration", async () => {
  const [campus, auth, google, callback, upload, hosting, page, schema] =
    await Promise.all([
      readFile(new URL("../app/api/campus/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/auth/route.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/api/auth/google/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/auth/google/callback/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/api/uploads/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    ]);
  assert.match(auth, /Invalid email or password/);
  assert.match(auth, /verificationRequired/);
  assert.match(campus, /Authentication required/);
  assert.match(campus, /Admin access required/);
  assert.match(campus, /enforceRateLimit/);
  assert.match(campus, /trustedWriteOrigin/);
  assert.match(auth, /action === "profile"/);
  assert.match(auth, /action === "preferences"/);
  assert.match(google, /campusone_oauth_state/);
  assert.match(callback, /openidconnect\.googleapis\.com/);
  assert.match(upload, /10 \* 1024 \* 1024/);
  assert.match(upload, /R2Bucket/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": "FILES"/);
  assert.match(schema, /userProfiles/);
  assert.match(schema, /userRecordStatuses/);
  assert.match(campus, /user_record_statuses/);
  assert.match(page, /QRCodeSVG/);
  for (const moduleName of [
    "Attendance",
    "Assignments",
    "Events",
    "Announcements",
    "Placements",
    "Clubs",
    "Calendar",
    "Messages",
    "Settings",
    "Admin",
  ])
    assert.match(page, new RegExp(moduleName));
});
