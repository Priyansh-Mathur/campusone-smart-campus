import { env } from "cloudflare:workers";
type OAuthEnv={GOOGLE_CLIENT_ID?:string;APP_ORIGIN?:string};

export async function GET(request:Request){
  const config=env as unknown as OAuthEnv;
  const requestOrigin=new URL(request.url).origin;
  const appOrigin=config.APP_ORIGIN?.startsWith("https://")?config.APP_ORIGIN:requestOrigin;
  if(!config.GOOGLE_CLIENT_ID)return Response.redirect(`${appOrigin}/?oauth=unconfigured`,302);
  const state=crypto.randomUUID()+crypto.randomUUID();
  const authorize=new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorize.searchParams.set("client_id",config.GOOGLE_CLIENT_ID);
  authorize.searchParams.set("redirect_uri",`${appOrigin}/api/auth/google/callback`);
  authorize.searchParams.set("response_type","code");
  authorize.searchParams.set("scope","openid email profile");
  authorize.searchParams.set("state",state);
  authorize.searchParams.set("prompt","select_account");
  return new Response(null,{status:302,headers:{location:authorize.toString(),"Set-Cookie":`campusone_oauth_state=${state}; Path=/api/auth/google/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600`}});
}
