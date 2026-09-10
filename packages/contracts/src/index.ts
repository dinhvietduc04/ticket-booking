import { z } from "zod";

export const userRoleSchema = z.enum(["CUSTOMER", "ORGANIZER", "ADMIN"]);
export const eventCategorySchema = z.enum([
  "MOVIE",
  "CONCERT",
  "SPORT",
  "THEATER",
  "CONFERENCE",
]);
export const eventStatusSchema = z.enum([
  "DRAFT",
  "PUBLISHED",
  "CANCELLED",
  "COMPLETED",
]);
export const sessionStatusSchema = z.enum([
  "SCHEDULED",
  "SELLING",
  "SOLD_OUT",
  "CANCELLED",
  "COMPLETED",
]);
export const seatTypeSchema = z.enum([
  "STANDARD",
  "VIP",
  "PREMIUM",
  "COUPLE",
  "ACCESSIBLE",
]);
export const sessionSeatStatusSchema = z.enum([
  "AVAILABLE",
  "HELD",
  "BOOKED",
  "BLOCKED",
]);
export const seatHoldStatusSchema = z.enum([
  "ACTIVE",
  "EXPIRED",
  "CONVERTED",
  "CANCELLED",
]);
export const bookingStatusSchema = z.enum([
  "PENDING_PAYMENT",
  "PAID",
  "PAYMENT_FAILED",
  "CANCELLED",
  "REFUNDED",
  "EXPIRED",
]);
export const paymentProviderSchema = z.enum(["FAKE", "STRIPE"]);
export const paymentStatusSchema = z.enum([
  "PENDING",
  "SUCCESS",
  "FAILED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);
export const ticketStatusSchema = z.enum([
  "VALID",
  "USED",
  "CANCELLED",
  "REFUNDED",
]);

export const moneySchema = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.string().length(3),
});

export const listEventsQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  category: eventCategorySchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const createSeatHoldSchema = z.object({
  seatIds: z.array(z.string().uuid()).min(1).max(8),
  admissionToken: z.string().uuid().optional(),
});

export const createBookingSchema = z.object({
  holdId: z.string().uuid(),
  promoCode: z.string().trim().toUpperCase().min(1).max(40).optional(),
});

export const createPaymentSchema = z.object({}).default({});

export const fakePaymentWebhookSchema = z.object({
  provider: z.literal("FAKE").default("FAKE"),
  eventId: z.string().trim().min(1).max(160),
  providerPaymentId: z.string().trim().min(1).max(160),
  status: z.enum(["SUCCESS", "FAILED"]),
  failureReason: z.string().trim().min(1).max(500).optional(),
});

export const validateTicketSchema = z.object({
  token: z.string().trim().min(1).max(200),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(6).max(32).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const eventSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  category: eventCategorySchema,
  posterUrl: z
    .union([
      z.string().url(),
      z
        .string()
        .regex(/^\/images\/[a-zA-Z0-9/_-]+\.(?:jpg|jpeg|png|webp|avif)$/),
    ])
    .nullable(),
  city: z.string(),
  venueName: z.string(),
  nextSessionAt: z.string().datetime().nullable(),
  minPrice: z.number().int().nonnegative().nullable(),
});

export const sessionSeatSchema = z.object({
  id: z.string().uuid(),
  seatId: z.string().uuid(),
  label: z.string(),
  section: z.string(),
  row: z.string(),
  number: z.number().int().positive(),
  type: seatTypeSchema,
  x: z.number(),
  y: z.number(),
  price: z.number().int().nonnegative(),
  currency: z.string().length(3),
  status: sessionSeatStatusSchema,
  version: z.number().int().nonnegative(),
});

export const sessionSeatMapSchema = z.object({
  sessionId: z.string().uuid(),
  eventTitle: z.string(),
  venueName: z.string(),
  hallName: z.string(),
  startAt: z.string().datetime(),
  seats: z.array(sessionSeatSchema),
});

export const seatStatusChangeReasonSchema = z.enum([
  "HELD",
  "RELEASED",
  "BOOKED",
  "EXPIRED",
]);

export const seatStatusChangeSchema = z.object({
  sessionSeatId: z.string().uuid(),
  seatId: z.string().uuid(),
  label: z.string(),
  status: sessionSeatStatusSchema,
  version: z.number().int().nonnegative(),
});

export const seatStatusChangedSchema = z.object({
  sessionId: z.string().uuid(),
  reason: seatStatusChangeReasonSchema,
  seats: z.array(seatStatusChangeSchema).min(1),
  emittedAt: z.string().datetime(),
});

export const heldSeatSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  price: z.number().int().nonnegative(),
  currency: z.string().length(3),
});

