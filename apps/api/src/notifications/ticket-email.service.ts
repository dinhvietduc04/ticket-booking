import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Job, Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";

const QUEUE_NAME = "ticket-email";

type TicketEmailJob = {
  bookingId: string;
};

@Injectable()
export class TicketEmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketEmailService.name);
  private connection?: IORedis;
  private queue?: Queue<TicketEmailJob>;
  private worker?: Worker<TicketEmailJob>;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      this.logger.warn("REDIS_URL is not set; ticket email jobs are disabled.");
      return;
    }

    this.connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<TicketEmailJob>(QUEUE_NAME, {
      connection: this.connection,
    });
    this.worker = new Worker<TicketEmailJob>(
      QUEUE_NAME,
      (job) => this.processTicketEmail(job),
      { connection: this.connection },
    );

    this.worker.on("failed", (job, error) => {
      this.logger.error(
        `Ticket email job failed: ${job?.id ?? "unknown"}`,
        error.stack,
      );
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }

  async enqueueTicketEmail(bookingId: string) {
    if (!this.queue) {
      return;
    }

    await this.queue.add(
      "send-ticket-email",
      { bookingId },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2_000,
        },
        jobId: `ticket-email-${bookingId}`,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }

  private async processTicketEmail(job: Job<TicketEmailJob>) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: job.data.bookingId },
      include: {
        user: true,
        session: {
          include: {
            event: true,
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
        },
      },
    });

    if (!booking || booking.status !== "PAID") {
      return;
    }

    const ticketLabels = booking.items
      .filter((item) => item.ticket)
      .map(
        (item) => `${item.sessionSeat.seat.row}${item.sessionSeat.seat.number}`,
      )
      .join(", ");

    this.logger.log(
      `Dev ticket email queued for ${booking.user.email}: ${booking.bookingNumber} (${booking.session.event.title}) seats ${ticketLabels}`,
    );
  }
}
