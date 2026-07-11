<div align="center">

# OpenAgentTelemetry

**Open-Source AI Agent Observability Platform · Self-Hosted · Data Sovereignty**

[![CI](https://github.com/future-fantasy-org/OpenAgentTelemetry/actions/workflows/ci.yml/badge.svg)](https://github.com/future-fantasy-org/OpenAgentTelemetry/actions/workflows/ci.yml)
[![Docker](https://github.com/future-fantasy-org/OpenAgentTelemetry/actions/workflows/docker-build.yml/badge.svg)](https://github.com/future-fantasy-org/OpenAgentTelemetry/actions/workflows/docker-build.yml)
[![License: MIT](https://img.shields.io/github/license/future-fantasy-org/OpenAgentTelemetry?color=yellow)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/future-fantasy-org/OpenAgentTelemetry?style=social)](https://github.com/future-fantasy-org/OpenAgentTelemetry/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/future-fantasy-org/OpenAgentTelemetry)](https://github.com/future-fantasy-org/OpenAgentTelemetry/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/future-fantasy-org/OpenAgentTelemetry)](https://github.com/future-fantasy-org/OpenAgentTelemetry/pulls)
[![Last Commit](https://img.shields.io/github/last-commit/future-fantasy-org/OpenAgentTelemetry)](https://github.com/future-fantasy-org/OpenAgentTelemetry/commits/main)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node-%3E%3D20-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-workspaces-orange.svg)](https://pnpm.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-%3E%3D15-blue.svg)](https://www.postgresql.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Trace LLM Calls · Visualize Agent Execution Paths · Evaluate Experiments · Manage Prompt Versions

[中文文档](./README.zh-CN.md) | [Documentation](./docs/README.md) | [Changelog](./CHANGELOG.md)

</div>

---

## Table of Contents

- [Introduction](#introduction)
- [Core Features](#core-features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [SDK Usage](#sdk-usage)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Development Guide](#development-guide)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Introduction

OpenAgentTelemetry (OAT) is a **self-hostable, open-source AI Agent observability platform**, comparable to [Langfuse](https://langfuse.com) / [LangSmith](https://smith.langchain.com).

**Why do you need it?** When your application integrates LLMs (Large Language Models), a single user request may trigger dozens of LLM calls, tool invocations, and retrieval operations. These calls form complex execution paths (traces). You need to:

- **See** the input, output, latency, and token consumption of every LLM call
- **Trace** the entire Agent execution path to pinpoint where things went wrong
- **Evaluate** whether output quality meets standards, and compare different Prompts / models side by side
- **Manage** Prompt template versions with support for rollback and A/B testing

**Why choose OAT?**

| Feature | LangSmith | Langfuse | **OAT** |
|---------|-----------|----------|---------|
| Self-hosted | ✗ | Enterprise only | **✓ Free & open source** |
| Data sovereignty | ✗ SaaS | Partial | **✓ Full control** |
| TypeScript full-stack | ✗ Python | Partial | **✓ Unified frontend & backend** |
| Deployment complexity | — | Medium (ClickHouse) | **Low (single Postgres)** |

---

## Core Features

### Tracing (M1 + M2)

- **SDK Decorator** — Wrap any async function with `traceable`, automatically maintains parent-child relationships via `AsyncLocalStorage` — no manual parentId needed
- **Batch Upload** — SDK built-in batch buffering + timed flush, minimizing performance impact on the host application
- **Ingestion API** — High-throughput data ingestion with API Key authentication + Zod runtime validation
- **Trace List** — REST API to query by Project, Next.js frontend with server-side rendered table
- **Trace Detail Page** — Tree structure displaying observation hierarchy, waterfall timeline for latency visualization, full input/output/model/tokens/cost display

### Evaluation & Scoring (M3)

- **Dataset Management** — Create test sets, add test cases (input + expectedOutput), full CRUD support
- **Scoring API** — Score traces via API Key (numeric values), supports manual annotation and automated evaluation
- **Score Query** — Aggregate all scores by trace, displayed on the frontend detail page

### Prompt Management (M4)

- **Versioning** — One Prompt maps to multiple versions, supports rollback and comparison
- **Variable Interpolation** — `{{name}}` / `{{name:default}}` syntax with dynamic render preview
- **Variable Extraction** — Automatically extracts variable list from templates, frontend generates input forms accordingly
- **Label Tagging** — Versions can be tagged (e.g. `production`, `experiment`) with active version switching

### Dashboard Statistics (M5)

- **Time Series Aggregation** — 1h / 24h / 7d / 30d time ranges with adaptive bucket granularity (minute / hour / day)
- **Latency Percentiles** — PostgreSQL `percentile_cont` for p50 / p90 / p99 latency calculation
- **Tokens & Cost** — prompt_tokens / completion_tokens / total_cost aggregated by time bucket
- **Top Models** — Group by model, show call count and cost, top 5
- **Score Distribution** — Group by score name, show average value and count
- **Recharts Visualization** — Area / Line / Bar charts, 4 summary cards

### Authentication (M6)

- **Single Admin Login** — Email + password, argon2 hash storage, bootstrapped from environment variables on startup (idempotent)
- **Cookie + JWT** — httpOnly cookie stores JWT, 7-day expiry, stateless session
- **Global Route Guard** — Fastify preHandler hook protects all `/api/*` (SDK ingestion and login endpoints exempted)
- **Frontend Login Guard** — Next.js Edge Middleware checks cookie, redirects to `/login` if unauthenticated

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Backend** | Fastify | Lightweight & high-performance, built-in schema validation, 2x faster than Express |
| **ORM** | Drizzle | Transparent SQL, doesn't hide database behavior, type-safe |
| **Database** | PostgreSQL | Single DB to start, Repository abstraction layer preserves future ClickHouse migration path |
| **Frontend** | Next.js 14 (App Router) | Great SSR performance, mature React ecosystem |
| **Styling** | Tailwind CSS | Atomic CSS, high development efficiency |
| **SDK** | TypeScript | Shares Zod schema with backend, type consistency across stack |
| **Auth** | argon2 + jose | argon2 password hashing (prebuilt napi-rs), jose for JWT sign/verify |
| **Charts** | Recharts | Declarative React charts, Area / Line / Bar out of the box |
| **Validation** | Zod | Runtime validation + TS type inference in one shot |
| **Package Manager** | pnpm workspaces | Hardlinks save disk space, workspace protocol for monorepo |

---

## Quick Start

### Option 1: Docker Compose (Recommended)

```bash
git clone https://github.com/future-fantasy-org/OpenAgentTelemetry.git
cd OpenAgentTelemetry

docker compose up -d
```

Access after startup:

| Service | URL |
|---------|-----|
| Web UI | http://localhost:3000/login |
| Server API | http://localhost:3001 |
| PostgreSQL | localhost:5432 |

Default admin credentials: `admin@oat.dev` / `admin123` (configurable via `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables).

### Option 2: Local Development

**Prerequisites:** Node.js ≥ 20, pnpm ≥ 9, PostgreSQL

```bash
pnpm install

# 1. Start Postgres and create database
createdb oat

# 2. Run database migrations + seed data
DATABASE_URL=postgresql://localhost:5432/oat \
  pnpm --filter @oat/server exec tsx ../../scripts/seed.ts

# 3. Start backend (terminal 1)
DATABASE_URL=postgresql://localhost:5432/oat \
  JWT_SECRET=your-secret-string \
  ADMIN_EMAIL=admin@oat.dev \
  ADMIN_PASSWORD=admin123 \
  pnpm dev:server

# 4. Start frontend (terminal 2)
SEED_PROJECT_ID=<projectId from step above> pnpm dev:web
```

---

## SDK Usage

### Installation

```bash
pnpm add @oat/sdk-ts
# or
npm install @oat/sdk-ts
```

### Minimal Example

```typescript
import { OATClient, traceable, setDefaultClient, resetTraceId } from '@oat/sdk-ts';

const client = new OATClient({
  baseUrl: 'http://localhost:3001',
  apiKey: 'your-api-key',
  flushAt: 50,       // flush after 50 events
  flushInterval: 1000, // or flush every second
});

setDefaultClient(client);
resetTraceId(); // reset traceId at the start of each request

// Wrap any async function with traceable to auto-record execution path
const greet = traceable(async (name: string) => {
  return `Hello, ${name}!`;
});

await greet('World');
// → trace automatically reported to OAT platform
```

### Automatic Tree Building

`traceable` uses Node.js `AsyncLocalStorage` to automatically maintain parent-child relationships — **no manual parentId needed**:

```typescript
const outer = traceable(async () => {
  console.log(getCurrentObservationId()); // 'outer-uuid'
  await inner(); // child call automatically uses 'outer-uuid' as parent
});

const inner = traceable(async () => {
  console.log(getCurrentParentId()); // 'outer-uuid'
});
```

---

## API Reference

> All `/api/*` routes require a login cookie (`oat_session` JWT), except `/api/public/*` (SDK ingestion, API Key auth), `/api/auth/login`, and `/health`.

### Health Check

```
GET /health
→ { "status": "ok" }
```

### Authentication

```
POST /api/auth/login
Content-Type: application/json

{ "email": "admin@oat.dev", "password": "admin123" }

→ { "user": { "id": "...", "email": "...", "role": "admin" } }
  + Set-Cookie: oat_session=<jwt>; HttpOnly; SameSite=Lax; Max-Age=604800

POST /api/auth/logout
→ { "ok": true }

GET /api/auth/me
→ { "user": { "id": "...", "email": "...", "role": "admin" } }
```

### Data Ingestion (SDK, API Key Auth)

```
POST /api/public/ingestion
Authorization: Bearer <api-key>
Content-Type: application/json

{
  "batch": [
    {
      "id": "obs-uuid",
      "traceId": "trace-uuid",
      "parentId": null,
      "type": "span",          // span | generation | event
      "name": "llm-call",
      "startTime": "2026-07-09T10:00:00.000Z",
      "endTime": "2026-07-09T10:00:01.500Z",
      "input": { "messages": [...] },
      "output": { "content": "..." },
      "metadata": { "model": "gpt-4o" },
      "level": "default"        // default | debug | warning | error
    }
  ]
}

→ { "accepted": 1 }
```

### Traces

```
GET /api/traces?projectId=<uuid>&limit=50
→ { "traces": [{ "id", "name", "userId", "sessionId", "timestamp" }] }

GET /api/traces/:id
→ { "id", "name", "input", "output", "metadata", "observations": [...] }
```

### Scores

```
POST /api/public/scores
Authorization: Bearer <api-key>

{ "traceId": "...", "name": "helpfulness", "value": 0.85, "comment": "..." }
→ { "id": "..." }

GET /api/traces/:id/scores
→ { "scores": [{ "id", "name", "value", "comment", "source", "createdAt" }] }
```

### Datasets

```
GET /api/datasets?projectId=<uuid>
→ { "datasets": [{ "id", "name", "description", "createdAt" }] }

GET /api/datasets/:id
→ { "dataset": { ... }, "items": [{ "id", "input", "expectedOutput", ... }] }

POST /api/datasets
{ "projectId": "...", "name": "Test Set A", "description": "..." }
→ { "id": "..." }

POST /api/datasets/:id/items
{ "input": { ... }, "expectedOutput": { ... } }
→ { "id": "..." }
```

### Prompt Management

```
GET /api/prompts?projectId=<uuid>
→ { "prompts": [{ "id", "name", "description", "latestVersion", "updatedAt" }] }

GET /api/prompts/:id
→ { "prompt": { ... }, "versions": [{ "version", "template", "labels", "isActive", ... }] }

POST /api/prompts
{ "projectId": "...", "name": "greeting", "template": "Hello {{name}}!" }
→ { "id": "...", "version": 1 }

POST /api/prompts/:id/versions
{ "template": "Hi {{name:there}}!", "labels": ["production"] }
→ { "version": 2 }

POST /api/prompts/:id/render
{ "variables": { "name": "World" } }
→ { "rendered": "Hello World!", "version": 1 }

GET /api/prompts/:id/variables
→ { "variables": ["name"] }
```

### Dashboard Statistics

```
GET /api/stats/overview?projectId=<uuid>&range=24h
// range: 1h | 24h | 7d | 30d

→ {
    "range": "24h",
    "series": [{ "bucket", "traceCount", "p50LatencyMs", "p90LatencyMs", "p99LatencyMs", "promptTokens", "completionTokens", "totalCost" }],
    "summary": { "totalTraces", "totalTokens", "totalCost", "avgLatencyMs" },
    "topModels": [{ "model", "count", "cost" }],
    "scoreDistribution": [{ "name", "avgValue", "count" }]
  }
```

---

## Project Structure

```
OpenAgentTelemetry/
├── apps/
│   ├── server/              # Fastify backend
│   │   ├── src/
│   │   │   ├── auth/        # Auth module (JWT sign/verify + global route guard)
│   │   │   ├── db/          # Drizzle schema + database client
│   │   │   ├── repositories/# Repository layer (interface + Postgres impl)
│   │   │   │   ├── trace-repository
│   │   │   │   ├── score-repository
│   │   │   │   ├── dataset-repository
│   │   │   │   ├── prompt-repository
│   │   │   │   ├── stats-repository    # Dashboard stats aggregation
│   │   │   │   └── user-repository     # User auth
│   │   │   ├── routes/      # Fastify routes
│   │   │   │   ├── health, ingestion, traces, trace-detail
│   │   │   │   ├── scores, datasets, prompts
│   │   │   │   ├── stats    # GET /api/stats/overview
│   │   │   │   └── auth     # login / logout / me
│   │   │   ├── modules/     # Business logic (IngestionService)
│   │   │   └── app.ts       # Fastify app factory (closure factory pattern for DI)
│   │   ├── drizzle/         # Database migration SQL (0000-0003)
│   │   └── Dockerfile
│   ├── web/                 # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/         # App Router pages
│   │   │   │   ├── login/   # Login page
│   │   │   │   ├── dashboard/  # Statistics charts (Recharts)
│   │   │   │   ├── traces/  # List + [id] detail
│   │   │   │   ├── datasets/
│   │   │   │   └── prompts/
│   │   │   ├── lib/         # API client
│   │   │   └── middleware.ts  # Edge login guard
│   │   └── Dockerfile
│   └── sdk-ts/              # TypeScript SDK
│       └── src/
│           ├── context.ts   # AsyncLocalStorage context management
│           ├── client.ts    # Batch buffering HTTP client
│           └── traceable.ts # Function decorator
├── packages/
│   └── shared/              # Shared Zod schema + type definitions
├── scripts/
│   ├── seed.ts              # Database migration + seed data
│   └── verify-sdk.ts        # SDK end-to-end verification script
├── docs/                    # Design specs, research, implementation plans
├── docker-compose.yml
└── pnpm-workspace.yaml
```

---

## Configuration

### Environment Variables

| Variable | Service | Default | Description |
|----------|---------|---------|-------------|
| `DATABASE_URL` | server | — | PostgreSQL connection string |
| `PORT` | server | `3001` | Backend listen port |
| `JWT_SECRET` | server | — | **Required**. JWT signing secret, must be a random long string in production |
| `ADMIN_EMAIL` | server | `admin@oat.dev` | Bootstrap admin email, auto-created on startup if not exists |
| `ADMIN_PASSWORD` | server | `admin123` | Bootstrap admin password, only used on first creation (does not overwrite existing users) |
| `SERVER_URL` | web | `http://localhost:3001` | Backend URL for frontend SSR access |
| `SEED_PROJECT_ID` | web | — | Default Project ID to display |
| `OAT_BASE_URL` | sdk | — | SDK ingestion target URL |
| `OAT_API_KEY` | sdk | — | SDK authentication API Key |

---

## Development Guide

```bash
# Install dependencies
pnpm install

# Run all tests
pnpm test

# Type check
pnpm lint

# Start backend dev server (hot reload)
pnpm dev:server

# Start frontend dev server
pnpm dev:web
```

### Testing Strategy

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | Vitest | Zod schema validation, SDK context, batch client |
| Integration | Vitest | Repository layer (requires real Postgres) |
| API | Vitest + Fastify inject | Routes + auth + validation (in-memory mode) |
| End-to-End | scripts/ | SDK → Server → DB → Web full chain |

---

## Roadmap

- [x] **M1 — Skeleton**: monorepo + DB + Server + SDK + Web + Docker
- [x] **M2 — Full Tracing**: trace detail page, tree structure, waterfall timeline
- [x] **M3 — Datasets + Scoring**: test set CRUD, scoring API, score query
- [x] **M4 — Prompt Management**: versioning, variable interpolation, label tagging, render preview
- [x] **M5 — Dashboard Statistics**: time series aggregation, latency percentiles, tokens/cost, top models, score distribution
- [x] **M6 — Authentication**: single admin login, Cookie+JWT, global route guard, frontend login guard
- [ ] **Future**: Python SDK, OTLP compatibility, alerting system, multi-tenant organizations

---

## Contributing

Issues and PRs are welcome!

1. Fork this repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

**Commit Convention** (Conventional Commits):

| Prefix | Purpose |
|--------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `refactor` | Refactoring |
| `test` | Tests |
| `chore` | Build/tooling |

---

## License

[MIT](LICENSE) © 2026 future-fantasy-org
