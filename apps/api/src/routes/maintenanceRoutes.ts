import express from "express";
import { prisma } from "@printowl/db";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { deleteObjectFromR2ByUrl } from "../utils/r2Storage.js";
import { PrintJobStatus } from "../../../../packages/db/dist/generated/prisma/enums.js";

const app = express.Router();

function normalizeUrlBase(url: string | undefined | null): string {
  return String(url ?? "")
    .trim()
    .replace(/\/$/, "");
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

/**
 * POST /api/v1/maintenance/expire-old-printjobs
 *
 * Expires PrintJobs older than 24 hours with statuses:
 *   PENDING, COMPLETED, REJECTED, FAILED, CANCELED
 * - Does NOT touch DRAFT or PROCESSING jobs.
 * - Does NOT delete job records — preserves them for analytics.
 * - Moves verificationCode → oldOtp, then sets verificationCode to null (freeing OTPs).
 * - Deletes associated file objects from Cloudflare R2 (best-effort).
 * - Clears file URLs (sets to empty string) so expired files can't be viewed.
 * - Sets expired = true.
 * - PENDING jobs get status changed to CANCELED.
 * - COMPLETED jobs keep their status but are marked expired.
 *
 * Admin-only.
 */
app.post(
  "/expire-old-printjobs",
  authMiddleware(["admin"]),
  async (req, res) => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const r2PublicBase = normalizeUrlBase(process.env.R2_PUBLIC_BUCKET_URL);
    if (!r2PublicBase) {
      return res.status(500).json({
        error:
          "R2_PUBLIC_BUCKET_URL is missing; cannot safely delete R2 objects.",
      });
    }

    try {
      // Find all non-expired jobs older than 24h with terminal/stale statuses
      const jobs = await prisma.printJob.findMany({
        where: {
          createdAt: { lt: cutoff },
          expired: false,
          status: {
            in: [
              PrintJobStatus.PENDING,
              PrintJobStatus.COMPLETED,
              PrintJobStatus.REJECTED,
              PrintJobStatus.FAILED,
              PrintJobStatus.CANCELED,
            ],
          },
        },
        select: {
          id: true,
          createdAt: true,
          status: true,
          verificationCode: true,
          files: {
            select: {
              id: true,
              url: true,
            },
          },
        },
      });

      if (jobs.length === 0) {
        return res.status(200).json({
          cutoff,
          matchedJobs: 0,
          expiredJobs: 0,
          matchedFileUrls: 0,
          r2Deleted: 0,
          r2Failed: 0,
          otpsFreed: 0,
        });
      }

      // 1) Delete files from R2 (best-effort, batched)
      const fileUrls = uniqueStrings(
        jobs
          .flatMap((j) => j.files.map((f) => f.url))
          .filter(
            (url): url is string => typeof url === "string" && url.length > 0,
          )
          .filter((url) => url.startsWith(`${r2PublicBase}/`)),
      );

      let r2Deleted = 0;
      let r2Failed = 0;

      const CONCURRENCY = 10;
      for (let i = 0; i < fileUrls.length; i += CONCURRENCY) {
        const chunk = fileUrls.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          chunk.map(async (url) => deleteObjectFromR2ByUrl(url)),
        );
        for (const result of results) {
          if (result.status === "fulfilled") {
            r2Deleted++;
          } else {
            r2Failed++;
            console.error("Failed to delete R2 object:", result.reason);
          }
        }
      }

      // 2) For each job: move verificationCode → oldOtp, null out verificationCode,
      //    mark expired, change PENDING → CANCELED
      let otpsFreed = 0;
      let expiredCount = 0;

      for (const job of jobs) {
        const updateData: Record<string, unknown> = {
          expired: true,
          oldOtp: job.verificationCode ?? undefined,
          verificationCode: null,
        };

        // PENDING jobs → CANCELED (they were never fulfilled)
        if (job.status === PrintJobStatus.PENDING) {
          updateData.status = PrintJobStatus.CANCELED;
        }
        // COMPLETED, REJECTED, FAILED, CANCELED → keep status, just mark expired

        await prisma.printJob.update({
          where: { id: job.id },
          data: updateData,
        });

        if (job.verificationCode != null) {
          otpsFreed++;
        }
        expiredCount++;

        // 3) Clear file URLs for this job (keep file records for analytics)
        const fileIds = job.files.map((f) => f.id);
        if (fileIds.length > 0) {
          await prisma.file.updateMany({
            where: { id: { in: fileIds } },
            data: { url: "" },
          });
        }
      }

      return res.status(200).json({
        cutoff,
        matchedJobs: jobs.length,
        expiredJobs: expiredCount,
        matchedFileUrls: fileUrls.length,
        r2Deleted,
        r2Failed,
        otpsFreed,
      });
    } catch (error) {
      console.error("[expire-old-printjobs] Failed:", error);
      return res
        .status(500)
        .json({ error: "Failed to expire old print jobs." });
    }
  },
);

