import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class VenuesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.venue.findMany({
      orderBy: { name: "asc" },
      include: {
        halls: {
          select: {
            id: true,
            name: true,
            capacity: true,
          },
        },
      },
    });
  }
}
