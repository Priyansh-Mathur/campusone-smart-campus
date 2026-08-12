# CampusOne

CampusOne is a full-stack Smart Campus Management Platform built for DevFusion 4.0 Problem Statement 1. It provides secure, role-based student, faculty, coordinator and administrator workflows in one responsive application.

## Live application

https://campusone-smart-campus.panditanshul6266.chatgpt.site

## Demo accounts

All demo accounts use password `Campus@123`.

| Role | Email | Main capabilities |
|---|---|---|
| Student | `student@campusone.dev` | Submit assignments, register for events, apply for placements, join clubs |
| Faculty | `faculty@campusone.dev` | Save attendance sessions, create assignments, publish marks and feedback |
| Coordinator | `coordinator@campusone.dev` | Create events, clubs and announcements |
| Admin | `admin@campusone.dev` | Create role-bound users, manage campus content, permissions and audit history |

## Implemented product areas

- Marketing landing page with feature, impact, testimonial, FAQ and responsive sections
- Email/password sign-up, demo email verification, forgot/reset password, logout and protected routes
- Configuration-ready Google OAuth 2.0 with state validation
- Server-derived RBAC; the browser cannot switch or claim its own role
- Role-specific dashboards, global search, notifications, dark theme and mobile navigation
- Persistent user profiles, preferences, password change and account deletion controls
- Attendance analytics, downloadable CSV reports and persistent faculty sessions
- Assignment PDF/ZIP or GitHub submissions, faculty grading and feedback
- Event registration/cancellation plus a real scannable QR pass
- Placement applications with validated PDF/DOC/DOCX resume uploads
- Clubs, academic calendar and persistent messaging
- Admin user/content management, campus structures, permissions and immutable action history
- Validated R2 uploads (10 MB maximum), D1 persistence, rate limiting and same-origin write protection

## Stack

- React 19, TypeScript and Vinext App Router
- Cloudflare Workers, D1 and R2
- Drizzle ORM and generated SQL migrations
- bcrypt password hashing and opaque HttpOnly session cookies
- Sites hosting

## Run locally

Node.js 22.13 or newer is required.

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run lint
npm test
npm audit --omit=dev
```

Generate a migration after editing `db/schema.ts`:

```bash
npm run db:generate
```

## Google OAuth configuration

Copy `.env.example` and provide `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and the public `APP_ORIGIN`. Register this redirect URI with Google:

```text
https://YOUR-DOMAIN/api/auth/google/callback
```

The public demo intentionally leaves institutional Google credentials unset; all email/password and demo-role flows remain available.

## Architecture and API

- [Architecture and ER model](docs/architecture.md)
- [OpenAPI specification](docs/openapi.yaml)
- [PS-1 compliance report](docs/ps1-compliance.md)
- [Generated migrations](drizzle)

Campus workflow entities use a typed-record model while users, sessions, profiles, rate limits and object files use dedicated stores. Authorization is enforced in API routes with server-resolved session roles.

## Deploy

The repository contains `.openai/hosting.json`; Sites provisions the `DB` D1 binding and `FILES` R2 binding. Deploy through Sites after setting any optional OAuth environment variables. Never commit deployment secrets.

## License

MIT — see [LICENSE](LICENSE).
