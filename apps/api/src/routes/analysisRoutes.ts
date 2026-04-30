import express from "express";
import { prisma } from "@printowl/db";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  PrintJobStatus,
  UserEventType,
  Source,
} from "../../../../packages/db/dist/generated/prisma/enums.js";

const app = express.Router();

app.use(authMiddleware(["admin"]));

type DateRange = {
  start: Date;
  end: Date;
};

function parseDateQuery(dateQuery: unknown): DateRange | null {
  if (dateQuery === undefined || dateQuery === "" || dateQuery === "null") {
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
    const [
      statusGroups,
      sourceGroups,
      totals,
      expiredCount,
      dailyStats,
      otpStats,
      syncStats,
    ] = await Promise.all([
      // 1. Status breakdown
      prisma.printJob.groupBy({
        by: ["status"],
        where: createdAtFilter ? { createdAt: createdAtFilter } : {},
        _count: { _all: true },
        _sum: { totalCost: true, totalPages: true },
      }),
      // 2. Source breakdown (Web vs WhatsApp)
      prisma.printJob.groupBy({
        by: ["source"],
        where: createdAtFilter ? { createdAt: createdAtFilter } : {},
        _count: { _all: true },
        _sum: { totalCost: true, totalPages: true },
      }),
      // 3. Overall aggregate for the period
      prisma.printJob.aggregate({
        where: {
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          status: PrintJobStatus.COMPLETED,
        },
        _sum: { totalCost: true, totalPages: true },
        _count: { _all: true },
      }),
      // 4. Expired jobs
      prisma.printJob.count({
        where: {
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          expired: true,
        },
      }),
      // 5. Daily trends (for charting)
      prisma.printJob.findMany({
        where: {
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          status: PrintJobStatus.COMPLETED,
        },
        select: {
          createdAt: true,
          totalCost: true,
          totalPages: true,
        },
      }),
      // 6. WhatsApp Login success rate
      prisma.whatsAppLoginOtp.aggregate({
        where: createdAtFilter ? { createdAt: createdAtFilter } : {},
        _count: { _all: true, usedAt: true },
      }),
      // 7. Sync penetration
      prisma.whatsAppUser.count({
        where: { userId: { not: null } },
      }),
    ]);

    // Format status breakdown
    const statusBreakdown = statusGroups.reduce<Record<string, any>>((acc, g) => {
      acc[g.status] = {
        count: g._count._all,
        revenue: g._sum.totalCost || 0,
        pages: g._sum.totalPages || 0,
      };
      return acc;
    }, {});

    // Format source breakdown
    const sourceBreakdown = sourceGroups.reduce<Record<string, any>>((acc, g) => {
      acc[g.source] = {
        count: g._count._all,
        revenue: g._sum.totalCost || 0,
        pages: g._sum.totalPages || 0,
        avgPages: g._count._all > 0 ? (g._sum.totalPages || 0) / g._count._all : 0,
      };
      return acc;
    }, {});

    // Calculate daily series
    const dailySeries = dailyStats.reduce<Record<string, any>>((acc, job) => {
      const day = job.createdAt.toISOString().slice(0, 10);
      if (!acc[day]) acc[day] = { revenue: 0, pages: 0, count: 0 };
      acc[day].revenue += job.totalCost;
      acc[day].pages += job.totalPages;
      acc[day].count += 1;
      return acc;
    }, {});

    const sortedDaily = Object.entries(dailySeries)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    // Funnel calculations
    const totalCount = totals._count._all;
    const completedCount = statusBreakdown[PrintJobStatus.COMPLETED]?.count || 0;
    const draftCount = statusBreakdown[PrintJobStatus.DRAFT]?.count || 0;
    const pendingCount = statusBreakdown[PrintJobStatus.PENDING]?.count || 0;

    // 8. File type breakdown (extension based as mimeType might be generic)
    const fileStats = await prisma.file.findMany({
      where: createdAtFilter ? { createdAt: createdAtFilter } : {},
      select: { name: true },
    });

    const fileTypeBreakdown = fileStats.reduce<Record<string, number>>((acc, f) => {
      const ext = f.name.split(".").pop()?.toUpperCase() || "UNKNOWN";
      acc[ext] = (acc[ext] || 0) + 1;
      return acc;
    }, {});

    res.status(200).json({
      meta: {
        date: req.query.date ?? "overall",
        isOverall: !dateRange,
      },
      summary: {
        totalRevenue: totals._sum.totalCost || 0,
        totalPages: totals._sum.totalPages || 0,
        totalCompletedJobs: completedCount,
        avgOrderValue: completedCount > 0 ? (totals._sum.totalCost || 0) / completedCount : 0,
        avgPagesPerJob: completedCount > 0 ? (totals._sum.totalPages || 0) / completedCount : 0,
      },
      funnel: {
        drafts: draftCount,
        pending: pendingCount,
        completed: completedCount,
        draftToPendingRate: draftCount > 0 ? (pendingCount / draftCount).toFixed(2) : 0,
        pendingToCompletedRate: pendingCount > 0 ? (completedCount / pendingCount).toFixed(2) : 0,
        overallConversion: (draftCount + pendingCount) > 0 ? (completedCount / (draftCount + pendingCount)).toFixed(2) : 0,
      },
      status: {
        ...statusBreakdown,
        EXPIRED: { count: expiredCount },
      },
      sources: sourceBreakdown,
      files: {
        totalFiles: fileStats.length,
        types: fileTypeBreakdown,
      },
      whatsapp: {
        otpTotal: otpStats._count._all,
        otpUsed: otpStats._count.usedAt,
        otpSuccessRate: otpStats._count._all > 0 ? (otpStats._count.usedAt / otpStats._count._all).toFixed(2) : 0,
        syncedUsers: syncStats, // Total WhatsApp users linked to a web account
        activeWhatsAppUsers: sourceBreakdown[Source.WHATSAPP]?.count > 0 ? 
          (await prisma.printJob.groupBy({ 
            by: ['userMetadataId'], 
            where: { 
              source: Source.WHATSAPP, 
              userMetadataId: { not: null },
              ...(createdAtFilter ? { createdAt: createdAtFilter } : {})
            } 
          })).length : 0, // Unique phone numbers that sent files
      },
      trends: sortedDaily,
    });

  } catch (error) {
    console.error("[analysis/summary] Error:", error);
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
    const [
      totalUsers,
      onboardingGroups,
      skippedCount,
      usersWithJobs,
      repeatUsers,
    ] = await Promise.all([
      prisma.user.count({
        where: createdAtFilter ? { createdAt: createdAtFilter } : {},
      }),
      prisma.user.groupBy({
        by: ["onboardingCompleted"],
        where: createdAtFilter ? { createdAt: createdAtFilter } : {},
        _count: { _all: true },
      }),
      prisma.userEvent.count({
        where: {
          type: UserEventType.ONBOARDING_SKIPPED,
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        },
      }),
      // Users who created at least one job in this period
      prisma.printJob.groupBy({
        by: ["userId"],
        where: {
          userId: { not: null },
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        },
        _count: { _all: true },
      }),
      // Repeat customers (users with more than 1 completed job total)
      prisma.printJob.groupBy({
        by: ["userId"],
        where: {
          userId: { not: null },
          status: PrintJobStatus.COMPLETED,
        },
        having: {
          userId: { _count: { gt: 1 } },
        },
      }),
    ]);

    const onboardingCompleted = onboardingGroups.find(g => g.onboardingCompleted)?._count._all || 0;
    const onboardingPending = onboardingGroups.find(g => !g.onboardingCompleted)?._count._all || 0;

    res.status(200).json({
      meta: {
        date: req.query.date ?? "overall",
        isOverall: !dateRange,
      },
      acquisition: {
        totalNewUsers: totalUsers,
        usersWithAtLeastOneJob: usersWithJobs.length,
        activationRate: totalUsers > 0 ? (usersWithJobs.length / totalUsers).toFixed(2) : 0,
      },
      onboarding: {
        completed: onboardingCompleted,
        pending: onboardingPending,
        skipped: skippedCount,
        completionRate: totalUsers > 0 ? (onboardingCompleted / totalUsers).toFixed(2) : 0,
      },
      retention: {
        repeatCustomers: repeatUsers.length,
        webUsersWithWhatsApp: await prisma.whatsAppUser.count({
          where: { 
            userId: { not: null }
          }
        }),
      }

    });

  } catch (error) {
    console.error("[analysis/users] Error:", error);
    return res.status(500).json({ error: "Failed to build user analysis." });
  }
});

app.get("/user-activity/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const userJobs = await prisma.printJob.findMany({
      where: {
        OR: [
          { userId: userId },
          { userMetadataId: userId }
        ]
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        totalCost: true,
        totalPages: true,
        source: true,
      }
    });

    const totalJobs = userJobs.length;
    const completedJobs = userJobs.filter(job => job.status === PrintJobStatus.COMPLETED).length;

    res.status(200).json({
      userId,
      summary: {
        totalJobs,
        completedJobs,
      },
      jobs: userJobs.map(job => ({
        id: job.id,
        status: job.status,
        time: job.createdAt,
        cost: job.totalCost,
        pages: job.totalPages,
        source: job.source,
      }))
    });
  } catch (error) {
    console.error("[analysis/user-activity] Error:", error);
    res.status(500).json({ error: "Failed to fetch user activity." });
  }
});

export default app;

