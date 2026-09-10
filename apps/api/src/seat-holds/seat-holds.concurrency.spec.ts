import { ConflictException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SeatHoldExpirationService } from "./seat-hold-expiration.service";
import { SeatHoldsService } from "./seat-holds.service";

jest.setTimeout(60_000);

describe("SeatHoldsService concurrency", () => {
  const prisma = new PrismaService();
  const expiration = new SeatHoldExpirationService(prisma);
  const service = new SeatHoldsService(prisma, expiration);
  const runId = `stage2-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let organizationIds: string[] = [];
  let userIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (organizationIds.length > 0) {
      const sessions = await prisma.session.findMany({
        where: { event: { organizationId: { in: organizationIds } } },
        select: { id: true },
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

  it("allows only 1 of 2 users to hold the same seat", async () => {
    const scenario = await createScenario(2);
    const results = await requestSameSeat(scenario.userIds, scenario);

    expect(countSuccesses(results)).toBe(1);
    expect(countConflicts(results)).toBe(1);
    await expectOnlyOneActiveHold(scenario.sessionSeatId);
  });

  it("allows only 1 of 100 users to hold the same seat", async () => {
    const scenario = await createScenario(100);
    const results = await requestSameSeat(scenario.userIds, scenario);

    expect(countSuccesses(results)).toBe(1);
    expect(countConflicts(results)).toBe(99);
    await expectOnlyOneActiveHold(scenario.sessionSeatId);
  });

  it("expires a hold and makes the seat available again", async () => {
    const scenario = await createScenario(1);
    const hold = await service.createHoldForUser(
      scenario.userIds[0]!,
      scenario.sessionId,
      {
        seatIds: [scenario.seatId],
      },
    );

    await prisma.seatHold.update({
      where: { id: hold.holdId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    await expiration.expireHold(hold.holdId);

    const [expiredHold, sessionSeat] = await Promise.all([
      prisma.seatHold.findUniqueOrThrow({ where: { id: hold.holdId } }),
      prisma.sessionSeat.findUniqueOrThrow({
        where: { id: scenario.sessionSeatId },
      }),
    ]);

    expect(expiredHold.status).toBe("EXPIRED");
    expect(sessionSeat.status).toBe("AVAILABLE");
  });

  it("extends the user's active hold when they hold more seats", async () => {
    const scenario = await createScenario(1);
    const firstHold = await service.createHoldForUser(
      scenario.userIds[0]!,
      scenario.sessionId,
      {
        seatIds: [scenario.seatId],
      },
    );

    const updatedHold = await service.createHoldForUser(
      scenario.userIds[0]!,
      scenario.sessionId,
      {
        seatIds: [scenario.seatId, scenario.extraSeatId],
      },
    );

    const [activeHolds, heldSeats] = await Promise.all([
      prisma.seatHold.findMany({
        where: {
          userId: scenario.userIds[0]!,
          sessionId: scenario.sessionId,
          status: "ACTIVE",
        },
        include: { items: true },
      }),
      prisma.sessionSeat.findMany({
        where: {
          id: { in: [scenario.sessionSeatId, scenario.extraSessionSeatId] },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    expect(updatedHold.holdId).toBe(firstHold.holdId);
    expect(
      updatedHold.seats.map((seat: { id: string }) => seat.id).sort(),
    ).toEqual([scenario.seatId, scenario.extraSeatId].sort());
    expect(activeHolds).toHaveLength(1);
    expect(activeHolds[0]!.items).toHaveLength(2);
    expect(heldSeats.map((seat) => seat.status)).toEqual(["HELD", "HELD"]);
  });

  async function createScenario(customerCount: number) {
    const suffix = `${organizationIds.length}-${customerCount}-${Date.now()}`;
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

    const customers = await Promise.all(
      Array.from({ length: customerCount }, (_, index) =>
        prisma.user.create({
          data: {
            email: `${runId}-customer-${suffix}-${index}@seatly.test`,
            passwordHash: "test-only",
            firstName: "Stage",
            lastName: `Customer ${index}`,
            emailVerified: true,
          },
        }),
      ),
    );

    userIds.push(organizer.id, ...customers.map((customer) => customer.id));

    const organization = await prisma.organization.create({
      data: {
        name: `Stage 2 ${suffix}`,
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
        name: `Concurrency Hall ${suffix}`,
        address: "1 Test Street",
        city: "Ho Chi Minh City",
        country: "Vietnam",
      },
    });

    const hall = await prisma.hall.create({
      data: {
        venueId: venue.id,
        name: "Main Hall",
        capacity: 2,
        layoutConfig: {
          rows: ["A"],
          seatsPerRow: 2,
          stageLabel: "STAGE",
        },
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
    const extraSeat = await prisma.seat.create({
      data: {
        hallId: hall.id,
        section: "MAIN",
        row: "A",
        number: 2,
        x: 1,
        y: 0,
      },
    });

    const event = await prisma.event.create({
      data: {
        organizationId: organization.id,
        title: `Stage 2 Event ${suffix}`,
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
    const extraSessionSeat = await prisma.sessionSeat.create({
      data: {
        sessionId: session.id,
        seatId: extraSeat.id,
        price: 1_000_000,
        currency: "VND",
      },
    });

    return {
      sessionId: session.id,
      seatId: seat.id,
      extraSeatId: extraSeat.id,
      sessionSeatId: sessionSeat.id,
      extraSessionSeatId: extraSessionSeat.id,
      userIds: customers.map((customer) => customer.id),
    };
  }

  async function requestSameSeat(
    customers: string[],
    scenario: { seatId: string; sessionId: string },
  ) {
    return Promise.all(
      customers.map((userId) =>
        service
          .createHoldForUser(userId, scenario.sessionId, {
            seatIds: [scenario.seatId],
          })
          .then((result) => ({ ok: true as const, result }))
          .catch((error) => ({ ok: false as const, error })),
      ),
    );
  }

  function countSuccesses(
    results: Awaited<ReturnType<typeof requestSameSeat>>,
  ) {
    return results.filter((result) => result.ok).length;
  }

  function countConflicts(
    results: Awaited<ReturnType<typeof requestSameSeat>>,
  ) {
    return results.filter(
      (result) => !result.ok && result.error instanceof ConflictException,
    ).length;
  }

  async function expectOnlyOneActiveHold(sessionSeatId: string) {
    const [sessionSeat, activeHoldItems] = await Promise.all([
      prisma.sessionSeat.findUniqueOrThrow({ where: { id: sessionSeatId } }),
      prisma.seatHoldItem.findMany({
        where: {
          sessionSeatId,
          hold: { status: "ACTIVE" },
        },
      }),
    ]);

    expect(sessionSeat.status).toBe("HELD");
    expect(activeHoldItems).toHaveLength(1);
  }
});
