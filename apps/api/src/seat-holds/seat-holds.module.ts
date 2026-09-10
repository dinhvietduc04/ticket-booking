import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { SeatHoldExpirationService } from "./seat-hold-expiration.service";
import { SeatHoldsController } from "./seat-holds.controller";
import { SeatHoldsService } from "./seat-holds.service";

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [SeatHoldsController],
  providers: [SeatHoldExpirationService, SeatHoldsService],
  exports: [SeatHoldExpirationService, SeatHoldsService],
})
export class SeatHoldsModule {}