// Keep the old DELETE endpoint as an alias for backwards compatibility
app.delete(
  "/cleanup-old-printjobs",
  authMiddleware(["admin"]),
  async (req, res) => {
    // Redirect to the new expiration logic by calling it internally
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const r2PublicBase = normalizeUrlBase(process.env.R2_PUBLIC_BUCKET_URL);
    if (!r2PublicBase) {
      return res.status(500).json({
        error:
          "R2_PUBLIC_BUCKET_URL is missing; cannot safely delete R2 objects.",
      });
    }

    try {
      const jobs = await prisma.printJob.findMany({
        where: {
          createdAt: { lt: cutoff },
          expired: false,
          status: {
            in: [
              PrintJobStatus.PENDING,
              PrintJobStatus.COMPLETED,
              PrintJobStatus.REJECTED,
              PrintJobStatus.FAILED,
              PrintJobStatus.CANCELED,
            ],
          },
        },
        select: {
          id: true,
          createdAt: true,
          status: true,
          verificationCode: true,
          files: {
            select: {
              id: true,
              url: true,
            },
          },
        },
      });

      if (jobs.length === 0) {
        return res.status(200).json({
          cutoff,
          matchedJobs: 0,
          expiredJobs: 0,
          matchedFileUrls: 0,
          r2Deleted: 0,
          r2Failed: 0,
          otpsFreed: 0,
        });
      }

      const fileUrls = uniqueStrings(
        jobs
          .flatMap((j) => j.files.map((f) => f.url))
          .filter(
            (url): url is string => typeof url === "string" && url.length > 0,
          )
          .filter((url) => url.startsWith(`${r2PublicBase}/`)),
      );

      let r2Deleted = 0;
      let r2Failed = 0;

      const CONCURRENCY = 10;
      for (let i = 0; i < fileUrls.length; i += CONCURRENCY) {
        const chunk = fileUrls.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          chunk.map(async (url) => deleteObjectFromR2ByUrl(url)),
        );
        for (const result of results) {
          if (result.status === "fulfilled") {
            r2Deleted++;
          } else {
            r2Failed++;
            console.error("Failed to delete R2 object:", result.reason);
          }
        }
      }

      let otpsFreed = 0;
      let expiredCount = 0;

      for (const job of jobs) {
        const updateData: Record<string, unknown> = {
          expired: true,
          oldOtp: job.verificationCode ?? undefined,
          verificationCode: null,
        };

        if (job.status === PrintJobStatus.PENDING) {
          updateData.status = PrintJobStatus.CANCELED;
        }

        await prisma.printJob.update({
          where: { id: job.id },
          data: updateData,
        });

        if (job.verificationCode != null) {
          otpsFreed++;
        }
        expiredCount++;

        const fileIds = job.files.map((f) => f.id);
        if (fileIds.length > 0) {
          await prisma.file.updateMany({
            where: { id: { in: fileIds } },
            data: { url: "" },
          });
        }
      }

      return res.status(200).json({
        cutoff,
        matchedJobs: jobs.length,
        expiredJobs: expiredCount,
        matchedFileUrls: fileUrls.length,
        r2Deleted,
        r2Failed,
        otpsFreed,
      });
    } catch (error) {
      console.error("[cleanup-old-printjobs] Failed:", error);
      return res
        .status(500)
        .json({ error: "Failed to expire old print jobs." });
    }
  },
);

/**
 * DELETE /api/v1/maintenance/cleanup-stale-drafts
 *
 * Deletes DRAFT PrintJobs where the most recent file was uploaded more
 * than 24 hours ago. Drafts with zero files that are themselves older
 * than 24h are also cleaned up.
 *
 * - Deletes associated files from Cloudflare R2 (best-effort).
 * - Frees up verification codes (drafts shouldn't have them, but just in case).
 *
 * Admin-only.
 */
