import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
const prisma = new PrismaClient({
  datasourceUrl:
    process.env.DATABASE_URL ??
    "postgresql://seatly:seatly@localhost:5432/seatly?schema=public",
});
const tag = `e2e-${Date.now()}`;
let orgId: string,
  sessionId: string,
  eventId: string,
  ownerId: string,
  customerId: string,
  waitingCustomerId: string;
const ownerEmail = `${tag}-owner@test.local`,
  customerEmail = `${tag}-customer@test.local`,
  waitingCustomerEmail = `${tag}-waiting@test.local`;
test.beforeAll(async () => {
  const passwordHash = await hash("password123", 4);
  ownerId = (
    await prisma.user.create({
      data: {
        email: ownerEmail,
        passwordHash,
        firstName: "E2E",
        lastName: "Organizer",
        role: "ORGANIZER",
      },
    })
  ).id;
  customerId = (
    await prisma.user.create({
      data: {
        email: customerEmail,
        passwordHash,
        firstName: "E2E",
        lastName: "Customer",
      },
    })
  ).id;
  waitingCustomerId = (
    await prisma.user.create({
      data: {
        email: waitingCustomerEmail,
        passwordHash,
        firstName: "E2E",
        lastName: "Waiting customer",
      },
    })
  ).id;
  orgId = (
    await prisma.organization.create({
      data: {
        name: "Browser Test Organization",
        slug: tag,
        status: "ACTIVE",
        members: { create: { userId: ownerId, role: "OWNER" } },
      },
    })
  ).id;
  const venue = await prisma.venue.create({
    data: {
      organizationId: orgId,
      name: "Browser Test Venue",
      address: "Test",
      city: "HCM",
      country: "VN",
    },
  });
  const hall = await prisma.hall.create({
    data: { venueId: venue.id, name: "Main Hall", capacity: 3 },
  });
  const seats = [];
  for (let i = 1; i <= 3; i++)
    seats.push(
      await prisma.seat.create({
        data: { hallId: hall.id, row: "A", number: i, x: 50 + i * 50, y: 50 },
      }),
    );
  eventId = (
    await prisma.event.create({
      data: {
        organizationId: orgId,
        title: "Browser Test Concert",
        slug: tag,
        category: "CONCERT",
        status: "PUBLISHED",
      },
    })
  ).id;
  sessionId = (
    await prisma.session.create({
      data: {
        eventId,
        hallId: hall.id,
        status: "SELLING",
        startAt: new Date(Date.now() + 100 * 3600000),
        endAt: new Date(Date.now() + 103 * 3600000),
      },
    })
  ).id;
  await prisma.sessionSeat.createMany({
    data: seats.map((s) => ({
      sessionId,
      seatId: s.id,
      price: 100000,
      basePrice: 100000,
    })),
  });
});
test.afterAll(async () => {
  if (sessionId) {
    await prisma.booking.deleteMany({ where: { sessionId } });
    await prisma.seatHold.deleteMany({ where: { sessionId } });
  }
  if (orgId) await prisma.organization.delete({ where: { id: orgId } });
  await prisma.user.deleteMany({
    where: {
      id: { in: [ownerId, customerId, waitingCustomerId].filter(Boolean) },
    },
  });
  await prisma.$disconnect();
});
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();
  await expect(page).toHaveURL(/\/events/);
}
test("organizer setup, venue layout, waiting room, discounted purchase, refund, and cancellation", async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, ownerEmail);
  await page.goto("/organizer");
  await expect(
    page.getByRole("heading", { name: "Revenue · VND" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Events", exact: true }).click();
  await page.getByLabel("Waiting room capacity (0 disables)").fill("1");
  await page.getByLabel("Admission duration (minutes)").fill("60");
  await page.getByRole("button", { name: "Add pricing threshold" }).click();
  await page.getByLabel("Seats sold (%)").fill("0");
  await page.getByRole("button", { name: "Save session settings" }).click();
  await expect(page.getByRole("status")).toHaveText("Changes saved.");
  await page.getByRole("button", { name: "Venues", exact: true }).click();
  await page.getByRole("button", { name: "Seat A1", exact: true }).click();
  await page.getByLabel("Seat X", { exact: true }).fill("80");
  await page.getByRole("button", { name: "Save layout" }).click();
  await expect(page.getByText("Layout saved.")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("venue-designer.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await page.getByLabel("Registered email").fill(customerEmail);
  await page.getByLabel("Role", { exact: true }).selectOption("SCANNER");
  await page.getByRole("button", { name: "Add or update member" }).click();
  await expect(page.getByRole("status")).toHaveText("Changes saved.");
  await page.getByRole("button", { name: "Promotions", exact: true }).click();
  await page.getByLabel("Code", { exact: true }).fill("BROWSER10");
  await page.getByLabel("Starts (local time)").fill("2026-01-01T00:00");
  await page.getByLabel("Ends (local time)").fill("2030-01-01T00:00");
  await page
    .getByRole("button", { name: "Create promotion", exact: true })
    .click();
  await expect(page.getByText("BROWSER10", { exact: true })).toBeVisible();
  const customer = await browser.newContext();
  const shop = await customer.newPage();
  shop.on("pageerror", (e) => errors.push(e.message));
  await login(shop, customerEmail);
  await shop.goto(`/booking/${sessionId}`);
  await shop.getByRole("button", { name: "Join waiting room" }).click();
  await expect(
    shop.getByRole("button", { name: "Seat A2, available" }),
  ).toBeVisible();
  const waitingCustomer = await browser.newContext();
  const queued = await waitingCustomer.newPage();
  queued.on("pageerror", (e) => errors.push(e.message));
  await login(queued, waitingCustomerEmail);
  await queued.goto(`/booking/${sessionId}`);
  await queued.getByRole("button", { name: "Join waiting room" }).click();
  await expect(queued.getByText("in the queue", { exact: true })).toBeVisible();
  await expect(
    queued.getByRole("button", { name: "Seat A1, available" }),
  ).toHaveCount(0);
  await shop.getByRole("button", { name: "Seat A2, available" }).click();
  await shop.getByRole("button", { name: "Hold Seats", exact: true }).click();
  await shop.getByRole("link", { name: /checkout/i }).click();
  await shop.getByLabel("Promo code").fill("BROWSER10");
  await shop.getByRole("button", { name: "Apply code" }).click();
  await expect(shop.getByText("Promotion", { exact: true })).toBeVisible();
  await shop.screenshot({
    path: info.outputPath("checkout.png"),
    fullPage: true,
  });
  await shop.getByRole("button", { name: "Pay with demo provider" }).click();
  await expect(shop).toHaveURL(/\/bookings\//);
  // B advances on the normal poll, without refreshing or expiring A's hour.
  await expect(
    queued.getByRole("button", { name: "Seat A1, available" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    queued.getByRole("button", { name: "Seat A2, booked" }),
  ).toBeVisible();
  await queued.screenshot({
    path: info.outputPath("waiting-room-after-checkout.png"),
    fullPage: true,
  });
  await waitingCustomer.close();
  const bookingId = shop.url().split("/").pop()!;
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
  });
  expect(booking.subtotal).toBe(130000);
  expect(booking.discount).toBe(13000);
  expect(booking.total).toBe(130000);
  await shop
    .getByRole("button", { name: "Cancel booking", exact: true })
    .click();
  await shop
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(
    shop.getByText("REFUNDED", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Events", exact: true }).click();
  await page.getByRole("button", { name: "Cancel event", exact: true }).click();
  await page
    .getByLabel("Cancellation reason")
    .fill("Browser test event cancelled");
  await page
    .getByRole("button", { name: "Confirm event cancellation", exact: true })
    .click();
  await expect(page.getByText(/CANCELLED · Refund workflow/)).toBeVisible();
  await expect
    .poll(
      async () =>
        (await prisma.eventCancellation.findUnique({ where: { eventId } }))
          ?.status,
    )
    .toBe("COMPLETED");
  await expect(
    page.getByText(/CANCELLED · Refund workflow: COMPLETED/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Audit", exact: true }).click();
  await expect(
    page.getByText("EVENT CANCELLED", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("audit.png"), fullPage: true });
  await page.getByRole("button", { name: "Analytics", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Revenue · VND" }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("analytics.png"),
    fullPage: true,
  });
  await shop.goto("/account/bookings");
  await expect(
    shop.getByRole("heading", { name: "Booking updates" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const section of ["Analytics", "Venues", "Promotions", "Events"]) {
    await page.getByRole("button", { name: section, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("mobile-workspace.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await customer.close();
});
test("mobile organizer login state stays within the viewport", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/organizer");
  await expect(
    page.getByText("Log in with an organizer account", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("mobile.png"),
    fullPage: true,
  });
});
