# CampusOne

CampusOne is a production-deployed Smart Campus Management Platform built for DevFusion 4.0 Problem Statement 1. It brings student, faculty, coordinator and administrator workflows into one responsive campus workspace.

## Live application

https://campusone-smart-campus.panditanshul6266.chatgpt.site

## Working modules

- Role-aware dashboards for Student, Faculty, Coordinator and Admin
- Subject-wise attendance analytics and faculty attendance marking
- Assignment creation, submission, review and status tracking
- Campus event creation, registration and cancellation
- Placement discovery, skill matching and application tracking
- Student club discovery and membership controls
- Academic calendar with classes, deadlines and events
- Persistent faculty/student messaging
- Admin announcements, quick controls and audit activity
- Global search, dark theme and responsive mobile navigation

All write operations use a Cloudflare D1 database and survive page refreshes and new sessions.

## Tech stack

- React 19 + TypeScript
- Vinext / Next.js-compatible App Router
- Tailwind CSS 4 and custom responsive CSS
- Cloudflare Workers
- Cloudflare D1 / SQLite
- Drizzle ORM and migrations
- Sites production hosting

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Run a production build:

```bash
npm run build
```

Generate migrations after changing `db/schema.ts`:

```bash
npm run db:generate
```

## Demo roles

Use the role selector in the top navigation. No password is required for the public hackathon demo.

| Role | Demo user | Capabilities |
|---|---|---|
| Student | Aarav Mehta | Submit assignments, register events, apply for placements, join clubs |
| Faculty | Dr. Maya Kapoor | Take attendance, create assignments, review work |
| Coordinator | Riya Sharma | Create events and publish campus updates |
| Admin | Vikram Rao | Manage content, view system statistics and audit activity |

## Architecture

```text
Browser UI (React)
      |
      v
/api/campus (Cloudflare Worker route)
      |
      v
Cloudflare D1 (records + activity audit log)
```

The API uses prepared statements, server-side validation and an indexed `kind` column for module filtering. `records` stores typed campus entities; `activity` records protected write actions for the admin audit view.

## Key source locations

- `app/page.tsx` — application modules and interactive workflows
- `app/globals.css` — responsive design system and dark theme
- `app/api/campus/route.ts` — persistent CRUD API and seed data
- `db/schema.ts` — relational schema
- `drizzle/` — generated SQL migrations
- `.openai/hosting.json` — Sites and D1 configuration

## Security notes

This repository is a public hackathon demonstration. Its role switcher demonstrates authorization-aware UI flows; a college deployment should connect roles to verified institutional accounts and enforce every permission server-side. API inputs are parameterized and database access uses prepared statements.

## License

MIT
