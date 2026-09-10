Good choice. A **Ticket Booking System** is a strong full-stack portfolio project because the core challenge is not the UI—it’s **concurrency, temporary reservations, payments, transactions, and real-time state**.

I’d design it as a cinema/concert/event booking platform similar to Ticketmaster or CGV, but small enough for one developer to finish.

# 1. Project concept

Working name:

**Seatly — Real-Time Ticket Booking Platform**

Users can:

```text
Browse events
→ choose a date/session
→ see a seat map
→ select seats
→ temporarily hold seats
→ checkout
→ pay
→ receive QR tickets
```

The important backend problem is:

> What happens if 100 users try to buy the same seat at the same time?

Your system should guarantee that **only one successful booking can own a seat**.

---

# 2. Locked architecture

The framework stack is locked around Next.js + NestJS. The important system boundaries are:

```text
Frontend application
Backend API
PostgreSQL database
Background jobs
Redis layer
Payment provider
Optional object storage
```

```text
                         ┌─────────────────┐
                         │     Next.js     │
                         │     Frontend    │
                         └────────┬────────┘
                                  │
                           HTTPS / WebSocket
                                  │
                         ┌────────▼────────┐
                         │     NestJS      │
                         │    REST API     │
                         └────────┬────────┘
                                  │
            ┌─────────────────────┼────────────────────┐
            │                     │                    │
            ▼                     ▼                    ▼
     ┌────────────┐        ┌────────────┐       ┌────────────┐
     │ PostgreSQL │        │   Redis    │       │  BullMQ    │
     │            │        │            │       │  Workers   │
     └────────────┘        └────────────┘       └────────────┘
            │                     │
            │                     │
            │              Seat reservations
            │              Rate limiting
            │              WebSocket state
            │
            ▼
     Booking database


                     ┌────────────────────┐
                     │ Payment Provider   │
                     │ Fake first/Stripe  │
                     └────────────────────┘


                     ┌────────────────────┐
                     │ Object Storage     │
                     │ Optional for MVP   │
                     └────────────────────┘
```

Keep the NestJS backend as a **modular monolith** initially rather than splitting everything into microservices.

For implementation, treat this document as a **north-star spec**, not a single sprint.

The first real target should be a thin vertical MVP:

```text
Browse event
→ choose session
→ view seat map
→ hold seats
→ checkout
→ confirm payment
→ generate QR tickets
```

If that flow has real transactions, expiration, idempotency, and concurrency tests, the project is already strong.

---

# 3. User roles

You need at least three roles.

For the MVP, keep the roles simple:

```text
CUSTOMER
ORGANIZER
ADMIN
```

Build enough organizer/admin behavior to support the booking flow first. Advanced analytics, refund management, event cancellation workflows, audit inspection, and scanner staff permissions can come later.

### CUSTOMER

Can:

* create an account
* browse events
* choose sessions
* select seats
* reserve seats
* pay
* cancel eligible bookings
* view previous bookings
* download tickets
* view QR codes

### ORGANIZER

Can:

* create events
* create venues
* create sessions
* configure seat prices
* see sales
* see attendees
* scan tickets
* issue refunds

### ADMIN

Can:

* manage users
* approve organizers
* disable events
* inspect payments
* inspect audit logs
* manage refunds
* view system statistics

---

# 4. Main domain model

The hierarchy should be:

```text
Venue
 └── Hall
      └── Seat

Event
 └── Session
      └── SessionSeat
           └── Reservation
                └── Booking
                     └── Ticket
```

This distinction is important.

A **Seat** represents the physical seat.

Example:

```text
Hall 1
A1
A2
A3
B1
B2
B3
```

A **SessionSeat** represents that seat for one particular event session.

For example:

```text
Seat A1

Movie:
Avengers

Session:
2026-09-10 19:00

Price:
150,000 VND

Status:
AVAILABLE
```

That makes pricing and availability much easier to manage.

---

# 5. Database entities

I would have approximately these tables.

## User

```text
users

id
email
passwordHash
firstName
lastName
phone
avatarUrl

role

emailVerified
status

createdAt
updatedAt
```

Possible roles:

```typescript
enum UserRole {
  CUSTOMER
  ORGANIZER
  ADMIN
}
```

---

# 6. Organizer

An organizer should be separate from User because multiple users could eventually belong to one company.

