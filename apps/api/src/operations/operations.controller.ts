import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  cancellationSchema,
  layoutSchema,
  memberSchema,
  promotionSchema,
  refundPolicySchema,
  sessionSettingsSchema,
} from "@ticket-booking/contracts";
import { z } from "zod";
import {
  AccessService,
  WaitingRoomService,
} from "../commerce/commerce.service";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizerService } from "./organizer.service";
import { RefundsService } from "./refunds.service";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";

const reportQuery = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, "Invalid date range.");
const auditQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  action: z.string().max(80).optional(),
});
@Controller()
export class OperationsController {
  constructor(
    private readonly access: AccessService,
    private readonly organizer: OrganizerService,
    private readonly refunds: RefundsService,
    private readonly waiting: WaitingRoomService,
    private readonly prisma: PrismaService,
  ) {}
  @Get("organizer/organizations")
  async organizations(@Headers("authorization") auth?: string) {
    return this.organizer.organizations(await this.access.user(auth));
  }
  @Get("organizer/organizations/:id")
  async overview(
    @Param("id") id: string,
    @Headers("authorization") auth?: string,
  ) {
    return this.organizer.overview(id, await this.access.user(auth));
  }
  @Get("organizer/organizations/:id/analytics")
  async analytics(
    @Param("id") id: string,
    @Query(new ZodValidationPipe(reportQuery)) q: z.infer<typeof reportQuery>,
    @Headers("authorization") auth?: string,
  ) {
    return this.organizer.analytics(
      id,
      await this.access.user(auth),
      q.from,
      q.to,
    );
  }
  @Get("organizer/organizations/:id/audit")
  async logs(
    @Param("id") id: string,
    @Query(new ZodValidationPipe(auditQuery)) q: z.infer<typeof auditQuery>,
    @Headers("authorization") auth?: string,
  ) {
    return this.organizer.logs(
      id,
      await this.access.user(auth),
      q.page,
      q.action,
    );
  }
  @Post("organizer/organizations/:id/members")
  async member(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(memberSchema))
    input: z.infer<typeof memberSchema>,
    @Headers("authorization") auth?: string,
  ) {
    return this.organizer.member(id, await this.access.user(auth), input);
  }
  @Delete("organizer/organizations/:id/members/:memberId")
  async removeMember(
    @Param("id") id: string,
    @Param("memberId") memberId: string,
    @Headers("authorization") auth?: string,
  ) {
    return this.organizer.removeMember(
      id,
      await this.access.user(auth),
      memberId,
    );
  }
  @Post("organizer/organizations/:id/promotions")
  async promotion(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(promotionSchema))
    input: z.infer<typeof promotionSchema>,
    @Headers("authorization") auth?: string,
  ) {
    return this.organizer.promotion(id, await this.access.user(auth), input);
  }
  @Delete("organizer/organizations/:id/promotions/:promotionId")
  async disablePromotion(
    @Param("id") id: string,
    @Param("promotionId") promotionId: string,
    @Headers("authorization") auth?: string,
  ) {
    return this.organizer.disablePromotion(
      id,
      await this.access.user(auth),
      promotionId,
    );
  }
  @Post("organizer/events/:id/refund-policy")
  async policy(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(refundPolicySchema))
    input: z.infer<typeof refundPolicySchema>,
    @Headers("authorization") auth?: string,
  ) {
    return this.organizer.policy(id, await this.access.user(auth), input);
  }
  @Post("organizer/events/:id/cancel")
  async cancel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(cancellationSchema))
    input: z.infer<typeof cancellationSchema>,
    @Headers("authorization") auth?: string,
  ) {
    return this.refunds.cancelEvent(
      id,
      await this.access.user(auth),
      input.reason,
    );
  }
  @Post("organizer/sessions/:id/settings")
  async settings(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(sessionSettingsSchema))
    input: z.infer<typeof sessionSettingsSchema>,
    @Headers("authorization") auth?: string,
  ) {
    return this.organizer.settings(id, await this.access.user(auth), input);
  }
  @Post("organizer/halls/:id/layout")
  async layout(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(layoutSchema))
    input: z.infer<typeof layoutSchema>,
    @Headers("authorization") auth?: string,
  ) {
    return this.organizer.layout(id, await this.access.user(auth), input);
  }
  @Post("organizer/venues/:id/halls")
  async hall(
    @Param("id") id: string,
    @Body(
      new ZodValidationPipe(
        z.object({ name: z.string().trim().min(1).max(80) }),
      ),
    )
    input: { name: string },
    @Headers("authorization") auth?: string,
  ) {
    return this.organizer.createHall(
      id,
      await this.access.user(auth),
      input.name,
    );
  }
  @Get("bookings/:id/refund-quote")
  async quote(
    @Param("id") id: string,
    @Headers("authorization") auth?: string,
  ) {
    return this.refunds.quote(id, await this.access.user(auth));
  }
  @Post("bookings/:id/refund")
  async refund(
    @Param("id") id: string,
    @Headers("authorization") auth?: string,
  ) {
    return this.refunds.refund(id, await this.access.user(auth));
  }
  @Get("account/notifications")
  async notifications(@Headers("authorization") auth?: string) {
    const userId = await this.access.user(auth);
    return this.prisma.customerNotification.findMany({
      where: { booking: { userId } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  @Get("sessions/:id/waiting-room")
  async waitingStatus(@Param("id") id: string) {
    const s = await this.prisma.session.findUniqueOrThrow({
      where: { id },
      select: { waitingRoomCapacity: true },
    });
    return { enabled: s.waitingRoomCapacity > 0 };
  }
  @Post("sessions/:id/waiting-room")
  async join(@Param("id") id: string, @Headers("authorization") auth?: string) {
    return this.waiting.join(id, await this.access.user(auth));
  }
}
