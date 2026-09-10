"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionSeatMapSchema = exports.sessionSeatSchema = exports.eventSummarySchema = exports.loginSchema = exports.registerSchema = exports.createSeatHoldSchema = exports.listEventsQuerySchema = exports.moneySchema = exports.sessionSeatStatusSchema = exports.seatTypeSchema = exports.sessionStatusSchema = exports.eventStatusSchema = exports.eventCategorySchema = exports.userRoleSchema = void 0;
const zod_1 = require("zod");
exports.userRoleSchema = zod_1.z.enum(["CUSTOMER", "ORGANIZER", "ADMIN"]);
exports.eventCategorySchema = zod_1.z.enum([
    "MOVIE",
    "CONCERT",
    "SPORT",
    "THEATER",
    "CONFERENCE",
]);
exports.eventStatusSchema = zod_1.z.enum([
    "DRAFT",
    "PUBLISHED",
    "CANCELLED",
    "COMPLETED",
]);
exports.sessionStatusSchema = zod_1.z.enum([
    "SCHEDULED",
    "SELLING",
    "SOLD_OUT",
    "CANCELLED",
    "COMPLETED",
]);
exports.seatTypeSchema = zod_1.z.enum([
    "STANDARD",
    "VIP",
    "PREMIUM",
    "COUPLE",
    "ACCESSIBLE",
]);
exports.sessionSeatStatusSchema = zod_1.z.enum([
    "AVAILABLE",
    "HELD",
    "BOOKED",
    "BLOCKED",
]);
exports.moneySchema = zod_1.z.object({
    amount: zod_1.z.number().int().nonnegative(),
    currency: zod_1.z.string().length(3),
});
exports.listEventsQuerySchema = zod_1.z.object({
    search: zod_1.z.string().trim().min(1).optional(),
    city: zod_1.z.string().trim().min(1).optional(),
    category: exports.eventCategorySchema.optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(50).default(20),
});
exports.createSeatHoldSchema = zod_1.z.object({
    seatIds: zod_1.z.array(zod_1.z.string().uuid()).min(1).max(8),
});
exports.registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8).max(128),
    firstName: zod_1.z.string().trim().min(1).max(80),
    lastName: zod_1.z.string().trim().min(1).max(80),
    phone: zod_1.z.string().trim().min(6).max(32).optional(),
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
exports.eventSummarySchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    title: zod_1.z.string(),
    slug: zod_1.z.string(),
    description: zod_1.z.string().nullable(),
    category: exports.eventCategorySchema,
    posterUrl: zod_1.z.string().url().nullable(),
    city: zod_1.z.string(),
    venueName: zod_1.z.string(),
    nextSessionAt: zod_1.z.string().datetime().nullable(),
    minPrice: zod_1.z.number().int().nonnegative().nullable(),
});
exports.sessionSeatSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    seatId: zod_1.z.string().uuid(),
    label: zod_1.z.string(),
    section: zod_1.z.string(),
    row: zod_1.z.string(),
    number: zod_1.z.number().int().positive(),
    type: exports.seatTypeSchema,
    x: zod_1.z.number(),
    y: zod_1.z.number(),
    price: zod_1.z.number().int().nonnegative(),
    currency: zod_1.z.string().length(3),
    status: exports.sessionSeatStatusSchema,
});
exports.sessionSeatMapSchema = zod_1.z.object({
    sessionId: zod_1.z.string().uuid(),
    eventTitle: zod_1.z.string(),
    venueName: zod_1.z.string(),
    hallName: zod_1.z.string(),
    startAt: zod_1.z.string().datetime(),
    seats: zod_1.z.array(exports.sessionSeatSchema),
});
//# sourceMappingURL=index.js.map