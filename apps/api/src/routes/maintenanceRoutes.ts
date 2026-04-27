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
 * DELETE /api/v1/maintenance/cleanup-old-printjobs
 *
 * Deletes PrintJobs older than 24 hours with terminal or stale statuses:
 *   PENDING, COMPLETED, REJECTED, FAILED, CANCELED
 * - Does NOT touch DRAFT or PROCESSING jobs.
 * - Deletes associated file objects from Cloudflare R2 (best-effort).
 *
 * Admin-only.
 */
app.delete(
  "/cleanup-old-printjobs",
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
      const jobs = await prisma.printJob.findMany({
        where: {
          createdAt: { lt: cutoff },
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
          files: {
            select: {
              url: true,
            },
          },
        },
      });

      const jobIds = jobs.map((j) => j.id);
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

      const deleted = jobIds.length
        ? await prisma.printJob.deleteMany({
            where: {
              id: { in: jobIds },
            },
          })
        : { count: 0 };

      return res.status(200).json({
        cutoff,
        matchedJobs: jobs.length,
        deletedJobs: deleted.count,
        matchedFileUrls: fileUrls.length,
        r2Deleted,
        r2Failed,
      });
    } catch (error) {
      console.error("[cleanup-old-printjobs] Failed:", error);
      return res
        .status(500)
        .json({ error: "Failed to cleanup old print jobs." });
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

export default app;
