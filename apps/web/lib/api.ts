import type {
  EventSummary,
  LoginDto,
  RegisterDto,
  SeatStatusChanged,
  SessionSeatMap,
} from "@ticket-booking/contracts";
import { z } from "zod";
import { fetchApiRead } from "./fetch-api-read";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const socketUrl =
  process.env.NEXT_PUBLIC_SOCKET_URL ?? apiUrl.replace(/\/api\/?$/, "");

const eventCategorySchema = z.enum([
  "MOVIE",
  "CONCERT",
  "SPORT",
  "THEATER",
  "CONFERENCE",
]);
const seatTypeSchema = z.enum([
  "STANDARD",
  "VIP",
  "PREMIUM",
  "COUPLE",
  "ACCESSIBLE",
]);
const sessionSeatStatusSchema = z.enum([
  "AVAILABLE",
  "HELD",
  "BOOKED",
  "BLOCKED",
]);
const seatHoldStatusSchema = z.enum([
  "ACTIVE",
  "EXPIRED",
  "CONVERTED",
  "CANCELLED",
]);
const bookingStatusSchema = z.enum([
  "PENDING_PAYMENT",
  "PAID",
  "PAYMENT_FAILED",
  "CANCELLED",
  "REFUNDED",
  "EXPIRED",
]);
const paymentProviderSchema = z.enum(["FAKE", "STRIPE"]);
const paymentStatusSchema = z.enum([
  "PENDING",
  "SUCCESS",
  "FAILED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);
const ticketStatusSchema = z.enum(["VALID", "USED", "CANCELLED", "REFUNDED"]);
const ticketSummarySchema = z.object({
  id: z.string().uuid(),
  ticketNumber: z.string(),
  seatLabel: z.string(),
  status: ticketStatusSchema,
});
const heldSeatSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  price: z.number().int().nonnegative(),
  currency: z.string().length(3),
});
const seatHoldSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  status: seatHoldStatusSchema,
  expiresAt: z.string().datetime(),
  seats: z.array(heldSeatSchema),
  total: z.number().int().nonnegative(),
});
const bookingDetailsSchema = z.object({
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
  tickets: z.array(ticketSummarySchema),
  createdAt: z.string().datetime(),
});
const paymentIntentSchema = z.object({
  id: z.string().uuid(),
  bookingId: z.string().uuid(),
  provider: paymentProviderSchema,
  providerPaymentId: z.string(),
  amount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  status: paymentStatusSchema,
});
const paymentWebhookResultSchema = z.object({
  processed: z.boolean(),
  payment: paymentIntentSchema.nullable(),
  booking: bookingDetailsSchema.nullable(),
});
const ticketDetailsSchema = z.object({
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
const bookingListSchema = z.object({
  data: z.array(bookingDetailsSchema),
});
const bookingTicketsSchema = z.object({
  data: z.array(ticketDetailsSchema),
});
const validateTicketSchema = z.object({
  token: z.string().trim().min(1).max(200),
});
const ticketValidationResultSchema = z.object({
  valid: z.boolean(),
  reason: z.string().optional(),
  ticket: ticketDetailsSchema.nullable(),
});
const ticketCheckInResultSchema = z.object({
  checkedIn: z.boolean(),
  ticket: ticketDetailsSchema,
});
const createBookingSchema = z.object({
  holdId: z.string().uuid(),
  promoCode: z.string().optional(),
});
const fakePaymentWebhookSchema = z.object({
  provider: z.literal("FAKE").default("FAKE"),
  eventId: z.string().trim().min(1).max(160),
  providerPaymentId: z.string().trim().min(1).max(160),
  status: z.enum(["SUCCESS", "FAILED"]),
  failureReason: z.string().trim().min(1).max(500).optional(),
});
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(6).max(32).optional(),
});
const eventSummarySchema = z.object({
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
const sessionSeatSchema = z.object({
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
const sessionSeatMapSchema = z.object({
  sessionId: z.string().uuid(),
  eventTitle: z.string(),
  venueName: z.string(),
  hallName: z.string(),
  startAt: z.string().datetime(),
  seats: z.array(sessionSeatSchema),
});
const seatStatusChangeReasonSchema = z.enum([
  "HELD",
  "RELEASED",
  "BOOKED",
  "EXPIRED",
]);
const seatStatusChangeSchema = z.object({
  sessionSeatId: z.string().uuid(),
  seatId: z.string().uuid(),
  label: z.string(),
  status: sessionSeatStatusSchema,
  version: z.number().int().nonnegative(),
});
const seatStatusChangedSchema = z.object({
  sessionId: z.string().uuid(),
  reason: seatStatusChangeReasonSchema,
  seats: z.array(seatStatusChangeSchema).min(1),
  emittedAt: z.string().datetime(),
});

export type SeatHold = z.infer<typeof seatHoldSchema>;
export type BookingDetails = z.infer<typeof bookingDetailsSchema>;
export type PaymentIntent = z.infer<typeof paymentIntentSchema>;
export type PaymentWebhookResult = z.infer<typeof paymentWebhookResultSchema>;
export type TicketDetails = z.infer<typeof ticketDetailsSchema>;
export type TicketValidationResult = z.infer<
  typeof ticketValidationResultSchema
>;
export type { SeatStatusChanged };

const eventListResponseSchema = z.object({
  data: z.array(eventSummarySchema),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

const eventDetailsSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  category: z.string(),
  posterUrl: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  organization: z.object({
    id: z.string(),
    name: z.string(),
  }),
  sessions: z.array(
    z.object({
      id: z.string(),
      startAt: z.string(),
      endAt: z.string(),
      status: z.string(),
      venueName: z.string(),
      hallName: z.string(),
      city: z.string(),
      availableSeatCount: z.number(),
      minPrice: z.number().nullable(),
    }),
  ),
});

export type EventDetails = z.infer<typeof eventDetailsSchema>;

const authSessionSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number(),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    firstName: z.string(),
    lastName: z.string(),
    role: z.string(),
  }),
});

