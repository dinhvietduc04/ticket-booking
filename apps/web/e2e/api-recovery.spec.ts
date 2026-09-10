import { test, expect } from "@playwright/test";
import { fetchApiRead } from "../lib/fetch-api-read";
import { PrismaClient } from "@prisma/client";

test("read recovers after a brief API connection failure", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1)
      throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
    return Response.json({ sessionId: "test-session" });
  };
  try {
    const result = await fetchApiRead(
      "http://localhost:4000/api/sessions/test-session/seats",
    );
    expect(await result.json()).toEqual({ sessionId: "test-session" });
    expect(calls).toBe(2);
  } finally {
    globalThis.fetch = original;
  }
});

test("persistent connection failures stop after three attempts", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new TypeError("fetch failed");
  };
  try {
    await expect(
      fetchApiRead("http://localhost:4000/api/events"),
    ).rejects.toThrow("Unable to reach Seatly");
    expect(calls).toBe(3);
  } finally {
    globalThis.fetch = original;
  }
});

test("HTTP errors are returned without retries", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(null, { status: 404 });
  };
  try {
    expect(
      (await fetchApiRead("http://localhost:4000/api/sessions/missing")).status,
    ).toBe(404);
    expect(calls).toBe(1);
  } finally {
    globalThis.fetch = original;
  }
});

test("invalid fetch arguments are not retried", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new TypeError("Invalid URL");
  };
  try {
    await expect(fetchApiRead("invalid URL")).rejects.toThrow("Invalid URL");
    expect(calls).toBe(1);
  } finally {
    globalThis.fetch = original;
  }
});

test("booking error screen can recover when the seat map becomes available", async ({
  page,
}) => {
  const prisma = new PrismaClient({
    datasourceUrl:
      process.env.DATABASE_URL ??
      "postgresql://seatly:seatly@localhost:5432/seatly?schema=public",
  });
  const sessionId = crypto.randomUUID();
  let organizationId: string | undefined;
  try {
    await page.goto(`/booking/${sessionId}`);
    await expect(
      page.getByRole("heading", { name: "We couldn’t load this seat map" }),
    ).toBeVisible();
    const organization = await prisma.organization.create({
      data: {
        name: "Recovery test",
        slug: `recovery-${sessionId}`,
        status: "ACTIVE",
      },
    });
    organizationId = organization.id;
    const venue = await prisma.venue.create({
      data: {
        organizationId,
        name: "Recovery venue",
        address: "Test",
        city: "HCM",
        country: "VN",
      },
    });
    const hall = await prisma.hall.create({
      data: { venueId: venue.id, name: "Recovery hall", capacity: 1 },
    });
    const seat = await prisma.seat.create({
      data: { hallId: hall.id, row: "A", number: 1, x: 50, y: 50 },
    });
    const event = await prisma.event.create({
      data: {
        organizationId,
        title: "Recovery concert",
        slug: `recovery-${sessionId}`,
        category: "CONCERT",
        status: "PUBLISHED",
      },
    });
    await prisma.session.create({
      data: {
        id: sessionId,
        eventId: event.id,
        hallId: hall.id,
        startAt: new Date(Date.now() + 86400000),
        endAt: new Date(Date.now() + 90000000),
        status: "SELLING",
        sessionSeats: { create: { seatId: seat.id, price: 100000 } },
      },
    });
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(
      page.getByRole("button", { name: "Seat A1, available" }),
    ).toBeVisible();
  } finally {
    await prisma.session.deleteMany({ where: { id: sessionId } });
    if (organizationId)
      await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  }
});
