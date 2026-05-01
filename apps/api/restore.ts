import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "@printowl/db";
import { PrintJobStatus, Source } from "../../../packages/db/dist/generated/prisma/enums.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("Reading old analysis data...");
  const dataPath = path.join(__dirname, "src/routes/oldanalysisdata.js");
  let content = fs.readFileSync(dataPath, "utf8");

const scriptContent = content + "\nmodule.exports = {  twentyfiveApril };\n";
  
  // We'll use the VM module to safely evaluate
  const vm = await import("vm");
  const sandbox = { module: { exports: {} } };
  vm.createContext(sandbox);
  vm.runInContext(scriptContent, sandbox);
  
  const exportsObj = sandbox.module.exports as any;
  const datasets = [exportsObj.twentysevenApril, exportsObj.twentyfiveApril].filter(Boolean);

  if (datasets.length === 0) {
    console.error("Could not parse data from the file.");
    return;
  }
  
  const allJobs: any[] = [];
  
  for (const data1 of datasets) {
    console.log(`Found data for date: ${data1.date}`);
    if (data1.pending?.jobs) allJobs.push(...data1.pending.jobs);
    if (data1.completed?.jobs) allJobs.push(...data1.completed.jobs);
    if (data1.draft?.jobs) allJobs.push(...data1.draft.jobs);
  }

  console.log(`Total jobs extracted: ${allJobs.length}`);

  let insertedCount = 0;
  for (const job of allJobs) {
    try {
      await prisma.printJob.upsert({
        where: { id: job.id },
        create: {
          id: job.id,
          verificationCode: null, // Left null to avoid unique constraint errors
          oldOtp: job.verificationCode, // Saved here per user instruction
          userId: job.userId,
          createdAt: new Date(job.createdAt),
          totalPages: job.totalPages,
          totalCost: job.totalCost,
          source: job.source as any,
          status: job.status as any,
          estimatedTime: job.totalPages * 30, // Required field fallback
          expired: true, // Marked as expired per user request
        },
        update: {}, // Don't overwrite if it already exists
      });
      insertedCount++;
    } catch (err: any) {
      if (err.message.includes("Foreign key constraint failed") || err.code === "P2003") {
        try {
          // Retry without the deleted userId
          await prisma.printJob.upsert({
            where: { id: job.id },
            create: {
              id: job.id,
              verificationCode: null,
              oldOtp: job.verificationCode,
              userId: null, // Fallback if user was deleted
              createdAt: new Date(job.createdAt),
              totalPages: job.totalPages,
              totalCost: job.totalCost,
              source: job.source as any,
              status: job.status as any,
              estimatedTime: job.totalPages * 30,
              expired: true, // Marked as expired per user request
            },
            update: {},
          });
          insertedCount++;
        } catch (fallbackErr: any) {
          console.log(`Skipped job ${job.id} on fallback - Error: ${fallbackErr.message}`);
        }
      } else {
        console.log(`Skipped job ${job.id} - Error: ${err.message}`);
      }
    }
  }

  console.log(`Successfully restored ${insertedCount} jobs.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