```text
organizations

id
name
slug
logoUrl
description

status

createdAt
updatedAt
```

Then:

```text
organization_members

id
organizationId
userId

role

createdAt
```

Organization roles:

```text
OWNER
ADMIN
STAFF
SCANNER
```

This makes the project more realistic.

---

# 7. Venue

```text
venues

id
organizationId

name
description

address
city
country

latitude
longitude

createdAt
updatedAt
```

Example:

```text
CGV Landmark 81
Ho Chi Minh City
Vietnam
```

---

# 8. Hall

```text
halls

id
venueId

name
capacity

layoutConfig

createdAt
updatedAt
```

For example:

```text
Hall 1
IMAX Room
Concert Arena
```

`layoutConfig` could contain some display metadata.

---

# 9. Seat

```text
seats

id
hallId

section
row
number

type

x
y

createdAt
updatedAt
```

Seat types:

```text
STANDARD
VIP
PREMIUM
COUPLE
ACCESSIBLE
```

The `x` and `y` properties let the frontend render the seat map.

Example:

```json
{
  "row": "A",
  "number": 12,
  "x": 280,
  "y": 140
}
```

---

# 10. Event

```text
events

id
organizationId

title
slug
description

category

posterUrl
bannerUrl

status

saleStartAt
saleEndAt

createdAt
updatedAt
```

Possible categories:

```text
MOVIE
CONCERT
SPORT
THEATER
CONFERENCE
```

Statuses:

```text
DRAFT
PUBLISHED
CANCELLED
COMPLETED
```

---

# 11. Session

One event can have multiple sessions.

Example:

```text
Taylor Swift Concert

September 20
18:00

September 21
18:00
```

Table:

```text
sessions

id
eventId
hallId

startAt
endAt

status

createdAt
updatedAt
```

Statuses:

```text
SCHEDULED
SELLING
SOLD_OUT
CANCELLED
COMPLETED
```

---

# 12. SessionSeat

This is one of the most important tables.

```text
session_seats

id

sessionId
seatId

price
currency

status

version

createdAt
updatedAt
```

Statuses:

```text
AVAILABLE
HELD
BOOKED
BLOCKED
```

For example:

```text
Session:
Taylor Swift - Sep 20

Seat:
A12

Price:
2,500,000

Status:
AVAILABLE
```

---

# 13. Seat pricing

You could also have:

```text
ticket_types

id
sessionId

name
description

price

seatType

createdAt
```

Example:

```text
VIP
3,000,000

Premium
2,000,000

Standard
1,000,000
```

Then assign seats to those ticket types.

---

# 14. Seat reservation / hold

This is the key system.

When a customer selects:

```text
A12
A13
```

those seats should temporarily become:

```text
HELD
```

for approximately:

```text
5 minutes
```

The frontend shows:

```text
Complete checkout within:

04:57
```

The reservation could look like:

```text
seat_holds

id
userId
sessionId

expiresAt

status

createdAt
```

And:

```text
seat_hold_items

id
holdId
sessionSeatId
```

Statuses:

```text
ACTIVE
EXPIRED
CONVERTED
CANCELLED
```

---

# 15. The concurrency problem

Imagine:

```text
User A selects A12
User B selects A12
```

at practically the same moment.

Your system must never return:

```text
User A → reserved A12 ✅
User B → reserved A12 ✅
```

Only one should win.

For example:

```text
User A → reserved A12 ✅

User B →
409 Conflict

"Seat A12 is no longer available."
```

This is the most interesting part of the entire project.

---

# 16. Database locking strategy

You could use a PostgreSQL transaction and row locking.

Conceptually:

```sql
BEGIN;

SELECT *
FROM session_seats
WHERE id IN (...)
FOR UPDATE;
```

Then check:

```text
status === AVAILABLE
```

and update:

```text
AVAILABLE
→
HELD
```

before committing.

If another transaction tries simultaneously, it must wait.

---

# 17. Alternative: optimistic locking

Your `SessionSeat` could contain:

```text
version
```

Example:

```text
id      A12
status  AVAILABLE
version 5
```

Update with:

```sql
UPDATE session_seats
SET
    status = 'HELD',
    version = version + 1
WHERE
    id = ?
    AND version = 5
    AND status = 'AVAILABLE';
```

If:

```text
affectedRows = 0
```

someone else changed it first.

