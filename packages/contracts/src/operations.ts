import { z } from "zod";

export const refundPolicySchema = z
  .object({
    fullRefundHours: z.number().int().min(1).max(8760).default(72),
    partialRefundHours: z.number().int().min(0).max(8760).default(24),
    partialRefundPercent: z.number().int().min(0).max(100).default(50),
  })
  .refine(
    (v) => v.fullRefundHours > v.partialRefundHours,
    "Full refund cutoff must precede partial refund cutoff.",
  );
export const promotionSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{2,40}$/),
    type: z.enum(["PERCENTAGE", "FIXED"]),
    value: z.number().int().positive().max(100000000),
    maxDiscount: z
      .number()
      .int()
      .positive()
      .max(100000000)
      .nullable()
      .default(null),
    currency: z.literal("VND").default("VND"),
    usageLimit: z.number().int().positive().max(1000000),
    perUserLimit: z.number().int().positive().max(100).default(1),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .refine(
    (v) => v.type !== "PERCENTAGE" || v.value <= 100,
    "Percentage must be at most 100.",
  )
  .refine(
    (v) => new Date(v.endsAt) > new Date(v.startsAt),
    "End must follow start.",
  );
export const memberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["OWNER", "ADMIN", "STAFF", "SCANNER"]),
});
export const cancellationSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});
export const pricingRulesSchema = z
  .array(
    z.object({
      soldPercent: z.number().int().min(0).max(100),
      multiplierPercent: z.number().int().min(100).max(500),
    }),
  )
  .max(10)
  .refine(
    (v) => new Set(v.map((r) => r.soldPercent)).size === v.length,
    "Thresholds must be unique.",
  );
export const sessionSettingsSchema = z.object({
  waitingRoomCapacity: z.number().int().min(0).max(10000),
  admissionMinutes: z.number().int().min(1).max(60),
  pricingRules: pricingRulesSchema,
});
export const layoutSchema = z
  .object({
    seats: z
      .array(
        z.object({
          id: z.string().uuid().optional(),
          row: z.string().trim().min(1).max(8),
          number: z.number().int().positive().max(999),
          section: z.string().trim().min(1).max(40),
          type: z.enum(["STANDARD", "VIP", "PREMIUM", "COUPLE", "ACCESSIBLE"]),
          x: z.number().int().min(0).max(2000),
          y: z.number().int().min(0).max(2000),
        }),
      )
      .min(1)
      .max(2000),
  })
  .refine(
    (v) =>
      new Set(v.seats.map((s) => `${s.row}:${s.number}`)).size ===
      v.seats.length,
    "Seat labels must be unique.",
  )
  .refine((v) => {
    const ids = v.seats.flatMap((s) => (s.id ? [s.id] : []));
    return new Set(ids).size === ids.length;
  }, "Seat IDs must be unique.")
  .refine(
    (v) =>
      !v.seats.some((seat, i) =>
        v.seats
          .slice(i + 1)
          .some(
            (other) =>
              Math.abs(seat.x - other.x) < 40 &&
              Math.abs(seat.y - other.y) < 40,
          ),
      ),
    "Seats overlap. Leave at least 40 units between seats.",
  );
export type RefundPolicy = z.infer<typeof refundPolicySchema>;
export type PromotionInput = z.infer<typeof promotionSchema>;
export type MemberInput = z.infer<typeof memberSchema>;
export type SessionSettings = z.infer<typeof sessionSettingsSchema>;
export type LayoutInput = z.infer<typeof layoutSchema>;
