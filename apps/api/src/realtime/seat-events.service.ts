import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import type {
  SeatStatusChanged,
  SeatStatusChangeReason,
} from "@ticket-booking/contracts";
import IORedis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import { SeatEventsGateway } from "./seat-events.gateway";

const CACHE_TTL_SECONDS = 60 * 60 * 24;

@Injectable()
export class SeatEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SeatEventsService.name);
  private redis?: IORedis;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly gateway?: SeatEventsGateway,
  ) {}

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      this.logger.warn("REDIS_URL is not set; seat status cache is disabled.");
      return;
    }

    this.redis = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
    });
  }

  async onModuleDestroy() {
    this.redis?.disconnect();
  }

  async publishSeatChanges(
    sessionId: string,
    sessionSeatIds: string[],
    reason: SeatStatusChangeReason,
  ) {
    const uniqueIds = [...new Set(sessionSeatIds)];

    if (uniqueIds.length === 0) {
      return;
    }

    const sessionSeats = await this.prisma.sessionSeat.findMany({
      where: {
        id: { in: uniqueIds },
        sessionId,
      },
      include: {
        seat: true,
      },
    });

    if (sessionSeats.length === 0) {
      return;
    }

    const payload: SeatStatusChanged = {
      sessionId,
      reason,
      seats: sessionSeats.map((sessionSeat) => ({
        sessionSeatId: sessionSeat.id,
        seatId: sessionSeat.seatId,
        label: `${sessionSeat.seat.row}${sessionSeat.seat.number}`,
        status: sessionSeat.status,
        version: sessionSeat.version,
      })),
      emittedAt: new Date().toISOString(),
    };

    await this.cacheSeatStatuses(payload);
    this.gateway?.publishSeatStatusChanged(payload);
  }

  private async cacheSeatStatuses(payload: SeatStatusChanged) {
    if (!this.redis) {
      return;
    }

    const key = `sessions:${payload.sessionId}:seat-status`;
    const values = Object.fromEntries(
      payload.seats.map((seat) => [
        seat.sessionSeatId,
        JSON.stringify({
          ...seat,
          reason: payload.reason,
          emittedAt: payload.emittedAt,
        }),
      ]),
    );

    await this.redis.hset(key, values);
    await this.redis.expire(key, CACHE_TTL_SECONDS);
  }
}
