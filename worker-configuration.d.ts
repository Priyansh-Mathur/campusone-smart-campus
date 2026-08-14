declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    ASSETS: Fetcher;
    APP_ORIGIN?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
  }
}
