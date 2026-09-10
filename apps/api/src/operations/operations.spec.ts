import { ConflictException, ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import {
  AccessService,
  priceAt,
  refundPercent,
  WaitingRoomService,
} from "../commerce/commerce.service";
import { SeatHoldExpirationService } from "../seat-holds/seat-hold-expiration.service";
import { SeatHoldsService } from "../seat-holds/seat-holds.service";
import { BookingsService } from "../bookings/bookings.service";
import { PaymentsService } from "../payments/payments.service";
import { TicketsService } from "../tickets/tickets.service";
import { OrganizerService } from "./organizer.service";
import { RefundsService } from "./refunds.service";

jest.setTimeout(60000);
describe("V2/V3 commerce invariants (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const access = new AccessService(
    prisma,
    new AuthService(prisma, new JwtService()),
  );
  const organizer = new OrganizerService(prisma, access);
  const expiry = new SeatHoldExpirationService(prisma);
  const holds = new SeatHoldsService(prisma, expiry);
  const bookings = new BookingsService(prisma, expiry);
  const tickets = new TicketsService(prisma);
  const payments = new PaymentsService(prisma, tickets);
  const refunds = new RefundsService(prisma, access);
  const waiting = new WaitingRoomService(prisma);
  const run = `v23-${crypto.randomUUID()}`;
  let orgId: string,
    ownerId: string,
    eventId: string,
    sessionId: string,
    hallId: string;
  let customers: string[] = [],
    seatIds: string[] = [],
    sessionSeatIds: string[] = [];
  const webhookIds: string[] = [];
  beforeAll(async () => {
    await prisma.$connect();
  });
  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    const users = [];
    for (let i = 0; i < 4; i++)
      users.push(
        await prisma.user.create({
          data: {
            email: `${run}-${suffix}-${i}@test.local`,
            passwordHash: "test",
            firstName: "Test",
            lastName: String(i),
          },
        }),
      );
    ownerId = users[0]!.id;
    customers = users.slice(1).map((u) => u.id);
    const org = await prisma.organization.create({
      data: {
        name: "Test operations",
        slug: `${run}-${suffix}`,
        status: "ACTIVE",
        members: { create: { userId: ownerId, role: "OWNER" } },
      },
    });
    orgId = org.id;
    const venue = await prisma.venue.create({
      data: {
        organizationId: orgId,
        name: "Venue",
        address: "Test",
        city: "HCM",
        country: "VN",
      },
    });
    const hall = await prisma.hall.create({
      data: { venueId: venue.id, name: "Hall", capacity: 3 },
    });
    hallId = hall.id;
    seatIds = [];
    for (let i = 1; i <= 3; i++)
      seatIds.push(
        (
          await prisma.seat.create({
            data: { hallId, row: "A", number: i, x: i * 50, y: 50 },
          })
        ).id,
      );
    const event = await prisma.event.create({
      data: {
        organizationId: orgId,
        title: "Test Event",
        slug: `${run}-${suffix}`,
        category: "CONCERT",
        status: "PUBLISHED",
      },
    });
    eventId = event.id;
    const session = await prisma.session.create({
      data: {
        eventId,
        hallId,
        status: "SELLING",
        startAt: new Date(Date.now() + 100 * 3600000),
        endAt: new Date(Date.now() + 103 * 3600000),
      },
    });
    sessionId = session.id;
    sessionSeatIds = [];
    for (const seatId of seatIds)
      sessionSeatIds.push(
        (
          await prisma.sessionSeat.create({
            data: { seatId, sessionId, price: 100000, basePrice: 100000 },
          })
        ).id,
      );
  });
  afterEach(async () => {
    await prisma.webhookEvent.deleteMany({
      where: { eventId: { in: webhookIds } },
    });
    await prisma.booking.deleteMany({ where: { sessionId } });
    await prisma.seatHold.deleteMany({ where: { sessionId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, ...customers] } },
    });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function hold(index = 0) {
    return holds.createHoldForUser(customers[index]!, sessionId, {
      seatIds: [seatIds[index]!],
    });
  }
  async function paid(index = 0) {
    const h = await hold(index);
    const booking = await bookings.createBookingForUser(customers[index]!, {
      holdId: h.holdId,
    });
    const payment = await payments.createFakePaymentForBooking(
      booking.id,
      customers[index]!,
    );
    const event = `${run}-${crypto.randomUUID()}`;
    webhookIds.push(event);
    await payments.processFakeWebhook({
      eventId: event,
      provider: "FAKE",
      providerPaymentId: payment.providerPaymentId,
      status: "SUCCESS",
    });
    return { booking, payment };
  }
  async function promo(limit = 1) {
    return organizer.promotion(orgId, ownerId, {
      code: "LAST10",
      type: "PERCENTAGE",
      value: 10,
      maxDiscount: 5000,
      currency: "VND",
      usageLimit: limit,
      perUserLimit: 1,
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 3600000).toISOString(),
    });
  }
  it("freezes dynamic prices on holds even when rules and base prices change", async () => {
    await organizer.settings(sessionId, ownerId, {
      waitingRoomCapacity: 0,
      admissionMinutes: 10,
      pricingRules: [{ soldPercent: 0, multiplierPercent: 130 }],
    });
    const h = await hold();
    expect(h.total).toBe(130000);
    await prisma.sessionSeat.updateMany({
      where: { sessionId },
      data: { price: 900000, basePrice: 900000 },
    });
    const booking = await bookings.createBookingForUser(customers[0]!, {
      holdId: h.holdId,
    });
    expect(booking.subtotal).toBe(130000);
    expect(booking.seats[0]!.price).toBe(130000);
    expect((await holds.findById(h.holdId)).total).toBe(130000);
  });
  it("does not extend a hold on repeated requests", async () => {
    const first = await hold();
    const second = await hold();
    expect(second.expiresAt).toBe(first.expiresAt);
  });
  it("allows only one concurrent checkout to consume the last promotion use", async () => {
    const promotion = await promo();
    const a = await hold(0),
      b = await hold(1);
    const results = await Promise.allSettled([
      bookings.createBookingForUser(customers[0]!, {
        holdId: a.holdId,
        promoCode: promotion.code,
      }),
      bookings.createBookingForUser(customers[1]!, {
        holdId: b.holdId,
        promoCode: promotion.code,
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const booking = await prisma.booking.findFirstOrThrow({
      where: { promotionId: promotion.id },
    });
    expect(booking.discount).toBe(5000);
    expect(booking.total).toBe(105000);
  });
  it("releases promo quota after unpaid expiry and preserves checkout idempotency", async () => {
    await promo();
    const first = await hold(0);
    const b = await bookings.createBookingForUser(customers[0]!, {
      holdId: first.holdId,
      promoCode: "LAST10",
    });
    expect(
      (
        await bookings.createBookingForUser(customers[0]!, {
          holdId: first.holdId,
          promoCode: "LAST10",
        })
      ).id,
    ).toBe(b.id);
    await prisma.booking.update({
      where: { id: b.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const second = await hold(1);
    expect(
      (
        await bookings.createBookingForUser(customers[1]!, {
          holdId: second.holdId,
          promoCode: "LAST10",
        })
      ).discount,
    ).toBe(5000);
  });
  it("enforces admission capacity, FIFO, token ownership, and expiry", async () => {
    await organizer.settings(sessionId, ownerId, {
      waitingRoomCapacity: 1,
      admissionMinutes: 10,
      pricingRules: [],
    });
    const a = await waiting.join(sessionId, customers[0]!);
    const b = await waiting.join(sessionId, customers[1]!);
    const c = await waiting.join(sessionId, customers[2]!);
    expect(a.status).toBe("ADMITTED");
    expect(b.position).toBe(1);
    expect(c.position).toBe(2);
    await expect(
      holds.createHoldForUser(customers[1]!, sessionId, {
        seatIds: [seatIds[1]!],
        admissionToken: a.admissionToken!,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(hold(0)).rejects.toBeInstanceOf(ForbiddenException);
    await prisma.waitingEntry.updateMany({
      where: { sessionId, userId: customers[0] },
      data: { admittedUntil: new Date(Date.now() - 1000) },
    });
    await expect(
      holds.createHoldForUser(customers[0]!, sessionId, {
        seatIds: [seatIds[0]!],
        admissionToken: a.admissionToken!,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const next = await waiting.join(sessionId, customers[2]!);
    expect(next.position).toBe(1);
    const admitted = await waiting.join(sessionId, customers[1]!);
    expect(admitted.status).toBe("ADMITTED");
    expect(
      (
        await holds.createHoldForUser(customers[1]!, sessionId, {
          seatIds: [seatIds[1]!],
          admissionToken: admitted.admissionToken!,
        })
      ).total,
    ).toBe(100000);
  });
  it("releases admission after payment so the next customer can enter", async () => {
    await organizer.settings(sessionId, ownerId, {
      waitingRoomCapacity: 1,
      admissionMinutes: 60,
      pricingRules: [],
    });
    const a = await waiting.join(sessionId, customers[0]!);
    expect((await waiting.join(sessionId, customers[1]!)).status).toBe(
      "WAITING",
    );
    const h = await holds.createHoldForUser(customers[0]!, sessionId, {
      seatIds: [seatIds[0]!],
      admissionToken: a.admissionToken!,
    });
    const booking = await bookings.createBookingForUser(customers[0]!, {
      holdId: h.holdId,
    });
    const payment = await payments.createFakePaymentForBooking(
      booking.id,
      customers[0]!,
    );
    const eventId = crypto.randomUUID();
    webhookIds.push(eventId);
    const webhook = {
      eventId,
      provider: "FAKE" as const,
      providerPaymentId: payment.providerPaymentId,
      status: "SUCCESS" as const,
    };
    await payments.processFakeWebhook(webhook);
    // No timer expiry or manual refresh: B's next ordinary poll must admit B.
    const b = await waiting.join(sessionId, customers[1]!);
    expect(b.status).toBe("ADMITTED");
    await expect(
      holds.createHoldForUser(customers[0]!, sessionId, {
        seatIds: [seatIds[2]!],
        admissionToken: a.admissionToken!,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect((await waiting.join(sessionId, customers[0]!)).status).toBe(
      "WAITING",
    );
    await payments.processFakeWebhook(webhook);
    const retryId = crypto.randomUUID();
    webhookIds.push(retryId);
    await payments.processFakeWebhook({ ...webhook, eventId: retryId });
    expect((await waiting.join(sessionId, customers[1]!)).admissionToken).toBe(
      b.admissionToken,
    );
    await holds.createHoldForUser(customers[1]!, sessionId, {
      seatIds: [seatIds[1]!],
      admissionToken: b.admissionToken!,
    });
  });
  it("keeps a newer admission when an earlier checkout completes late", async () => {
    await organizer.settings(sessionId, ownerId, {
      waitingRoomCapacity: 1,
      admissionMinutes: 60,
      pricingRules: [],
    });
    const first = await waiting.join(sessionId, customers[0]!);
    const h = await holds.createHoldForUser(customers[0]!, sessionId, {
      seatIds: [seatIds[0]!],
      admissionToken: first.admissionToken!,
    });
    const booking = await bookings.createBookingForUser(customers[0]!, {
      holdId: h.holdId,
    });
    const payment = await payments.createFakePaymentForBooking(
      booking.id,
      customers[0]!,
    );
    await prisma.waitingEntry.updateMany({
      where: { sessionId, userId: customers[0]! },
      data: { admittedUntil: new Date(Date.now() - 1000) },
    });
    const newer = await waiting.join(sessionId, customers[0]!);
    expect(newer.status).toBe("ADMITTED");
    expect(newer.admissionToken).not.toBe(first.admissionToken);
    const eventId = crypto.randomUUID();
    webhookIds.push(eventId);
    await payments.processFakeWebhook({
      eventId,
      provider: "FAKE",
      providerPaymentId: payment.providerPaymentId,
      status: "SUCCESS",
    });
    expect((await waiting.join(sessionId, customers[0]!)).admissionToken).toBe(
      newer.admissionToken,
    );
    expect((await waiting.join(sessionId, customers[1]!)).status).toBe(
      "WAITING",
    );
  });
  it("does not over-admit under concurrent joins", async () => {
    await organizer.settings(sessionId, ownerId, {
      waitingRoomCapacity: 1,
      admissionMinutes: 10,
      pricingRules: [],
    });
    const result = await Promise.all(
      customers.map((id) => waiting.join(sessionId, id)),
    );
    expect(result.filter((r) => r.status === "ADMITTED")).toHaveLength(1);
    expect(
      await prisma.waitingEntry.count({
        where: { sessionId, status: "ADMITTED" },
      }),
    ).toBe(1);
  });
  it("refunds exactly once under concurrent requests and rejects another customer", async () => {
    const { booking } = await paid();
    await expect(refunds.refund(booking.id, customers[1]!)).rejects.toThrow();
    const results = await Promise.all([
      refunds.refund(booking.id, customers[0]!),
      refunds.refund(booking.id, customers[0]!),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(results[0].amount).toBe(110000);
    expect(
      await prisma.refund.count({ where: { bookingId: booking.id } }),
    ).toBe(1);
    expect(
      (
        await prisma.sessionSeat.findUniqueOrThrow({
          where: { id: sessionSeatIds[0] },
        })
      ).status,
    ).toBe("AVAILABLE");
    expect(
      (
        await prisma.ticket.findFirstOrThrow({
          where: { bookingItem: { bookingId: booking.id } },
        })
      ).status,
    ).toBe("REFUNDED");
  });
  it("tops up a partial customer refund after event cancellation without affecting a resale", async () => {
    await prisma.session.update({
      where: { id: sessionId },
      data: { startAt: new Date(Date.now() + 48 * 3600000) },
    });
    const { booking, payment } = await paid();
    const customerRefund = await refunds.refund(booking.id, customers[0]!);
    expect(customerRefund.amount).toBe(55000);
    const resaleHold = await holds.createHoldForUser(customers[1]!, sessionId, {
      seatIds: [seatIds[0]!],
    });
    const resale = await bookings.createBookingForUser(customers[1]!, {
      holdId: resaleHold.holdId,
    });
    const resalePayment = await payments.createFakePaymentForBooking(
      resale.id,
      customers[1]!,
    );
    const resaleEvent = crypto.randomUUID();
    webhookIds.push(resaleEvent);
    await payments.processFakeWebhook({
      provider: "FAKE",
      eventId: resaleEvent,
      providerPaymentId: resalePayment.providerPaymentId,
      status: "SUCCESS",
    });
    // Cancel an event using the durable task as a worker would after a restart.
    await prisma.event.update({
      where: { id: eventId },
      data: { status: "CANCELLED" },
    });
    await prisma.eventCancellation.create({
      data: { eventId, actorId: ownerId, reason: "Cancelled by organizer" },
    });
    await refunds.refund(booking.id, ownerId, "EVENT");
    expect(
      (
        await prisma.sessionSeat.findUniqueOrThrow({
          where: { id: sessionSeatIds[0] },
        })
      ).status,
    ).toBe("BOOKED");
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: resale.id } }))
        .status,
    ).toBe("PAID");
    await refunds.processCancellation(eventId);
    await refunds.processCancellation(eventId);
    const rows = await prisma.refund.findMany({
      where: { bookingId: booking.id },
    });
    expect(rows).toHaveLength(2);
    expect(rows.reduce((n, r) => n + r.amount, 0)).toBe(booking.total);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }))
        .refundedAmount,
    ).toBe(booking.total);
    expect(
      (await prisma.eventCancellation.findUniqueOrThrow({ where: { eventId } }))
        .status,
    ).toBe("COMPLETED");
  });
  it("never revives refunded bookings from late success or failure webhooks", async () => {
    const { booking, payment } = await paid();
    await refunds.refund(booking.id, customers[0]!);
    for (const status of ["SUCCESS", "FAILED"] as const) {
      const id = crypto.randomUUID();
      webhookIds.push(id);
      const r = await payments.processFakeWebhook({
        provider: "FAKE",
        eventId: id,
        providerPaymentId: payment.providerPaymentId,
        status,
      });
      expect(r.booking?.status).toBe("REFUNDED");
    }
    expect(
      (
        await prisma.ticket.findFirstOrThrow({
          where: { bookingItem: { bookingId: booking.id } },
        })
      ).status,
    ).toBe("REFUNDED");
  });
  it("cancels pending checkout and prevents late payment and new holds", async () => {
    const h = await hold(),
      b = await bookings.createBookingForUser(customers[0]!, {
        holdId: h.holdId,
      });
    const p = await payments.createFakePaymentForBooking(b.id, customers[0]!);
    await refunds.cancelEvent(eventId, ownerId, "Event cannot proceed");
    await refunds.processCancellation(eventId);
    await expect(hold(1)).rejects.toThrow();
    const id = crypto.randomUUID();
    webhookIds.push(id);
    const result = await payments.processFakeWebhook({
      provider: "FAKE",
      eventId: id,
      providerPaymentId: p.providerPaymentId,
      status: "SUCCESS",
    });
    expect(result.booking?.status).toBe("CANCELLED");
    expect(
      await prisma.ticket.count({
        where: { bookingItem: { bookingId: b.id } },
      }),
    ).toBe(0);
  });
  it("settles a payment racing event cancellation without leaving a valid ticket or captured balance", async () => {
    const h = await hold();
    const booking = await bookings.createBookingForUser(customers[0]!, {
      holdId: h.holdId,
    });
    const payment = await payments.createFakePaymentForBooking(
      booking.id,
      customers[0]!,
    );
    const event = crypto.randomUUID();
    webhookIds.push(event);
    await Promise.all([
      payments.processFakeWebhook({
        provider: "FAKE",
        eventId: event,
        providerPaymentId: payment.providerPaymentId,
        status: "SUCCESS",
      }),
      refunds.cancelEvent(eventId, ownerId, "Concurrent cancellation test"),
    ]);
    await refunds.processCancellation(eventId);
    const finalPayment = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(["FAILED", "REFUNDED"]).toContain(finalPayment.status);
    expect(
      await prisma.ticket.count({
        where: { bookingItem: { bookingId: booking.id }, status: "VALID" },
      }),
    ).toBe(0);
    if (finalPayment.status === "REFUNDED")
      expect(finalPayment.refundedAmount).toBe(booking.total);
  });
  it("checks hold ownership and closes a cancelled checkout before a seat can be reused", async () => {
    const h = await hold();
    await expect(
      holds.findById(h.holdId, customers[1]!),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(holds.cancel(h.holdId, customers[1]!)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const booking = await bookings.createBookingForUser(customers[0]!, {
      holdId: h.holdId,
    });
    await holds.cancel(h.holdId, customers[0]!);
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }))
        .status,
    ).toBe("CANCELLED");
  });
  it("rejects refunds after check-in and within the no-refund window", async () => {
    const a = await paid(0);
    const ticket = await prisma.ticket.findFirstOrThrow({
      where: { bookingItem: { bookingId: a.booking.id } },
    });
    await tickets.checkInById(ticket.id);
    await expect(
      refunds.refund(a.booking.id, customers[0]!),
    ).rejects.toBeInstanceOf(ConflictException);
    const b = await paid(1);
    await prisma.session.update({
      where: { id: sessionId },
      data: { startAt: new Date(Date.now() + 2 * 3600000) },
    });
    expect((await refunds.quote(b.booking.id, customers[1]!)).amount).toBe(0);
    await expect(
      refunds.refund(b.booking.id, customers[1]!),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it("isolates organizations, restricts scanners, and protects the final owner", async () => {
    await expect(
      organizer.overview(orgId, customers[0]!),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: customers[0] },
    });
    await organizer.member(orgId, ownerId, {
      email: user.email,
      role: "SCANNER",
    });
    await expect(organizer.analytics(orgId, user.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const { booking } = await paid(1);
    const ticket = await prisma.ticket.findFirstOrThrow({
      where: { bookingItem: { bookingId: booking.id } },
    });
    await expect(
      access.ticket(user.id, { id: ticket.id }),
    ).resolves.toBeUndefined();
    const member = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId: orgId, userId: user.id },
    });
    await organizer.removeMember(orgId, ownerId, member.id);
    await expect(
      access.ticket(user.id, { id: ticket.id }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const owner = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId: orgId, userId: ownerId },
    });
    await expect(
      organizer.removeMember(orgId, ownerId, owner.id),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it("persists safe layout moves and rejects structural changes to scheduled halls", async () => {
    const seats = await prisma.seat.findMany({ where: { hallId } });
    await organizer.layout(hallId, ownerId, {
      seats: seats.map((s, i) => ({ ...s, x: i === 0 ? 250 : s.x })),
    });
    expect(
      (await prisma.seat.findUniqueOrThrow({ where: { id: seats[0]!.id } })).x,
    ).toBe(250);
    await expect(
      organizer.layout(hallId, ownerId, { seats: seats.slice(1) }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await organizer.logs(orgId, ownerId)).data[0]?.action).toBe(
      "HALL_LAYOUT_UPDATED",
    );
  });
  it("reports captured revenue, refunds, conversion, and immutable ticket prices", async () => {
    const a = await paid(0);
    await refunds.refund(a.booking.id, customers[0]!);
    const h = await hold(1);
    await bookings.createBookingForUser(customers[1]!, { holdId: h.holdId });
    const report = await organizer.analytics(orgId, ownerId);
    expect(report.conversionRate).toBe(0.5);
    expect(report.refundRate).toBe(1);
    expect(report.revenue[0]).toMatchObject({
      grossRevenue: 110000,
      refunds: 110000,
      netRevenue: 0,
    });
    expect(report.byTicketType[0]?.subtotal).toBe(100000);
  });
});

describe("Policy boundaries", () => {
  const now = new Date("2026-01-01T00:00:00Z"),
    policy = {
      fullRefundHours: 72,
      partialRefundHours: 24,
      partialRefundPercent: 50,
    };
  it.each([
    [72, 100],
    [71.99, 50],
    [24, 50],
    [23.99, 0],
    [-1, 0],
  ])("refunds at %s hours: %s percent", (hours, expected) => {
    expect(
      refundPercent(new Date(now.getTime() + hours * 3600000), now, policy),
    ).toBe(expected);
  });
  it("uses the highest crossed pricing threshold without compounding", () => {
    const rules = [
      { soldPercent: 80, multiplierPercent: 130 },
      { soldPercent: 50, multiplierPercent: 110 },
    ];
    expect(priceAt(100000, 79, 100, rules)).toBe(110000);
    expect(priceAt(100000, 80, 100, rules)).toBe(130000);
  });
});
