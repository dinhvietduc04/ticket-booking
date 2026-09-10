import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { refundPolicySchema } from "@ticket-booking/contracts";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import {
  AccessService,
  audit,
  MANAGERS,
  refundPercent,
  serial,
} from "../commerce/commerce.service";
import { SeatEventsService } from "../realtime/seat-events.service";

@Injectable()
export class RefundsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RefundsService.name);
  private connection?: IORedis;
  private queue?: Queue<{ eventId: string }>;
  private worker?: Worker<{ eventId: string }>;
  private recovery?: ReturnType<typeof setInterval>;
  private recovering = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    @Optional() private readonly seats?: SeatEventsService,
  ) {}

  async onModuleInit() {
    if (process.env.REDIS_URL) {
      this.connection = new IORedis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null,
      });
      this.queue = new Queue("event-refunds", { connection: this.connection });
      this.worker = new Worker(
        "event-refunds",
        (job) => this.processCancellation(job.data.eventId),
        { connection: this.connection },
      );
      this.worker.on("failed", (_job, error) =>
        this.logger.error(error.message),
      );
    }
    this.recovery = setInterval(() => {
      void this.recover();
    }, 30000);
    this.recovery.unref();
    await this.recover();
  }
  async onModuleDestroy() {
    clearInterval(this.recovery);
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }

  async quote(bookingId: string, userId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: {
        session: { include: { event: true } },
        refunds: true,
        items: { include: { ticket: true } },
      },
    });
    if (!booking) throw new NotFoundException("Booking was not found.");
    const policy = refundPolicySchema.parse(
      booking.session.event.refundPolicy ?? {},
    );
    const percent =
      booking.status === "PAID" &&
      !booking.items.some((i) => i.ticket?.status === "USED")
        ? refundPercent(booking.session.startAt, new Date(), policy)
        : 0;
    return {
      percent,
      amount: Math.floor((booking.total * percent) / 100),
      currency: booking.currency,
      policy,
      refunds: booking.refunds,
    };
  }

  async refund(
    bookingId: string,
    actorId: string,
    kind: "CUSTOMER" | "EVENT" = "CUSTOMER",
  ) {
    const result = await serial(this.prisma, async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          session: { include: { event: true } },
          payments: true,
          items: { include: { ticket: true } },
          refunds: true,
        },
      });
      if (!booking || (kind === "CUSTOMER" && booking.userId !== actorId))
        throw new NotFoundException("Booking was not found.");
      if (kind === "EVENT" && booking.session.event.status !== "CANCELLED")
        throw new ConflictException("Event is not cancelled.");
      const existing = booking.refunds.find((r) => r.kind === kind);
      if (existing)
        return {
          refund: existing,
          sessionId: booking.sessionId,
          seatIds: [] as string[],
        };
      if (
        !["PAID", "REFUNDED"].includes(booking.status) ||
        (kind === "CUSTOMER" && booking.status !== "PAID")
      )
        throw new ConflictException("Booking is not refundable.");
      if (
        kind === "CUSTOMER" &&
        booking.items.some((i) => i.ticket?.status === "USED")
      )
        throw new ConflictException("Checked-in tickets cannot be refunded.");
      const policy = refundPolicySchema.parse(
        booking.session.event.refundPolicy ?? {},
      );
      const percent =
        kind === "EVENT"
          ? 100
          : refundPercent(booking.session.startAt, new Date(), policy);
      if (percent === 0)
        throw new ConflictException("The refund window has closed.");
      const refunded = booking.refunds.reduce((sum, r) => sum + r.amount, 0);
      const amount = Math.max(
        0,
        Math.floor((booking.total * percent) / 100) - refunded,
      );
      const payments = booking.payments.filter((p) =>
        ["SUCCESS", "PARTIALLY_REFUNDED", "REFUNDED"].includes(p.status),
      );
      if (payments.some((p) => p.provider !== "FAKE"))
        throw new ConflictException(
          "Refunds currently support the fake payment provider only.",
        );
      if (
        payments.reduce((sum, p) => sum + p.amount - p.refundedAmount, 0) <
        amount
      )
        throw new ConflictException(
          "Insufficient captured payment for refund.",
        );
      let remaining = amount;
      for (const payment of payments) {
        const portion = Math.min(
          remaining,
          payment.amount - payment.refundedAmount,
        );
        if (portion <= 0) continue;
        const next = payment.refundedAmount + portion;
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            refundedAmount: next,
            status: next === payment.amount ? "REFUNDED" : "PARTIALLY_REFUNDED",
          },
        });
        remaining -= portion;
      }
      const refund = await tx.refund.create({
        data: {
          bookingId,
          actorId,
          kind,
          amount,
          currency: booking.currency,
          reason:
            kind === "EVENT"
              ? "Event cancelled"
              : `Customer cancellation (${percent}% refund)`,
          providerRefundId: `fake_refund_${bookingId}_${kind}`,
        },
      });
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: "REFUNDED" },
      });
      await tx.ticket.updateMany({
        where: { bookingItem: { bookingId } },
        data: { status: "REFUNDED" },
      });
      const seatIds =
        kind === "CUSTOMER" ? booking.items.map((i) => i.sessionSeatId) : [];
      if (seatIds.length)
        await tx.sessionSeat.updateMany({
          where: { id: { in: seatIds }, status: "BOOKED" },
          data: {
            status:
              booking.session.event.status === "CANCELLED"
                ? "BLOCKED"
                : "AVAILABLE",
            version: { increment: 1 },
          },
        });
      await tx.customerNotification.upsert({
        where: { bookingId_kind: { bookingId, kind } },
        create: {
          bookingId,
          kind,
          message: `${refund.reason}. ${amount} ${booking.currency} refunded via the demo payment provider.`,
        },
        update: {},
      });
      await audit(
        tx,
        booking.session.event.organizationId,
        actorId,
        "BOOKING_REFUNDED",
        bookingId,
        { amount, kind },
      );
      return { refund, sessionId: booking.sessionId, seatIds };
    });
    if (result.seatIds.length)
      await this.seats?.publishSeatChanges(
        result.sessionId,
        result.seatIds,
        "RELEASED",
      );
    return result.refund;
  }

  async cancelEvent(eventId: string, actorId: string, reason: string) {
    const result = await serial(this.prisma, async (tx) => {
      const event = await tx.event.findUnique({ where: { id: eventId } });
      if (!event) throw new NotFoundException("Event was not found.");
      await this.access.organization(
        actorId,
        event.organizationId,
        MANAGERS,
        tx,
      );
      const existing = await tx.eventCancellation.findUnique({
        where: { eventId },
      });
      if (existing) return existing;
      await tx.event.update({
        where: { id: eventId },
        data: { status: "CANCELLED" },
      });
      await tx.session.updateMany({
        where: { eventId },
        data: { status: "CANCELLED" },
      });
      await tx.ticket.updateMany({
        where: {
          bookingItem: { booking: { session: { eventId } } },
          status: "VALID",
        },
        data: { status: "CANCELLED" },
      });
      await tx.payment.updateMany({
        where: { booking: { session: { eventId } }, status: "PENDING" },
        data: { status: "FAILED", failureReason: "Event cancelled" },
      });
      await tx.booking.updateMany({
        where: { session: { eventId }, status: "PENDING_PAYMENT" },
        data: { status: "CANCELLED" },
      });
      await tx.seatHold.updateMany({
        where: { session: { eventId }, status: "ACTIVE" },
        data: { status: "CANCELLED" },
      });
      await tx.sessionSeat.updateMany({
        where: { session: { eventId }, status: { in: ["AVAILABLE", "HELD"] } },
        data: { status: "BLOCKED", version: { increment: 1 } },
      });
      await audit(
        tx,
        event.organizationId,
        actorId,
        "EVENT_CANCELLED",
        eventId,
        { reason },
      );
      return tx.eventCancellation.create({
        data: { eventId, actorId, reason },
      });
    });
    const sessions = await this.prisma.session.findMany({
      where: { eventId },
      include: { sessionSeats: { select: { id: true } } },
    });
    for (const session of sessions)
      await this.seats?.publishSeatChanges(
        session.id,
        session.sessionSeats.map((s) => s.id),
        "RELEASED",
      );
    // The database task is committed first; recovery handles a queue outage.
    void this.schedule(eventId).catch((error) =>
      this.logger.warn(String(error)),
    );
    return result;
  }

  async processCancellation(eventId: string) {
    const task = await this.prisma.eventCancellation.findUnique({
      where: { eventId },
    });
    if (!task || task.status === "COMPLETED") return;
    try {
      for (;;) {
        const bookings = await this.prisma.booking.findMany({
          where: {
            session: { eventId },
            status: { in: ["PAID", "REFUNDED"] },
            refunds: { none: { kind: "EVENT" } },
          },
          select: { id: true },
          take: 50,
        });
        if (!bookings.length) break;
        for (const booking of bookings)
          await this.refund(booking.id, task.actorId, "EVENT");
      }
      await this.prisma.eventCancellation.update({
        where: { eventId },
        data: { status: "COMPLETED", completedAt: new Date(), lastError: null },
      });
    } catch (error) {
      await this.prisma.eventCancellation.update({
        where: { eventId },
        data: { lastError: String(error).slice(0, 1000) },
      });
      throw error;
    }
  }
  private async schedule(eventId: string) {
    if (!this.queue) return this.processCancellation(eventId);
    await this.queue.add(
      "refund-event",
      { eventId },
      {
        jobId: `event-${eventId}`,
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
  private async recover() {
    if (this.recovering) return;
    this.recovering = true;
    try {
      const tasks = await this.prisma.eventCancellation.findMany({
        where: { status: "PENDING" },
        take: 100,
      });
      for (const task of tasks) await this.schedule(task.eventId);
    } catch (error) {
      this.logger.warn(String(error));
    } finally {
      this.recovering = false;
    }
  }
}
