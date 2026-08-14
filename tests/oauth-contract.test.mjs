import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  clearOAuthCookies,
  googleAuthorizationUrl,
  mobileSuccessResponse,
  normalizeAppOrigin,
  normalizeGoogleProfile,
  oauthAttemptCookies,
  oauthFailureResponse,
  randomToken,
  sha256Base64Url,
} from "../lib/oauth.ts";

const productionOrigin =
  "https://campusone-smart-campus.panditanshul6266.chatgpt.site";

function setCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie().join(", ");
  }
  return response.headers.get("set-cookie") ?? "";
}

function appChallenge(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

test("Google identity validation requires a verified email and stable subject", () => {
  assert.equal(
    normalizeGoogleProfile({
      sub: "google-user-1",
      email: "student@example.com",
      email_verified: false,
    }),
    null,
  );
  assert.equal(
    normalizeGoogleProfile({
      email: "student@example.com",
      email_verified: true,
    }),
    null,
  );
  assert.deepEqual(
    normalizeGoogleProfile({
      sub: "google-user-1",
      email: " Student@Example.com ",
      email_verified: true,
      name: "Campus Student",
    }),
    {
      subject: "google-user-1",
      email: "student@example.com",
      name: "Campus Student",
    },
  );
});

test("Google authorization uses state, S256 PKCE and hardened cookies", async () => {
  const state = randomToken(32);
  const verifier = randomToken(32);
  const challenge = await sha256Base64Url(verifier);
  const authorize = googleAuthorizationUrl({
    clientId: "test-client.apps.googleusercontent.com",
    redirectUri: `${productionOrigin}/api/auth/google/callback`,
    state,
    codeChallenge: challenge,
  });
  assert.equal(authorize.origin, "https://accounts.google.com");
  assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorize.searchParams.get("code_challenge"), challenge);
  assert.equal(authorize.searchParams.get("state"), state);
  assert.match(challenge, /^[\w-]{43}$/);

  const cookies = oauthAttemptCookies(state, verifier).join(", ");
  assert.match(cookies, /campusone_oauth_state=/);
  assert.match(cookies, /campusone_oauth_pkce=/);
  assert.match(cookies, /HttpOnly/i);
  assert.match(cookies, /Secure/i);
  assert.match(cookies, /SameSite=Lax/i);
});

test("OAuth failures are private, friendly redirects that clear all transient cookies", () => {
  const response = oauthFailureResponse(productionOrigin, "cancelled");
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    `${productionOrigin}/?oauth=cancelled`,
  );
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  const cleared = setCookies(response);
  for (const name of [
    "campusone_oauth_state",
    "campusone_oauth_pkce",
    "campusone_oauth_mobile",
  ]) {
    assert.match(cleared, new RegExp(`${name}=.*Max-Age=0`));
  }
  assert.equal(clearOAuthCookies().length, 3);
});

test("OAuth origin normalization supports localhost and rejects unsafe configured origins", () => {
  assert.equal(
    normalizeAppOrigin(
      "http://127.0.0.1:8787/api/auth/google",
      "http://localhost:3000/superfluous/path/",
    ),
    "http://localhost:3000",
  );
  assert.equal(
    normalizeAppOrigin(
      `${productionOrigin}/api/auth/google`,
      "http://attacker.example/path",
    ),
    productionOrigin,
  );
  assert.equal(
    normalizeAppOrigin(
      `${productionOrigin}/api/auth/google`,
      `${productionOrigin}/trailing/path/`,
    ),
    productionOrigin,
  );
});

test("Android handoff is bound to the app challenge and uses a fixed deep link", () => {
  const verifier = "A".repeat(64);
  const challenge = appChallenge(verifier);
  assert.match(challenge, /^[\w-]{43}$/);
  const cookies = oauthAttemptCookies(randomToken(32), randomToken(32), challenge);
  assert.match(cookies.join(", "), new RegExp(`campusone_oauth_mobile=${challenge}`));
  const response = mobileSuccessResponse("B".repeat(43));
  assert.equal(
    response.headers.get("location"),
    `campusone://oauth/callback?code=${"B".repeat(43)}`,
  );
});

test("OAuth routes enforce deployment, identity and one-time Android contracts", async () => {
  const [start, oauth, auth, callback, mobile, schema, migration] = await Promise.all([
    readFile(new URL("../app/api/auth/google/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/oauth.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/auth.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/auth/google/callback/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/auth/google/mobile/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0005_special_nehzno.sql", import.meta.url), "utf8"),
  ]);
  assert.match(start, /GOOGLE_CLIENT_ID\?\.trim/);
  assert.match(start, /searchParams\.get\("client"\) === "android"/);
  assert.match(start, /searchParams\.get\("code_challenge"\)/);
  assert.match(oauth, /candidate\.email_verified !== true/);
  assert.match(oauth, /code_verifier: args\.codeVerifier/);
  assert.match(auth, /provider_subject/);
  assert.match(auth, /UPDATE users SET verified=1/);
  assert.match(auth, /used_at IS NULL AND expires_at>\?/);
  assert.match(callback, /createOAuthHandoff/);
  assert.match(callback, /mobileSuccessResponse/);
  assert.match(mobile, /export async function GET/);
  assert.match(mobile, /searchParams\.get\("code"\)/);
  assert.match(mobile, /searchParams\.get\("verifier"\)/);
  assert.match(mobile, /redirectResponse\(origin, \[result\.sessionCookie\]\)/);
  assert.match(schema, /oauthIdentities/);
  assert.match(schema, /oauthHandoffs/);
  assert.match(migration, /ALTER TABLE `users` ADD `credential_kind`/);
});
