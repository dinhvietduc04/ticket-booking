import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import {
  loginSchema,
  registerSchema,
  type LoginDto,
  type RegisterDto,
} from "@ticket-booking/contracts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post("login")
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginDto) {
    return this.authService.login(body);
  }

  @Get("me")
  me(@Headers("authorization") authorization?: string) {
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;

    if (!token) {
      throw new UnauthorizedException({
        code: "UNAUTHORIZED",
        message: "Missing bearer token.",
      });
    }

    return this.authService.me(token);
  }
}
