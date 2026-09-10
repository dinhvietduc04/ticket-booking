import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SeatEventsGateway } from "./seat-events.gateway";
import { SeatEventsService } from "./seat-events.service";

@Module({
  imports: [PrismaModule],
  providers: [SeatEventsGateway, SeatEventsService],
  exports: [SeatEventsService],
})
export class RealtimeModule {}
