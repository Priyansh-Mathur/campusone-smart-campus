export const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";
export const MOBILE_CALLBACK_URI = "campusone://oauth/callback";

export const OAUTH_STATE_COOKIE = "campusone_oauth_state";
export const OAUTH_PKCE_COOKIE = "campusone_oauth_pkce";
export const OAUTH_MOBILE_COOKIE = "campusone_oauth_mobile";

const OAUTH_COOKIE_AGE_SECONDS = 10 * 60;
const TOKEN_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type OAuthReason =
  | "unconfigured"
  | "invalid_state"
  | "cancelled"
  | "provider_error"
  | "token_exchange"
  | "profile"
  | "unverified_email"
  | "account"
  | "temporarily_unavailable"
  | "invalid_mobile_request"
  | "invalid_handoff";

export type OAuthRuntimeConfig = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APP_ORIGIN?: string;
};

export type VerifiedGoogleProfile = {
  subject: string;
  email: string;
  name: string;
};

export class OAuthFlowError extends Error {
  readonly reason: OAuthReason;

  constructor(reason: OAuthReason) {
    super(reason);
    this.name = "OAuthFlowError";
    this.reason = reason;
  }
}

function isLocalHostname(hostname: string) {
  const value = hostname.toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "[::1]";
}

export function normalizeAppOrigin(requestUrl: string, configured?: string) {
  const requestOrigin = new URL(requestUrl).origin;
  if (!configured?.trim()) return requestOrigin;
  try {
    const candidate = new URL(configured.trim());
    const secure = candidate.protocol === "https:";
    const local = candidate.protocol === "http:" && isLocalHostname(candidate.hostname);
    if ((!secure && !local) || candidate.username || candidate.password) return requestOrigin;
    return candidate.origin;
  } catch {
    return requestOrigin;
  }
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
}

export async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

export function isValidVerifier(value: string | null | undefined) {
  return Boolean(value && TOKEN_PATTERN.test(value));
}

export function isValidChallenge(value: string | null | undefined) {
  return Boolean(value && CHALLENGE_PATTERN.test(value));
}

export function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rawValue] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(rawValue.join("="));
    } catch {
      return null;
    }
  }
  return null;
}

function oauthCookie(name: string, value: string, maxAge: number) {
  return `${name}=${encodeURIComponent(value)}; Path=${GOOGLE_CALLBACK_PATH}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function oauthAttemptCookies(state: string, verifier: string, appChallenge?: string) {
  const cookies = [
    oauthCookie(OAUTH_STATE_COOKIE, state, OAUTH_COOKIE_AGE_SECONDS),
    oauthCookie(OAUTH_PKCE_COOKIE, verifier, OAUTH_COOKIE_AGE_SECONDS),
  ];
  cookies.push(
    appChallenge
      ? oauthCookie(OAUTH_MOBILE_COOKIE, appChallenge, OAUTH_COOKIE_AGE_SECONDS)
      : oauthCookie(OAUTH_MOBILE_COOKIE, "", 0),
  );
  return cookies;
}

export function clearOAuthCookies() {
  return [
    oauthCookie(OAUTH_STATE_COOKIE, "", 0),
    oauthCookie(OAUTH_PKCE_COOKIE, "", 0),
    oauthCookie(OAUTH_MOBILE_COOKIE, "", 0),
  ];
}

export function redirectResponse(location: string, cookies: string[] = []) {
  const headers = new Headers({
    location,
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

export function oauthFailureResponse(origin: string, reason: OAuthReason, mobile = false) {
  const location = mobile ? new URL(MOBILE_CALLBACK_URI) : new URL("/", origin);
  location.searchParams.set(mobile ? "error" : "oauth", reason);
  return redirectResponse(location.toString(), clearOAuthCookies());
}

export function mobileSuccessResponse(code: string) {
  const location = new URL(MOBILE_CALLBACK_URI);
  location.searchParams.set("code", code);
  return redirectResponse(location.toString(), clearOAuthCookies());
}

export function googleAuthorizationUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}) {
  const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorize.searchParams.set("client_id", args.clientId);
  authorize.searchParams.set("redirect_uri", args.redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "openid email profile");
  authorize.searchParams.set("state", args.state);
  authorize.searchParams.set("code_challenge", args.codeChallenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("prompt", "select_account");
  return authorize;
}

export function normalizeGoogleProfile(value: unknown): VerifiedGoogleProfile | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const subject = typeof candidate.sub === "string" ? candidate.sub.trim() : "";
  const email = typeof candidate.email === "string" ? candidate.email.trim().toLowerCase() : "";
  const name = typeof candidate.name === "string" ? candidate.name.trim().slice(0, 120) : "";
  if (
    !subject ||
    subject.length > 255 ||
    !email ||
    email.length > 320 ||
    candidate.email_verified !== true
  ) {
    return null;
  }
  return { subject, email, name: name || email.split("@")[0] };
}

async function jsonBody(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export async function exchangeGoogleIdentity(args: {
  clientId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  fetcher?: typeof fetch;
}) {
  const fetcher = args.fetcher ?? fetch;
  let tokenResponse: Response;
  try {
    tokenResponse = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: args.code,
        client_id: args.clientId,
        client_secret: args.clientSecret,
        redirect_uri: args.redirectUri,
        grant_type: "authorization_code",
        code_verifier: args.codeVerifier,
      }),
    });
  } catch {
    throw new OAuthFlowError("temporarily_unavailable");
  }
  if (!tokenResponse.ok) throw new OAuthFlowError("token_exchange");
  const token = (await jsonBody(tokenResponse)) as Record<string, unknown> | null;
  const accessToken = typeof token?.access_token === "string" ? token.access_token : "";
  if (!accessToken) throw new OAuthFlowError("token_exchange");

  let profileResponse: Response;
  try {
    profileResponse = await fetcher("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new OAuthFlowError("temporarily_unavailable");
  }
  if (!profileResponse.ok) throw new OAuthFlowError("profile");
  const profile = normalizeGoogleProfile(await jsonBody(profileResponse));
  if (!profile) throw new OAuthFlowError("unverified_email");
  return profile;
}