app.delete(
  "/cleanup-stale-drafts",
  authMiddleware(["admin"]),
  async (req, res) => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const r2PublicBase = normalizeUrlBase(process.env.R2_PUBLIC_BUCKET_URL);
    if (!r2PublicBase) {
      return res.status(500).json({
        error:
          "R2_PUBLIC_BUCKET_URL is missing; cannot safely delete R2 objects.",
      });
    }

    try {
      // Find all DRAFT jobs
      const drafts = await prisma.printJob.findMany({
        where: {
          status: PrintJobStatus.DRAFT,
        },
        select: {
          id: true,
          createdAt: true,
          files: {
            select: {
              url: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      // Filter: keep only drafts where the LAST file is older than 24h,
      // or drafts with no files that are themselves older than 24h.
      const staleDrafts = drafts.filter((draft) => {
        if (draft.files.length === 0) {
          // Empty draft — stale if the job itself is old
          return draft.createdAt < cutoff;
        }
        // Non-empty draft — stale if the newest file is old
        const latestFileDate = draft.files[0]!.createdAt;
        return latestFileDate < cutoff;
      });

      if (staleDrafts.length === 0) {
        return res.status(200).json({
          cutoff,
          matchedDrafts: 0,
          deletedDrafts: 0,
          matchedFileUrls: 0,
          r2Deleted: 0,
          r2Failed: 0,
        });
      }

      const draftIds = staleDrafts.map((d) => d.id);
      const fileUrls = uniqueStrings(
        staleDrafts
          .flatMap((d) => d.files.map((f) => f.url))
          .filter(
            (url): url is string => typeof url === "string" && url.length > 0,
          )
          .filter((url) => url.startsWith(`${r2PublicBase}/`)),
      );

      // Delete R2 objects (best-effort, batched)
      let r2Deleted = 0;
      let r2Failed = 0;

      const CONCURRENCY = 10;
      for (let i = 0; i < fileUrls.length; i += CONCURRENCY) {
        const chunk = fileUrls.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          chunk.map(async (url) => deleteObjectFromR2ByUrl(url)),
        );
        for (const result of results) {
          if (result.status === "fulfilled") {
            r2Deleted++;
          } else {
            r2Failed++;
            console.error("Failed to delete R2 object:", result.reason);
          }
        }
      }

      // Delete the draft jobs (cascading deletes should handle files + options)
      const deleted = await prisma.printJob.deleteMany({
        where: { id: { in: draftIds } },
      });

      return res.status(200).json({
        cutoff,
        matchedDrafts: staleDrafts.length,
        deletedDrafts: deleted.count,
        matchedFileUrls: fileUrls.length,
        r2Deleted,
        r2Failed,
      });
    } catch (error) {
      console.error("[cleanup-stale-drafts] Failed:", error);
      return res
        .status(500)
        .json({ error: "Failed to cleanup stale drafts." });
    }
  },
);

/**
 * GET /api/v1/maintenance/otp-availability
 *
 * Shows how many 4-digit OTP codes (1000–9999) are currently in use
 * and how many are available for new job submissions.
 *
 * Admin-only.
 */
app.get(
  "/otp-availability",
  authMiddleware(["admin"]),
  async (req, res) => {
    try {
      const TOTAL_CODES = 9000; // 1000–9999

      // Count jobs that currently hold a verificationCode (non-null)
      const usedCount = await prisma.printJob.count({
        where: {
          verificationCode: { not: null },
        },
      });

      // Breakdown by status
      const byStatus = await prisma.printJob.groupBy({
        by: ["status"],
        where: {
          verificationCode: { not: null },
        },
        _count: true,
      });

      const statusBreakdown: Record<string, number> = {};
      for (const entry of byStatus) {
        statusBreakdown[entry.status] = entry._count;
      }

      const available = TOTAL_CODES - usedCount;
      const utilizationPercent = ((usedCount / TOTAL_CODES) * 100).toFixed(1);

      return res.status(200).json({
        totalCodes: TOTAL_CODES,
        usedCodes: usedCount,
        availableCodes: available,
        utilizationPercent: `${utilizationPercent}%`,
        byStatus: statusBreakdown,
        canHandleTomorrow: available > 50,
        warning: available < 100 ? "LOW: Consider running expire-old-printjobs" : null,
      });
    } catch (error) {
      console.error("[otp-availability] Failed:", error);
      return res.status(500).json({ error: "Failed to check OTP availability." });
    }
  },
);

export default app;
