import { ConflictException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BookingsService } from "../bookings/bookings.service";
import { SeatHoldExpirationService } from "../seat-holds/seat-hold-expiration.service";
import { SeatHoldsService } from "../seat-holds/seat-holds.service";
import { TicketsService } from "../tickets/tickets.service";
import { PaymentsService } from "./payments.service";

jest.setTimeout(60_000);

describe("PaymentsService", () => {
  const prisma = new PrismaService();
  const expiration = new SeatHoldExpirationService(prisma);
  const holds = new SeatHoldsService(prisma, expiration);
  const bookings = new BookingsService(prisma, expiration);
  const tickets = new TicketsService(prisma);
  const payments = new PaymentsService(prisma, tickets);
  const runId = `stage3-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let organizationIds: string[] = [];
  let userIds: string[] = [];
  let webhookEventIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (webhookEventIds.length > 0) {
      await prisma.webhookEvent.deleteMany({
        where: { eventId: { in: webhookEventIds } },
      });
      webhookEventIds = [];
    }

    if (organizationIds.length > 0) {
      const sessions = await prisma.session.findMany({
        where: { event: { organizationId: { in: organizationIds } } },
        select: { id: true },
      });

      await prisma.booking.deleteMany({
        where: { sessionId: { in: sessions.map((session) => session.id) } },
      });
      await prisma.seatHold.deleteMany({
        where: { sessionId: { in: sessions.map((session) => session.id) } },
      });

      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
      organizationIds = [];
    }

    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
      userIds = [];
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("marks payment successful and books seats through an idempotent fake webhook", async () => {
    const scenario = await createScenario();
    const hold = await holds.createHoldForUser(
      scenario.userId,
      scenario.sessionId,
      {
        seatIds: [scenario.seatId],
      },
    );
    const booking = await bookings.createBookingForUser(scenario.userId, {
      holdId: hold.holdId,
    });
    const payment = await payments.createFakePaymentForDemoBooking(
      booking.id,
      scenario.userEmail,
    );
    const eventId = `${runId}-payment-success`;
    webhookEventIds.push(eventId);

    const firstResult = await payments.processFakeWebhook({
      provider: "FAKE",
      eventId,
      providerPaymentId: payment.providerPaymentId,
      status: "SUCCESS",
    });
    const secondResult = await payments.processFakeWebhook({
      provider: "FAKE",
      eventId,
      providerPaymentId: payment.providerPaymentId,
      status: "SUCCESS",
    });

    const [
      sessionSeat,
      persistedBooking,
      persistedPayment,
      persistedHold,
      persistedTicketCount,
    ] = await Promise.all([
      prisma.sessionSeat.findUniqueOrThrow({
        where: { id: scenario.sessionSeatId },
      }),
      prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }),
      prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
      prisma.seatHold.findUniqueOrThrow({ where: { id: hold.holdId } }),
      prisma.ticket.count({
        where: { bookingItem: { bookingId: booking.id } },
      }),
    ]);

    expect(firstResult.processed).toBe(true);
    expect(firstResult.booking?.status).toBe("PAID");
    expect(secondResult.processed).toBe(false);
    expect(secondResult.booking?.status).toBe("PAID");
    expect(sessionSeat.status).toBe("BOOKED");
    expect(persistedBooking.status).toBe("PAID");
    expect(persistedPayment.status).toBe("SUCCESS");
    expect(persistedHold.status).toBe("CONVERTED");
    expect(persistedTicketCount).toBe(1);
  });

  it("expires stale pending bookings and releases their held seats before payment", async () => {
    const scenario = await createScenario();
    const hold = await holds.createHoldForUser(
      scenario.userId,
      scenario.sessionId,
      {
        seatIds: [scenario.seatId],
      },
    );
    const booking = await bookings.createBookingForUser(scenario.userId, {
      holdId: hold.holdId,
    });

    await prisma.booking.update({
      where: { id: booking.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    await expect(
      payments.createFakePaymentForDemoBooking(booking.id, scenario.userEmail),
    ).rejects.toBeInstanceOf(ConflictException);

    const [sessionSeat, persistedBooking, persistedHold] = await Promise.all([
      prisma.sessionSeat.findUniqueOrThrow({
        where: { id: scenario.sessionSeatId },
      }),
      prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }),
      prisma.seatHold.findUniqueOrThrow({ where: { id: hold.holdId } }),
    ]);

    expect(sessionSeat.status).toBe("AVAILABLE");
    expect(persistedBooking.status).toBe("EXPIRED");
    expect(persistedHold.status).toBe("EXPIRED");
  });

  async function createScenario() {
    const suffix = `${organizationIds.length}-${Date.now()}`;
    const organizer = await prisma.user.create({
      data: {
        email: `${runId}-organizer-${suffix}@seatly.test`,
        passwordHash: "test-only",
        firstName: "Stage",
        lastName: "Organizer",
        role: "ORGANIZER",
        emailVerified: true,
      },
    });
    const customer = await prisma.user.create({
      data: {
        email: `${runId}-customer-${suffix}@seatly.test`,
        passwordHash: "test-only",
        firstName: "Stage",
        lastName: "Customer",
        emailVerified: true,
      },
    });
    userIds.push(organizer.id, customer.id);

    const organization = await prisma.organization.create({
      data: {
        name: `Stage 3 ${suffix}`,
        slug: `${runId}-${suffix}`,
        status: "ACTIVE",
        members: {
          create: {
            userId: organizer.id,
            role: "OWNER",
          },
        },
      },
    });
    organizationIds.push(organization.id);

    const venue = await prisma.venue.create({
      data: {
        organizationId: organization.id,
        name: `Payment Hall ${suffix}`,
        address: "1 Test Street",
        city: "Ho Chi Minh City",
        country: "Vietnam",
      },
    });
    const hall = await prisma.hall.create({
      data: {
        venueId: venue.id,
        name: "Main Hall",
        capacity: 1,
      },
    });
    const seat = await prisma.seat.create({
      data: {
        hallId: hall.id,
        section: "MAIN",
        row: "A",
        number: 1,
        x: 0,
        y: 0,
      },
    });
    const event = await prisma.event.create({
      data: {
        organizationId: organization.id,
        title: `Stage 3 Event ${suffix}`,
        slug: `${runId}-event-${suffix}`,
        category: "CONCERT",
        status: "PUBLISHED",
      },
    });
    const session = await prisma.session.create({
      data: {
        eventId: event.id,
        hallId: hall.id,
        startAt: new Date("2026-09-20T11:00:00.000Z"),
        endAt: new Date("2026-09-20T14:00:00.000Z"),
        status: "SELLING",
      },
    });
    const sessionSeat = await prisma.sessionSeat.create({
      data: {
        sessionId: session.id,
        seatId: seat.id,
        price: 1_000_000,
        currency: "VND",
      },
    });

    return {
      userId: customer.id,
      userEmail: customer.email,
      sessionId: session.id,
      seatId: seat.id,
      sessionSeatId: sessionSeat.id,
    };
  }
});
