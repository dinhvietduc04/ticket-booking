import type {
  LayoutInput,
  RefundPolicy,
  SessionSettings,
} from "@ticket-booking/contracts";
export async function operations<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("seatly.accessToken")
      : null;
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"}${path}`,
    {
      method,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
  );
  const data = await response.json();
  if (!response.ok) {
    const errors = data.details?.formErrors;
    if (Array.isArray(errors) && errors.length)
      throw new Error(errors.join(" "));
    throw new Error(
      typeof data.message === "string"
        ? data.message
        : "Please check the form and try again.",
    );
  }
  return data as T;
}
export type Organization = {
  id: string;
  name: string;
  members: { role: string }[];
};
export type Session = SessionSettings & {
  id: string;
  startAt: string;
  status: string;
  pricingRules: SessionSettings["pricingRules"] | null;
};
export type Event = {
  id: string;
  title: string;
  status: string;
  refundPolicy: RefundPolicy | null;
  sessions: Session[];
  cancellation: { status: string; lastError: string | null } | null;
};
export type Hall = {
  id: string;
  name: string;
  seats: LayoutInput["seats"];
  _count: { sessions: number };
};
export type Overview = {
  events: Event[];
  venues: { id: string; name: string; halls: Hall[] }[];
  promotions: {
    id: string;
    code: string;
    type: string;
    value: number;
    active: boolean;
    usageLimit: number;
    endsAt: string;
  }[];
  members: {
    id: string;
    role: string;
    user: { email: string; firstName: string; lastName: string };
  }[];
};
export type SalesGroup = {
  id: string;
  label: string;
  currency: string;
  orders: number;
  tickets: number;
  gross: number;
  refunds: number;
};
export type Analytics = {
  revenue: {
    currency: string;
    grossRevenue: number;
    refunds: number;
    netRevenue: number;
    averageOrderValue: number;
  }[];
  orders: number;
  paidOrders: number;
  ticketsSold: number;
  conversionRate: number;
  refundRate: number;
  seatsRemaining: number;
  byDay: SalesGroup[];
  bySession: SalesGroup[];
  byTicketType: {
    label: string;
    currency: string;
    tickets: number;
    subtotal: number;
  }[];
};
export type AuditPage = {
  data: {
    id: string;
    actorId: string;
    action: string;
    targetId: string;
    details: unknown;
    createdAt: string;
  }[];
  page: number;
  total: number;
  totalPages: number;
};
export type Admission = {
  status: string;
  position: number;
  admissionToken: string | null;
  admittedUntil: string | null;
};
export type RefundQuote = {
  percent: number;
  amount: number;
  currency: string;
  policy: RefundPolicy;
  refunds: { id: string; amount: number; reason: string; createdAt: string }[];
};
