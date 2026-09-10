import { Module } from "@nestjs/common";
import { CommerceModule } from "../commerce/commerce.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { OperationsController } from "./operations.controller";
import { OrganizerService } from "./organizer.service";
import { RefundsService } from "./refunds.service";
@Module({
  imports: [CommerceModule, RealtimeModule],
  controllers: [OperationsController],
  providers: [OrganizerService, RefundsService],
})
export class OperationsModule {}
