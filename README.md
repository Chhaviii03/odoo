# AssetFlow

**Enterprise Asset & Resource Management System**

AssetFlow digitizes how organizations track, allocate, book, maintain, and audit physical assets and shared resources. Built as a modular monolith for clean ERP architecture, role-based workflows, and conflict-safe business rules — without purchasing or accounting complexity.

## Features

- Organization setup — departments, asset categories, employee directory
- Asset lifecycle — Available → Allocated / Reserved / Under Maintenance / Lost / Retired / Disposed
- Allocation with **double-allocation block** + transfer workflow
- Resource booking with **overlap validation** (adjacent slots allowed)
- Maintenance approval kanban (Pending → Resolved)
- Structured audit cycles with auto discrepancy reports
- KPI dashboard, reports/analytics, notifications & activity logs
- RBAC: Admin · Asset Manager · Department Head · Employee  
  *(signup always creates Employee — roles assigned only by Admin)*

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | React + TypeScript (Vite), Tailwind CSS, React Query, Zustand, Recharts |
| Backend | Node.js + TypeScript + Express |
| ORM / DB | Prisma + PostgreSQL |
| Auth | JWT (access + refresh) + bcrypt |
| Realtime | Socket.io |
| Jobs | node-cron (overdue returns, booking transitions) |
| Deploy | Docker Compose |

## Screens

| # | Screen | Route |
|---|--------|-------|
| 1 | Login / Signup | `/login` |
| 2 | Dashboard / KPIs | `/` |
| 3 | Organization Setup | `/organization` |
| 4 | Asset Registration & Directory | `/assets` |
| 5 | Allocation & Transfer | `/allocation` |
| 6 | Resource Booking | `/booking` |
| 7 | Maintenance Management | `/maintenance` |
| 8 | Asset Audit | `/audit` |
| 9 | Reports & Analytics | `/reports` |
| 10 | Notifications & Activity Logs | `/activity` |

## Project structure

```
odoo/
├── backend/          # Express API (modular monolith)
│   ├── prisma/       # schema + seed
│   └── src/modules/  # auth, org, assets, allocations, bookings, …
├── frontend/         # React app (pages = screens 1–10)
├── docker-compose.yml
└── README.md
```

## Quick start (Docker)

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API | http://localhost:4000/api/v1 |
| Health | http://localhost:4000/health |

## Local development

### 1. PostgreSQL

```bash
docker compose up -d postgres
# or use any local Postgres and set DATABASE_URL
```

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma db push          # or: npx prisma migrate dev
npm run seed
npm run dev                 # http://localhost:4000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173 (proxies /api → :4000)
```

## Demo accounts

Password for all: `password123`

| Role | Email |
|------|-------|
| Admin | `admin@assetflow.dev` |
| Asset Manager | `manager@assetflow.dev` |
| Department Head | `head@assetflow.dev` |
| Employee | `priya@assetflow.dev` |
| Employee | `raj@assetflow.dev` |

Seeded demo scenarios:

- Laptop **AF-0001** held by Priya → allocating it elsewhere triggers the conflict + transfer flow
- Bookable resources ready for overlap checks (e.g. 9:00–10:00 blocks 9:30–10:30; 10:00–11:00 is allowed)
- Overdue allocation on the dashboard + a pending maintenance request on the kanban

## Core business rules

- **Asset state machine** — all status changes go through one guarded transition + history log
- **Allocation conflict** — active allocation → `409` with current holder + transfer affordance
- **Booking overlap** — `existing.start < new.end AND existing.end > new.start` (half-open intervals)
- **Maintenance** — asset flips to Under Maintenance only on approval; back to Available on resolve
- **Audit close** — Missing items → asset status Lost, in a single transaction

## API overview

Base path: `/api/v1`  
Auth required on all routes except `/auth/signup` and `/auth/login`.

Modules: Auth · Departments · Categories · Employees · Assets · Allocations · Transfers · Bookings · Maintenance · Audits · Reports · Notifications · Activity logs · Dashboard KPIs

## Authors

- GitHub: [harshitashar25](https://github.com/harshitashar25)
- Contact: 23cs2025@rgipt.ac.in

## License

Built for the Odoo / AssetFlow hackathon challenge.
