import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Job, Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import { SeatEventsService } from "../realtime/seat-events.service";

import { serial } from "../commerce/commerce.service";

const QUEUE_NAME = "seat-hold-expiration";

type ExpireHoldJob = {
  holdId: string;
};

type SeatReleaseGroup = {
  sessionId: string;
  sessionSeatIds: string[];
};

@Injectable()
export class SeatHoldExpirationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SeatHoldExpirationService.name);
  private connection?: IORedis;
  private queue?: Queue<ExpireHoldJob>;
  private worker?: Worker<ExpireHoldJob>;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly seatEvents?: SeatEventsService,
  ) {}

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      this.logger.warn(
        "REDIS_URL is not set; seat holds expire on next access.",
      );
      return;
    }

    this.connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<ExpireHoldJob>(QUEUE_NAME, {
      connection: this.connection,
    });
    this.worker = new Worker<ExpireHoldJob>(
      QUEUE_NAME,
      (job) => this.processExpirationJob(job),
      { connection: this.connection },
    );

    this.worker.on("failed", (job, error) => {
      this.logger.error(
        `Seat hold expiration job failed: ${job?.id ?? "unknown"}`,
        error.stack,
      );
    });

    await this.expireDueHolds();
    await this.rescheduleActiveHolds();
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }

  async scheduleHoldExpiration(holdId: string, expiresAt: Date) {
    if (!this.queue) {
      return;
    }

    const jobId = `seat-hold-${holdId}`;
    const existingJob = await this.queue.getJob(jobId);
    await existingJob?.remove();

    await this.queue.add(
      "expire-hold",
      { holdId },
      {
        delay: Math.max(expiresAt.getTime() - Date.now(), 0),
        jobId,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }

  async expireHold(holdId: string, now = new Date()) {
    const result = await serial(this.prisma, (tx) =>
      this.expireHoldWithinTransaction(tx, holdId, now),
    );

    await this.publishReleaseGroups(result.releaseGroups, "EXPIRED");

    return result.hold;
  }

  async expireStaleHoldsForSessionSeats(
    tx: Prisma.TransactionClient,
    sessionId: string,
    sessionSeatIds: string[],
    now = new Date(),
  ) {
    if (sessionSeatIds.length === 0) {
      return [];
    }

    const holds = await tx.seatHold.findMany({
      where: {
        sessionId,
        status: "ACTIVE",
        expiresAt: { lte: now },
        items: {
          some: {
            sessionSeatId: { in: sessionSeatIds },
          },
        },
      },
      select: {
        id: true,
        items: {
          select: {
            sessionSeatId: true,
          },
        },
      },
    });

    if (holds.length === 0) {
      return [];
    }

    const releaseGroups = await this.releaseExpiredHoldsWithinTransaction(
      tx,
      holds.map((hold) => hold.id),
      now,
    );

    return releaseGroups.flatMap((group) => group.sessionSeatIds);
  }

  private async processExpirationJob(job: Job<ExpireHoldJob>) {
    await this.expireHold(job.data.holdId);
  }

  private async expireDueHolds() {
    const holds = await this.prisma.seatHold.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: { lte: new Date() },
      },
      select: { id: true },
      take: 500,
    });

    if (holds.length === 0) {
      return;
    }

    const releaseGroups = await serial(this.prisma, (tx) =>
      this.releaseExpiredHoldsWithinTransaction(
        tx,
        holds.map((hold) => hold.id),
        new Date(),
      ),
    );

    await this.publishReleaseGroups(releaseGroups, "EXPIRED");
  }

  private async rescheduleActiveHolds() {
    if (!this.queue) {
      return;
    }

    const holds = await this.prisma.seatHold.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, expiresAt: true },
      take: 1000,
    });

    await Promise.all(
      holds.map((hold) => this.scheduleHoldExpiration(hold.id, hold.expiresAt)),
    );
  }

  private async expireHoldWithinTransaction(
    tx: Prisma.TransactionClient,
    holdId: string,
    now: Date,
  ) {
    const hold = await tx.seatHold.findUnique({
      where: { id: holdId },
      select: {
        id: true,
        status: true,
        expiresAt: true,
      },
    });

    if (!hold || hold.status !== "ACTIVE" || hold.expiresAt > now) {
      return { hold, releaseGroups: [] };
    }

    const releaseGroups = await this.releaseExpiredHoldsWithinTransaction(
      tx,
      [hold.id],
      now,
    );

    const expiredHold = await tx.seatHold.findUnique({
      where: { id: hold.id },
      select: {
        id: true,
        status: true,
        expiresAt: true,
      },
    });

    return { hold: expiredHold, releaseGroups };
  }

  private async releaseExpiredHoldsWithinTransaction(
    tx: Prisma.TransactionClient,
    holdIds: string[],
    now: Date,
  ): Promise<SeatReleaseGroup[]> {
    const holds = await tx.seatHold.findMany({
      where: {
        id: { in: holdIds },
        status: "ACTIVE",
        expiresAt: { lte: now },
      },
      select: {
        id: true,
        sessionId: true,
        items: {
          select: {
            sessionSeatId: true,
          },
        },
      },
    });

    const sessionSeatIds = holds.flatMap((hold) =>
      hold.items.map((item) => item.sessionSeatId),
    );
    const expiredHoldIds = holds.map((hold) => hold.id);

    const pendingBookings = await tx.booking.findMany({
      where: {
        holdId: { in: expiredHoldIds },
        status: "PENDING_PAYMENT",
      },
      select: { id: true },
    });
    const pendingBookingIds = pendingBookings.map((booking) => booking.id);

    if (sessionSeatIds.length > 0) {
      await tx.sessionSeat.updateMany({
        where: {
          id: { in: sessionSeatIds },
          status: "HELD",
        },
        data: {
          status: "AVAILABLE",
          version: { increment: 1 },
        },
      });
    }

    if (pendingBookingIds.length > 0) {
      await tx.payment.updateMany({
        where: {
          bookingId: { in: pendingBookingIds },
          status: "PENDING",
        },
        data: {
          status: "FAILED",
          failureReason: "Booking expired before payment completed.",
        },
      });

      await tx.booking.updateMany({
        where: {
          id: { in: pendingBookingIds },
          status: "PENDING_PAYMENT",
        },
        data: {
          status: "EXPIRED",
        },
      });
    }

    await tx.seatHold.updateMany({
      where: {
        id: { in: expiredHoldIds },
        status: "ACTIVE",
      },
      data: {
        status: "EXPIRED",
      },
    });

    return groupReleasedSeatsBySession(holds);
  }

  private async publishReleaseGroups(
    releaseGroups: SeatReleaseGroup[],
    reason: "EXPIRED",
  ) {
    await Promise.all(
      releaseGroups.map((group) =>
        this.seatEvents?.publishSeatChanges(
          group.sessionId,
          group.sessionSeatIds,
          reason,
        ),
      ),
    );
  }
}

function groupReleasedSeatsBySession(
  holds: Array<{
    sessionId: string;
    items: Array<{ sessionSeatId: string }>;
  }>,
): SeatReleaseGroup[] {
  const groups = new Map<string, Set<string>>();

  for (const hold of holds) {
    const group = groups.get(hold.sessionId) ?? new Set<string>();

    for (const item of hold.items) {
      group.add(item.sessionSeatId);
    }

    groups.set(hold.sessionId, group);
  }

  return [...groups.entries()].map(([sessionId, seatIds]) => ({
    sessionId,
    sessionSeatIds: [...seatIds],
  }));
}
