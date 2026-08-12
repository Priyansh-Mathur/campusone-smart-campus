import { env } from "cloudflare:workers";
import { enforceRateLimit, getSessionUser, jsonError, trustedWriteOrigin } from "../../../lib/auth";

const maxSize = 10 * 1024 * 1024;
const allowedExtensions: Record<string,string[]> = {
  assignment:["pdf","zip"], resume:["pdf","doc","docx"], material:["pdf","ppt","pptx","doc","docx","zip"], profile:["jpg","jpeg","png","webp"],
};

export async function POST(request: Request) {
  if (!trustedWriteOrigin(request)) return jsonError("Untrusted request origin",403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("Authentication required",401);
  if (!(await enforceRateLimit(request,"upload",10,60))) return jsonError("Upload limit reached. Try again in a minute.",429);
  const form = await request.formData();
  const file = form.get("file");
  const purpose = String(form.get("purpose")??"assignment");
  if (!(file instanceof File)) return jsonError("Choose a file to upload");
  const extension = file.name.split(".").pop()?.toLowerCase()??"";
  if (!(allowedExtensions[purpose]??[]).includes(extension)) return jsonError(`Unsupported ${purpose} file type`);
  if (!file.size || file.size>maxSize) return jsonError("File must be between 1 byte and 10 MB");
  if (purpose==="material"&&!(["Faculty","Admin"] as string[]).includes(user.role)) return jsonError("Faculty access required",403);
  const bucket = (env as unknown as {FILES:R2Bucket}).FILES;
  const key = `${purpose}/${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
  await bucket.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type||"application/octet-stream"},customMetadata:{ownerId:String(user.id),originalName:file.name,purpose}});
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS records (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', meta TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL)").run();
  await env.DB.prepare("INSERT INTO records(kind,title,subtitle,status,meta,created_at) VALUES(?,?,?,?,?,?)")
    .bind("upload",file.name,`${purpose} upload by ${user.name}`,"stored",JSON.stringify({key,purpose,size:file.size,ownerId:user.id}),Date.now()).run();
  await env.DB.prepare("INSERT INTO activity(message,actor,created_at) VALUES(?,?,?)").bind(`Uploaded ${purpose}: ${file.name}`,user.name,Date.now()).run();
  return Response.json({file:{name:file.name,key,size:file.size,purpose}},{status:201});
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("Authentication required",401);
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return jsonError("File key required");
  const metadata = await env.DB.prepare("SELECT meta FROM records WHERE kind='upload' AND json_extract(meta,'$.key')=?").bind(key).first<{meta:string}>();
  if (!metadata) return jsonError("File not found",404);
  const meta = JSON.parse(metadata.meta) as {ownerId:number};
  if (user.role!=="Admin"&&user.role!=="Faculty"&&meta.ownerId!==user.id) return jsonError("Access denied",403);
  const object = await (env as unknown as {FILES:R2Bucket}).FILES.get(key);
  if (!object) return jsonError("File not found",404);
  const headers = new Headers(); object.writeHttpMetadata(headers); headers.set("etag",object.httpEtag); headers.set("content-disposition","attachment");
  return new Response(object.body,{headers});
}
