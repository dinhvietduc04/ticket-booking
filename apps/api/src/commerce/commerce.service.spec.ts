import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { serial } from "./commerce.service";

const clientVersion = "5.22.0";
const connectorError = (code: string) =>
  new Prisma.PrismaClientUnknownRequestError(
    `Error occurred during query execution: ConnectorError(ConnectorError { kind: QueryError(PostgresError { code: "${code}", message: "database conflict" }) })`,
    { clientVersion },
  );

describe("serial transaction retries", () => {
  const retryableErrors = [
    new Prisma.PrismaClientKnownRequestError("Transaction conflict", {
      code: "P2034",
      clientVersion,
    }),
    connectorError("40P01"),
    connectorError("40001"),
  ];

  it.each(retryableErrors)("retries a database conflict: %s", async (error) => {
    const tx = {} as Prisma.TransactionClient;
    const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValue("ok");
    const transaction = jest.fn((callback) => callback(tx));
    const prisma = { $transaction: transaction } as unknown as PrismaService;

    await expect(serial(prisma, fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledWith(tx);
    expect(transaction).toHaveBeenLastCalledWith(fn, {
      isolationLevel: "Serializable",
      timeout: 15000,
    });
  });

  it.each(retryableErrors)(
    "bounds retries for persistent conflicts: %s",
    async (error) => {
      const transaction = jest.fn().mockRejectedValue(error);
      const prisma = { $transaction: transaction } as unknown as PrismaService;

      await expect(serial(prisma, jest.fn())).rejects.toBe(error);
      expect(transaction).toHaveBeenCalledTimes(5);
    },
  );

  it.each([
    new ConflictException("Booking is not refundable"),
    new Error('PostgresError { code: "40P01" }'),
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion,
    }),
    connectorError("23505"),
    new Prisma.PrismaClientUnknownRequestError("Unrelated failure: 40P01", {
      clientVersion,
    }),
  ])("does not retry unrelated errors: %s", async (error) => {
    const transaction = jest.fn().mockRejectedValue(error);
    const prisma = { $transaction: transaction } as unknown as PrismaService;

    await expect(serial(prisma, jest.fn())).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
