import { UnauthorizedException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service";

describe("AuthService request user resolution", () => {
  it("prefers an active bearer-token user over the demo header", async () => {
    const { service, jwt, prisma } = createService();
    jwt.verifyAsync.mockResolvedValue({ sub: "real-user-id" });
    prisma.user.findUnique.mockResolvedValue({
      id: "real-user-id",
      status: "ACTIVE",
    });

    await expect(
      service.resolveRequestUserId(
        "Bearer access-token",
        "customer-a@seatly.local",
      ),
    ).resolves.toBe("real-user-id");
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "real-user-id" },
      select: { id: true, status: true },
    });
  });

  it("falls back to the seeded demo user when no bearer token exists", async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: "demo-user-id",
      status: "ACTIVE",
    });

    await expect(
      service.resolveRequestUserId(undefined, "Customer-A@Seatly.Local"),
    ).resolves.toBe("demo-user-id");
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "customer-a@seatly.local" },
      select: { id: true, status: true },
    });
  });

  it("rejects inactive bearer-token users", async () => {
    const { service, jwt, prisma } = createService();
    jwt.verifyAsync.mockResolvedValue({ sub: "disabled-user-id" });
    prisma.user.findUnique.mockResolvedValue({
      id: "disabled-user-id",
      status: "DISABLED",
    });

    await expect(
      service.resolveRequestUserId("Bearer access-token"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function createService() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };
  const jwt = {
    verifyAsync: jest.fn(),
    signAsync: jest.fn(),
  };

  return {
    jwt,
    prisma,
    service: new AuthService(
      prisma as unknown as ConstructorParameters<typeof AuthService>[0],
      jwt as unknown as JwtService,
    ),
  };
}
