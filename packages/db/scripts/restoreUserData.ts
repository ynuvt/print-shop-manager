/// <reference types="node" />

import "dotenv/config";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { prisma } from "../src/client.js";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Add it to packages/db/.env or export it in your shell before running this script.",
  );
}

const backupPathFromArg = process.argv[2];
const backupDir = path.join(process.cwd(), "prisma", "backups");

async function findLatestBackupFile(): Promise<string> {
  const entries = await fs.readdir(backupDir, { withFileTypes: true });
  const backupFiles = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.startsWith("user-data.") &&
        entry.name.endsWith(".json"),
    )
    .map((entry) => entry.name)
    .sort();

  const latest = backupFiles.at(-1);
  if (!latest) {
    throw new Error(
      `No backup files found in ${backupDir}. Run \"npm run users:backup\" first (from packages/db).`,
    );
  }

  return path.join(backupDir, latest);
}

type BackupPayload = {
  users: Array<{
    id: string;
    onboardingCompleted: boolean;
    name: string | null;
    createdAt?: string;
    updatedAt?: string;
  }>;
  // Present in some older backups; intentionally ignored by this script.
  whatsAppUsers?: unknown;
};

const backupFilePath = backupPathFromArg
  ? path.isAbsolute(backupPathFromArg)
    ? backupPathFromArg
    : path.join(process.cwd(), backupPathFromArg)
  : await findLatestBackupFile();

try {
  const raw = await fs.readFile(backupFilePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<BackupPayload>;

  const users = Array.isArray(parsed.users) ? parsed.users : [];

  if (users.length === 0) {
    throw new Error(
      `Backup file ${backupFilePath} does not look like a user-data backup (missing users array).`,
    );
  }

  // Restore Users first (no FK dependencies)
  const usersToCreate = users.map((u) => ({
    id: u.id,
    onboardingCompleted: u.onboardingCompleted ?? false,
    name: u.name ?? null,
    // We intentionally do not restore createdAt/updatedAt to avoid issues with @updatedAt.
  }));

  const userResult = await prisma.user.createMany({
    data: usersToCreate,
    skipDuplicates: true,
  });

  console.log(
    `Restored Users: inserted ${userResult.count} (skipDuplicates=true) from ${backupFilePath}`,
  );
} finally {
  await prisma.$disconnect();
}