For this project, I'd implement **database locking first**, then perhaps document optimistic locking as an alternative.

---

# 18. Redis seat reservation

Redis becomes useful for temporary holds.

Example:

```text
seat-lock:session123:seatA12
```

Value:

```text
user-123
```

TTL:

```text
300 seconds
```

Conceptually:

```text
SET
seat-lock:session123:A12
user123
NX
EX
300
```

`NX` means:

```text
only create the key if it doesn't already exist
```

Therefore:

```text
User A
SET NX
→ success

User B
SET NX
→ failure
```

However, I would still treat **PostgreSQL as the authoritative source** for the final booking.

Redis helps with temporary coordination and fast reads.

Important:

```text
Redis should improve speed and coordination.
PostgreSQL should guarantee correctness.
```

If Redis says a seat is available but PostgreSQL says it is booked, PostgreSQL wins.

For the MVP, you can start with PostgreSQL transactions and BullMQ expiration first, then add Redis when real-time state and faster temporary locks become useful.

---

# 19. Reservation flow

User selects seats.

```text
POST /sessions/:sessionId/holds
```

Request:

```json
{
  "seatIds": [
    "seat-a12",
    "seat-a13"
  ]
}
```

Backend API:

```text
1. Validate session
2. Validate user
3. Validate seat IDs
4. Lock seats
5. Check availability
6. Create hold
7. Set expiration
8. Update seats to HELD
9. Publish WebSocket event
10. Return reservation
```

Response:

```json
{
  "holdId": "hold_123",
  "expiresAt": "2026-09-20T12:05:00Z",
  "seats": [
    {
      "id": "A12",
      "price": 150000
    },
    {
      "id": "A13",
      "price": 150000
    }
  ],
  "total": 300000
}
```

---

# 20. Reservation expiration

Suppose the customer leaves the checkout page.

After:

```text
5 minutes
```

the reservation should automatically expire.

Use BullMQ.

Create job:

```text
expire-seat-hold
```

with delay:

```text
5 minutes
```

Worker performs:

```text
Find hold

if hold.status !== ACTIVE
    return

Set hold = EXPIRED

Set seats:
HELD → AVAILABLE

Delete Redis locks

Broadcast WebSocket event
```

---

# 21. Real-time seat map

This is where WebSockets make the project look much better.

Users looking at the same session join something like:

```text
session:123
```

When someone reserves:

```text
A12
A13
```

Backend broadcasts:

```json
{
  "event": "seat-held",
  "data": {
    "seatIds": [
      "A12",
      "A13"
    ]
  }
}
```

Everybody's UI immediately changes:

```text
🟢 AVAILABLE
↓
🟡 HELD
```

When bought:

```text
🟡 HELD
↓
🔴 BOOKED
```

When reservation expires:

```text
🟡 HELD
↓
🟢 AVAILABLE
```

That gives you genuinely useful real-time functionality rather than adding WebSockets just to say you used them.

---

# 22. Booking

A booking should be created during checkout.

```text
bookings

id
bookingNumber

userId
sessionId

subtotal
serviceFee
discount

total
currency

status

expiresAt

createdAt
updatedAt
```

Statuses:

```text
PENDING_PAYMENT
PAID
PAYMENT_FAILED
CANCELLED
REFUNDED
EXPIRED
```

---

# 23. Booking items

```text
booking_items

id
bookingId

sessionSeatId

price
ticketType

createdAt
```

Never calculate old booking totals from current seat prices.

Store the actual price paid inside:

```text
booking_items.price
```

because prices may change later.

---

# 24. Payment

For a portfolio project, use:

**a fake payment provider first**

Then upgrade to:

**Stripe test mode**

This lets you finish and test the booking engine before adding provider-specific payment complexity.

The flow:

```text
Seat held

↓

Create booking

↓

Create payment intent

↓

Customer pays

↓

Payment provider sends webhook

↓

Backend verifies webhook

↓

Booking becomes PAID

↓

Seats become BOOKED

↓

Generate tickets
```

Important:

Don't trust:

```text
Frontend:
"payment successful!"
```

The authoritative confirmation should come from the **payment webhook**.

---

# 25. Payment table

```text
payments

id
bookingId

provider

providerPaymentId

amount
currency

status

failureReason

createdAt
updatedAt
```

Statuses:

```text
PENDING
SUCCESS
FAILED
REFUNDED
PARTIALLY_REFUNDED
```

