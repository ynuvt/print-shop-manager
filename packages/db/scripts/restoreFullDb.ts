/// <reference types="node" />

import "dotenv/config";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { prisma } from "../src/client.js";

const backupPathFromArg = process.argv[2];

if (!backupPathFromArg) {
  console.error("Please provide the path to the backup folder. Example: node scripts/restoreFullDb.ts prisma/backups/full-2026-04-30T14-29-00-000Z");
  process.exit(1);
}

const backupDir = path.isAbsolute(backupPathFromArg)
  ? backupPathFromArg
  : path.join(process.cwd(), backupPathFromArg);

async function restoreTable(tableName: string, model: any) {
  const filePath = path.join(backupDir, `${tableName}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    
    if (data.length === 0) {
      console.log(`Table ${tableName}: No data to restore.`);
      return;
    }

    console.log(`Restoring ${tableName} (${data.length} records)...`);
    
    // For many models, createMany is most efficient
    const result = await model.createMany({
      data,
      skipDuplicates: true,
    });
    
    console.log(`Done. Restored ${result.count} records to ${tableName}.`);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.warn(`Table ${tableName}: Backup file not found, skipping.`);
    } else {
      console.error(`Failed to restore ${tableName}:`, error.message);
    }
  }
}

try {
  // Restore in dependency order
  await restoreTable("User", prisma.user);
  await restoreTable("PrintShop", prisma.printShop);
  await restoreTable("Brand", prisma.brand);
  await restoreTable("WhatsAppUser", prisma.whatsAppUser);
  await restoreTable("PrintJob", prisma.printJob);
  await restoreTable("PrintJobOwner", prisma.printJobOwner);
  await restoreTable("file", prisma.file);
  await restoreTable("printOption", prisma.printOption);
  await restoreTable("WhatsAppLoginOtp", prisma.whatsAppLoginOtp);
  await restoreTable("UserEvent", prisma.userEvent);
  await restoreTable("MobileSyncOtp", prisma.mobileSyncOtp);
  await restoreTable("Outlet", prisma.outlet);
  await restoreTable("OutletWorker", prisma.outletWorker);
  await restoreTable("BrandOffer", prisma.brandOffer);
  await restoreTable("Coupon", prisma.coupon);
  await restoreTable("CouponRedemption", prisma.couponRedemption);

  console.log(`\nFull database restore completed!`);
} catch (error) {
  console.error("Restore failed:", error);
} finally {
  await prisma.$disconnect();
}
