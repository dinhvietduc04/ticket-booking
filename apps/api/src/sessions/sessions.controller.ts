import { Controller, Get, Param } from "@nestjs/common";
import { SessionsService } from "./sessions.service";

@Controller("sessions")
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get(":sessionId")
  findById(@Param("sessionId") sessionId: string) {
    return this.sessionsService.findById(sessionId);
  }

  @Get(":sessionId/seats")
  getSeatMap(@Param("sessionId") sessionId: string) {
    return this.sessionsService.getSeatMap(sessionId);
  }
}
