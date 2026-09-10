import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  PrismaClient,
  SeatType,
  UserRole,
  type Organization,
} from "@prisma/client";
import { hash } from "bcryptjs";
import { events, organizations, venues, type DemoEvent } from "./demo-data";

const prisma = new PrismaClient();
const now = new Date();
const day = 86400000;
const ago = (days: number) => new Date(now.getTime() - days * day);
const at = (days: number) => {
  const date = new Date(now.getTime() + 7 * 3600000);
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(12, 0, 0, 0); // 19:00 Vietnam time, independent of host timezone.
  return date;
};
function venueId(key: string) {
  const hex = createHash("sha256")
    .update(`seatly-demo-venue-${key}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
type Tx = Prisma.TransactionClient;
type Inventory = Prisma.SessionSeatGetPayload<{ include: { seat: true } }>;

async function seedBooking(
  tx: Tx,
  input: {
    sessionId: string;
    userId: string;
    seats: Inventory[];
    ordinal: number;
    state?: "PAID" | "REFUNDED" | "PAYMENT_FAILED" | "EXPIRED";
    used?: boolean;
    cancelled?: boolean;
    promotionId?: string;
    organizationId: string;
    actorId: string;
  },
) {
  const state = input.state ?? "PAID";
  const createdAt = ago(8 + (input.ordinal % 21));
  const subtotal = input.seats.reduce((sum, seat) => sum + seat.price, 0);
  const serviceFee = Math.round(subtotal * 0.1);
  const discount = input.promotionId
    ? Math.min(Math.floor(subtotal * 0.1), 100000)
    : 0;
  const total = subtotal + serviceFee - discount;
  const captured = state === "PAID" || state === "REFUNDED";
  const hold = await tx.seatHold.create({
    data: {
      sessionId: input.sessionId,
      userId: input.userId,
      createdAt,
      status: captured
        ? "CONVERTED"
        : state === "EXPIRED"
          ? "EXPIRED"
          : "CANCELLED",
      expiresAt: new Date(createdAt.getTime() + 5 * 60000),
      items: {
        create: input.seats.map((s) => ({
          sessionSeatId: s.id,
          price: s.price,
          currency: "VND",
        })),
      },
    },
  });
  const booking = await tx.booking.create({
    data: {
      bookingNumber: `BK-DEMO-${randomUUID().slice(0, 8).toUpperCase()}`,
      sessionId: input.sessionId,
      userId: input.userId,
      holdId: hold.id,
      status: state,
      subtotal,
      serviceFee,
      discount,
      total,
      createdAt,
      promotionId: input.promotionId,
      expiresAt: captured ? null : hold.expiresAt,
      items: {
        create: input.seats.map((s) => ({
          sessionSeatId: s.id,
          price: s.price,
          ticketType: s.seat.type,
          createdAt,
        })),
      },
      payments: {
        create: {
          provider: "FAKE",
          providerPaymentId: `fake_demo_${randomUUID()}`,
          amount: total,
          createdAt,
          status:
            state === "REFUNDED" ? "REFUNDED" : captured ? "SUCCESS" : "FAILED",
          refundedAmount: state === "REFUNDED" ? total : 0,
          failureReason: captured
            ? null
            : state === "EXPIRED"
              ? "Checkout expired"
              : "Demo card declined",
        },
      },
    },
    include: { items: true },
  });
  if (captured) {
    await tx.ticket.createMany({
      data: booking.items.map((item) => ({
        bookingItemId: item.id,
        userId: input.userId,
        ticketNumber: `TK-DEMO-${randomUUID().slice(0, 8).toUpperCase()}`,
        qrCode: `ticket_${randomUUID()}`,
        createdAt,
        status:
          state === "REFUNDED" ? "REFUNDED" : input.used ? "USED" : "VALID",
        usedAt: input.used ? new Date(at(-7).getTime() - 30 * 60000) : null,
      })),
    });
  }
  if (state === "PAID" || input.cancelled) {
    await tx.sessionSeat.updateMany({
      where: { id: { in: input.seats.map((s) => s.id) } },
      data: { status: "BOOKED", version: 2 },
    });
  }
  if (state === "REFUNDED") {
    const refundedAt = ago(input.cancelled ? 1 : 3);
    const kind = input.cancelled ? "EVENT" : "CUSTOMER";
    const reason = input.cancelled
      ? "Event cancelled after production safety review"
      : "Customer cancellation (100% refund)";
    await tx.refund.create({
      data: {
        bookingId: booking.id,
        kind,
        amount: total,
        currency: "VND",
        reason,
        actorId: input.cancelled ? input.actorId : input.userId,
        providerRefundId: `fake_refund_${booking.id}_${kind}`,
        createdAt: refundedAt,
      },
    });
    await tx.customerNotification.create({
      data: {
        bookingId: booking.id,
        kind,
        message: `${reason}. ${total.toLocaleString("en-US")} VND refunded via the demo payment provider.`,
        createdAt: refundedAt,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.cancelled ? input.actorId : input.userId,
        action: "BOOKING_REFUNDED",
        targetId: booking.id,
        details: { amount: total, kind },
        createdAt: refundedAt,
      },
    });
  }
}

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo accounts must not be seeded in production.");
  const passwordHash = await hash("password123", 12);
  // Empty updates preserve existing credentials, account settings, and demo progress.
  const accounts: [string, string, string, UserRole][] = [
    ["organizer", "Linh", "Nguyen", "ORGANIZER"],
    ["customer-a", "Minh", "Tran", "CUSTOMER"],
    ["customer-b", "Anh", "Pham", "CUSTOMER"],
    ["admin", "Mai", "Vo", "ADMIN"],
    ["manager", "Bao", "Le", "ORGANIZER"],
    ["staff", "Thao", "Huynh", "ORGANIZER"],
    ["scanner", "Khanh", "Do", "ORGANIZER"],
    ...["Lan", "Huy", "Nhi", "Duy", "Trang", "Nam", "Vy", "Tuan"].map(
      (name, i): [string, string, string, UserRole] => [
        `guest-${i + 1}`,
        name,
        "Nguyen",
        "CUSTOMER",
      ],
    ),
  ];
  const users = await Promise.all(
    accounts.map(([alias, firstName, lastName, role]) =>
      prisma.user.upsert({
        where: { email: `${alias}@seatly.local` },
        update: {},
        create: {
          email: `${alias}@seatly.local`,
          firstName,
          lastName,
          role,
          passwordHash,
          emailVerified: true,
        },
      }),
    ),
  );
  const owner = users[0]!;
  const customers = [users[1]!, users[2]!, ...users.slice(7)];
  const orgs: Organization[] = [];
  for (const definition of organizations) {
    const org = await prisma.organization.upsert({
      where: { slug: definition.slug },
      update: {},
      create: { ...definition, status: "ACTIVE" },
    });
    orgs.push(org);
    for (const [user, role] of [
      [owner, "OWNER"],
      [users[4]!, "ADMIN"],
      [users[5]!, "STAFF"],
      [users[6]!, "SCANNER"],
    ] as const) {
      await prisma.organizationMember.upsert({
        where: {
          organizationId_userId: { organizationId: org.id, userId: user.id },
        },
        update: {},
        create: { organizationId: org.id, userId: user.id, role },
      });
    }
    for (const offer of [
      {
        code: "WELCOME10",
        type: "PERCENTAGE",
        value: 10,
        maxDiscount: 100000,
        active: true,
        endsAt: at(90),
      },
      {
        code: "SAVE50K",
        type: "FIXED",
        value: 50000,
        maxDiscount: null,
        active: true,
        endsAt: at(90),
      },
      {
        code: "LASTSEASON",
        type: "PERCENTAGE",
        value: 20,
        maxDiscount: 150000,
        active: true,
        endsAt: ago(2),
      },
      {
        code: "BACKSTAGE",
        type: "FIXED",
        value: 100000,
        maxDiscount: null,
        active: false,
        endsAt: at(90),
      },
    ]) {
      await prisma.promotion.upsert({
        where: {
          organizationId_code: { organizationId: org.id, code: offer.code },
        },
        update: {},
        create: {
          organizationId: org.id,
          ...offer,
          startsAt: ago(60),
          usageLimit: 500,
          perUserLimit: 10,
        },
      });
    }
  }
  const halls = new Map<string, string>();
  for (const definition of venues) {
    const id = venueId(definition.key);
    const hall = await prisma.$transaction(async (tx) => {
      const venue = await tx.venue.upsert({
        where: { id },
        update: {},
        create: {
          id,
          organizationId: orgs[definition.organization]!.id,
          name: definition.name,
          address: definition.address,
          city: definition.city,
          country: "Vietnam",
          description:
            "Fictional demo venue with reserved seating and step-free access.",
        },
      });
      const existing = await tx.hall.findUnique({
        where: { venueId_name: { venueId: venue.id, name: definition.hall } },
      });
      if (existing) return existing;
      const rows = Array.from({ length: definition.rows }, (_, i) =>
        String.fromCharCode(65 + i),
      );
      return tx.hall.create({
        data: {
          venueId: venue.id,
          name: definition.hall,
          capacity: definition.rows * definition.columns,
          layoutConfig: {
            stageLabel: definition.key === "cinema" ? "SCREEN" : "STAGE",
            rows,
            seatsPerRow: definition.columns,
          },
          seats: {
            create: rows.flatMap((row, ri) =>
              Array.from({ length: definition.columns }, (_, ci) => ({
                row,
                number: ci + 1,
                section: "MAIN",
                type:
                  ri === rows.length - 1 && ci < 2
                    ? SeatType.ACCESSIBLE
                    : definition.key === "cinema" && ri === rows.length - 1
                      ? SeatType.COUPLE
                      : ri === 0
                        ? SeatType.VIP
                        : ri === 1
                          ? SeatType.PREMIUM
                          : SeatType.STANDARD,
                x: 80 + ci * 48 + (ci >= definition.columns / 2 ? 32 : 0),
                y: 80 + ri * 48,
              })),
            ),
          },
        },
      });
    });
    halls.set(definition.key, hall.id);
  }
  // No sessions: this spare hall supports all venue-designer operations.
  await prisma.hall.upsert({
    where: {
      venueId_name: { venueId: venueId("river"), name: "Studio Workshop" },
    },
    update: {},
    create: {
      venueId: venueId("river"),
      name: "Studio Workshop",
      capacity: 12,
      layoutConfig: { stageLabel: "STAGE" },
      seats: {
        create: Array.from({ length: 12 }, (_, i) => ({
          row: i < 6 ? "A" : "B",
          number: (i % 6) + 1,
          type: "STANDARD",
          x: 80 + (i % 6) * 48,
          y: 80 + Math.floor(i / 6) * 48,
        })),
      },
    },
  });
  let created = 0;
  for (const [eventIndex, definition] of events.entries()) {
    const slug = `demo-${definition.slug}`;
    // Each event and all its related fixtures commit atomically. Reruns skip existing events.
    const added = await prisma.$transaction(
      async (tx) => {
        if (await tx.event.findUnique({ where: { slug } })) return false;
        const venue = venues.find((v) => v.key === definition.venue)!;
        const organizationId = orgs[venue.organization]!.id;
        const status = definition.status ?? "PUBLISHED";
        const event = await tx.event.create({
          data: {
            organizationId,
            slug,
            title: definition.title,
            description: definition.description,
            category: definition.category,
            status,
            posterUrl: `/images/demo/${definition.image}.jpg`,
            bannerUrl: `/images/demo/${definition.image}.jpg`,
            saleStartAt: ago(60),
            saleEndAt: new Date(
              Math.max(
                at(Math.max(...definition.days)).getTime(),
                definition.scenario === "closed-refund"
                  ? now.getTime() + 12 * 3600000
                  : 0,
              ),
            ),
            refundPolicy: {
              fullRefundHours: 72,
              partialRefundHours: 24,
              partialRefundPercent: 50,
            },
            createdAt: new Date(now.getTime() - eventIndex * 1000),
          },
        });
        const promo = await tx.promotion.findUniqueOrThrow({
          where: { organizationId_code: { organizationId, code: "WELCOME10" } },
        });
        for (const [sessionIndex, offset] of definition.days.entries()) {
          await seedSession(tx, definition, {
            eventId: event.id,
            hallId: halls.get(definition.venue)!,
            organizationId,
            actorId: owner.id,
            customerIds: customers.map((u) => u.id),
            promotionId: promo.id,
            offset,
            sessionIndex,
            eventIndex,
          });
        }
        if (status === "CANCELLED")
          await tx.eventCancellation.create({
            data: {
              eventId: event.id,
              actorId: owner.id,
              reason: "Production safety review; all ticket holders refunded.",
              status: "COMPLETED",
              createdAt: ago(1),
              completedAt: ago(1),
            },
          });
        await tx.auditLog.create({
          data: {
            organizationId,
            actorId: owner.id,
            action:
              status === "CANCELLED" ? "EVENT_CANCELLED" : "DEMO_EVENT_CREATED",
            targetId: event.id,
            details: { title: event.title, status, source: "demo-seed" },
            createdAt: status === "CANCELLED" ? ago(1) : ago(60),
          },
        });
        return true;
      },
      { timeout: 60000 },
    );
    if (added) created++;
  }
  console.log(
    `Demo seed complete: ${created} events added, ${events.length - created} already present. Existing data preserved.`,
  );
  console.log(
    "Demo logins: organizer, manager, staff, scanner, admin, customer-a, customer-b @seatly.local / password123 (new accounts only).",
  );
  console.log(
    "Scenarios and image credits: docs/demo-data.md. Open http://localhost:3000/events",
  );
}

async function seedSession(
  tx: Tx,
  definition: DemoEvent,
  input: {
    eventId: string;
    hallId: string;
    organizationId: string;
    actorId: string;
    customerIds: string[];
    promotionId: string;
    offset: number;
    sessionIndex: number;
    eventIndex: number;
  },
) {
  const eventStatus = definition.status ?? "PUBLISHED";
  const soldOut =
    definition.scenario === "sold-out" && input.sessionIndex === 0;
  // Hour-based examples stay inside their refund windows even when seeded late at night.
  const startAt =
    definition.scenario === "partial-refund"
      ? new Date(now.getTime() + 48 * 3600000)
      : definition.scenario === "closed-refund"
        ? new Date(now.getTime() + 12 * 3600000)
        : at(input.offset);
  const rules =
    definition.scenario === "popular"
      ? [
          { soldPercent: 50, multiplierPercent: 120 },
          { soldPercent: 80, multiplierPercent: 140 },
        ]
      : [];
  const session = await tx.session.create({
    data: {
      eventId: input.eventId,
      hallId: input.hallId,
      startAt,
      endAt: new Date(startAt.getTime() + 3 * 3600000),
      status:
        eventStatus === "DRAFT"
          ? "SCHEDULED"
          : eventStatus === "COMPLETED"
            ? "COMPLETED"
            : eventStatus === "CANCELLED"
              ? "CANCELLED"
              : soldOut
                ? "SOLD_OUT"
                : "SELLING",
      waitingRoomCapacity:
        definition.scenario === "queue" && input.sessionIndex === 0 ? 1 : 0,
      admissionMinutes: 10,
      pricingRules: rules,
    },
  });
  const seats = await tx.seat.findMany({
    where: { hallId: input.hallId },
    orderBy: [{ row: "asc" }, { number: "asc" }],
  });
  await tx.sessionSeat.createMany({
    data: seats.map((seat, i) => {
      const price = Math.round(
        definition.price *
          (seat.type === "VIP"
            ? 2
            : seat.type === "PREMIUM"
              ? 1.5
              : seat.type === "COUPLE"
                ? 1.8
                : 1),
      );
      return {
        sessionId: session.id,
        seatId: seat.id,
        price,
        basePrice: price,
        status:
          eventStatus === "CANCELLED" || (!soldOut && i === seats.length - 1)
            ? "BLOCKED"
            : "AVAILABLE",
      };
    }),
  });
  if (eventStatus === "DRAFT") return;
  const inventory = await tx.sessionSeat.findMany({
    where: { sessionId: session.id },
    include: { seat: true },
    orderBy: [{ seat: { row: "asc" } }, { seat: { number: "asc" } }],
  });
  const bookedCount = soldOut
    ? seats.length
    : definition.scenario === "popular"
      ? 60
      : eventStatus === "CANCELLED"
        ? 6
        : eventStatus === "COMPLETED"
          ? 36
          : 6 + (input.eventIndex % 5) * 2;
  for (let i = 0; i < bookedCount; i += 2) {
    await seedBooking(tx, {
      ...input,
      sessionId: session.id,
      userId: input.customerIds[(i / 2) % input.customerIds.length]!,
      seats: inventory.slice(i, i + 2),
      ordinal: i / 2 + input.eventIndex + input.sessionIndex,
      state: eventStatus === "CANCELLED" ? "REFUNDED" : "PAID",
      cancelled: eventStatus === "CANCELLED",
      used: eventStatus === "COMPLETED",
      promotionId: i === 4 ? input.promotionId : undefined,
    });
  }
  if (!soldOut && eventStatus === "PUBLISHED" && input.sessionIndex === 0) {
    for (const [index, state] of (
      ["REFUNDED", "PAYMENT_FAILED", "EXPIRED"] as const
    ).entries()) {
      await seedBooking(tx, {
        ...input,
        sessionId: session.id,
        userId: input.customerIds[index % 2]!,
        seats: inventory.slice(bookedCount + index, bookedCount + index + 1),
        ordinal: index + input.eventIndex,
        state,
        promotionId: undefined,
      });
    }
  }
  if (rules.length) {
    // Match priceAt(): exclude blocked seats; historical purchases keep their original prices.
    const multiplier =
      bookedCount / (seats.length - 1) >= 0.8
        ? 1.4
        : bookedCount / (seats.length - 1) >= 0.5
          ? 1.2
          : 1;
    for (const seat of inventory
      .slice(bookedCount)
      .filter((s) => s.status === "AVAILABLE")) {
      await tx.sessionSeat.update({
        where: { id: seat.id },
        data: { price: Math.round(seat.basePrice! * multiplier) },
      });
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
