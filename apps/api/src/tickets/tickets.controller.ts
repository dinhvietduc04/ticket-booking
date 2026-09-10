import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import {
  validateTicketSchema,
  type ValidateTicketDto,
} from "@ticket-booking/contracts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthService } from "../auth/auth.service";
import { TicketsService } from "./tickets.service";
import { AccessService } from "../commerce/commerce.service";

@Controller()
export class TicketsController {
  constructor(
    private readonly authService: AuthService,
    private readonly ticketsService: TicketsService,
    private readonly access: AccessService,
  ) {}

  @Get("bookings/:bookingId/tickets")
  async listForBooking(
    @Param("bookingId") bookingId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-demo-user-email") demoUserEmail?: string,
  ) {
    const userId = await this.authService.resolveRequestUserId(
      authorization,
      demoUserEmail,
    );

    return this.ticketsService.listBookingTicketsForUser(bookingId, userId);
  }

  @Post("tickets/validate")
  async validate(
    @Body(new ZodValidationPipe(validateTicketSchema)) body: ValidateTicketDto,
    @Headers("authorization") auth?: string,
  ) {
    await this.access.ticket(await this.access.user(auth), {
      qrCode: body.token,
    });
    return this.ticketsService.validateToken(body.token);
  }

  @Post("tickets/check-in")
  async checkInByToken(
    @Body(new ZodValidationPipe(validateTicketSchema)) body: ValidateTicketDto,
    @Headers("authorization") auth?: string,
  ) {
    await this.access.ticket(await this.access.user(auth), {
      qrCode: body.token,
    });
    return this.ticketsService.checkInByToken(body.token);
  }

  @Get("tickets/:id")
  async getById(
    @Param("id") id: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-demo-user-email") demoUserEmail?: string,
  ) {
    const userId = await this.authService.resolveRequestUserId(
      authorization,
      demoUserEmail,
    );

    return this.ticketsService.getTicketForUser(id, userId);
  }

  @Post("tickets/:id/check-in")
  async checkInById(
    @Param("id") id: string,
    @Headers("authorization") auth?: string,
  ) {
    await this.access.ticket(await this.access.user(auth), { id });
    return this.ticketsService.checkInById(id);
  }
}
