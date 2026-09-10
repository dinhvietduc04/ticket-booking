import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_DEMO_USER_EMAIL = "customer-a@seatly.local";

const ticketDetailsInclude = {
  user: true,
  bookingItem: {
    include: {
      booking: {
        include: {
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
        },
      },
      sessionSeat: {
        include: {
          seat: true,
        },
      },
    },
  },
} satisfies Prisma.TicketInclude;

type TicketRecord = Prisma.TicketGetPayload<{
  include: typeof ticketDetailsInclude;
}>;

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTicketsForBooking(
    tx: Prisma.TransactionClient,
    bookingId: string,
  ) {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: {
        items: {
          include: {
            ticket: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException({
        code: "BOOKING_NOT_FOUND",
        message: "Booking was not found.",
      });
    }

    for (const item of booking.items) {
      if (item.ticket) {
        continue;
      }

      await tx.ticket.create({
        data: {
          bookingItemId: item.id,
          userId: booking.userId,
          ticketNumber: createTicketNumber(),
          qrCode: createTicketToken(),
        },
      });
    }
  }

  async listDemoBookingTickets(
    bookingId: string,
    demoUserEmail = DEFAULT_DEMO_USER_EMAIL,
  ) {
    const user = await this.findDemoUser(demoUserEmail);
    return this.listBookingTicketsForUser(bookingId, user.id);
  }

  async listBookingTicketsForUser(bookingId: string, userId: string) {
    await this.ensureTicketsForPaidBooking(bookingId, userId);

    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      select: { id: true },
    });

    if (!booking) {
      throw new NotFoundException({
        code: "BOOKING_NOT_FOUND",
        message: "Booking was not found.",
      });
    }

    const tickets = await this.prisma.ticket.findMany({
      where: {
        userId,
        bookingItem: {
          bookingId,
        },
      },
      include: ticketDetailsInclude,
      orderBy: {
        createdAt: "asc",
      },
    });

    return {
      data: tickets.map(mapTicketDetails),
    };
  }

  private async ensureTicketsForPaidBooking(bookingId: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, userId },
        include: {
          items: {
            include: {
              ticket: true,
            },
          },
        },
      });

      if (!booking || booking.status !== "PAID") {
        return;
      }

      for (const item of booking.items) {
        if (item.ticket) {
          continue;
        }

        await tx.ticket.create({
          data: {
            bookingItemId: item.id,
            userId: booking.userId,
            ticketNumber: createTicketNumber(),
            qrCode: createTicketToken(),
          },
        });
      }
    });
  }

  async getDemoTicket(id: string, demoUserEmail = DEFAULT_DEMO_USER_EMAIL) {
    const user = await this.findDemoUser(demoUserEmail);
    return this.getTicketForUser(id, user.id);
  }

  async getTicketForUser(id: string, userId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, userId },
      include: ticketDetailsInclude,
    });

    if (!ticket) {
      throw new NotFoundException({
        code: "TICKET_NOT_FOUND",
        message: "Ticket was not found.",
      });
    }

    return mapTicketDetails(ticket);
  }

  async validateToken(token: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { qrCode: token },
      include: ticketDetailsInclude,
    });

    if (!ticket) {
      return {
        valid: false,
        reason: "Ticket token was not found.",
        ticket: null,
      };
    }

    const invalidReason = getInvalidTicketReason(ticket);

    return {
      valid: !invalidReason,
      ...(invalidReason ? { reason: invalidReason } : {}),
      ticket: mapTicketDetails(ticket),
    };
  }

  async checkInByToken(token: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { qrCode: token },
      select: { id: true },
    });

    if (!ticket) {
      throw new NotFoundException({
        code: "TICKET_NOT_FOUND",
        message: "Ticket was not found.",
      });
    }

    return this.checkInById(ticket.id);
  }

  async checkInById(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({
        where: { id },
        include: ticketDetailsInclude,
      });

      if (!ticket) {
        throw new NotFoundException({
          code: "TICKET_NOT_FOUND",
          message: "Ticket was not found.",
        });
      }

      const invalidReason = getInvalidTicketReason(ticket);
      if (invalidReason) {
        throw new ConflictException({
          code:
            ticket.status === "USED" ? "TICKET_ALREADY_USED" : "TICKET_INVALID",
          message: invalidReason,
        });
      }

      const updated = await tx.ticket.updateMany({
        where: {
          id,
          status: "VALID",
        },
        data: {
          status: "USED",
          usedAt: new Date(),
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException({
          code: "TICKET_ALREADY_USED",
          message: "Ticket has already been checked in.",
        });
      }

      const checkedIn = await tx.ticket.findUniqueOrThrow({
        where: { id },
        include: ticketDetailsInclude,
      });

      return {
        checkedIn: true,
        ticket: mapTicketDetails(checkedIn),
      };
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

function mapTicketDetails(ticket: TicketRecord) {
  const booking = ticket.bookingItem.booking;
  const seat = ticket.bookingItem.sessionSeat.seat;

  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    bookingId: booking.id,
    bookingNumber: booking.bookingNumber,
    eventTitle: booking.session.event.title,
    venueName: booking.session.hall.venue.name,
    hallName: booking.session.hall.name,
    startAt: booking.session.startAt.toISOString(),
    seatLabel: `${seat.row}${seat.number}`,
    holderName: `${ticket.user.firstName} ${ticket.user.lastName}`.trim(),
    qrCode: ticket.qrCode,
    status: ticket.status,
    usedAt: ticket.usedAt?.toISOString() ?? null,
    createdAt: ticket.createdAt.toISOString(),
  };
}

function getInvalidTicketReason(ticket: TicketRecord) {
  if (
    ticket.bookingItem.booking.session.status === "CANCELLED" ||
    ticket.bookingItem.booking.session.event.status === "CANCELLED"
  )
    return "Event was cancelled.";
  if (ticket.status === "USED") {
    return "Ticket has already been checked in.";
  }

  if (ticket.status !== "VALID") {
    return "Ticket is not valid for entry.";
  }

  if (ticket.bookingItem.booking.status !== "PAID") {
    return "Booking has not been paid.";
  }

  return null;
}

function createTicketNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `TK-${datePart}-${randomPart}`;
}

function createTicketToken() {
  return `ticket_${crypto.randomUUID()}`;
}
