import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { OrganizationRole, Prisma } from "@prisma/client";
import {
  pricingRulesSchema,
  type RefundPolicy,
} from "@ticket-booking/contracts";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";

export const MANAGERS: OrganizationRole[] = ["OWNER", "ADMIN"];
export const STAFF: OrganizationRole[] = [...MANAGERS, "STAFF"];
export const SCANNERS: OrganizationRole[] = [...STAFF, "SCANNER"];

@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async user(authorization?: string) {
    if (!authorization?.startsWith("Bearer "))
      throw new UnauthorizedException("Please log in.");
    return this.auth.resolveRequestUserId(authorization);
  }

  async organization(
    userId: string,
    organizationId: string,
    roles = STAFF,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== "ACTIVE")
      throw new ForbiddenException("Account is inactive.");
    if (user.role === "ADMIN") return "OWNER" as const;
    const member = await tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { organization: true },
    });
    if (
      !member ||
      member.organization.status !== "ACTIVE" ||
      !roles.includes(member.role)
    ) {
      throw new ForbiddenException(
        "You do not have permission in this organization.",
      );
    }
    return member.role;
  }

  async ticket(userId: string, where: Prisma.TicketWhereUniqueInput) {
    const ticket = await this.prisma.ticket.findUnique({
      where,
      include: {
        bookingItem: {
          include: {
            booking: { include: { session: { include: { event: true } } } },
          },
        },
      },
    });
    if (!ticket) throw new NotFoundException("Ticket was not found.");
    await this.organization(
      userId,
      ticket.bookingItem.booking.session.event.organizationId,
      SCANNERS,
    );
  }
}

export function audit(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorId: string,
  action: string,
  targetId: string,
  details: Prisma.InputJsonValue = {},
) {
  return tx.auditLog.create({
    data: { organizationId, actorId, action, targetId, details },
  });
}

// Retry only database serialization conflicts. External provider calls must stay outside this helper.
export async function serial<T>(
  prisma: PrismaService,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: "Serializable",
        timeout: 15000,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt >= 4
      )
        throw error;
    }
  }
}

export function priceAt(
  base: number,
  sold: number,
  capacity: number,
  rules: unknown,
) {
  const parsed = pricingRulesSchema.safeParse(rules ?? []);
  if (!parsed.success) return base;
  const threshold = capacity ? (sold * 100) / capacity : 0;
  const rule = [...parsed.data]
    .sort((a, b) => b.soldPercent - a.soldPercent)
    .find((r) => threshold >= r.soldPercent);
  return Math.round((base * (rule?.multiplierPercent ?? 100)) / 100);
}

export function refundPercent(startAt: Date, now: Date, policy: RefundPolicy) {
  const hours = (startAt.getTime() - now.getTime()) / 3600000;
  return hours >= policy.fullRefundHours
    ? 100
    : hours >= policy.partialRefundHours
      ? policy.partialRefundPercent
      : 0;
}

export async function promotionDiscount(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  code: string | undefined,
  subtotal: number,
  currency: string,
) {
  if (!code) return { discount: 0, promotionId: undefined };
  const promotion = await tx.promotion.findUnique({
    where: {
      organizationId_code: { organizationId, code: code.trim().toUpperCase() },
    },
  });
  const now = new Date();
  if (
    !promotion ||
    !promotion.active ||
    promotion.startsAt > now ||
    promotion.endsAt <= now ||
    promotion.currency !== currency
  )
    throw new ConflictException("Promo code is unavailable.");
  const where: Prisma.BookingWhereInput = {
    promotionId: promotion.id,
    OR: [
      { status: { in: ["PAID", "REFUNDED"] } },
      { status: "PENDING_PAYMENT", expiresAt: { gt: now } },
    ],
  };
  const used = await tx.booking.count({ where });
  const personal = await tx.booking.count({ where: { ...where, userId } });
  if (used >= promotion.usageLimit || personal >= promotion.perUserLimit)
    throw new ConflictException("Promo code usage limit reached.");
  const raw =
    promotion.type === "PERCENTAGE"
      ? Math.floor((subtotal * promotion.value) / 100)
      : promotion.value;
  return {
    discount: Math.min(subtotal, raw, promotion.maxDiscount ?? subtotal),
    promotionId: promotion.id,
  };
}

@Injectable()
export class WaitingRoomService {
  constructor(private readonly prisma: PrismaService) {}

  async join(sessionId: string, userId: string) {
    return serial(this.prisma, async (tx) => {
      // One short row lock assigns/admit FIFO entries across every API process.
      await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${sessionId} FOR UPDATE`;
      const session = await tx.session.findUnique({
        where: { id: sessionId },
        include: { event: true },
      });
      if (
        !session ||
        session.status !== "SELLING" ||
        session.event.status === "CANCELLED"
      )
        throw new ConflictException("This session is not selling.");
      if (session.waitingRoomCapacity === 0)
        return {
          status: "DISABLED",
          position: 0,
          admissionToken: null,
          admittedUntil: null,
        };
      const now = new Date();
      await tx.waitingEntry.updateMany({
        where: { sessionId, status: "ADMITTED", admittedUntil: { lte: now } },
        data: { status: "EXPIRED" },
      });
      let own = await tx.waitingEntry.findUnique({
        where: { sessionId_userId: { sessionId, userId } },
      });
      if (own?.status === "EXPIRED" || own?.status === "COMPLETED") {
        await tx.waitingEntry.delete({ where: { id: own.id } });
        own = null;
      }
      if (!own)
        own = await tx.waitingEntry.create({ data: { sessionId, userId } });
      const admitted = await tx.waitingEntry.count({
        where: { sessionId, status: "ADMITTED", admittedUntil: { gt: now } },
      });
      const next = await tx.waitingEntry.findMany({
        where: { sessionId, status: "WAITING" },
        orderBy: { sequence: "asc" },
        take: Math.max(0, session.waitingRoomCapacity - admitted),
      });
      if (next.length)
        await tx.waitingEntry.updateMany({
          where: { id: { in: next.map((e) => e.id) } },
          data: {
            status: "ADMITTED",
            admittedUntil: new Date(
              now.getTime() + session.admissionMinutes * 60000,
            ),
          },
        });
      own = await tx.waitingEntry.findUniqueOrThrow({ where: { id: own.id } });
      const position =
        own.status === "WAITING"
          ? 1 +
            (await tx.waitingEntry.count({
              where: {
                sessionId,
                status: "WAITING",
                sequence: { lt: own.sequence },
              },
            }))
          : 0;
      return {
        status: own.status,
        position,
        admissionToken: own.status === "ADMITTED" ? own.token : null,
        admittedUntil: own.admittedUntil?.toISOString() ?? null,
      };
    });
  }
}

export async function requireAdmission(
  tx: Prisma.TransactionClient,
  sessionId: string,
  userId: string,
  token?: string,
) {
  const entry = token
    ? await tx.waitingEntry.findFirst({
        where: {
          sessionId,
          userId,
          token,
          status: "ADMITTED",
          admittedUntil: { gt: new Date() },
        },
      })
    : null;
  if (!entry)
    throw new ForbiddenException({
      code: "WAITING_ROOM_REQUIRED",
      message: "Join the waiting room to reserve seats.",
    });
  return entry;
}
