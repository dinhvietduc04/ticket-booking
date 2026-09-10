import { Injectable, NotFoundException } from "@nestjs/common";
import type { SessionSeatMap } from "@ticket-booking/contracts";
import { PrismaService } from "../prisma/prisma.service";

import { priceAt } from "../commerce/commerce.service";

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        eventId: true,
        startAt: true,
        pricingRules: true,
        endAt: true,
        status: true,
        event: {
          select: {
            title: true,
          },
        },
        hall: {
          select: {
            name: true,
            venue: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException({
        code: "SESSION_NOT_FOUND",
        message: "Session was not found.",
      });
    }

    return {
      id: session.id,
      eventId: session.eventId,
      eventTitle: session.event.title,
      startAt: session.startAt.toISOString(),
      endAt: session.endAt.toISOString(),
      status: session.status,
      venueName: session.hall.venue.name,
      hallName: session.hall.name,
    };
  }

  async getSeatMap(sessionId: string): Promise<SessionSeatMap> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        startAt: true,
        pricingRules: true,
        event: {
          select: {
            title: true,
          },
        },
        hall: {
          select: {
            name: true,
            venue: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException({
        code: "SESSION_NOT_FOUND",
        message: "Session was not found.",
      });
    }

    const sessionSeats = await this.prisma.sessionSeat.findMany({
      where: { sessionId },
      select: {
        id: true,
        seatId: true,
        price: true,
        basePrice: true,
        currency: true,
        status: true,
        version: true,
        seat: {
          select: {
            row: true,
            number: true,
            section: true,
            type: true,
            x: true,
            y: true,
          },
        },
      },
      orderBy: [{ seat: { row: "asc" } }, { seat: { number: "asc" } }],
    });

    return {
      sessionId: session.id,
      eventTitle: session.event.title,
      venueName: session.hall.venue.name,
      hallName: session.hall.name,
      startAt: session.startAt.toISOString(),
      seats: sessionSeats.map((sessionSeat) => ({
        id: sessionSeat.id,
        seatId: sessionSeat.seatId,
        label: `${sessionSeat.seat.row}${sessionSeat.seat.number}`,
        section: sessionSeat.seat.section,
        row: sessionSeat.seat.row,
        number: sessionSeat.seat.number,
        type: sessionSeat.seat.type,
        x: sessionSeat.seat.x,
        y: sessionSeat.seat.y,
        price:
          sessionSeat.status === "AVAILABLE"
            ? priceAt(
                sessionSeat.basePrice ?? sessionSeat.price,
                sessionSeats.filter((s) => s.status === "BOOKED").length,
                sessionSeats.filter((s) => s.status !== "BLOCKED").length,
                session.pricingRules,
              )
            : sessionSeat.price,
        currency: sessionSeat.currency,
        status: sessionSeat.status,
        version: sessionSeat.version,
      })),
    };
  }
}
