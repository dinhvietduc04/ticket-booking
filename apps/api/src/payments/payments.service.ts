import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { FakePaymentWebhookDto } from "@ticket-booking/contracts";
import {
  bookingDetailsInclude,
  mapBookingDetails,
} from "../bookings/bookings.service";
import { TicketEmailService } from "../notifications/ticket-email.service";
import { PrismaService } from "../prisma/prisma.service";
import { SeatEventsService } from "../realtime/seat-events.service";
import { TicketsService } from "../tickets/tickets.service";

import { serial } from "../commerce/commerce.service";

const DEFAULT_DEMO_USER_EMAIL = "customer-a@seatly.local";

const paymentInclude = {
  booking: {
    include: bookingDetailsInclude,
  },
} satisfies Prisma.PaymentInclude;

type PaymentRecord = Prisma.PaymentGetPayload<{
  include: typeof paymentInclude;
}>;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService,
    @Optional() private readonly ticketEmails?: TicketEmailService,
    @Optional() private readonly seatEvents?: SeatEventsService,
  ) {}

  async createFakePaymentForDemoBooking(
    bookingId: string,
    demoUserEmail = DEFAULT_DEMO_USER_EMAIL,
  ) {
    const user = await this.findDemoUser(demoUserEmail);
    return this.createFakePaymentForBooking(bookingId, user.id);
  }

  async createFakePaymentForBooking(bookingId: string, userId: string) {
    await this.expirePendingBookingIfNeeded(bookingId);

    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: {
        payments: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException({
        code: "BOOKING_NOT_FOUND",
        message: "Booking was not found.",
      });
    }

    if (booking.status === "PAID") {
      const successfulPayment = booking.payments.find(
        (payment) => payment.status === "SUCCESS",
      );

      if (successfulPayment) {
        return mapPaymentIntent(successfulPayment);
      }
    }

    if (booking.status !== "PENDING_PAYMENT") {
      throw new ConflictException({
        code: "BOOKING_NOT_PAYABLE",
        message: "This booking is no longer payable.",
      });
    }

    const pendingPayment = booking.payments.find(
      (payment) => payment.status === "PENDING",
    );

    if (pendingPayment) {
      return mapPaymentIntent(pendingPayment);
    }

    const payment = await this.prisma.payment.create({
      data: {
        bookingId: booking.id,
        provider: "FAKE",
        providerPaymentId: `fake_pi_${crypto.randomUUID()}`,
        amount: booking.total,
        currency: booking.currency,
      },
    });

    return mapPaymentIntent(payment);
  }

  async processFakeWebhook(dto: FakePaymentWebhookDto) {
    try {
      const outcome = await serial(this.prisma, async (tx) => {
        await tx.webhookEvent.create({
          data: {
            provider: "FAKE",
            eventId: dto.eventId,
          },
        });

        const payment = await tx.payment.findUnique({
          where: {
            provider_providerPaymentId: {
              provider: "FAKE",
              providerPaymentId: dto.providerPaymentId,
            },
          },
          include: paymentInclude,
        });

        if (!payment) {
          throw new NotFoundException({
            code: "PAYMENT_NOT_FOUND",
            message: "Payment was not found.",
          });
        }

        if (
          ["CANCELLED", "REFUNDED", "EXPIRED", "PAYMENT_FAILED"].includes(
            payment.booking.status,
          ) ||
          ["REFUNDED", "PARTIALLY_REFUNDED", "FAILED"].includes(
            payment.status,
          ) ||
          payment.booking.session.event.status === "CANCELLED"
        ) {
          return {
            result: {
              processed: true,
              payment: mapPaymentIntent(payment),
              booking: mapBookingDetails(payment.booking),
            },
            seatChange: null,
            ticketEmailBookingId: null,
          };
        }

        if (payment.status === "SUCCESS" || payment.booking.status === "PAID") {
          await this.tickets.createTicketsForBooking(tx, payment.booking.id);
          const refreshed = await tx.payment.findUniqueOrThrow({
            where: { id: payment.id },
            include: paymentInclude,
          });

          return {
            result: {
              processed: true,
              payment: mapPaymentIntent(refreshed),
              booking: mapBookingDetails(refreshed.booking),
            },
            seatChange: null,
            ticketEmailBookingId: refreshed.booking.id,
          };
        }

        if (dto.status === "FAILED") {
          const failed = await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: "FAILED",
              failureReason:
                dto.failureReason ?? "Fake provider reported payment failure.",
              booking: {
                update: {
                  status: "PAYMENT_FAILED",
                },
              },
            },
            include: paymentInclude,
          });

          const releasedSessionSeatIds =
            await this.releaseBookingSeatsWithinTransaction(
              tx,
              failed.booking.id,
            );
          await this.cancelHoldWithinTransaction(tx, failed.booking.holdId);

          return {
            result: {
              processed: true,
              payment: mapPaymentIntent(failed),
              booking: mapBookingDetails(failed.booking),
            },
            seatChange: {
              sessionId: failed.booking.sessionId,
              sessionSeatIds: releasedSessionSeatIds,
              reason: "RELEASED" as const,
            },
            ticketEmailBookingId: null,
          };
        }

        if (
          payment.booking.status !== "PENDING_PAYMENT" ||
          (payment.booking.expiresAt && payment.booking.expiresAt <= new Date())
        ) {
          const expired = await this.expireBookingWithinTransaction(
            tx,
            payment.booking.id,
          );

          return {
            result: {
              processed: true,
              payment: expired.payment
                ? mapPaymentIntent(expired.payment)
                : mapPaymentIntent(payment),
              booking: expired.booking
                ? mapBookingDetails(expired.booking)
                : mapBookingDetails(payment.booking),
            },
            seatChange:
              expired.releasedSessionSeatIds.length > 0
                ? {
                    sessionId: payment.booking.sessionId,
                    sessionSeatIds: expired.releasedSessionSeatIds,
                    reason: "EXPIRED" as const,
                  }
                : null,
            ticketEmailBookingId: null,
          };
        }

        const sessionSeatIds = payment.booking.items.map(
          (item) => item.sessionSeatId,
        );
        const bookedSeats = await tx.sessionSeat.updateMany({
          where: {
            id: { in: sessionSeatIds },
            status: "HELD",
          },
          data: {
            status: "BOOKED",
            version: { increment: 1 },
          },
        });

        if (bookedSeats.count !== sessionSeatIds.length) {
          throw new ConflictException({
            code: "SEAT_STATE_CHANGED",
            message: "One or more seats could not be booked.",
          });
        }

        const succeeded = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "SUCCESS",
            booking: {
              update: {
                status: "PAID",
                hold: payment.booking.holdId
                  ? {
                      update: {
                        status: "CONVERTED",
                      },
                    }
                  : undefined,
              },
            },
          },
          include: paymentInclude,
        });
        await this.tickets.createTicketsForBooking(tx, succeeded.booking.id);
        // Release only the admission used by this hold. A delayed payment must
        // never release a newer admission obtained after the original expired.
        if (succeeded.booking.holdId) {
          const hold = await tx.seatHold.findUniqueOrThrow({
            where: { id: succeeded.booking.holdId },
            select: { admissionEntryId: true },
          });
          if (hold.admissionEntryId) {
            await tx.waitingEntry.updateMany({
              where: {
                id: hold.admissionEntryId,
                sessionId: succeeded.booking.sessionId,
                userId: succeeded.booking.userId,
                status: "ADMITTED",
              },
              data: { status: "COMPLETED" },
            });
          }
        }
        const succeededWithTickets = await tx.payment.findUniqueOrThrow({
          where: { id: succeeded.id },
          include: paymentInclude,
        });

        return {
          result: {
            processed: true,
            payment: mapPaymentIntent(succeededWithTickets),
            booking: mapBookingDetails(succeededWithTickets.booking),
          },
          seatChange: {
            sessionId: succeededWithTickets.booking.sessionId,
            sessionSeatIds,
            reason: "BOOKED" as const,
          },
          ticketEmailBookingId: succeededWithTickets.booking.id,
        };
      });

      if (outcome.seatChange) {
        await this.seatEvents?.publishSeatChanges(
          outcome.seatChange.sessionId,
          outcome.seatChange.sessionSeatIds,
          outcome.seatChange.reason,
        );
      }
      if (outcome.ticketEmailBookingId) {
        await this.ticketEmails?.enqueueTicketEmail(
          outcome.ticketEmailBookingId,
        );
      }

      return outcome.result;
    } catch (error) {
      if (isUniqueConflict(error)) {
        const payment = await this.prisma.payment.findUnique({
          where: {
            provider_providerPaymentId: {
              provider: "FAKE",
              providerPaymentId: dto.providerPaymentId,
            },
          },
          include: paymentInclude,
        });

        return {
          processed: false,
          payment: payment ? mapPaymentIntent(payment) : null,
          booking: payment ? mapBookingDetails(payment.booking) : null,
        };
      }

      throw error;
    }
  }

  private async expirePendingBookingIfNeeded(bookingId: string) {
    const expired = await this.prisma.$transaction((tx) =>
      this.expireBookingWithinTransaction(tx, bookingId),
    );

    if (expired.booking && expired.releasedSessionSeatIds.length > 0) {
      await this.seatEvents?.publishSeatChanges(
        expired.booking.sessionId,
        expired.releasedSessionSeatIds,
        "EXPIRED",
      );
    }
  }

  private async expireBookingWithinTransaction(
    tx: Prisma.TransactionClient,
    bookingId: string,
  ) {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: bookingDetailsInclude,
    });

    if (
      !booking ||
      booking.status !== "PENDING_PAYMENT" ||
      !booking.expiresAt ||
      booking.expiresAt > new Date()
    ) {
      return { booking, payment: null, releasedSessionSeatIds: [] };
    }

    const releasedSessionSeatIds =
      await this.releaseBookingSeatsWithinTransaction(tx, booking.id);

    const payment = await tx.payment.updateMany({
      where: {
        bookingId: booking.id,
        status: "PENDING",
      },
      data: {
        status: "FAILED",
        failureReason: "Booking expired before payment completed.",
      },
    });

    const expiredBooking = await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: "EXPIRED",
        hold: booking.holdId
          ? {
              update: {
                status: "EXPIRED",
              },
            }
          : undefined,
      },
      include: bookingDetailsInclude,
    });

    const latestPayment =
      payment.count > 0
        ? await tx.payment.findFirst({
            where: { bookingId: booking.id },
            orderBy: { updatedAt: "desc" },
            include: paymentInclude,
          })
        : null;

    return {
      booking: expiredBooking,
      payment: latestPayment,
      releasedSessionSeatIds,
    };
  }

  private async releaseBookingSeatsWithinTransaction(
    tx: Prisma.TransactionClient,
    bookingId: string,
  ) {
    const items = await tx.bookingItem.findMany({
      where: { bookingId },
      select: { sessionSeatId: true },
    });

    await tx.sessionSeat.updateMany({
      where: {
        id: { in: items.map((item) => item.sessionSeatId) },
        status: "HELD",
      },
      data: {
        status: "AVAILABLE",
        version: { increment: 1 },
      },
    });

    return items.map((item) => item.sessionSeatId);
  }

  private async cancelHoldWithinTransaction(
    tx: Prisma.TransactionClient,
    holdId: string | null,
  ) {
    if (!holdId) {
      return;
    }

    await tx.seatHold.updateMany({
      where: {
        id: holdId,
        status: "ACTIVE",
      },
      data: {
        status: "CANCELLED",
      },
    });
  }

  private async findDemoUser(demoUserEmail: string) {
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

    return user;
  }
}

type PaymentLike = {
  id: string;
  bookingId: string;
  provider: "FAKE" | "STRIPE";
  providerPaymentId: string;
  amount: number;
  currency: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";
};

function mapPaymentIntent(payment: PaymentLike) {
  return {
    id: payment.id,
    bookingId: payment.bookingId,
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
  };
}

function isUniqueConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
