/// <reference types="node" />

import "dotenv/config";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { prisma } from "../src/client.js";

function timestampForFilename(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

const backupDir = path.join(process.cwd(), "prisma", "backups", `full-${timestampForFilename(new Date())}`);

async function backupTable(tableName: string, model: any) {
  console.log(`Backing up ${tableName}...`);
  const data = await model.findMany();
  const filePath = path.join(backupDir, `${tableName}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  console.log(`Done. ${data.length} records saved to ${filePath}`);
  return data.length;
}

try {
  await fs.mkdir(backupDir, { recursive: true });

  const summary: Record<string, number> = {};

  summary.User = await backupTable("User", prisma.user);
  summary.WhatsAppUser = await backupTable("WhatsAppUser", prisma.whatsAppUser);
  summary.PrintJob = await backupTable("PrintJob", prisma.printJob);
  summary.PrintJobOwner = await backupTable("PrintJobOwner", prisma.printJobOwner);
  summary.File = await backupTable("file", prisma.file);
  summary.PrintOption = await backupTable("printOption", prisma.printOption);
  summary.WhatsAppLoginOtp = await backupTable("WhatsAppLoginOtp", prisma.whatsAppLoginOtp);
  summary.UserEvent = await backupTable("UserEvent", prisma.userEvent);
  summary.MobileSyncOtp = await backupTable("MobileSyncOtp", prisma.mobileSyncOtp);

  const summaryPath = path.join(backupDir, "summary.json");
  await fs.writeFile(summaryPath, JSON.stringify({
    exportedAt: new Date().toISOString(),
    summary
  }, null, 2), "utf8");

  console.log(`\nFull database backup completed!`);
  console.log(`Backup location: ${backupDir}`);
  console.dir(summary);

} catch (error) {
  console.error("Backup failed:", error);
} finally {
  await prisma.$disconnect();
}
