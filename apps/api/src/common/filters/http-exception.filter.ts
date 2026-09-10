import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request, Response } from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? body.message
        : exception instanceof Error
          ? exception.message
          : "Internal server error";
    const code =
      typeof body === "object" && body !== null && "code" in body
        ? body.code
        : statusCode === HttpStatus.INTERNAL_SERVER_ERROR
          ? "INTERNAL_SERVER_ERROR"
          : "HTTP_ERROR";
    const details =
      typeof body === "object" && body !== null && "details" in body
        ? body.details
        : undefined;

    response.status(statusCode).json({
      statusCode,
      code,
      message,
      ...(details ? { details } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