---

# 26. Payment idempotency

This is another excellent interview topic.

Imagine Stripe sends the webhook:

```text
payment.success
```

three times.

Without protection, you could:

```text
generate ticket
generate ticket
generate ticket
```

Instead store:

```text
webhook_events

id
provider
eventId

processedAt
```

Before processing:

```text
Does eventId already exist?

YES → ignore
NO → process
```

Use a unique constraint on:

```text
(provider, eventId)
```

---

# 27. Ticket

After payment:

```text
tickets

id
ticketNumber

bookingItemId
userId

qrCode

status

usedAt

createdAt
```

Statuses:

```text
VALID
USED
CANCELLED
REFUNDED
```

---

# 28. QR code

QR should ideally contain an opaque token such as:

```text
ticket_token:
79366b1b-e24f-...
```

rather than:

```text
bookingId = 123
```

The scanner submits:

```text
POST /tickets/validate
```

Request:

```json
{
  "token": "79366b1b..."
}
```

Response:

```json
{
  "valid": true,
  "ticket": {
    "event": "Coldplay",
    "seat": "A12",
    "holder": "John Doe"
  }
}
```

---

# 29. Ticket scanning

Your organizer dashboard can have:

```text
/scanner
```

Camera scans QR.

Flow:

```text
scan QR

↓

POST /tickets/check-in

↓

Transaction

↓

VALID → USED
```

If someone scans it again:

```text
409

Ticket already used
```

This is another concurrency problem.

Two gate employees could scan the same ticket at nearly the same moment.

Use atomic updates or transaction locking.

---

# 30. Event discovery

Frontend page:

```text
/events
```

Supports:

```text
search
category
city
date
price
availability
```

API:

```http
GET /events
```

Query:

```text
?search=coldplay
&city=hochiminh
&category=CONCERT
&page=1
&limit=20
```

Response:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 125,
    "totalPages": 7
  }
}
```

---

# 31. Event details page

```text
/events/[slug]
```

Display:

```text
Hero image

Coldplay
Music of the Spheres

Description

Venue
Landmark 81

Available sessions

SEP 20
18:00

SEP 21
18:00
```

Click:

```text
Book tickets
```

---

# 32. Seat selection page

URL:

```text
/events/[slug]/sessions/[sessionId]
```

Layout:

```text
             SCREEN / STAGE

        ┌────────────────────┐
        │       STAGE        │
        └────────────────────┘

 A    1  2  3  4  5  6  7

 B    1  2  3  4  5  6  7

 C    1  2  3  4  5  6  7


Available     🟢
Selected      🔵
Held          🟡
Sold          ⚫
```

Sidebar:

```text
Your seats

A12     150,000
A13     150,000

----------------

Subtotal 300,000

Continue
```

---

# 33. Checkout page

```text
/checkout/[holdId]
```

Display:

```text
Reservation expires in

04:42
```

Summary:

```text
Coldplay

September 20
18:00

Seats
A12
A13

Subtotal            300,000
Service fee          30,000
--------------------------------
Total               330,000 VND
```

Then:

```text
Pay now
```

---

# 34. Booking confirmation

```text
/bookings/[bookingId]
```

Display:

```text
Booking confirmed 🎉

Booking #BK-2026-28192

Coldplay

20 September 2026
18:00

Seat A12
Seat A13

[View ticket]
```

---

# 35. Customer dashboard

```text
/account/bookings
```

Tabs:

```text
Upcoming
Past
Cancelled
```

Booking cards:

```text
Coldplay

Sep 20, 2026
18:00

A12, A13

PAID

View tickets
```

---

# 36. Organizer dashboard

Create:

```text
/organizer
```

Dashboard:

```text
Revenue

₫521,000,000


Tickets sold

1,842


Upcoming events

12


Refunds

23
```

Charts:

```text
Revenue by day

Tickets sold by event

Sales by ticket type
```

---

# 37. Organizer event management

```text
/organizer/events
```

CRUD:

```text
Create event
Edit event
Publish event
Cancel event
Duplicate event
```

---

# 38. Venue designer

This could be an advanced feature.

Organizer creates:

```text
Rows:
A–K

Seats per row:
20
```

System generates:

```text
A1-A20
B1-B20
...
K1-K20
```

Later you could make a drag-and-drop venue designer.

---

# 39. Backend modules

If we choose NestJS, the backend could look like this:

```text
src/

