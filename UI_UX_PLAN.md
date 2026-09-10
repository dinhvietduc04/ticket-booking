# Seatly UI/UX Improvement Plan

This plan focuses on improving the customer-facing experience before returning to the larger V2/V3 roadmap in `specs.MD`.

## Goal

Make Seatly feel like a polished, usable ticket-booking product.

The priority is the complete customer journey:

```text
Events
-> Event details
-> Seat selection
-> Checkout
-> Booking confirmation
-> Tickets
```

Secondary flows such as scanner, login, register, and booking history should support that journey cleanly.

---

## Phase 1 - Design Audit

Review all current pages:

- `/`
- `/events`
- `/events/[slug]`
- `/booking/[sessionId]`
- `/checkout/[holdId]`
- `/bookings/[bookingId]`
- `/account/bookings`
- `/scanner`
- `/login`
- `/register`

Check for:

- unclear page hierarchy
- inconsistent spacing
- weak calls to action
- missing loading states
- missing error states
- missing empty states
- mobile layout issues
- text overflow
- confusing seat or ticket statuses
- accessibility gaps

Deliverable:

- a short UI/UX findings checklist
- screenshots of key issues if useful
- prioritized fixes

---

## Phase 2 - App Shell And Visual System

Improve the shared product foundation:

- navigation
- page widths
- spacing scale
- typography
- button styles
- form styles
- status colors
- focus states
- loading and error patterns

The app should feel consistent across public pages, booking pages, account pages, and scanner pages.

Deliverable:

- updated shared layout
- refined global CSS/theme tokens
- reusable UI primitives where helpful

---

## Phase 3 - Event Discovery

Upgrade `/events` into the main browsing surface.

Improve:

- event cards
- poster display
- category labels
- city and venue metadata
- date/time visibility
- starting price display
- availability indicators
- search/filter UI
- loading state
- empty-results state

Expected result:

Users should quickly understand what events are available and where to start booking.

---

## Phase 4 - Event Detail Page

Improve `/events/[slug]`.

Add or refine:

- stronger event hero/banner
- event title and category hierarchy
- venue details
- event description
- session list
- session availability
- clear "Book tickets" action
- responsive mobile layout

Expected result:

Users should be able to inspect an event and confidently choose a session.

---

## Phase 5 - Seat Selection

Polish `/booking/[sessionId]`.

Improve:

- seat map readability
- stage/screen presentation
- selected seat feedback
- held/booked/blocked states
- current user's held seats
- status legend
- sticky booking summary
- hold timer visibility
- conflict messaging when seats become unavailable
- mobile seat-map behavior

Expected result:

Seat selection should feel clear, responsive, and trustworthy, especially when live seat updates happen.

---

## Phase 6 - Checkout

Polish `/checkout/[holdId]`.

Improve:

- reservation countdown
- order summary
- seat list
- fee and total breakdown
- payment button state
- expired-hold state
- payment failure state
- successful payment transition

Expected result:

Checkout should clearly communicate urgency, total cost, and payment progress.

---

## Phase 7 - Confirmation, Tickets, And Booking History

Improve:

- `/bookings/[bookingId]`
- `/account/bookings`

Add or refine:

- real-ticket visual design
- QR/token display
- event, date, venue, hall, and seat details
- booking status labels
- upcoming/past/cancelled tabs
- "view tickets" actions
- "continue payment" action for pending bookings
- empty booking-history state

Expected result:

Tickets should feel credible and booking history should be easy to scan.

---

## Phase 8 - Scanner Experience

Improve `/scanner`.

Add or refine:

- clear token input
- camera-scan placeholder or scan panel
- recent scan history
- success state
- already-used state
- invalid-ticket state
- fast reset for the next scan

Expected result:

The scanner should feel operational and fast for event staff.

---

## Phase 9 - Responsive And Accessibility Pass

Check the app across:

- mobile
- tablet
- desktop

Verify:

- no overlapping content
- no clipped text
- buttons remain tappable
- seat map remains usable
- forms are keyboard accessible
- focus states are visible
- color contrast is acceptable
- loading and error states are announced clearly enough

Expected result:

The primary flow should be usable on both phone and desktop.

---

## Phase 10 - Frontend Quality Pass

Clean up frontend implementation after UX changes.

Tasks:

- extract repeated UI patterns
- reduce duplicated API response schemas where practical
- use shared contracts from `packages/contracts`
- keep component boundaries simple
- add Playwright smoke tests for the main customer journey

Suggested smoke flow:

```text
Open events
-> choose event
-> choose session
-> select seats
-> create hold
-> checkout
-> complete fake payment
-> view tickets
```

---

## Recommended Implementation Order

1. Event discovery
2. Event detail
3. Seat picker
4. Checkout
5. Booking confirmation and tickets
6. Booking history
7. Scanner
8. Responsive/accessibility pass
9. Frontend cleanup
10. Playwright smoke tests

This order improves the visible customer journey first while keeping the work scoped and easy to review.

