import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  LayoutInput,
  MemberInput,
  PromotionInput,
  RefundPolicy,
  SessionSettings,
} from "@ticket-booking/contracts";
import { PrismaService } from "../prisma/prisma.service";
import {
  AccessService,
  audit,
  MANAGERS,
  serial,
  STAFF,
} from "../commerce/commerce.service";

@Injectable()
export class OrganizerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async organizations(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    return this.prisma.organization.findMany({
      where:
        user.role === "ADMIN"
          ? {}
          : { status: "ACTIVE", members: { some: { userId } } },
      select: {
        id: true,
        name: true,
        members: { where: { userId }, select: { role: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  async overview(organizationId: string, actorId: string) {
    await this.access.organization(actorId, organizationId);
    const [events, venues, promotions, members] = await Promise.all([
      this.prisma.event.findMany({
        where: { organizationId },
        include: { sessions: true, cancellation: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.venue.findMany({
        where: { organizationId },
        include: {
          halls: {
            include: {
              seats: { orderBy: [{ row: "asc" }, { number: "asc" }] },
              _count: { select: { sessions: true } },
            },
          },
        },
      }),
      this.prisma.promotion.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.organizationMember.findMany({
        where: { organizationId },
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return { events, venues, promotions, members };
  }

  async analytics(
    organizationId: string,
    actorId: string,
    from?: string,
    to?: string,
  ) {
    await this.access.organization(actorId, organizationId, STAFF);
    const createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
    const bookings = await this.prisma.booking.findMany({
      where: { session: { event: { organizationId } }, createdAt },
      include: {
        payments: true,
        refunds: true,
        items: true,
        session: { include: { event: true } },
      },
    });
    const inventory = await this.prisma.sessionSeat.groupBy({
      by: ["status"],
      where: { session: { event: { organizationId } } },
      _count: true,
    });
    const captured = bookings.filter((b) =>
      b.payments.some((p) =>
        ["SUCCESS", "REFUNDED", "PARTIALLY_REFUNDED"].includes(p.status),
      ),
    );
    const currencies = [...new Set(captured.map((b) => b.currency))];
    const revenue = currencies.map((currency) => {
      const rows = captured.filter((b) => b.currency === currency);
      const grossRevenue = rows.reduce((n, b) => n + b.total, 0);
      const refunds = rows.reduce(
        (n, b) => n + b.refunds.reduce((s, r) => s + r.amount, 0),
        0,
      );
      return {
        currency,
        grossRevenue,
        refunds,
        netRevenue: grossRevenue - refunds,
        averageOrderValue: rows.length
          ? Math.round(grossRevenue / rows.length)
          : 0,
      };
    });
    const group = (
      key: (b: (typeof captured)[number]) => string,
      identity = key,
    ) => {
      const map = new Map<
        string,
        {
          id: string;
          label: string;
          currency: string;
          orders: number;
          tickets: number;
          gross: number;
          refunds: number;
        }
      >();
      for (const b of captured) {
        const label = key(b),
          id = `${identity(b)}:${b.currency}`;
        const row = map.get(id) ?? {
          id,
          label,
          currency: b.currency,
          orders: 0,
          tickets: 0,
          gross: 0,
          refunds: 0,
        };
        row.orders++;
        row.tickets += b.items.length;
        row.gross += b.total;
        row.refunds += b.refunds.reduce((n, r) => n + r.amount, 0);
        map.set(id, row);
      }
      return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
    };
    const byTicketType = new Map<
      string,
      { label: string; currency: string; tickets: number; subtotal: number }
    >();
    for (const b of captured)
      for (const item of b.items) {
        const key = `${item.ticketType}:${b.currency}`,
          row = byTicketType.get(key) ?? {
            label: item.ticketType,
            currency: b.currency,
            tickets: 0,
            subtotal: 0,
          };
        row.tickets++;
        row.subtotal += item.price;
        byTicketType.set(key, row);
      }
    return {
      revenue,
      orders: bookings.length,
      paidOrders: captured.length,
      ticketsSold: captured.reduce((n, b) => n + b.items.length, 0),
      conversionRate: bookings.length ? captured.length / bookings.length : 0,
      refundRate: captured.length
        ? captured.filter((b) => b.refunds.some((r) => r.amount > 0)).length /
          captured.length
        : 0,
      seatsRemaining:
        inventory.find((s) => s.status === "AVAILABLE")?._count ?? 0,
      inventory,
      byDay: group((b) => b.createdAt.toISOString().slice(0, 10)),
      bySession: group(
        (b) => `${b.session.event.title} · ${b.session.startAt.toISOString()}`,
        (b) => b.sessionId,
      ),
      byTicketType: [...byTicketType.values()],
    };
  }

  async logs(
    organizationId: string,
    actorId: string,
    page = 1,
    action?: string,
  ) {
    await this.access.organization(actorId, organizationId, MANAGERS);
    const where = { organizationId, ...(action ? { action } : {}) };
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 25,
        take: 25,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / 25) };
  }

  async member(organizationId: string, actorId: string, input: MemberInput) {
    return serial(this.prisma, async (tx) => {
      const role = await this.access.organization(
        actorId,
        organizationId,
        MANAGERS,
        tx,
      );
      const user = await tx.user.findUnique({
        where: { email: input.email.toLowerCase() },
      });
      if (!user)
        throw new NotFoundException(
          "This user must register before being added.",
        );
      const current = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId: user.id } },
      });
      if (
        role !== "OWNER" &&
        (input.role === "OWNER" ||
          current?.role === "OWNER" ||
          input.role === "ADMIN" ||
          current?.role === "ADMIN")
      )
        throw new ConflictException(
          "Only an owner can manage owners and administrators.",
        );
      if (
        current?.role === "OWNER" &&
        input.role !== "OWNER" &&
        (await tx.organizationMember.count({
          where: { organizationId, role: "OWNER" },
        })) <= 1
      )
        throw new ConflictException("Keep at least one organization owner.");
      const member = await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId, userId: user.id } },
        create: { organizationId, userId: user.id, role: input.role },
        update: { role: input.role },
      });
      await audit(tx, organizationId, actorId, "MEMBER_UPDATED", member.id, {
        email: user.email,
        before: current?.role ?? null,
        after: input.role,
      });
      return member;
    });
  }

  async removeMember(
    organizationId: string,
    actorId: string,
    memberId: string,
  ) {
    return serial(this.prisma, async (tx) => {
      const role = await this.access.organization(
        actorId,
        organizationId,
        MANAGERS,
        tx,
      );
      const member = await tx.organizationMember.findFirst({
        where: { id: memberId, organizationId },
      });
      if (!member) throw new NotFoundException("Member was not found.");
      if (role !== "OWNER" && ["OWNER", "ADMIN"].includes(member.role))
        throw new ConflictException("Only an owner can remove this member.");
      if (
        member.role === "OWNER" &&
        (await tx.organizationMember.count({
          where: { organizationId, role: "OWNER" },
        })) <= 1
      )
        throw new ConflictException("Keep at least one organization owner.");
      await tx.organizationMember.delete({ where: { id: memberId } });
      await audit(tx, organizationId, actorId, "MEMBER_REMOVED", memberId, {
        userId: member.userId,
        role: member.role,
      });
      return { removed: true };
    });
  }

  async promotion(
    organizationId: string,
    actorId: string,
    input: PromotionInput,
  ) {
    return serial(this.prisma, async (tx) => {
      await this.access.organization(actorId, organizationId, MANAGERS, tx);
      const existing = await tx.promotion.findUnique({
        where: { organizationId_code: { organizationId, code: input.code } },
      });
      if (existing)
        throw new ConflictException("This promo code already exists.");
      const promotion = await tx.promotion.create({
        data: { ...input, organizationId },
      });
      await audit(
        tx,
        organizationId,
        actorId,
        "PROMOTION_CREATED",
        promotion.id,
        { code: input.code },
      );
      return promotion;
    });
  }
  async disablePromotion(organizationId: string, actorId: string, id: string) {
    return serial(this.prisma, async (tx) => {
      await this.access.organization(actorId, organizationId, MANAGERS, tx);
      const result = await tx.promotion.updateMany({
        where: { id, organizationId },
        data: { active: false },
      });
      if (!result.count)
        throw new NotFoundException("Promotion was not found.");
      await audit(tx, organizationId, actorId, "PROMOTION_DISABLED", id);
      return { disabled: true };
    });
  }
  async policy(eventId: string, actorId: string, policy: RefundPolicy) {
    return serial(this.prisma, async (tx) => {
      const event = await tx.event.findUniqueOrThrow({
        where: { id: eventId },
      });
      await this.access.organization(
        actorId,
        event.organizationId,
        MANAGERS,
        tx,
      );
      // Existing customers retain the policy that was visible at purchase.
      if (
        await tx.booking.count({
          where: {
            session: { eventId },
            status: { in: ["PAID", "PENDING_PAYMENT"] },
          },
        })
      )
        throw new ConflictException(
          "Refund policy is locked after checkout begins.",
        );
      const result = await tx.event.update({
        where: { id: eventId },
        data: { refundPolicy: policy },
      });
      await audit(
        tx,
        event.organizationId,
        actorId,
        "REFUND_POLICY_UPDATED",
        eventId,
        policy,
      );
      return result;
    });
  }
  async settings(
    sessionId: string,
    actorId: string,
    settings: SessionSettings,
  ) {
    return serial(this.prisma, async (tx) => {
      const session = await tx.session.findUniqueOrThrow({
        where: { id: sessionId },
        include: { event: true },
      });
      await this.access.organization(
        actorId,
        session.event.organizationId,
        MANAGERS,
        tx,
      );
      const result = await tx.session.update({
        where: { id: sessionId },
        data: settings,
      });
      await audit(
        tx,
        session.event.organizationId,
        actorId,
        "SESSION_SETTINGS_UPDATED",
        sessionId,
        settings,
      );
      return result;
    });
  }
  async layout(hallId: string, actorId: string, layout: LayoutInput) {
    return serial(this.prisma, async (tx) => {
      const hall = await tx.hall.findUniqueOrThrow({
        where: { id: hallId },
        include: {
          venue: true,
          seats: true,
          _count: { select: { sessions: true } },
        },
      });
      await this.access.organization(
        actorId,
        hall.venue.organizationId,
        MANAGERS,
        tx,
      );
      const existing = new Map(hall.seats.map((s) => [s.id, s]));
      for (const seat of layout.seats)
        if (seat.id && !existing.has(seat.id))
          throw new ConflictException("Seat belongs to another hall.");
      if (
        hall._count.sessions &&
        (layout.seats.length !== hall.seats.length ||
          layout.seats.some(
            (s) =>
              !s.id ||
              s.row !== existing.get(s.id)?.row ||
              s.number !== existing.get(s.id)?.number ||
              s.type !== existing.get(s.id)?.type ||
              s.section !== existing.get(s.id)?.section,
          ))
      )
        throw new ConflictException(
          "A scheduled hall supports position changes only. Create a new hall for a different seat structure.",
        );
      if (!hall._count.sessions)
        await tx.seat.deleteMany({ where: { hallId } });
      for (const seat of layout.seats) {
        if (hall._count.sessions)
          await tx.seat.update({
            where: { id: seat.id! },
            data: { x: seat.x, y: seat.y },
          });
        else await tx.seat.create({ data: { ...seat, hallId } });
      }
      await tx.hall.update({
        where: { id: hallId },
        data: {
          capacity: layout.seats.length,
          layoutConfig: { width: 2100, height: 2100 },
        },
      });
      await audit(
        tx,
        hall.venue.organizationId,
        actorId,
        "HALL_LAYOUT_UPDATED",
        hallId,
        { seatCount: layout.seats.length },
      );
      return { saved: true };
    });
  }
  async createHall(venueId: string, actorId: string, name: string) {
    return serial(this.prisma, async (tx) => {
      const venue = await tx.venue.findUniqueOrThrow({
        where: { id: venueId },
      });
      await this.access.organization(
        actorId,
        venue.organizationId,
        MANAGERS,
        tx,
      );
      const hall = await tx.hall.create({
        data: { venueId, name, capacity: 0 },
      });
      await audit(tx, venue.organizationId, actorId, "HALL_CREATED", hall.id, {
        name,
      });
      return hall;
    });
  }
}
