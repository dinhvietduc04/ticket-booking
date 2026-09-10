import { Module } from "@nestjs/common";
import { CommerceModule } from "./commerce/commerce.module";
import { OperationsModule } from "./operations/operations.module";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import { BookingsModule } from "./bookings/bookings.module";
import { EventsModule } from "./events/events.module";
import { HealthModule } from "./health/health.module";
import { PaymentsModule } from "./payments/payments.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { SeatHoldsModule } from "./seat-holds/seat-holds.module";
import { SessionsModule } from "./sessions/sessions.module";
import { TicketsModule } from "./tickets/tickets.module";
import { VenuesModule } from "./venues/venues.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ["../../.env", ".env"],
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.RATE_LIMIT_TTL_MS ?? 60_000),
        limit: Number(process.env.RATE_LIMIT_MAX ?? 120),
      },
    ]),
    PrismaModule,
    CommerceModule,
    OperationsModule,
    HealthModule,
    AuthModule,
    EventsModule,
    SessionsModule,
    VenuesModule,
    RealtimeModule,
    SeatHoldsModule,
    BookingsModule,
    PaymentsModule,
    TicketsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
