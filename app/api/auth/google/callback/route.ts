import { env } from "cloudflare:workers";
import { hash } from "bcryptjs";
import { createSession, ensureAuthTables } from "../../../../../lib/auth";

type OAuthEnv={GOOGLE_CLIENT_ID?:string;GOOGLE_CLIENT_SECRET?:string;APP_ORIGIN?:string};
type GoogleUser={email?:string;name?:string;email_verified?:boolean};

function cookieValue(request:Request,name:string){const cookies=request.headers.get("cookie")??"";for(const item of cookies.split(";")){const [key,...value]=item.trim().split("=");if(key===name)return decodeURIComponent(value.join("="))}return null}
function failed(origin:string,reason:string){return Response.redirect(`${origin}/?oauth=${encodeURIComponent(reason)}`,302)}

export async function GET(request:Request){
  const config=env as unknown as OAuthEnv;const url=new URL(request.url);const origin=config.APP_ORIGIN?.startsWith("https://")?config.APP_ORIGIN:url.origin;
  if(!config.GOOGLE_CLIENT_ID||!config.GOOGLE_CLIENT_SECRET)return failed(origin,"unconfigured");
  const code=url.searchParams.get("code");const state=url.searchParams.get("state");
  if(!code||!state||state!==cookieValue(request,"campusone_oauth_state"))return failed(origin,"invalid_state");
  const tokenResponse=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:config.GOOGLE_CLIENT_ID,client_secret:config.GOOGLE_CLIENT_SECRET,redirect_uri:`${origin}/api/auth/google/callback`,grant_type:"authorization_code"})});
  if(!tokenResponse.ok)return failed(origin,"token_exchange");
  const token=await tokenResponse.json() as {access_token?:string};if(!token.access_token)return failed(origin,"token_exchange");
  const profileResponse=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{authorization:`Bearer ${token.access_token}`}});
  if(!profileResponse.ok)return failed(origin,"profile");
  const profile=await profileResponse.json() as GoogleUser;const email=profile.email?.trim().toLowerCase();
  if(!email||profile.email_verified===false)return failed(origin,"unverified_email");
  await ensureAuthTables();let user=await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first<{id:number}>();
  if(!user){user=await env.DB.prepare("INSERT INTO users(name,email,password_hash,role,verified,created_at) VALUES(?,?,?,?,1,?) RETURNING id").bind(profile.name?.trim()||email.split("@")[0],email,await hash(crypto.randomUUID(),10),"Student",Date.now()).first<{id:number}>()}
  if(!user)return failed(origin,"account");
  const sessionCookie=await createSession(user.id);const headers=new Headers({location:origin});headers.append("Set-Cookie",sessionCookie);headers.append("Set-Cookie","campusone_oauth_state=; Path=/api/auth/google/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  return new Response(null,{status:302,headers});
}
