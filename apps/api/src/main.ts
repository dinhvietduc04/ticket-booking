import "reflect-metadata";
import helmet from "helmet";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger("HTTP");

  app.setGlobalPrefix("api");
  app.use(helmet());
  app.use((request: Request, response: Response, next: NextFunction) => {
    const startedAt = Date.now();

    response.on("finish", () => {
      logger.log(
        JSON.stringify({
          method: request.method,
          path: request.originalUrl,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
        }),
      );
    });

    next();
  });
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  });
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();