├── auth/
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── strategies/
│   ├── guards/
│   └── dto/
│
├── users/
│
├── organizations/
│
├── venues/
│
├── halls/
│
├── seats/
│
├── events/
│
├── sessions/
│
├── seat-holds/
│
├── bookings/
│
├── payments/
│
├── tickets/
│
├── notifications/
│
├── websocket/
│
├── workers/
│
├── audit/
│
├── prisma/
│
├── redis/
│
├── common/
│   ├── decorators/
│   ├── guards/
│   ├── interceptors/
│   ├── filters/
│   └── pipes/
│
├── config/
│
└── app.module.ts
```

That structure will already demonstrate that you understand modular backend design.

---

# 40. Main API design

## Authentication

```http
POST /auth/register
POST /auth/login
POST /auth/logout
POST /auth/refresh
POST /auth/verify-email
POST /auth/forgot-password
POST /auth/reset-password
```

---

## Users

```http
GET   /users/me
PATCH /users/me
```

---

## Events

```http
GET    /events
GET    /events/:slug

POST   /events
PATCH  /events/:id
DELETE /events/:id
```

Organizer protected.

---

## Sessions

```http
GET  /events/:eventId/sessions

POST /events/:eventId/sessions

GET  /sessions/:sessionId

GET  /sessions/:sessionId/seats
```

---

## Holds

```http
POST   /sessions/:sessionId/holds

GET    /holds/:id

DELETE /holds/:id
```

---

## Bookings

```http
POST /bookings

GET /bookings

GET /bookings/:id

POST /bookings/:id/cancel
```

---

## Payments

```http
POST /bookings/:id/payment

POST /payments/webhook
```

---

## Tickets

```http
GET  /tickets/:id

POST /tickets/validate

POST /tickets/:id/check-in
```

---

# 41. Authentication

I recommend:

```text
Access Token
15 minutes

Refresh Token
7-30 days
```

Access token:

```text
Authorization:
Bearer ey...
```

Refresh token:

```text
HttpOnly
Secure
SameSite
cookie
```

Avoid storing sensitive tokens in localStorage if you can.

---

# 42. RBAC

For example, NestJS-style guards:

```typescript
@Roles(UserRole.ADMIN)
@Roles(UserRole.ORGANIZER)
```

For organization permissions:

```typescript
@OrganizationRoles(
  OrganizationRole.OWNER,
  OrganizationRole.ADMIN,
)
```

Authorization should check:

```text
Does this user belong to this organization?

AND

Does their role allow the action?
```

Not merely:

```text
role === ORGANIZER
```

because organizers must not modify another organizer's events.

---

# 43. Redis uses

Don't use Redis just because it looks good on your CV.

Use it for real reasons.

### Seat locks

```text
seat-lock:{sessionId}:{seatId}
```

### Session cache

```text
session:{sessionId}:seats
```

### Rate limiting

```text
rate-limit:{userId}
```

### WebSocket adapter

If you eventually run multiple backend instances.

---

# 44. BullMQ jobs

Good jobs include:

```text
expire-seat-hold

send-ticket-email

generate-ticket-pdf

payment-reconciliation

send-event-reminder

refund-processing

cleanup-expired-bookings
```

For example:

```text
24 hours before event

send-event-reminder
```

---

# 45. Notifications

Table:

```text
notifications

id
userId

type

title
message

readAt

createdAt
```

Possible types:

```text
BOOKING_CONFIRMED
PAYMENT_FAILED
EVENT_CANCELLED
EVENT_REMINDER
REFUND_COMPLETED
```

---

# 46. Email notifications

Emails:

```text
Verify email

Booking confirmation

Ticket

Payment failed

Event reminder

Event cancelled

Refund confirmation
```

For development you could use something like Mailpit locally.

---

# 47. Audit logs

This feature is fantastic for backend interviews.

```text
audit_logs

id

actorId

action

entityType
entityId

metadata

ipAddress

createdAt
```

Example:

```text
ORGANIZER 123

EVENT_UPDATED

event_572

