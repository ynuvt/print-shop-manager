/**
 * One-time backfill: set defaultShopId on all existing WhatsAppUser rows
 * that don't already have one. Run this after migrating to production DB
 * while the app was deployed for a single shop only.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/backfill-default-shop.mjs TCET
 *
 *   Or with the local .env:
 *   cd apps/api && node --env-file .env ../../scripts/backfill-default-shop.mjs TCET
 *
 * Only touches rows where defaultShopId IS NULL — safe to re-run.
 */

import { PrismaClient } from "../packages/db/dist/generated/prisma/client.js";

const shopId = process.argv[2]?.trim().toUpperCase();

if (!shopId) {
  console.error("Usage: node scripts/backfill-default-shop.mjs <SHOP_ID>");
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  // Verify the shop exists and is active
  const shop = await prisma.printShop.findUnique({
    where: { shopId },
    select: { shopId: true, name: true, username: true, isActive: true },
  });

  if (!shop) {
    console.error(`Shop "${shopId}" not found.`);
    process.exit(1);
  }
  if (!shop.isActive) {
    console.error(`Shop "${shopId}" exists but is not active.`);
    process.exit(1);
  }

  console.log(`Target shop: ${shop.name || shop.username} (${shop.shopId})`);

  // Count how many users will be updated
  const count = await prisma.whatsAppUser.count({
    where: { defaultShopId: null },
  });

  console.log(`Updating ${count} WhatsAppUser rows where defaultShopId is null…`);

  const result = await prisma.whatsAppUser.updateMany({
    where: { defaultShopId: null },
    data: { defaultShopId: shop.shopId },
  });

  console.log(`Done. Updated ${result.count} rows.`);
} catch (err) {
  console.error("Error:", err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
