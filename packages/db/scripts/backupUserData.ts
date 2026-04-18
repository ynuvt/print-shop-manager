/// <reference types="node" />

import "dotenv/config";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { prisma } from "../src/client.js";

function timestampForFilename(date: Date): string {
  // ISO without characters that are awkward in filenames
  return date.toISOString().replace(/[:.]/g, "-");
}

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Add it to packages/db/.env or export it in your shell before running this script.",
  );
}

const backupDir = path.join(process.cwd(), "prisma", "backups");
const backupFileName = `user-data.${timestampForFilename(new Date())}.json`;
const backupFilePath = path.join(backupDir, backupFileName);

try {
  await fs.mkdir(backupDir, { recursive: true });

  const users = await prisma.user.findMany({
    select: {
      id: true,
      onboardingCompleted: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    counts: {
      users: users.length,
    },
    users,
  };

  await fs.writeFile(backupFilePath, JSON.stringify(payload, null, 2), "utf8");

  // Intentionally do not print user data.
  console.log(`Backed up ${users.length} User rows to ${backupFilePath}`);
} finally {
  await prisma.$disconnect();
}