{
  "before": {
    "price": 1000000
  },
  "after": {
    "price": 1200000
  }
}
```

---

# 48. Logging

Use structured logs.

Example:

```json
{
  "level": "info",
  "requestId": "req_123",
  "userId": "usr_543",
  "method": "POST",
  "path": "/sessions/123/holds",
  "duration": 124
}
```

Having a `requestId` makes tracing issues much easier.

---

# 49. Global error response

Don't return random error structures.

Use:

```json
{
  "statusCode": 409,
  "code": "SEAT_NOT_AVAILABLE",
  "message": "One or more seats are no longer available.",
  "details": {
    "seatIds": [
      "A12"
    ]
  },
  "timestamp": "2026-09-20T12:30:00Z",
  "path": "/sessions/123/holds"
}
```

---

# 50. Important HTTP status codes

Use them correctly.

```text
200 OK

201 Created

400 Bad Request

401 Unauthorized

403 Forbidden

404 Not Found

409 Conflict

422 Unprocessable Entity

429 Too Many Requests

500 Internal Server Error
```

Seat conflicts should probably be:

```text
409 Conflict
```

---

# 51. Validation

Use **Zod** for request/response validation and shared API contracts.

Place shared schemas in a workspace package so both the backend and frontend can import the same definitions.

For example:

```typescript
import { z } from 'zod';

export const createSeatHoldSchema = z.object({
  seatIds: z.array(z.string().uuid()).min(1).max(8),
});

export type CreateSeatHoldDto = z.infer<typeof createSeatHoldSchema>;
```

In NestJS, validate incoming requests with a Zod validation pipe.

Limit the number of tickets per booking.

For example:

```text
Maximum 8 seats.
```

This also reduces abuse.

---

# 52. Database constraints

This is extremely important.

Do not rely exclusively on application checks.

Example:

```text
users.email

UNIQUE
```

Organization slug:

```text
UNIQUE
```

Ticket number:

```text
UNIQUE
```

Provider event ID:

```text
UNIQUE
```

A physical seat:

```text
UNIQUE(hallId, row, number)
```

Session seat:

```text
UNIQUE(sessionId, seatId)
```

Database constraints are your last line of defense.

Add the important constraints in the first schema/migration, not as a late production cleanup task.

The MVP should include at minimum:

```text
UNIQUE(users.email)

UNIQUE(events.slug)

UNIQUE(organizations.slug)

UNIQUE(hallId, row, number)

UNIQUE(sessionId, seatId)

UNIQUE(bookings.bookingNumber)

UNIQUE(tickets.ticketNumber)

UNIQUE(payments.provider, payments.providerPaymentId)

UNIQUE(webhook_events.provider, webhook_events.eventId)
```

---

# 53. Database indexing

Add indexes such as:

```text
events.status

events.slug

sessions.eventId

sessions.startAt

session_seats.sessionId

session_seats.status

bookings.userId

bookings.status

tickets.ticketNumber
```

Then practice:

```sql
EXPLAIN ANALYZE
```

and talk about query optimization in your README.

---

# 54. Testing

I'd make tests one of the major selling points.

## Unit tests

```text
AuthService

SeatHoldService

BookingService

PaymentService

TicketService
```

---

## Integration tests

Test:

```text
PostgreSQL

Redis

repository

transactions
```

---

## E2E tests

For example:

```text
Register
↓
Login
↓
Browse event
↓
Select session
↓
Reserve A12
↓
Create booking
↓
Complete payment
↓
Receive ticket
```

---

# 55. Most important concurrency test

Create two simultaneous requests:

```text
Promise.all([
  userA.reserve("A12"),
  userB.reserve("A12")
])
```

Expected:

```text
1 success

1 failure
```

Never:

```text
2 success
```

Put this test in your GitHub repository.

It demonstrates the purpose of your architecture immediately.

---

# 56. Another concurrency test

100 users:

```text
100 requests
↓
same seat
```

Expected result:

```text
1 reservation successful

99 rejected
```

This makes for a great README demo.

---

# 57. Security

At minimum implement:

```text
Password hashing

JWT authentication

Refresh-token rotation

RBAC

CORS configuration

Helmet

Rate limiting

Input validation

SQL injection protection

XSS awareness

Secure cookies

Webhook signature validation
```

Also never store card information yourself.

Let the payment provider handle it.

---

# 58. Rate limiting

Examples:

```text
Login:

5 attempts/minute
```

Seat hold:

```text
10/minute/user
```

Ticket validation:

```text
reasonable scanner-specific limits
```

Public search:

```text
100/minute/IP
```

---

# 59. Frontend structure

If we choose Next.js, the frontend could look like this:

```text
app/

