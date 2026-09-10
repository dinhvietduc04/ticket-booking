import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  listEventsQuerySchema,
  type ListEventsQuery,
} from "@ticket-booking/contracts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { EventsService } from "./events.service";

@Controller("events")
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listEventsQuerySchema)) query: ListEventsQuery,
  ) {
    return this.eventsService.list(query);
  }

  @Get(":slug")
  findBySlug(@Param("slug") slug: string) {
    return this.eventsService.findBySlug(slug);
  }
}
