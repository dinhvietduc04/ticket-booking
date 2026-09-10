import { ConflictException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BookingsService } from "../bookings/bookings.service";
import { PaymentsService } from "../payments/payments.service";
import { SeatHoldExpirationService } from "../seat-holds/seat-hold-expiration.service";
import { SeatHoldsService } from "../seat-holds/seat-holds.service";
import { TicketsService } from "./tickets.service";

jest.setTimeout(60_000);

describe("TicketsService", () => {
  const prisma = new PrismaService();
  const expiration = new SeatHoldExpirationService(prisma);
  const holds = new SeatHoldsService(prisma, expiration);
  const bookings = new BookingsService(prisma, expiration);
  const tickets = new TicketsService(prisma);
  const payments = new PaymentsService(prisma, tickets);
  const runId = `stage4-${Date.now()}-${Math.random().toString(36).slice(2)}`;

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

  it("creates QR tickets for paid bookings and validates their tokens", async () => {
    const scenario = await createScenario();
    const paidBooking = await createPaidBooking(scenario);

    const result = await tickets.listDemoBookingTickets(
      paidBooking.id,
      scenario.userEmail,
    );
    const [ticket] = result.data;
    expect(ticket).toBeDefined();
    if (!ticket) {
      throw new Error("Expected one ticket.");
    }
    const validation = await tickets.validateToken(ticket.qrCode);

    expect(result.data).toHaveLength(1);
    expect(ticket.bookingId).toBe(paidBooking.id);
    expect(ticket.seatLabel).toBe("A1");
    expect(validation.valid).toBe(true);
    expect(validation.ticket?.ticketNumber).toBe(ticket.ticketNumber);
  });

  it("checks in a ticket exactly once", async () => {
    const scenario = await createScenario();
    const paidBooking = await createPaidBooking(scenario);
    const [ticket] = (
      await tickets.listDemoBookingTickets(paidBooking.id, scenario.userEmail)
    ).data;
    expect(ticket).toBeDefined();
    if (!ticket) {
      throw new Error("Expected one ticket.");
    }

    const checkedIn = await tickets.checkInByToken(ticket.qrCode);
    const validation = await tickets.validateToken(ticket.qrCode);

    await expect(tickets.checkInByToken(ticket.qrCode)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(checkedIn.ticket.status).toBe("USED");
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe("Ticket has already been checked in.");
  });

  it("allows only one concurrent check-in for the same ticket", async () => {
    const scenario = await createScenario();
    const paidBooking = await createPaidBooking(scenario);
    const [ticket] = (
      await tickets.listDemoBookingTickets(paidBooking.id, scenario.userEmail)
    ).data;
    expect(ticket).toBeDefined();
    if (!ticket) {
      throw new Error("Expected one ticket.");
    }

    const results = await Promise.allSettled([
      tickets.checkInById(ticket.id),
      tickets.checkInById(ticket.id),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });

  async function createPaidBooking(
    scenario: Awaited<ReturnType<typeof createScenario>>,
  ) {
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
    const eventId = `${runId}-payment-success-${webhookEventIds.length}`;
    webhookEventIds.push(eventId);

    const result = await payments.processFakeWebhook({
      provider: "FAKE",
      eventId,
      providerPaymentId: payment.providerPaymentId,
      status: "SUCCESS",
    });

    if (!result.booking) {
      throw new Error("Expected paid booking.");
    }

    return result.booking;
  }

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
        name: `Stage 4 ${suffix}`,
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
        name: `Ticket Hall ${suffix}`,
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
        title: `Stage 4 Event ${suffix}`,
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

    await prisma.sessionSeat.create({
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
    };
  }
});