├── (public)/
│   ├── page.tsx
│   ├── events/
│   │   ├── page.tsx
│   │   └── [slug]/
│
├── booking/
│   └── [sessionId]/
│
├── checkout/
│   └── [holdId]/
│
├── account/
│   ├── bookings/
│   ├── tickets/
│   └── profile/
│
├── organizer/
│   ├── dashboard/
│   ├── events/
│   ├── venues/
│   └── analytics/
│
├── admin/
│
├── login/
│
└── register/
```

---

# 60. Frontend state

You don't need Redux for everything.

Potential state-management choices:

```text
Server Components
    ↓
initial data

TanStack Query
    ↓
server state

Zustand
    ↓
seat-selection local state

WebSocket
    ↓
real-time seat changes
```

For example:

```text
selectedSeatIds
```

can live in Zustand.

Event data should come from TanStack Query/server fetching.

---

# 61. Seat status UI

Keep state obvious.

```text
AVAILABLE
Selectable

SELECTED
Selected by current user

HELD
Temporarily reserved by someone

BOOKED
Sold

BLOCKED
Unavailable
```

Important distinction:

Your current user's hold could display differently from another user's hold.

---

# 62. Analytics

Organizer dashboard could track:

```text
Gross revenue

Net revenue

Tickets sold

Conversion rate

Average order value

Refund rate

Seats remaining

Sales by day

Sales by session

Sales by ticket type
```

---

# 63. Advanced waiting room

This would be a great **V2/V3** feature.

Imagine:

```text
Taylor Swift tickets

50,000 users

2,000 seats
```

Instead of letting everyone hit the booking service simultaneously:

```text
User
↓
Waiting room
↓
Queue
↓
Allowed into booking
```

Assign:

```text
queuePosition
```

and admission tokens.

Now you're approaching Ticketmaster-style system-design territory.

---

# 64. Advanced dynamic pricing

Example:

```text
Standard
₫500k

VIP
₫2m
```

Later:

```text
80% seats sold
→ standard price becomes ₫650k
```

Important rule:

Once the user creates a reservation:

```text
lock the price
```

so it doesn't change during checkout.

---

# 65. Promo codes

Tables:

```text
promotions

id
code

type

value

maxDiscount

usageLimit

perUserLimit

startsAt
endsAt
```

Types:

```text
PERCENTAGE
FIXED
```

Example:

```text
WELCOME10

10%

max discount:
100,000 VND
```

---

# 66. Refunds

Booking could support:

```text
FULL REFUND

PARTIAL REFUND

NO REFUND
```

Organizer defines:

```text
72+ hours:
100%

24-72 hours:
50%

<24 hours:
0%
```

You can add this later.

---

# 67. Event cancellation

If an organizer cancels:

```text
Event
↓
CANCELLED
```

Then background job:

```text
find paid bookings

↓

create refund jobs

↓

invalidate tickets

↓

notify customers
```

This is a great use case for BullMQ.

---

# 68. Docker development

Your local development stack should run external dependencies locally:

```text
docker-compose.yml

postgres
redis
mailpit
minio optional
```

Then run:

```text
Backend app
Frontend app
```

locally.

Eventually Dockerize those as well.

---

# 69. Monorepo

Use **pnpm workspaces**.

Turborepo is optional. Add it if workspace scripts start getting slow or repetitive.

The repository should look like:

```text
ticket-booking/

├── apps/
│   ├── api/
│   │   └── backend
│   │
│   └── web/
│       └── frontend
│
├── packages/
│   ├── contracts/
│   ├── eslint-config/
│   └── tsconfig/
│
├── docker/
│
├── docker-compose.yml
│
└── README.md
```

---

# 70. Locked framework and technology stack

Final stack:

```text
Frontend
---------------------------
Next.js
TypeScript
Tailwind CSS
shadcn/ui
TanStack Query
Zustand
Socket.IO client
Zod


Backend
---------------------------
NestJS
TypeScript
Prisma
Zod validation pipe
Passport JWT
Socket.IO


Database
---------------------------
PostgreSQL


Cache / locking
---------------------------
Redis
Required for BullMQ
Useful later for seat locks, caching, and websocket scaling


Queue
---------------------------
BullMQ


