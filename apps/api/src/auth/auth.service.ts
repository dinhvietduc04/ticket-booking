import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import type { LoginDto, RegisterDto } from "@ticket-booking/contracts";
import { PrismaService } from "../prisma/prisma.service";

const ACCESS_TOKEN_TTL = "15m";
const DEFAULT_DEMO_USER_EMAIL = "customer-a@seatly.local";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException({
        code: "EMAIL_ALREADY_REGISTERED",
        message: "This email is already registered.",
      });
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash: await hash(dto.password, 12),
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      },
    });

    return this.sessionFor(user.id);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException({
        code: "INVALID_CREDENTIALS",
        message: "Email or password is incorrect.",
      });
    }

    return this.sessionFor(user.id);
  }

  async me(token: string) {
    const payload = await this.verifyAccessToken(token);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
        role: true,
        emailVerified: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: "UNAUTHORIZED",
        message: "User no longer exists.",
      });
    }

    return {
      ...user,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async resolveRequestUserId(
    authorization?: string,
    demoUserEmail = DEFAULT_DEMO_USER_EMAIL,
  ) {
    const bearerToken = this.getBearerToken(authorization);

    if (bearerToken) {
      const payload = await this.verifyAccessToken(bearerToken);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, status: true },
      });

      if (!user || user.status !== "ACTIVE") {
        throw new UnauthorizedException({
          code: "UNAUTHORIZED",
          message: "User is not active.",
        });
      }

      return user.id;
    }

    const user = await this.prisma.user.findUnique({
      where: { email: demoUserEmail.trim().toLowerCase() },
      select: { id: true, status: true },
    });

    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException({
        code: "UNAUTHORIZED",
        message: "Seeded demo user was not found. Run pnpm db:seed.",
      });
    }

    return user.id;
  }

  private async sessionFor(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });

    return {
      accessToken: await this.jwtService.signAsync(
        {
          sub: user.id,
          email: user.email,
          role: user.role,
        },
        {
          secret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret",
          expiresIn: ACCESS_TOKEN_TTL,
        },
      ),
      tokenType: "Bearer",
      expiresIn: 15 * 60,
      user,
    };
  }

  private async verifyAccessToken(token: string): Promise<{ sub: string }> {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret",
      });
    } catch {
      throw new UnauthorizedException({
        code: "UNAUTHORIZED",
        message: "Invalid or expired bearer token.",
      });
    }
  }

  private getBearerToken(authorization?: string) {
    return authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;
  }
}
