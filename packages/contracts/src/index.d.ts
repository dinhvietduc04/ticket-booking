import { z } from "zod";
export declare const userRoleSchema: z.ZodEnum<["CUSTOMER", "ORGANIZER", "ADMIN"]>;
export declare const eventCategorySchema: z.ZodEnum<["MOVIE", "CONCERT", "SPORT", "THEATER", "CONFERENCE"]>;
export declare const eventStatusSchema: z.ZodEnum<["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"]>;
export declare const sessionStatusSchema: z.ZodEnum<["SCHEDULED", "SELLING", "SOLD_OUT", "CANCELLED", "COMPLETED"]>;
export declare const seatTypeSchema: z.ZodEnum<["STANDARD", "VIP", "PREMIUM", "COUPLE", "ACCESSIBLE"]>;
export declare const sessionSeatStatusSchema: z.ZodEnum<["AVAILABLE", "HELD", "BOOKED", "BLOCKED"]>;
export declare const moneySchema: z.ZodObject<{
    amount: z.ZodNumber;
    currency: z.ZodString;
}, "strip", z.ZodTypeAny, {
    amount: number;
    currency: string;
}, {
    amount: number;
    currency: string;
}>;
export declare const listEventsQuerySchema: z.ZodObject<{
    search: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodEnum<["MOVIE", "CONCERT", "SPORT", "THEATER", "CONFERENCE"]>>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    search?: string | undefined;
    city?: string | undefined;
    category?: "MOVIE" | "CONCERT" | "SPORT" | "THEATER" | "CONFERENCE" | undefined;
}, {
    search?: string | undefined;
    city?: string | undefined;
    category?: "MOVIE" | "CONCERT" | "SPORT" | "THEATER" | "CONFERENCE" | undefined;
    page?: number | undefined;
    limit?: number | undefined;
}>;
export declare const createSeatHoldSchema: z.ZodObject<{
    seatIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    seatIds: string[];
}, {
    seatIds: string[];
}>;
export declare const registerSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    firstName: z.ZodString;
    lastName: z.ZodString;
    phone: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string | undefined;
}, {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string | undefined;
}>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export declare const eventSummarySchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    slug: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    category: z.ZodEnum<["MOVIE", "CONCERT", "SPORT", "THEATER", "CONFERENCE"]>;
    posterUrl: z.ZodNullable<z.ZodString>;
    city: z.ZodString;
    venueName: z.ZodString;
    nextSessionAt: z.ZodNullable<z.ZodString>;
    minPrice: z.ZodNullable<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    city: string;
    category: "MOVIE" | "CONCERT" | "SPORT" | "THEATER" | "CONFERENCE";
    id: string;
    title: string;
    slug: string;
    description: string | null;
    posterUrl: string | null;
    venueName: string;
    nextSessionAt: string | null;
    minPrice: number | null;
}, {
    city: string;
    category: "MOVIE" | "CONCERT" | "SPORT" | "THEATER" | "CONFERENCE";
    id: string;
    title: string;
    slug: string;
    description: string | null;
    posterUrl: string | null;
    venueName: string;
    nextSessionAt: string | null;
    minPrice: number | null;
}>;
export declare const sessionSeatSchema: z.ZodObject<{
    id: z.ZodString;
    seatId: z.ZodString;
    label: z.ZodString;
    section: z.ZodString;
    row: z.ZodString;
    number: z.ZodNumber;
    type: z.ZodEnum<["STANDARD", "VIP", "PREMIUM", "COUPLE", "ACCESSIBLE"]>;
    x: z.ZodNumber;
    y: z.ZodNumber;
    price: z.ZodNumber;
    currency: z.ZodString;
    status: z.ZodEnum<["AVAILABLE", "HELD", "BOOKED", "BLOCKED"]>;
}, "strip", z.ZodTypeAny, {
    number: number;
    currency: string;
    type: "STANDARD" | "VIP" | "PREMIUM" | "COUPLE" | "ACCESSIBLE";
    status: "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";
    id: string;
    seatId: string;
    label: string;
    section: string;
    row: string;
    x: number;
    y: number;
    price: number;
}, {
    number: number;
    currency: string;
    type: "STANDARD" | "VIP" | "PREMIUM" | "COUPLE" | "ACCESSIBLE";
    status: "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";
    id: string;
    seatId: string;
    label: string;
    section: string;
    row: string;
    x: number;
    y: number;
    price: number;
}>;
export declare const sessionSeatMapSchema: z.ZodObject<{
    sessionId: z.ZodString;
    eventTitle: z.ZodString;
    venueName: z.ZodString;
    hallName: z.ZodString;
    startAt: z.ZodString;
    seats: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        seatId: z.ZodString;
        label: z.ZodString;
        section: z.ZodString;
        row: z.ZodString;
        number: z.ZodNumber;
        type: z.ZodEnum<["STANDARD", "VIP", "PREMIUM", "COUPLE", "ACCESSIBLE"]>;
        x: z.ZodNumber;
        y: z.ZodNumber;
        price: z.ZodNumber;
        currency: z.ZodString;
        status: z.ZodEnum<["AVAILABLE", "HELD", "BOOKED", "BLOCKED"]>;
    }, "strip", z.ZodTypeAny, {
        number: number;
        currency: string;
        type: "STANDARD" | "VIP" | "PREMIUM" | "COUPLE" | "ACCESSIBLE";
        status: "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";
        id: string;
        seatId: string;
        label: string;
        section: string;
        row: string;
        x: number;
        y: number;
        price: number;
    }, {
        number: number;
        currency: string;
        type: "STANDARD" | "VIP" | "PREMIUM" | "COUPLE" | "ACCESSIBLE";
        status: "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";
        id: string;
        seatId: string;
        label: string;
        section: string;
        row: string;
        x: number;
        y: number;
        price: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    venueName: string;
    sessionId: string;
    eventTitle: string;
    hallName: string;
    startAt: string;
    seats: {
        number: number;
        currency: string;
        type: "STANDARD" | "VIP" | "PREMIUM" | "COUPLE" | "ACCESSIBLE";
        status: "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";
        id: string;
        seatId: string;
        label: string;
        section: string;
        row: string;
        x: number;
        y: number;
        price: number;
    }[];
}, {
    venueName: string;
    sessionId: string;
    eventTitle: string;
    hallName: string;
    startAt: string;
    seats: {
        number: number;
        currency: string;
        type: "STANDARD" | "VIP" | "PREMIUM" | "COUPLE" | "ACCESSIBLE";
        status: "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";
        id: string;
        seatId: string;
        label: string;
        section: string;
        row: string;
        x: number;
        y: number;
        price: number;
    }[];
}>;
export type UserRole = z.infer<typeof userRoleSchema>;
export type EventCategory = z.infer<typeof eventCategorySchema>;
export type EventStatus = z.infer<typeof eventStatusSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type SeatType = z.infer<typeof seatTypeSchema>;
export type SessionSeatStatus = z.infer<typeof sessionSeatStatusSchema>;
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
export type CreateSeatHoldDto = z.infer<typeof createSeatHoldSchema>;
export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type EventSummary = z.infer<typeof eventSummarySchema>;
export type SessionSeatMap = z.infer<typeof sessionSeatMapSchema>;
