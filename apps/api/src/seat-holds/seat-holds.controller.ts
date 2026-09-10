import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
} from "@nestjs/common";
import {
  createSeatHoldSchema,
  type CreateSeatHoldDto,
} from "@ticket-booking/contracts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthService } from "../auth/auth.service";
import { SeatHoldsService } from "./seat-holds.service";

@Controller()
export class SeatHoldsController {
  constructor(
    private readonly authService: AuthService,
    private readonly seatHoldsService: SeatHoldsService,
  ) {}

  @Post("sessions/:sessionId/holds")
  async create(
    @Param("sessionId") sessionId: string,
    @Body(new ZodValidationPipe(createSeatHoldSchema)) body: CreateSeatHoldDto,
    @Headers("authorization") authorization?: string,
    @Headers("x-demo-user-email") demoUserEmail?: string,
  ) {
    const userId = await this.authService.resolveRequestUserId(
      authorization,
      demoUserEmail,
    );

    return this.seatHoldsService.createHoldForUser(userId, sessionId, body);
  }

  @Get("holds/:holdId")
  async findById(
    @Param("holdId") holdId: string,
    @Headers("authorization") auth?: string,
    @Headers("x-demo-user-email") demo?: string,
  ) {
    return this.seatHoldsService.findById(
      holdId,
      await this.authService.resolveRequestUserId(auth, demo),
    );
  }

  @Delete("holds/:holdId")
  async cancel(
    @Param("holdId") holdId: string,
    @Headers("authorization") auth?: string,
    @Headers("x-demo-user-email") demo?: string,
  ) {
    return this.seatHoldsService.cancel(
      holdId,
      await this.authService.resolveRequestUserId(auth, demo),
    );
  }
}
