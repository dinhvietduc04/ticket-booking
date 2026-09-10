import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CreateSeatHoldDto } from "@ticket-booking/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { SeatEventsService } from "../realtime/seat-events.service";
import { SeatHoldExpirationService } from "./seat-hold-expiration.service";
import {
  priceAt,
  requireAdmission,
  serial,
} from "../commerce/commerce.service";

const HOLD_DURATION_MS = 5 * 60 * 1000;
const DEFAULT_DEMO_USER_EMAIL = "customer-a@seatly.local";

@Injectable()
export class SeatHoldsService {
  private readonly logger = new Logger(SeatHoldsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly expiration: SeatHoldExpirationService,
    @Optional() private readonly seatEvents?: SeatEventsService,
  ) {}

  async createDemoHold(
    sessionId: string,
    dto: CreateSeatHoldDto,
    demoUserEmail = DEFAULT_DEMO_USER_EMAIL,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { email: demoUserEmail.trim().toLowerCase() },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException({
        code: "DEMO_USER_NOT_FOUND",
        message: "Seeded demo user was not found. Run pnpm db:seed.",
      });
    }

    return this.createHoldForUser(user.id, sessionId, dto);
  }

  async createHoldForUser(
    userId: string,
    sessionId: string,
    dto: CreateSeatHoldDto,
  ) {
    const expiresAt = new Date(Date.now() + HOLD_DURATION_MS);
    const requestedSeatIds = [...new Set(dto.seatIds)];

    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const session = await tx.session.findUnique({
            where: { id: sessionId },
            include: { event: true },
          });

          if (
            !session ||
            session.status !== "SELLING" ||
            session.event.status === "CANCELLED"
          ) {
            throw new NotFoundException({
              code: "SESSION_NOT_FOUND",
              message: "Selling session was not found.",
            });
          }

          const admission =
            session.waitingRoomCapacity > 0
              ? await requireAdmission(
                  tx,
                  sessionId,
                  userId,
                  dto.admissionToken,
                )
              : null;
          const inventory = await tx.sessionSeat.groupBy({
            by: ["status"],
            where: { sessionId },
            _count: true,
          });
          const sold =
            inventory.find((s) => s.status === "BOOKED")?._count ?? 0;
          const capacity = inventory
            .filter((s) => s.status !== "BLOCKED")
            .reduce((n, s) => n + s._count, 0);
          const seats = await tx.sessionSeat.findMany({
            where: {
              sessionId,
              seatId: { in: requestedSeatIds },
            },
            include: { seat: true },
          });

          if (seats.length !== requestedSeatIds.length) {
            throw seatUnavailable();
          }

          const activeHold = await tx.seatHold.findFirst({
            where: {
              userId,
              sessionId,
              status: "ACTIVE",
              expiresAt: { gt: new Date() },
              booking: null,
            },
            include: {
              items: {
                include: {
                  sessionSeat: { include: { seat: true } },
                },
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          });
          const existingSeatIds = new Set(
            activeHold?.items.map((item) => item.sessionSeat.seatId) ?? [],
          );
          const seatsToHold = seats.filter(
            (seat) => !existingSeatIds.has(seat.seatId),
          );
          if ((activeHold?.items.length ?? 0) + seatsToHold.length > 8)
            throw new ConflictException(
              "A hold can contain at most eight seats.",
            );

          const staleReleasedSessionSeatIds =
            await this.expiration.expireStaleHoldsForSessionSeats(
              tx,
              sessionId,
              seatsToHold.map((seat) => seat.id),
            );

          const updated = await tx.sessionSeat.updateMany({
            where: {
              id: { in: seatsToHold.map((seat) => seat.id) },
              status: "AVAILABLE",
            },
            data: {
              status: "HELD",
              version: { increment: 1 },
            },
          });

          if (updated.count !== seatsToHold.length) {
            throw seatUnavailable();
          }

          if (activeHold && seatsToHold.length > 0) {
            await tx.seatHoldItem.createMany({
              data: seatsToHold.map((seat) => ({
                holdId: activeHold.id,
                sessionSeatId: seat.id,
                price: priceAt(
                  seat.basePrice ?? seat.price,
                  sold,
                  capacity,
                  session.pricingRules,
                ),
                currency: seat.currency,
              })),
              skipDuplicates: true,
            });
          }

          const hold = activeHold
            ? await tx.seatHold.update({
                where: { id: activeHold.id },
                data: { admissionEntryId: admission?.id ?? null },
                include: {
                  items: {
                    include: {
                      sessionSeat: { include: { seat: true } },
                    },
                  },
                },
              })
            : await tx.seatHold.create({
                data: {
                  userId,
                  sessionId,
                  admissionEntryId: admission?.id ?? null,
                  expiresAt,
                  items: {
                    create: seatsToHold.map((seat) => ({
                      sessionSeatId: seat.id,
                      price: priceAt(
                        seat.basePrice ?? seat.price,
                        sold,
                        capacity,
                        session.pricingRules,
                      ),
                      currency: seat.currency,
                    })),
                  },
                },
                include: {
                  items: {
                    include: {
                      sessionSeat: { include: { seat: true } },
                    },
                  },
                },
              });

          if (hold.items.length === 0) {
            throw seatUnavailable();
          }

          const requestedButNotHeld = requestedSeatIds.some(
            (seatId) =>
              !hold.items.some((item) => item.sessionSeat.seatId === seatId),
          );

          if (requestedButNotHeld) {
            throw seatUnavailable();
          }

          if (
            hold.items.some((item) => item.sessionSeat.status !== "HELD") ||
            hold.items.some((item) => item.sessionSeat.sessionId !== sessionId)
          ) {
            throw seatUnavailable();
          }

          const total = hold.items.reduce((sum, item) => sum + item.price, 0);

          return {
            response: {
              holdId: hold.id,
              expiresAt: hold.expiresAt.toISOString(),
              seats: hold.items.map((item) => ({
                id: item.sessionSeat.seatId,
                label: `${item.sessionSeat.seat.row}${item.sessionSeat.seat.number}`,
                price: item.price,
                currency: item.currency,
              })),
              total,
            },
            staleReleasedSessionSeatIds,
            heldSessionSeatIds: seatsToHold.map((seat) => seat.id),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      try {
        await this.expiration.scheduleHoldExpiration(
          result.response.holdId,
          new Date(result.response.expiresAt),
        );
      } catch (error) {
        this.logger.warn(
          `Seat hold ${result.response.holdId} was created but expiration scheduling failed.`,
          error instanceof Error ? error.stack : undefined,
        );
      }

      await this.seatEvents?.publishSeatChanges(
        sessionId,
        result.staleReleasedSessionSeatIds,
        "EXPIRED",
      );
      await this.seatEvents?.publishSeatChanges(
        sessionId,
        result.heldSessionSeatIds,
        "HELD",
      );

      return result.response;
    } catch (error) {
      if (isSeatConflict(error)) {
        throw seatUnavailable();
      }

      throw error;
    }
  }

  async findById(holdId: string, userId?: string) {
    const hold = await this.prisma.seatHold.findUnique({
      where: { id: holdId },
      include: {
        items: {
          include: {
            sessionSeat: { include: { seat: true } },
          },
        },
      },
    });

    if (!hold) {
      throw new NotFoundException({
        code: "HOLD_NOT_FOUND",
        message: "Seat hold was not found.",
      });
    }

    if (userId && hold.userId !== userId)
      throw new ForbiddenException("This hold belongs to another customer.");
    return {
      id: hold.id,
      sessionId: hold.sessionId,
      status: hold.status,
      expiresAt: hold.expiresAt.toISOString(),
      seats: hold.items.map((item) => ({
        id: item.sessionSeat.seatId,
        label: `${item.sessionSeat.seat.row}${item.sessionSeat.seat.number}`,
        price: item.price,
        currency: item.currency,
      })),
      total: hold.items.reduce((sum, item) => sum + item.price, 0),
    };
  }

  async cancel(holdId: string, userId?: string) {
    const result = await serial(this.prisma, async (tx) => {
      const hold = await tx.seatHold.findUnique({
        where: { id: holdId },
        include: { items: true },
      });

      if (!hold) {
        throw new NotFoundException({
          code: "HOLD_NOT_FOUND",
          message: "Seat hold was not found.",
        });
      }

      if (userId && hold.userId !== userId)
        throw new ForbiddenException("This hold belongs to another customer.");
      if (hold.status !== "ACTIVE") {
        return {
          response: { id: hold.id, status: hold.status },
          sessionId: hold.sessionId,
          releasedSessionSeatIds: [],
        };
      }

      await tx.payment.updateMany({
        where: { booking: { holdId }, status: "PENDING" },
        data: { status: "FAILED", failureReason: "Reservation cancelled" },
      });
      await tx.booking.updateMany({
        where: { holdId, status: "PENDING_PAYMENT" },
        data: { status: "CANCELLED" },
      });
      await tx.sessionSeat.updateMany({
        where: {
          id: { in: hold.items.map((item) => item.sessionSeatId) },
          status: "HELD",
        },
        data: {
          status: "AVAILABLE",
          version: { increment: 1 },
        },
      });

      const cancelled = await tx.seatHold.update({
        where: { id: hold.id },
        data: { status: "CANCELLED" },
      });

      return {
        response: {
          id: cancelled.id,
          status: cancelled.status,
        },
        sessionId: hold.sessionId,
        releasedSessionSeatIds: hold.items.map((item) => item.sessionSeatId),
      };
    });

    await this.seatEvents?.publishSeatChanges(
      result.sessionId,
      result.releasedSessionSeatIds,
      "RELEASED",
    );

    return result.response;
  }
}

function seatUnavailable() {
  return new ConflictException({
    code: "SEAT_NOT_AVAILABLE",
    message: "One or more seats are no longer available.",
  });
}

function isSeatConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}
