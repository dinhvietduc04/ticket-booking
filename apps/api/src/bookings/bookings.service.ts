import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CreateBookingDto } from "@ticket-booking/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { SeatHoldExpirationService } from "../seat-holds/seat-hold-expiration.service";

import { promotionDiscount, serial } from "../commerce/commerce.service";

const DEFAULT_DEMO_USER_EMAIL = "customer-a@seatly.local";

export const bookingDetailsInclude = {
  session: {
    include: {
      event: true,
      hall: {
        include: {
          venue: true,
        },
      },
    },
  },
  items: {
    include: {
      ticket: true,
      sessionSeat: {
        include: {
          seat: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  },
} satisfies Prisma.BookingInclude;

type BookingRecord = Prisma.BookingGetPayload<{
  include: typeof bookingDetailsInclude;
}>;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expiration: SeatHoldExpirationService,
  ) {}

  async createDemoBooking(
    dto: CreateBookingDto,
    demoUserEmail = DEFAULT_DEMO_USER_EMAIL,
  ) {
    const user = await this.findDemoUser(demoUserEmail);
    return this.createBookingForUser(user.id, dto);
  }

  async createBookingForUser(userId: string, dto: CreateBookingDto) {
    const staleHold = await this.prisma.seatHold.findUnique({
      where: { id: dto.holdId },
      select: { id: true, status: true, expiresAt: true },
    });

    if (staleHold?.status === "ACTIVE" && staleHold.expiresAt <= new Date()) {
      await this.expiration.expireHold(staleHold.id);
    }

    return serial(this.prisma, async (tx) => {
      const hold = await tx.seatHold.findUnique({
        where: { id: dto.holdId },
        include: {
          session: { include: { event: true } },
          booking: {
            include: bookingDetailsInclude,
          },
          items: {
            include: {
              sessionSeat: {
                include: {
                  seat: true,
                },
              },
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

      if (hold.userId !== userId) {
        throw new ForbiddenException({
          code: "HOLD_OWNER_MISMATCH",
          message: "This hold belongs to another customer.",
        });
      }

      if (
        hold.session.status === "CANCELLED" ||
        hold.session.event.status === "CANCELLED"
      )
        throw new ConflictException("Event was cancelled.");

      if (hold.booking) {
        return mapBookingDetails(hold.booking);
      }

      if (hold.status !== "ACTIVE") {
        throw new ConflictException({
          code: "HOLD_NOT_ACTIVE",
          message: "This hold is no longer active.",
        });
      }

      if (hold.expiresAt <= new Date()) {
        throw new ConflictException({
          code: "HOLD_EXPIRED",
          message: "This hold expired before checkout started.",
        });
      }

      if (hold.items.length === 0) {
        throw new ConflictException({
          code: "EMPTY_HOLD",
          message: "This hold does not contain any seats.",
        });
      }

      if (
        hold.items.some((item) => item.sessionSeat.status !== "HELD") ||
        hold.items.some((item) => item.sessionSeat.sessionId !== hold.sessionId)
      ) {
        throw new ConflictException({
          code: "SEAT_NOT_HELD",
          message: "One or more held seats are no longer reserved.",
        });
      }

      const subtotal = hold.items.reduce((sum, item) => sum + item.price, 0);
      const serviceFee = Math.round(subtotal * 0.1);
      const currency = hold.items[0]?.currency ?? "VND";
      const { discount, promotionId } = await promotionDiscount(
        tx,
        hold.session.event.organizationId,
        userId,
        dto.promoCode,
        subtotal,
        currency,
      );
      const total = subtotal + serviceFee - discount;

      const booking = await tx.booking.create({
        data: {
          bookingNumber: createBookingNumber(),
          userId,
          sessionId: hold.sessionId,
          holdId: hold.id,
          subtotal,
          serviceFee,
          discount,
          promotionId,
          total,
          currency,
          expiresAt: hold.expiresAt,
          items: {
            create: hold.items.map((item) => ({
              sessionSeatId: item.sessionSeatId,
              price: item.price,
              ticketType: item.sessionSeat.seat.type,
            })),
          },
        },
        include: bookingDetailsInclude,
      });

      return mapBookingDetails(booking);
    });
  }

  async listDemoBookings(demoUserEmail = DEFAULT_DEMO_USER_EMAIL) {
    const user = await this.findDemoUser(demoUserEmail);
    return this.listBookingsForUser(user.id);
  }

  async listBookingsForUser(userId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { userId },
      include: bookingDetailsInclude,
      orderBy: { createdAt: "desc" },
    });

    return {
      data: bookings.map(mapBookingDetails),
    };
  }

  async getDemoBooking(id: string, demoUserEmail = DEFAULT_DEMO_USER_EMAIL) {
    const user = await this.findDemoUser(demoUserEmail);
    return this.getBookingForUser(id, user.id);
  }

  async getBookingForUser(id: string, userId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, userId },
      include: bookingDetailsInclude,
    });

    if (!booking) {
      throw new NotFoundException({
        code: "BOOKING_NOT_FOUND",
        message: "Booking was not found.",
      });
    }

    return mapBookingDetails(booking);
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

export function mapBookingDetails(booking: BookingRecord) {
  return {
    id: booking.id,
    bookingNumber: booking.bookingNumber,
    userId: booking.userId,
    sessionId: booking.sessionId,
    holdId: booking.holdId,
    subtotal: booking.subtotal,
    serviceFee: booking.serviceFee,
    discount: booking.discount,
    total: booking.total,
    currency: booking.currency,
    status: booking.status,
    expiresAt: booking.expiresAt?.toISOString() ?? null,
    eventTitle: booking.session.event.title,
    venueName: booking.session.hall.venue.name,
    hallName: booking.session.hall.name,
    startAt: booking.session.startAt.toISOString(),
    seats: booking.items.map((item) => ({
      id: item.sessionSeat.seatId,
      label: `${item.sessionSeat.seat.row}${item.sessionSeat.seat.number}`,
      price: item.price,
      currency: item.sessionSeat.currency,
    })),
    tickets: booking.items
      .filter((item) => item.ticket)
      .map((item) => ({
        id: item.ticket!.id,
        ticketNumber: item.ticket!.ticketNumber,
        seatLabel: `${item.sessionSeat.seat.row}${item.sessionSeat.seat.number}`,
        status: item.ticket!.status,
      })),
    createdAt: booking.createdAt.toISOString(),
  };
}

function createBookingNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `BK-${datePart}-${randomPart}`;
}
