import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import {
  createBookingSchema,
  type CreateBookingDto,
} from "@ticket-booking/contracts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthService } from "../auth/auth.service";
import { BookingsService } from "./bookings.service";

@Controller("bookings")
export class BookingsController {
  constructor(
    private readonly authService: AuthService,
    private readonly bookingsService: BookingsService,
  ) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(createBookingSchema)) body: CreateBookingDto,
    @Headers("authorization") authorization?: string,
    @Headers("x-demo-user-email") demoUserEmail?: string,
  ) {
    const userId = await this.authService.resolveRequestUserId(
      authorization,
      demoUserEmail,
    );

    return this.bookingsService.createBookingForUser(userId, body);
  }

  @Get()
  async listMine(
    @Headers("authorization") authorization?: string,
    @Headers("x-demo-user-email") demoUserEmail?: string,
  ) {
    const userId = await this.authService.resolveRequestUserId(
      authorization,
      demoUserEmail,
    );

    return this.bookingsService.listBookingsForUser(userId);
  }

  @Get(":id")
  async getById(
    @Param("id") id: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-demo-user-email") demoUserEmail?: string,
  ) {
    const userId = await this.authService.resolveRequestUserId(
      authorization,
      demoUserEmail,
    );

    return this.bookingsService.getBookingForUser(id, userId);
  }
}
