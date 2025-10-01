import { PrismaClient } from "@prisma/client";

// ประกาศ global type ว่าจะเก็บ prisma ไว้
const globalForPrisma = global as unknown as { prisma: PrismaClient };

// ถ้ายังไม่มี ให้สร้างใหม่
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["query", "error", "warn"], // เปิด log เวลา query DB
  });

// กัน Prisma ถูกสร้างซ้ำตอน dev (hot reload)
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
