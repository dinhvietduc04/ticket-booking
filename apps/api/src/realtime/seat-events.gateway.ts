import { Logger, OnModuleDestroy } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { createAdapter } from "@socket.io/redis-adapter";
import IORedis from "ioredis";
import type { Namespace, Server, Socket } from "socket.io";
import { z } from "zod";
import type { SeatStatusChanged } from "@ticket-booking/contracts";

const joinSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

type JoinSessionPayload = z.infer<typeof joinSessionSchema>;

@WebSocketGateway({
  cors: {
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  },
  namespace: "sessions",
})
export class SeatEventsGateway implements OnGatewayInit, OnModuleDestroy {
  @WebSocketServer()
  private namespace?: Namespace;

  private readonly logger = new Logger(SeatEventsGateway.name);
  private redisPublisher?: IORedis;
  private redisSubscriber?: IORedis;

  async afterInit(server: Namespace | Server) {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      this.logger.warn(
        "REDIS_URL is not set; Socket.IO is running without the Redis adapter.",
      );
      return;
    }

    this.redisPublisher = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.redisSubscriber = this.redisPublisher.duplicate();

    getSocketServer(server).adapter(
      createAdapter(this.redisPublisher, this.redisSubscriber),
    );
    this.logger.log("Socket.IO Redis adapter is ready.");
  }

  async onModuleDestroy() {
    this.redisPublisher?.disconnect();
    this.redisSubscriber?.disconnect();
  }

  @SubscribeMessage("session.join")
  async joinSession(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: JoinSessionPayload,
  ) {
    const { sessionId } = joinSessionSchema.parse(payload);
    await socket.join(sessionRoom(sessionId));

    return { sessionId, joined: true };
  }

  @SubscribeMessage("session.leave")
  async leaveSession(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ) {
    const { sessionId } = joinSessionSchema.parse(payload);
    await socket.leave(sessionRoom(sessionId));

    return { sessionId, left: true };
  }

  publishSeatStatusChanged(payload: SeatStatusChanged) {
    this.namespace
      ?.to(sessionRoom(payload.sessionId))
      .emit("seat.status.changed", payload);
  }
}

function getSocketServer(server: Namespace | Server) {
  return "server" in server ? server.server : server;
}

function sessionRoom(sessionId: string) {
  return `session:${sessionId}`;
}
