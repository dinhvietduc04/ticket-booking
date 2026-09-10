import { Body, Controller, Headers, Param, Post } from "@nestjs/common";
import {
  createPaymentSchema,
  fakePaymentWebhookSchema,
  type CreatePaymentDto,
  type FakePaymentWebhookDto,
} from "@ticket-booking/contracts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthService } from "../auth/auth.service";
import { PaymentsService } from "./payments.service";

@Controller()
export class PaymentsController {
  constructor(
    private readonly authService: AuthService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post("bookings/:bookingId/payment")
  async createFakePayment(
    @Param("bookingId") bookingId: string,
    @Body(new ZodValidationPipe(createPaymentSchema)) _body: CreatePaymentDto,
    @Headers("authorization") authorization?: string,
    @Headers("x-demo-user-email") demoUserEmail?: string,
  ) {
    const userId = await this.authService.resolveRequestUserId(
      authorization,
      demoUserEmail,
    );

    return this.paymentsService.createFakePaymentForBooking(bookingId, userId);
  }

  @Post("payments/webhook")
  processWebhook(
    @Body(new ZodValidationPipe(fakePaymentWebhookSchema))
    body: FakePaymentWebhookDto,
  ) {
    return this.paymentsService.processFakeWebhook(body);
  }
}
