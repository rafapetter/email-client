# emai-client

A Superhuman-style email client built with Next.js. Designed as the human interface for reviewing and managing what AI agents do with your email using the [@petter100/emai](https://www.npmjs.com/package/@petter100/emai) SDK.

## Features

- 3-pane layout (sidebar, email list, email detail)
- IMAP/SMTP email sync with multiple account support
- AI-powered email enrichment (priority, classification, summaries, action items)
- Hybrid search (BM25 full-text + optional semantic search)
- Workflow rules engine with AI conditions and actions
- Keyboard shortcuts throughout
- Dark mode support

## Quick Start

```bash
# Clone and install
git clone https://github.com/rafatandom/email-client.git
cd email-client
npm install

# Generate secrets
cp .env.example .env.local
# Edit .env.local — at minimum set:
#   NEXTAUTH_SECRET (run: openssl rand -base64 32)
#   ENCRYPTION_KEY  (run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Run migrations and start
npm run db:migrate
npm run dev
```

Open [http://localhost:3004](http://localhost:3004) and add your email account.

## Database

By default, emai-client uses a **local SQLite file** at `./data/email-client.db` — no external database needed.

For cloud deployments (e.g. Vercel), set these env vars to use a remote [Turso](https://turso.tech) / LibSQL database:

```
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token
```

## Docker

```bash
# Build
docker build -t emai-client .

# Run (local SQLite, data persisted in volume)
docker run -d \
  -p 3004:3004 \
  -v emai-data:/app/data \
  -e NEXTAUTH_SECRET=$(openssl rand -base64 32) \
  -e NEXTAUTH_URL=http://localhost:3004 \
  -e ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  emai-client

# Run (with remote Turso database)
docker run -d \
  -p 3004:3004 \
  -e NEXTAUTH_SECRET=your-secret \
  -e NEXTAUTH_URL=http://localhost:3004 \
  -e ENCRYPTION_KEY=your-key \
  -e TURSO_DATABASE_URL=libsql://your-db.turso.io \
  -e TURSO_AUTH_TOKEN=your-token \
  emai-client
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXTAUTH_SECRET` | Yes | — | Session encryption key |
| `NEXTAUTH_URL` | Yes | `http://localhost:3004` | App URL |
| `ENCRYPTION_KEY` | Yes | — | 32-byte hex key for encrypting email credentials |
| `TURSO_DATABASE_URL` | No | `file:./data/email-client.db` | LibSQL/Turso database URL |
| `TURSO_AUTH_TOKEN` | No | — | Turso auth token (only for remote DB) |

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: SQLite via @libsql/client + Drizzle ORM
- **Auth**: NextAuth.js v5
- **Email**: @petter100/emai SDK (IMAP/SMTP, AI, search)
- **UI**: Tailwind CSS v4 + shadcn/ui + Zustand
