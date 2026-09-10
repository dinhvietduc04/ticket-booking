import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { TicketEmailService } from "./ticket-email.service";

@Module({
  imports: [PrismaModule],
  providers: [TicketEmailService],
  exports: [TicketEmailService],
})
export class NotificationsModule {}
