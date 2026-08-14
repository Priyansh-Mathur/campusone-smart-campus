import { env } from "cloudflare:workers";
import {
  createOAuthHandoff,
  createSession,
  linkGoogleIdentity,
} from "../../../../../lib/auth";
import {
  GOOGLE_CALLBACK_PATH,
  OAUTH_MOBILE_COOKIE,
  OAUTH_PKCE_COOKIE,
  OAUTH_STATE_COOKIE,
  OAuthFlowError,
  clearOAuthCookies,
  exchangeGoogleIdentity,
  isValidChallenge,
  isValidVerifier,
  mobileSuccessResponse,
  normalizeAppOrigin,
  oauthFailureResponse,
  readCookie,
  redirectResponse,
  type OAuthReason,
  type OAuthRuntimeConfig,
} from "../../../../../lib/oauth";

export async function GET(request: Request) {
  const config = env as unknown as OAuthRuntimeConfig;
  const url = new URL(request.url);
  const origin = normalizeAppOrigin(request.url, config.APP_ORIGIN);
  const mobileCookie = readCookie(request, OAUTH_MOBILE_COOKIE);
  const appChallenge = isValidChallenge(mobileCookie) ? mobileCookie : null;
  const mobile = Boolean(appChallenge);
  const fail = (reason: OAuthReason) => oauthFailureResponse(origin, reason, mobile);

  const clientId = config.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = config.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return fail("unconfigured");

  const state = url.searchParams.get("state");
  const expectedState = readCookie(request, OAUTH_STATE_COOKIE);
  if (!state || !expectedState || state !== expectedState) return fail("invalid_state");

  const providerError = url.searchParams.get("error");
  if (providerError) {
    return fail(providerError === "access_denied" ? "cancelled" : "provider_error");
  }
  const code = url.searchParams.get("code");
  const codeVerifier = readCookie(request, OAUTH_PKCE_COOKIE);
  if (!code || !isValidVerifier(codeVerifier)) return fail("invalid_state");

  try {
    const profile = await exchangeGoogleIdentity({
      clientId,
      clientSecret,
      code,
      codeVerifier: codeVerifier!,
      redirectUri: `${origin}${GOOGLE_CALLBACK_PATH}`,
    });
    const userId = await linkGoogleIdentity(profile);
    if (mobile && appChallenge) {
      const handoffCode = await createOAuthHandoff(userId, appChallenge);
      return mobileSuccessResponse(handoffCode);
    }
    const sessionCookie = await createSession(userId);
    return redirectResponse(origin, [sessionCookie, ...clearOAuthCookies()]);
  } catch (error) {
    if (error instanceof OAuthFlowError) return fail(error.reason);
    return fail("temporarily_unavailable");
  }
}