export const seatHoldSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  status: seatHoldStatusSchema,
  expiresAt: z.string().datetime(),
  seats: z.array(heldSeatSchema),
  total: z.number().int().nonnegative(),
});

export const bookingDetailsSchema = z.object({
  id: z.string().uuid(),
  bookingNumber: z.string(),
  userId: z.string().uuid(),
  sessionId: z.string().uuid(),
  holdId: z.string().uuid().nullable(),
  subtotal: z.number().int().nonnegative(),
  serviceFee: z.number().int().nonnegative(),
  discount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  currency: z.string().length(3),
  status: bookingStatusSchema,
  expiresAt: z.string().datetime().nullable(),
  eventTitle: z.string(),
  venueName: z.string(),
  hallName: z.string(),
  startAt: z.string().datetime(),
  seats: z.array(heldSeatSchema),
  createdAt: z.string().datetime(),
});

export const paymentIntentSchema = z.object({
  id: z.string().uuid(),
  bookingId: z.string().uuid(),
  provider: paymentProviderSchema,
  providerPaymentId: z.string(),
  amount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  status: paymentStatusSchema,
});

export const ticketSummarySchema = z.object({
  id: z.string().uuid(),
  ticketNumber: z.string(),
  seatLabel: z.string(),
  status: ticketStatusSchema,
});

export const ticketDetailsSchema = z.object({
  id: z.string().uuid(),
  ticketNumber: z.string(),
  bookingId: z.string().uuid(),
  bookingNumber: z.string(),
  eventTitle: z.string(),
  venueName: z.string(),
  hallName: z.string(),
  startAt: z.string().datetime(),
  seatLabel: z.string(),
  holderName: z.string(),
  qrCode: z.string(),
  status: ticketStatusSchema,
  usedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const bookingDetailsWithTicketsSchema = bookingDetailsSchema.extend({
  tickets: z.array(ticketSummarySchema),
});

export const bookingListSchema = z.object({
  data: z.array(bookingDetailsWithTicketsSchema),
});

export const bookingTicketsSchema = z.object({
  data: z.array(ticketDetailsSchema),
});

export const ticketValidationResultSchema = z.object({
  valid: z.boolean(),
  reason: z.string().optional(),
  ticket: ticketDetailsSchema.nullable(),
});

export const ticketCheckInResultSchema = z.object({
  checkedIn: z.boolean(),
  ticket: ticketDetailsSchema,
});

export const paymentWebhookResultSchema = z.object({
  processed: z.boolean(),
  payment: paymentIntentSchema.nullable(),
  booking: bookingDetailsWithTicketsSchema.nullable(),
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type EventCategory = z.infer<typeof eventCategorySchema>;
export type EventStatus = z.infer<typeof eventStatusSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type SeatType = z.infer<typeof seatTypeSchema>;
export type SessionSeatStatus = z.infer<typeof sessionSeatStatusSchema>;
export type SeatHoldStatus = z.infer<typeof seatHoldStatusSchema>;
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type PaymentProvider = z.infer<typeof paymentProviderSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
export type CreateSeatHoldDto = z.infer<typeof createSeatHoldSchema>;
export type CreateBookingDto = z.infer<typeof createBookingSchema>;
export type CreatePaymentDto = z.infer<typeof createPaymentSchema>;
export type FakePaymentWebhookDto = z.infer<typeof fakePaymentWebhookSchema>;
export type ValidateTicketDto = z.infer<typeof validateTicketSchema>;
export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type EventSummary = z.infer<typeof eventSummarySchema>;
export type SessionSeatMap = z.infer<typeof sessionSeatMapSchema>;
export type SeatStatusChangeReason = z.infer<
  typeof seatStatusChangeReasonSchema
>;
export type SeatStatusChange = z.infer<typeof seatStatusChangeSchema>;
export type SeatStatusChanged = z.infer<typeof seatStatusChangedSchema>;
export type SeatHold = z.infer<typeof seatHoldSchema>;
export type BookingDetails = z.infer<typeof bookingDetailsSchema>;
export type BookingDetailsWithTickets = z.infer<
  typeof bookingDetailsWithTicketsSchema
>;
export type PaymentIntent = z.infer<typeof paymentIntentSchema>;
export type PaymentWebhookResult = z.infer<typeof paymentWebhookResultSchema>;
export type TicketSummary = z.infer<typeof ticketSummarySchema>;
export type TicketDetails = z.infer<typeof ticketDetailsSchema>;
export type BookingTickets = z.infer<typeof bookingTicketsSchema>;
export type TicketValidationResult = z.infer<
  typeof ticketValidationResultSchema
>;
export type TicketCheckInResult = z.infer<typeof ticketCheckInResultSchema>;
export * from "./operations";
