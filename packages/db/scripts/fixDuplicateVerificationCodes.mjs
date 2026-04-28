import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Looking for duplicate verificationCode values…");

  const duplicates = await prisma.$queryRaw`
    SELECT "verificationCode", COUNT(*)::int AS "cnt"
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
    console.log(`   Code ${d.verificationCode} appears ${d.cnt} times`);
  }

  // Get all used codes
  const allRows = await prisma.printJob.findMany({
    where: { verificationCode: { not: null } },
    select: { verificationCode: true },
  });
  const usedCodes = new Set(allRows.map((r) => r.verificationCode));

  function genCode() {
    let code;
    let attempts = 0;
    do {
      code = Math.floor(1000 + Math.random() * 9000);
      attempts++;
      if (attempts > 50000) throw new Error("Exhausted unique codes");
    } while (usedCodes.has(code));
    usedCodes.add(code);
    return code;
  }

  let totalFixed = 0;
  for (const dup of duplicates) {
    const rows = await prisma.printJob.findMany({
      where: { verificationCode: dup.verificationCode },
      orderBy: { createdAt: "asc" },
      select: { id: true, verificationCode: true },
    });

    // Keep the oldest, reassign the rest
    for (let i = 1; i < rows.length; i++) {
      const newCode = genCode();
      await prisma.printJob.update({
        where: { id: rows[i].id },
        data: { verificationCode: newCode },
      });
      console.log(`   ✏️  PrintJob ${rows[i].id}: ${dup.verificationCode} → ${newCode}`);
      totalFixed++;
    }
  }

  console.log(`\n✅ Fixed ${totalFixed} duplicate(s). All verification codes are now unique.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