Storage
---------------------------
No external storage for MVP
MinIO optional locally
Cloudflare R2 / S3 later


Payment
---------------------------
Fake payment provider for MVP
Stripe test mode later


Email
---------------------------
Skip real email for MVP
Mailpit locally later
Resend later


Testing
---------------------------
Jest
Supertest
Playwright later


DevOps
---------------------------
Docker
GitHub Actions
```

External services are not required for the MVP.

Start with local infrastructure and fake integrations:

```text
PostgreSQL via Docker
Redis via Docker
Fake payment provider
Local QR token generation
Seeded poster/image URLs
```

Upgrade to real external services after the booking flow is correct:

```text
Stripe test mode for payments
Resend for email
Cloudflare R2 / S3 for files
Managed Postgres and Redis for deployment
Sentry for error monitoring
```

---

# 71. Implementation milestones

Do not implement everything immediately.

The full plan is intentionally ambitious, but the first goal should be a complete booking flow with strong correctness guarantees.

## MVP target

The MVP should prove this:

```text
A user can browse an event,
select seats,
hold them temporarily,
complete checkout,
and receive QR tickets.

Two users can never successfully reserve or buy the same seat.
```

That is the core portfolio story.

### Milestone 1 — Foundation

```text
Auth

Events

Venues

Sessions

Seats

Database constraints

Seed data
```

Goal:

```text
User can browse an event
and see available seats.
```

Keep organizer/admin functionality minimal here. It is enough if you can create test events, venues, sessions, and seats through protected APIs or seed scripts.

### Milestone 2 — Booking engine

Build:

```text
seat hold

database transaction

BullMQ expiration job

reservation expiration

concurrency handling

conflict responses
```

Goal:

```text
Two users cannot reserve the same seat.
```

This should be your biggest focus.

Add the headline tests here:

```text
2 users request the same seat
→ 1 success
→ 1 conflict

100 users request the same seat
→ 1 success
→ 99 conflicts
```

### Milestone 3 — Payments

Build:

```text
Booking

Checkout

Fake payment provider

Payment webhook

Idempotency
```

Goal:

```text
HELD
→ payment
→ BOOKED
```

Once this works, replace or extend the fake provider with Stripe test mode.

### Milestone 4 — Tickets

Build:

```text
QR ticket

ticket validation

check-in

booking history
```

Goal:

```text
Customer can enter the event with a ticket.
```

### Milestone 5 — Real time

Add:

```text
Redis

Socket.IO

seat updates

email jobs
```

BullMQ may already exist from Milestone 2 for hold expiration. In this milestone, expand the real-time experience and background jobs rather than introducing correctness for the first time.

### Milestone 6 — Production engineering

Finally add:

```text
Docker

CI/CD

rate limiting

logging

audit log

unit tests

integration tests

E2E tests

load tests

performance optimization
```

This is where the project becomes polished, observable, and easier to discuss in interviews.

### Later V2/V3 features

Implementation note: these nine features are now implemented. V2 groups organizer operations (analytics, refunds, cancellation, audit, promotions, staff); V3 groups venue design, waiting rooms, and dynamic pricing. See `docs/v2-v3.md` for the concrete defaults, validation, and integration limits.

Add these only after the MVP flow is reliable:

```text
Advanced organizer analytics

Refund rules

Event cancellation refund workflow

Audit log UI

Drag-and-drop venue designer

Waiting room

Dynamic pricing

Promo codes

Multi-organization staff permissions
```

---

# 72. The project should ultimately demonstrate this

When an interviewer opens your repository, you want them to see:

```text
Authentication           ✅

Authorization            ✅

PostgreSQL               ✅

Transactions             ✅

Concurrency              ✅

Database locking         ✅

Redis                    ✅

Caching                  ✅

Queues                   ✅

WebSockets               ✅

Payments                 ✅

Webhooks                 ✅

Idempotency              ✅

QR tickets               ✅

Background workers       ✅

Testing                  ✅

Docker                   ✅

CI/CD                    ✅

Logging                  ✅

Database optimization    ✅
```

That turns the project from:

> "I made a website where you buy tickets."

into:

> "I designed a concurrent booking system that prevents overselling using transactional seat reservations, Redis-backed temporary holds, asynchronous expiration jobs, idempotent payment processing, and real-time availability updates."

**That second sentence is exactly the kind of thing you want to be able to say in a backend interview.**
