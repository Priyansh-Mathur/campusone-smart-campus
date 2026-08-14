import { env } from "cloudflare:workers";
import {
  consumeOAuthHandoff,
  createSession,
  enforceRateLimit,
  ensureAuthTables,
  getUserById,
  type SessionUser,
} from "../../../../../lib/auth";
import {
  isValidVerifier,
  normalizeAppOrigin,
  oauthFailureResponse,
  redirectResponse,
  type OAuthRuntimeConfig,
} from "../../../../../lib/oauth";

type ExchangeResult =
  | { ok: true; user: SessionUser; sessionCookie: string }
  | { ok: false; status: number; error: string };

function mobileJson(body: unknown, status: number, sessionCookie?: string) {
  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  if (sessionCookie) headers.set("Set-Cookie", sessionCookie);
  return Response.json(body, { status, headers });
}

async function exchangeHandoff(
  request: Request,
  code: string,
  verifier: string,
): Promise<ExchangeResult> {
  if (!isValidVerifier(code) || !isValidVerifier(verifier)) {
    return {
      ok: false,
      status: 400,
      error: "Enter a valid OAuth handoff code and verifier.",
    };
  }
  try {
    await ensureAuthTables();
    if (!(await enforceRateLimit(request, "oauth-mobile", 8, 60))) {
      return {
        ok: false,
        status: 429,
        error: "Too many sign-in attempts. Please wait a minute.",
      };
    }
    const userId = await consumeOAuthHandoff(code, verifier);
    if (!userId) {
      return {
        ok: false,
        status: 401,
        error: "This sign-in link is invalid, expired, or already used.",
      };
    }
    const user = await getUserById(userId);
    if (!user) {
      return {
        ok: false,
        status: 410,
        error: "The linked campus account no longer exists.",
      };
    }
    return { ok: true, user, sessionCookie: await createSession(userId) };
  } catch {
    return {
      ok: false,
      status: 503,
      error: "Google sign-in is temporarily unavailable. Please try again.",
    };
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await exchangeHandoff(
    request,
    url.searchParams.get("code")?.trim() ?? "",
    url.searchParams.get("verifier")?.trim() ?? "",
  );
  const config = env as unknown as OAuthRuntimeConfig;
  const origin = normalizeAppOrigin(request.url, config.APP_ORIGIN);
  if (!result.ok) {
    return oauthFailureResponse(
      origin,
      result.status === 503 || result.status === 429
        ? "temporarily_unavailable"
        : "invalid_handoff",
    );
  }
  return redirectResponse(origin, [result.sessionCookie]);
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return mobileJson({ error: "Enter a valid OAuth handoff code and verifier." }, 400);
  }
  const result = await exchangeHandoff(
    request,
    typeof payload.code === "string" ? payload.code.trim() : "",
    typeof payload.verifier === "string" ? payload.verifier.trim() : "",
  );
  return result.ok
    ? mobileJson({ user: result.user }, 200, result.sessionCookie)
    : mobileJson({ error: result.error }, result.status);
}
