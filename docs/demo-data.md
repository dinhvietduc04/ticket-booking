# Demo data

Run `pnpm db:seed`, then visit <http://localhost:3000/events>. Run `pnpm db:seed:check` to check the seeded relationships, financial totals, tickets, inventory, and image files.

The seed adds 15 fictional productions: 12 published events across all five categories, one draft, one cancelled event with completed refunds, and one completed performance. There are 23 sessions, five venues in Ho Chi Minh City, Hanoi, and Da Nang, and three organizer workspaces. Seat maps include VIP, premium, standard, accessible, and cinema couple seats, with base prices from 75,000 to 650,000 VND. A spare Studio Workshop hall is available for unrestricted layout editing.

## Reruns and dates

Seeding is additive. Existing accounts, credentials, events, bookings, and demo progress are preserved. Events use `demo-` slugs; each event and its related bookings commit together, and an existing slug is skipped on later runs. A failed run can be retried. The previous Coldplay event remains if it already exists.

Dates are relative to the first run. Most sessions start at 19:00 Vietnam time over the next 24 days. Little Lanterns starts in exactly 48 hours; Design Tomorrow starts in 12 hours to demonstrate refund cutoffs. The completed show is seven days in the past. Sales history spans the previous four weeks. These dates do not move on reruns, so demonstrations of time-sensitive scenarios should use a fresh disposable development database when the original dates have passed. The script refuses to run with `NODE_ENV=production`.

## Accounts

New accounts share the password `password123`. Existing accounts keep their passwords.

| Email                                                 | Demo use                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `customer-a@seatly.local`                             | Minh: booking history, valid tickets, full/partial/no-refund examples, cancelled-event notification |
| `customer-b@seatly.local`                             | Anh: second customer for waiting-room and seat-contention demos                                     |
| `organizer@seatly.local`                              | Owner in all three demo workspaces                                                                  |
| `manager@seatly.local`                                | Organization admin: promotions, settings, and team management                                       |
| `staff@seatly.local`                                  | Reports/events access without manager privileges                                                    |
| `scanner@seatly.local`                                | Ticket scanning in the demo organizations                                                           |
| `admin@seatly.local`                                  | Application admin across organizations                                                              |
| `guest-1@seatly.local` through `guest-8@seatly.local` | Additional customers supplying realistic attendance and sales history                               |

## Demonstration guide

| Flow                                        | Where to start                                                                                                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browse categories and multiple performances | `/events`; movie, concert, theater, sport, and conference cards all have local images and descriptions                                                                                  |
| Checkout and promo                          | Choose Hanoi After Dark, pick available seats, then use `WELCOME10` or `SAVE50K`                                                                                                        |
| Waiting room                                | First Neon River session: capacity 1, admission 10 minutes. Join as A and B in separate browser profiles. A completing payment admits B on the next poll. Second session has no queue.  |
| Seat contention and live holds              | Second Neon River session: select the same available seat in two customer profiles                                                                                                      |
| Sold out                                    | Midnight in Saigon: first performance sold out, second still selling                                                                                                                    |
| Dynamic pricing                             | City Hoops: 60 of 95 sellable seats purchased; remaining inventory starts at 120% of base price. At 80% sold, it rises to 140%. Existing orders retain their original prices.           |
| Full refund                                 | Customer A's paid Hanoi After Dark booking in `/account/bookings`                                                                                                                       |
| Partial refund                              | Customer A's paid Little Lanterns booking: 50% within the initial 24–72-hour window                                                                                                     |
| Refund unavailable                          | Customer A's Design Tomorrow booking: inside 24 hours                                                                                                                                   |
| Cancelled production                        | Rainy Season Live in organizer Events; customer history contains refunded tickets and notifications                                                                                     |
| Scanner                                     | Open a valid ticket from customer A's booking details; use its displayed token in `/scanner` as the scanner. Summer Encore tickets are already used; Rainy Season tickets are refunded. |
| Analytics                                   | `/organizer`: select a demo organization to see sales by day/session/type, captured revenue, refunds, and conversion                                                                    |
| Permissions                                 | Compare organizer, manager, staff, and scanner accounts                                                                                                                                 |
| Venue designer                              | Saigon Live Collective → Venues → Riverfront Music Hall → Studio Workshop                                                                                                               |
| Draft workflow                              | Winter Sessions appears in the organizer workspace and stays out of public discovery                                                                                                    |

All three organizations have `WELCOME10` (10%, maximum 100,000 VND), `SAVE50K` (50,000 VND), `LASTSEASON` (expired), and `BACKSTAGE` (disabled). Active codes permit 500 total uses and 10 per customer. Some historical orders use WELCOME10. Pending holds and waiting entries are created through the real UI so they don't expire before a presentation; the seed provides paid, refunded, failed, and expired booking history.

## Images

The 12 JPEGs in `apps/web/public/images/demo` are bundled stock photos from Unsplash, used as illustrative category artwork, not official posters or representations of real productions. Their source URLs are recorded in [`scripts/demo-images.json`](../scripts/demo-images.json). Normal seeding and local image display require no image-host access. To download the same 1440 × 900 assets again, run `node scripts/download-demo-images.mjs` (requires network access).

The editable catalog is in [`apps/api/prisma/demo-data.ts`](../apps/api/prisma/demo-data.ts); fixture creation is in [`apps/api/prisma/seed.ts`](../apps/api/prisma/seed.ts).
