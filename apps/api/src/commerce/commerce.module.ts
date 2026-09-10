import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AccessService, WaitingRoomService } from "./commerce.service";
@Global()
@Module({
  imports: [AuthModule, PrismaModule],
  providers: [AccessService, WaitingRoomService],
  exports: [AccessService, WaitingRoomService],
})
export class CommerceModule {}