export type AuthSession = z.infer<typeof authSessionSchema>;

type FetchJsonOptions = {
  revalidate?: number;
};

async function fetchJson<T>(
  path: string,
  schema: z.ZodSchema<T>,
  options: FetchJsonOptions = {},
): Promise<T> {
  const response = await fetchApiRead(`${apiUrl}${path}`, {
    headers: {
      Accept: "application/json",
      ...requestAuthHeaders(),
    },
    next:
      typeof options.revalidate === "number"
        ? { revalidate: options.revalidate }
        : undefined,
    cache: typeof options.revalidate === "number" ? undefined : "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}`,
    );
  }

  return schema.parse(await response.json());
}

export function listEvents(): Promise<{ data: EventSummary[] }> {
  return fetchJson("/events", eventListResponseSchema, { revalidate: 30 });
}

export function getEvent(slug: string): Promise<EventDetails> {
  return fetchJson(`/events/${slug}`, eventDetailsSchema, { revalidate: 30 });
}

export function getSeatMap(sessionId: string): Promise<SessionSeatMap> {
  return fetchJson(`/sessions/${sessionId}/seats`, sessionSeatMapSchema);
}

export function parseSeatStatusChanged(payload: unknown) {
  return seatStatusChangedSchema.safeParse(payload);
}

export function getSocketUrl() {
  return socketUrl;
}

export function getHold(holdId: string): Promise<SeatHold> {
  return fetchJson(`/holds/${holdId}`, seatHoldSchema);
}

export function getBooking(bookingId: string): Promise<BookingDetails> {
  return fetchJson(`/bookings/${bookingId}`, bookingDetailsSchema);
}

export function listBookings(): Promise<{ data: BookingDetails[] }> {
  return fetchJson("/bookings", bookingListSchema);
}

export async function getBookingTickets(
  bookingId: string,
): Promise<TicketDetails[]> {
  const result = await fetchJson(
    `/bookings/${bookingId}/tickets`,
    bookingTicketsSchema,
  );

  return result.data;
}

export async function createHold(
  sessionId: string,
  seatIds: string[],
  admissionToken?: string,
) {
  const response = await fetch(`${apiUrl}/sessions/${sessionId}/holds`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...requestAuthHeaders(),
    },
    body: JSON.stringify({ seatIds, admissionToken }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message ?? "Unable to hold seats.");
  }

  return payload as {
    holdId: string;
    expiresAt: string;
    seats: Array<{
      id: string;
      label: string;
      price: number;
      currency: string;
    }>;
    total: number;
  };
}

export async function createBooking(
  holdId: string,
  promoCode?: string,
): Promise<BookingDetails> {
  const dto = createBookingSchema.parse({ holdId, promoCode });
  return postJson("/bookings", dto, bookingDetailsSchema);
}

export async function createPayment(bookingId: string): Promise<PaymentIntent> {
  return postJson(`/bookings/${bookingId}/payment`, {}, paymentIntentSchema);
}

export async function completeFakePayment(
  providerPaymentId: string,
): Promise<PaymentWebhookResult> {
  const dto = fakePaymentWebhookSchema.parse({
    provider: "FAKE",
    eventId: `fake_evt_${crypto.randomUUID()}`,
    providerPaymentId,
    status: "SUCCESS",
  });

  return postJson("/payments/webhook", dto, paymentWebhookResultSchema);
}

export async function validateTicket(
  token: string,
): Promise<TicketValidationResult> {
  const dto = validateTicketSchema.parse({ token });
  return postJson("/tickets/validate", dto, ticketValidationResultSchema);
}

export async function checkInTicket(token: string) {
  const dto = validateTicketSchema.parse({ token });
  return postJson("/tickets/check-in", dto, ticketCheckInResultSchema);
}

export async function login(dto: LoginDto): Promise<AuthSession> {
  loginSchema.parse(dto);

  return postJson("/auth/login", dto, authSessionSchema);
}

export async function register(dto: RegisterDto): Promise<AuthSession> {
  registerSchema.parse(dto);

  return postJson("/auth/register", dto, authSessionSchema);
}

async function postJson<T>(
  path: string,
  body: unknown,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...requestAuthHeaders(),
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message ?? "Request failed.");
  }

  return schema.parse(payload);
}

export function formatVnd(amount: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

function requestAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  const accessToken = window.localStorage.getItem("seatly.accessToken");
  const rawUser = window.localStorage.getItem("seatly.user");
  const headers: Record<string, string> = {};

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  if (!rawUser) {
    return headers;
  }

  try {
    const user = z
      .object({ email: z.string().email() })
      .parse(JSON.parse(rawUser));
    headers["x-demo-user-email"] = user.email;
  } catch {
    return headers;
  }

  return headers;
}
