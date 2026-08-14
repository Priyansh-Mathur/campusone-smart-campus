import { env } from "cloudflare:workers";
import {
  GOOGLE_CALLBACK_PATH,
  googleAuthorizationUrl,
  isValidChallenge,
  normalizeAppOrigin,
  oauthAttemptCookies,
  oauthFailureResponse,
  randomToken,
  redirectResponse,
  sha256Base64Url,
  type OAuthRuntimeConfig,
} from "../../../../lib/oauth";

export async function GET(request: Request) {
  const config = env as unknown as OAuthRuntimeConfig;
  const requestUrl = new URL(request.url);
  const origin = normalizeAppOrigin(request.url, config.APP_ORIGIN);
  const mobile =
    requestUrl.searchParams.get("client") === "android" ||
    requestUrl.searchParams.get("platform") === "android" ||
    requestUrl.searchParams.get("mobile") === "1";
  const appChallenge =
    requestUrl.searchParams.get("code_challenge") ??
    requestUrl.searchParams.get("app_challenge");

  if (mobile && !isValidChallenge(appChallenge)) {
    return oauthFailureResponse(origin, "invalid_mobile_request", true);
  }
  const clientId = config.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) return oauthFailureResponse(origin, "unconfigured", mobile);

  if (requestUrl.origin !== origin) {
    const canonical = new URL("/api/auth/google", origin);
    if (mobile) {
      canonical.searchParams.set("client", "android");
      canonical.searchParams.set("code_challenge", appChallenge!);
    }
    return redirectResponse(canonical.toString());
  }

  const state = randomToken(32);
  const codeVerifier = randomToken(32);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const authorize = googleAuthorizationUrl({
    clientId,
    redirectUri: `${origin}${GOOGLE_CALLBACK_PATH}`,
    state,
    codeChallenge,
  });
  return redirectResponse(
    authorize.toString(),
    oauthAttemptCookies(state, codeVerifier, mobile ? appChallenge! : undefined),
  );
}
