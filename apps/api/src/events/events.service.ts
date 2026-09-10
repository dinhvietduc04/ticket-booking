import { Injectable, NotFoundException } from "@nestjs/common";
import type { EventSummary, ListEventsQuery } from "@ticket-booking/contracts";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListEventsQuery) {
    const where = {
      status: "PUBLISHED" as const,
      ...(query.category ? { category: query.category } : {}),
      ...(query.search
        ? {
            title: {
              contains: query.search,
              mode: "insensitive" as const,
            },
          }
        : {}),
      ...(query.city
        ? {
            sessions: {
              some: {
                hall: {
                  venue: {
                    city: {
                      contains: query.city,
                      mode: "insensitive" as const,
                    },
                  },
                },
              },
            },
          }
        : {}),
    };

    const [events, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          slug: true,
          description: true,
          category: true,
          posterUrl: true,
          sessions: {
            where: { status: "SELLING" },
            orderBy: { startAt: "asc" },
            select: {
              id: true,
              startAt: true,
              hall: {
                select: {
                  venue: {
                    select: {
                      city: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.event.count({ where }),
    ]);
    const sessionIds = events.flatMap((event) =>
      event.sessions.map((session) => session.id),
    );
    const priceGroups =
      sessionIds.length > 0
        ? await this.prisma.sessionSeat.groupBy({
            by: ["sessionId"],
            where: {
              sessionId: { in: sessionIds },
              status: "AVAILABLE",
            },
            _min: { price: true },
          })
        : [];
    const minPriceBySessionId = new Map(
      priceGroups.map((group) => [group.sessionId, group._min.price]),
    );

    return {
      data: events.map((event): EventSummary => {
        const firstSession = event.sessions[0];
        const minPrices = event.sessions
          .map((session) => minPriceBySessionId.get(session.id))
          .filter((price): price is number => typeof price === "number");

        return {
          id: event.id,
          title: event.title,
          slug: event.slug,
          description: event.description,
          category: event.category,
          posterUrl: event.posterUrl,
          city: firstSession?.hall.venue.city ?? "",
          venueName: firstSession?.hall.venue.name ?? "",
          nextSessionAt: firstSession?.startAt.toISOString() ?? null,
          minPrice: minPrices.length > 0 ? Math.min(...minPrices) : null,
        };
      }),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findBySlug(slug: string) {
    const event = await this.prisma.event.findUnique({
      where: { slug },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        category: true,
        posterUrl: true,
        bannerUrl: true,
        status: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        sessions: {
          orderBy: { startAt: "asc" },
          select: {
            id: true,
            startAt: true,
            endAt: true,
            status: true,
            hall: {
              select: {
                name: true,
                venue: {
                  select: {
                    name: true,
                    city: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!event || event.status !== "PUBLISHED") {
      throw new NotFoundException({
        code: "EVENT_NOT_FOUND",
        message: "Event was not found.",
      });
    }
    const sessionIds = event.sessions.map((session) => session.id);
    const availabilityGroups =
      sessionIds.length > 0
        ? await this.prisma.sessionSeat.groupBy({
            by: ["sessionId"],
            where: {
              sessionId: { in: sessionIds },
              status: "AVAILABLE",
            },
            _count: { _all: true },
            _min: { price: true },
          })
        : [];
    const availabilityBySessionId = new Map(
      availabilityGroups.map((group) => [
        group.sessionId,
        {
          count: group._count._all,
          minPrice: group._min.price,
        },
      ]),
    );

    return {
      id: event.id,
      title: event.title,
      slug: event.slug,
      description: event.description,
      category: event.category,
      posterUrl: event.posterUrl,
      bannerUrl: event.bannerUrl,
      organization: {
        id: event.organization.id,
        name: event.organization.name,
      },
      sessions: event.sessions.map((session) => {
        const availability = availabilityBySessionId.get(session.id);

        return {
          id: session.id,
          startAt: session.startAt.toISOString(),
          endAt: session.endAt.toISOString(),
          status: session.status,
          venueName: session.hall.venue.name,
          hallName: session.hall.name,
          city: session.hall.venue.city,
          availableSeatCount: availability?.count ?? 0,
          minPrice: availability?.minPrice ?? null,
        };
      }),
    };
  }
}
