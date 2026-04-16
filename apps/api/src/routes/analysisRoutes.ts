import express from "express";
import { prisma } from "@printowl/db";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  PrintJobStatus,
  UserEventType,
} from "../../../../packages/db/dist/generated/prisma/enums.js";

const app = express.Router();

type DateRange = {
  start: Date;
  end: Date;
};

function parseDateQuery(dateQuery: unknown): DateRange | null {
  if (dateQuery === undefined) {
    return null;
  }

  if (typeof dateQuery !== "string") {
    throw new Error(
      "Query param 'date' must be a string in YYYY-MM-DD format.",
    );
  }

  const trimmed = dateQuery.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Invalid date format. Use YYYY-MM-DD.");
  }

  const [yearString, monthString, dayString] = trimmed.split("-");
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);

  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);

  if (
    Number.isNaN(start.getTime()) ||
    start.getFullYear() !== year ||
    start.getMonth() !== month - 1 ||
    start.getDate() !== day
  ) {
    throw new Error(
      "Invalid date value. Use a real calendar date in YYYY-MM-DD.",
    );
  }

  return { start, end };
}

function buildCreatedAtFilter(range: DateRange | null) {
  if (!range) {
    return undefined;
  }

  return {
    gte: range.start,
    lt: range.end,
  };
}

app.get("/summary", async (req, res) => {
  let dateRange: DateRange | null;

  try {
    dateRange = parseDateQuery(req.query.date);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid date query.";
    return res.status(400).json({ error: message });
  }

  const createdAtFilter = buildCreatedAtFilter(dateRange);

  try {
    const [totalJobs, grouped, pendingJobs, completedJobs, totalCompletedCost] =
      await Promise.all([
        prisma.printJob.count({
          where: {
            ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          },
        }),
        prisma.printJob.groupBy({
          by: ["status"],
          where: {
            ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          },
          _count: {
            status: true,
          },
        }),
        prisma.printJob.findMany({
          where: {
            status: PrintJobStatus.PENDING,
            ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          },
          select: {
            id: true,
            verificationCode: true,
            userId: true,
            createdAt: true,
            totalPages: true,
            totalCost: true,
            source: true,
            status: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        }),
        prisma.printJob.findMany({
          where: {
            status: PrintJobStatus.COMPLETED,
            ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          },
          select: {
            id: true,
            verificationCode: true,
            userId: true,
            createdAt: true,
            totalPages: true,
            totalCost: true,
            source: true,
            status: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        }),
        prisma.printJob.aggregate({
          _sum: { totalCost: true },
          where: {
            status: PrintJobStatus.COMPLETED,
            ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          },
        }),
      ]);

    const statusCounts = grouped.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count.status;
      return acc;
    }, {});

    const pagesByDay = completedJobs.reduce<Record<string, number>>(
      (acc, job) => {
        const dateKey = job.createdAt.toISOString().slice(0, 10);
        acc[dateKey] = (acc[dateKey] ?? 0) + (job.totalPages ?? 0);
        return acc;
      },
      {},
    );

    const pagesPrintedByDay = Object.entries(pagesByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, pages]) => ({ date, pages }));

    res.status(200).json({
      date: req.query.date ?? null,
      isOverall: !dateRange,
      totalJobs,
      statusCounts,
      pagesPrintedByDay,
      totalCompletedCost: totalCompletedCost._sum.totalCost || 0,
      pending: {
        count: statusCounts[PrintJobStatus.PENDING] ?? 0,
        jobs: pendingJobs,
      },
      completed: {
        count: statusCounts[PrintJobStatus.COMPLETED] ?? 0,
        jobs: completedJobs,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to build analysis summary." });
  }
});

app.get("/users", async (req, res) => {
  let dateRange: DateRange | null;

  try {
    dateRange = parseDateQuery(req.query.date);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid date query.";
    return res.status(400).json({ error: message });
  }

  const createdAtFilter = buildCreatedAtFilter(dateRange);

  try {
    const users = await prisma.user.findMany({
      where: {
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      },
      select: {
        id: true,
        onboardingCompleted: true,
      },
    });

    if (!users.length) {
      return res.status(200).json({
        date: req.query.date ?? null,
        isOverall: !dateRange,
        totalUserEntries: 0,
        usersCreatedNewJob: 0,
        usersCompletedOnboarding: 0,
        usersCompletedOnboardingOnly: 0,
        usersSkippedOnboardingAndLeft: 0,
        usersWithNoJob: 0,
      });
    }

    const userIds = users.map((user) => user.id);

    const [jobUsers, skippedUsers] = await Promise.all([
      prisma.printJob.findMany({
        where: {
          userId: {
            in: userIds,
          },
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        },
        select: {
          userId: true,
        },
        distinct: ["userId"],
      }),
      prisma.userEvent.findMany({
        where: {
          userId: {
            in: userIds,
          },
          type: UserEventType.ONBOARDING_SKIPPED,
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        },
        select: {
          userId: true,
        },
        distinct: ["userId"],
      }),
    ]);

    const usersWithJobs = new Set(
      jobUsers.map((item) => item.userId).filter(Boolean),
    );
    const usersSkippedOnboarding = new Set(
      skippedUsers.map((item) => item.userId).filter(Boolean),
    );

    const usersCreatedNewJob = usersWithJobs.size;
    const usersCompletedOnboarding = users.filter(
      (user) => user.onboardingCompleted,
    ).length;
    const usersCompletedOnboardingOnly = users.filter(
      (user) => user.onboardingCompleted && !usersWithJobs.has(user.id),
    ).length;
    const usersSkippedOnboardingAndLeft = users.filter(
      (user) =>
        usersSkippedOnboarding.has(user.id) && !usersWithJobs.has(user.id),
    ).length;

    return res.status(200).json({
      date: req.query.date ?? null,
      isOverall: !dateRange,
      totalUserEntries: users.length,
      usersCreatedNewJob,
      usersCompletedOnboarding,
      usersCompletedOnboardingOnly,
      usersSkippedOnboardingAndLeft,
      usersWithNoJob: users.length - usersCreatedNewJob,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Failed to build user analysis." });
  }
});

export default app;
