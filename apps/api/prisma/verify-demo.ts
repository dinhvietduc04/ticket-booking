import assert = require("node:assert/strict");
import { access } from "node:fs/promises";
import * as path from "node:path";
import { PrismaClient } from "@prisma/client";
import { events } from "./demo-data";

const prisma = new PrismaClient();

async function main() {
  const catalog = await prisma.event.findMany({
    where: { slug: { in: events.map((event) => `demo-${event.slug}`) } },
    include: {
      sessions: {
        include: {
          sessionSeats: true,
          bookings: {
            include: {
              items: { include: { ticket: true } },
              payments: true,
              refunds: true,
              hold: { include: { items: true } },
            },
          },
        },
      },
    },
  });
  assert.equal(catalog.length, events.length, "Run pnpm db:seed first");
  let bookingCount = 0,
    ticketCount = 0,
    seatCount = 0,
    sessionCount = 0;
  for (const event of catalog) {
    assert.match(event.posterUrl!, /^\/images\/demo\/[a-z-]+\.jpg$/);
    await access(
      path.resolve(__dirname, "../../web/public", event.posterUrl!.slice(1)),
    );
    for (const session of event.sessions) {
      sessionCount++;
      seatCount += session.sessionSeats.length;
      assert(session.endAt > session.startAt);
      const seatIds = new Set(session.sessionSeats.map((seat) => seat.id));
      const purchased = new Set<string>();
      for (const booking of session.bookings) {
        bookingCount++;
        assert.equal(
          booking.subtotal,
          booking.items.reduce((sum, item) => sum + item.price, 0),
        );
        assert.equal(
          booking.total,
          booking.subtotal + booking.serviceFee - booking.discount,
        );
        assert.equal(
          booking.payments.reduce((sum, payment) => sum + payment.amount, 0),
          booking.total,
        );
        assert.equal(
          booking.payments.reduce(
            (sum, payment) => sum + payment.refundedAmount,
            0,
          ),
          booking.refunds.reduce((sum, refund) => sum + refund.amount, 0),
        );
        assert.equal(booking.hold?.items.length, booking.items.length);
        for (const item of booking.items) {
          assert(
            seatIds.has(item.sessionSeatId),
            "Booking seat must belong to its session",
          );
          const snapshot: { price: number } | undefined =
            booking.hold!.items.find(
              (held) => held.sessionSeatId === item.sessionSeatId,
            );
          assert.equal(snapshot?.price, item.price);
          if (item.ticket) {
            ticketCount++;
            assert.equal(item.ticket.userId, booking.userId);
            assert.equal(
              item.ticket.status === "USED",
              item.ticket.usedAt !== null,
            );
          }
          if (booking.status === "PAID") {
            assert(item.ticket, "Paid booking must have tickets");
            assert(
              !purchased.has(item.sessionSeatId),
              "Seat cannot be sold twice",
            );
            purchased.add(item.sessionSeatId);
            assert.equal(
              session.sessionSeats.find(
                (seat) => seat.id === item.sessionSeatId,
              )?.status,
              "BOOKED",
            );
          }
          if (booking.status === "REFUNDED")
            assert.equal(item.ticket?.status, "REFUNDED");
          if (["PAYMENT_FAILED", "EXPIRED"].includes(booking.status))
            assert.equal(item.ticket, null);
        }
      }
      if (session.status === "SOLD_OUT")
        assert(session.sessionSeats.every((seat) => seat.status === "BOOKED"));
      if (event.status === "CANCELLED")
        assert(
          session.sessionSeats.every((seat) =>
            ["BOOKED", "BLOCKED"].includes(seat.status),
          ),
        );
    }
  }
  console.log(
    `Verified ${catalog.length} events, ${sessionCount} sessions, ${seatCount} seats, ${bookingCount} bookings, ${ticketCount} tickets, image files, payment totals, refunds, and inventory consistency.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
