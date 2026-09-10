# Seatly

Seatly is a real-time ticket booking platform built as a full-stack portfolio project. The MVP booking flow is extended with the V2/V3 features from `specs.MD`: organizer analytics, refunds, event cancellation workflows, audit history, promotions, staff permissions, a venue designer, waiting rooms, and dynamic pricing. See [V2/V3 setup, behavior, and APIs](docs/v2-v3.md).

## Current Scope

Implemented:

- pnpm monorepo with `apps/api`, `apps/web`, and `packages/contracts`
- NestJS API foundation
- Next.js web foundation
- Shared Zod contracts
- Split Prisma schema files
- PostgreSQL and Redis local infrastructure
- Initial migration and seed data
- Auth endpoints: register, login, me
- Event discovery and event details
- Venue, hall, physical seat, session, and session seat models
- Seat-map API
- Transactional seat hold endpoint
- BullMQ hold expiration worker
- 2-user and 100-user same-seat concurrency tests
- Booking records from active holds
- Fake payment provider
- Idempotent payment confirmation
- Booked seat finalization
- QR-style ticket tokens generated after successful payment
- Ticket validation and atomic check-in endpoints
- Booking confirmation tickets
- Customer booking history
- Scanner check-in page
- Socket.IO session rooms for live booking pages
- Redis-backed Socket.IO fanout and seat-status cache when `REDIS_URL` is set
- Live seat status updates for held, released, expired, and booked seats
- BullMQ ticket email job queue with dev-log delivery
- Bearer-token customer flow with seeded demo-user fallback for local demos
- API health check at `GET /api/health`
- Helmet security headers
- Global API rate limiting with configurable `RATE_LIMIT_TTL_MS` and `RATE_LIMIT_MAX`
- Compact structured HTTP request logs
- GitHub Actions CI for install, Prisma generation, migrations, typecheck, tests, and build

## Local Services

Start Postgres and Redis:

```bash
docker compose up -d postgres redis
```

Install dependencies:

```bash
pnpm install
```

Apply migrations and seed:

```bash
pnpm db:migrate
pnpm db:generate
pnpm db:seed
```

Run the apps:

```bash
pnpm dev:api
pnpm dev:web
```

URLs:

- Web: `http://localhost:3000/events`
- Booking history: `http://localhost:3000/account/bookings`
- Scanner: `http://localhost:3000/scanner`
- Organizer workspace: `http://localhost:3000/organizer`
- API: `http://localhost:4000/api`
- Health: `http://localhost:4000/api/health`

## Demo Data

`pnpm db:seed` adds 15 realistic demo events, 23 sessions, local images, five venues, three organizer workspaces, promotions, sales history, tickets, and refund/cancellation examples. Reruns preserve existing data and demo progress. Dates are relative to the first seed run.

Log in as `organizer@seatly.local`, `customer-a@seatly.local`, or `customer-b@seatly.local` with `password123`. Manager, staff, scanner, and application admin accounts are also included. Existing accounts keep their credentials.

For dev-only hold testing before the auth UI exists, pass one of the customer emails as `x-demo-user-email` when calling `POST /api/sessions/:sessionId/holds`.

See the [demo accounts and scenario guide](docs/demo-data.md) for checkout, waiting-room, pricing, scanner, analytics, and refund walkthroughs. Run `pnpm db:seed:check` to verify the fixtures. The old Coldplay event is preserved if it already exists.

## Useful Commands

```bash
pnpm typecheck
pnpm lint
pnpm --filter @ticket-booking/api test
pnpm build
pnpm db:generate
pnpm --filter @ticket-booking/api exec prisma validate --schema prisma
```

On Windows, stop the API before running `pnpm db:generate`; Prisma replaces a query engine DLL that can be locked by a running NestJS process.

## Prisma Schema Layout

The Prisma schema is split by domain in `apps/api/prisma`:

- `schema.prisma`
- `enums.prisma`
- `identity.prisma`
- `venues.prisma`
- `events.prisma`
- `reservations.prisma`
- `bookings.prisma`
- `payments.prisma`
- `tickets.prisma`

Migrations are generated under `apps/api/migrations`.

## Current Ticket APIs

```http
GET  /api/bookings/:bookingId/tickets
GET  /api/tickets/:id
POST /api/tickets/validate
POST /api/tickets/check-in
POST /api/tickets/:id/check-in
```

Ticket tokens are opaque values stored in `tickets.qrCode`. A successful fake-payment webhook creates one ticket per booking item, and check-in uses an atomic status update so the same ticket cannot be admitted twice.

## Current Real-Time Events

Socket namespace:

```text
/sessions
```

Client messages:

```text
session.join  { sessionId }
session.leave { sessionId }
```

Server message:

```text
seat.status.changed
```

The payload contains the `sessionId`, change reason, changed seats, their new status, and version. The booking page subscribes to its session room and merges updates into the seat map without refreshing.

## MVP Story

The project demonstrates the core ticket-booking backend story:

```text
A customer can register or log in,
browse a published event,
select available seats,
hold them temporarily,
complete fake checkout,
receive QR tickets,
and check tickets in atomically.
```

The concurrency tests cover the headline guarantee: two customers cannot successfully hold the same seat, including a 100-user same-seat contention scenario.

## Production Follow-Ups

Further integration and deployment work:

- load testing and performance reports
- Stripe test-mode integration
- real email delivery
