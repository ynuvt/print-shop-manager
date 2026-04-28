/// <reference types="node" />

import "dotenv/config";
import { prisma } from "../src/client.js";

/**
 * Finds duplicate verificationCode values in PrintJob and reassigns
 * new unique 4-digit codes to the duplicates (keeping the oldest row's code).
 */

async function getUsedCodes(): Promise<Set<number>> {
  const rows = await prisma.printJob.findMany({
    where: { verificationCode: { not: null } },
    select: { verificationCode: true },
  });
  return new Set(rows.map((r) => r.verificationCode!));
}

function generateUniqueCode(usedCodes: Set<number>): number {
  // 4-digit codes: 1000–9999
  let code: number;
  let attempts = 0;
  do {
    code = Math.floor(1000 + Math.random() * 9000);
    attempts++;
    if (attempts > 50000) {
      throw new Error("Could not find a unique 4-digit code after 50 000 attempts");
    }
  } while (usedCodes.has(code));
  usedCodes.add(code);
  return code;
}

async function main() {
  console.log("🔍 Looking for duplicate verificationCode values…");

  // Find codes that appear more than once
  const duplicates: { verificationCode: number; _count: number }[] =
    await prisma.$queryRaw`
      SELECT "verificationCode", COUNT(*)::int AS "_count"
      FROM "PrintJob"
      WHERE "verificationCode" IS NOT NULL
      GROUP BY "verificationCode"
      HAVING COUNT(*) > 1
    `;

  if (duplicates.length === 0) {
    console.log("✅ No duplicates found — you're good to go!");
    return;
  }

  console.log(`⚠️  Found ${duplicates.length} duplicated code(s):`);
  for (const d of duplicates) {
    console.log(`   Code ${d.verificationCode} appears ${d._count} times`);
  }

  const usedCodes = await getUsedCodes();
  let totalFixed = 0;

  for (const dup of duplicates) {
    // Get all rows with this code, ordered by createdAt (keep the oldest)
    const rows = await prisma.printJob.findMany({
      where: { verificationCode: dup.verificationCode },
      orderBy: { createdAt: "asc" },
      select: { id: true, verificationCode: true, createdAt: true },
    });

    // Skip the first (oldest) — reassign the rest
    for (let i = 1; i < rows.length; i++) {
      const newCode = generateUniqueCode(usedCodes);
      await prisma.printJob.update({
        where: { id: rows[i].id },
        data: { verificationCode: newCode },
      });
      console.log(
        `   ✏️  PrintJob ${rows[i].id}: ${dup.verificationCode} → ${newCode}`
      );
      totalFixed++;
    }
  }

  console.log(`\n✅ Fixed ${totalFixed} duplicate(s). All verification codes are now unique.`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
