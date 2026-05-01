import express from "express";
import { prisma } from "@printowl/db";
import {
  PrintJobStatus,
  UserEventType,
  Source,
} from "../../../../packages/db/dist/generated/prisma/enums.js";

const app = express.Router();


type DateRange = {
  start: Date;
  end: Date;
};

function parseDateQuery(reqQuery: any): DateRange | null {
  const MIN_DATE = new Date("2026-04-25T00:00:00.000Z"); // April 25, 2026

  if (reqQuery.startDate && reqQuery.endDate) {
    let start = new Date(reqQuery.startDate);
    let end = new Date(reqQuery.endDate);
    end.setHours(23, 59, 59, 999);

    if (start < MIN_DATE) start = MIN_DATE;

    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return { start, end };
    }
  }

  if (reqQuery.date && typeof reqQuery.date === "string" && reqQuery.date !== "null") {
    const trimmed = reqQuery.date.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split("-").map(Number);
      let start = new Date(year, month - 1, day, 0, 0, 0, 0);
      let end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
      
      if (start < MIN_DATE) start = MIN_DATE;
      
      return { start, end };
    }
  }

  // Default to MIN_DATE to now
  return { start: MIN_DATE, end: new Date() };
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
    dateRange = parseDateQuery(req.query);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid date query.";
    return res.status(400).json({ error: message });
  }

  const createdAtFilter = buildCreatedAtFilter(dateRange);

  try {
    // 1. Status breakdown
    const statusGroups = await prisma.printJob.groupBy({
      by: ["status"],
      where: createdAtFilter ? { createdAt: createdAtFilter } : {},
      _count: { _all: true },
      _sum: { totalCost: true, totalPages: true },
    });
    // 2. Source breakdown (Web vs WhatsApp)
    const sourceGroups = await prisma.printJob.groupBy({
      by: ["source"],
      where: createdAtFilter ? { createdAt: createdAtFilter } : {},
      _count: { _all: true },
      _sum: { totalCost: true, totalPages: true },
    });
    // 3. Overall aggregate for the period
    const totals = await prisma.printJob.aggregate({
      where: {
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        status: PrintJobStatus.COMPLETED,
      },
      _sum: { totalCost: true, totalPages: true },
      _count: { _all: true },
    });
    // 4. Expired jobs breakdown
    const expiredCount = await prisma.printJob.groupBy({
      by: ["status"],
      where: {
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        expired: true,
      },
      _count: { _all: true },
    });
    // 5. Daily trends (for charting)
    const dailyStats = await prisma.printJob.findMany({
      where: {
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        status: PrintJobStatus.COMPLETED,
      },
      select: {
        createdAt: true,
        totalCost: true,
        totalPages: true,
      },
    });
    // 6. WhatsApp Login success rate
    const otpStats = await prisma.whatsAppLoginOtp.aggregate({
      where: createdAtFilter ? { createdAt: createdAtFilter } : {},
      _count: { _all: true, usedAt: true },
    });
    // 7. Sync penetration
    const syncStats = await prisma.whatsAppUser.count({
      where: { userId: { not: null } },
    });

    // Format expired breakdown
    const expiredBreakdown = (expiredCount as any[]).reduce<Record<string, number>>((acc, g) => {
      acc[g.status] = g._count._all;
      return acc;
    }, {});
    const totalExpired = (expiredCount as any[]).reduce((sum, g) => sum + g._count._all, 0);

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

    // For pendingCount, include currently active PENDING jobs
    // AND jobs that were PENDING but got expired (status changed to CANCELED + expired=true)
    const activePending = statusBreakdown[PrintJobStatus.PENDING]?.count || 0;
    const expiredPending = expiredBreakdown[PrintJobStatus.CANCELED] || 0;
    const pendingCount = activePending + expiredPending;

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
        EXPIRED: {
          count: totalExpired,
          breakdown: expiredBreakdown,
        },
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
    dateRange = parseDateQuery(req.query);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid date query.";
    return res.status(400).json({ error: message });
  }

  const createdAtFilter = buildCreatedAtFilter(dateRange);

  try {
    // 1. New users created in the period
    const totalUsers = await prisma.user.count({
      where: createdAtFilter ? { createdAt: createdAtFilter } : {},
    });
    // 2. Onboarding status breakdown for NEW users created in this period
    const onboardingGroups = await prisma.user.groupBy({
      by: ["onboardingCompleted"],
      where: createdAtFilter ? { createdAt: createdAtFilter } : {},
      _count: { _all: true },
    });
    // 3. Skip events in the period
    const skippedCount = await prisma.userEvent.count({
      where: {
        type: UserEventType.ONBOARDING_SKIPPED,
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      },
    });
    // 4. Total unique users who were active (created a job) in this period
    const activeUsers = await prisma.printJob.groupBy({
      by: ["userId"],
      where: {
        userId: { not: null },
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      },
    });
    // 5. New users created in this period who also did a job in this same period (Activation)
    const activatedNewUsers = await prisma.printJob.groupBy({
      by: ["userId"],
      where: {
        userId: { not: null },
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        user: {
          createdAt: createdAtFilter ? createdAtFilter : undefined,
        },
      },
    });
    // 6. Repeat customers active in this period
    // (Completed a job in period AND had at least one completed job before the period)
    // If overall, just users with > 1 completed job total.
    const repeatUsers = await (!dateRange ? 
      prisma.printJob.groupBy({
        by: ["userId"],
        where: { userId: { not: null }, status: PrintJobStatus.COMPLETED },
        having: { userId: { _count: { gt: 1 } } }
      }) :
      prisma.printJob.groupBy({
        by: ["userId"],
        where: {
          userId: { not: null },
          status: PrintJobStatus.COMPLETED,
          createdAt: createdAtFilter,
          user: {
            printJobs: {
              some: {
                status: PrintJobStatus.COMPLETED,
                createdAt: { lt: dateRange.start }
              }
            }
          }
        }
      }));

    const onboardingCompleted = onboardingGroups.find(g => g.onboardingCompleted)?._count._all || 0;
    const onboardingPending = onboardingGroups.find(g => !g.onboardingCompleted)?._count._all || 0;

    res.status(200).json({
      meta: {
        date: req.query.date ?? "overall",
        isOverall: !dateRange,
      },
      acquisition: {
        totalNewUsers: totalUsers,
        totalActiveUsers: activeUsers.length,
        usersWithAtLeastOneJob: activatedNewUsers.length, // This is now cohort-based "Activated New Users"
        activationRate: totalUsers > 0 ? (activatedNewUsers.length / totalUsers).toFixed(2) : 0,
      },
      onboarding: {
        completed: onboardingCompleted,
        pending: onboardingPending,
        skipped: skippedCount,
        completionRate: totalUsers > 0 ? (onboardingCompleted / totalUsers).toFixed(2) : 0,
      },
      retention: {
        repeatCustomers: repeatUsers.length,
        webUsersWithWhatsApp: await prisma.user.count({
          where: { 
            ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
            whatsAppUser: { isNot: null }
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

app.get("/insights", async (req, res) => {
  let dateRange: DateRange | null;
  try {
    dateRange = parseDateQuery(req.query);
  } catch (error) {
    return res.status(400).json({ error: "Invalid date query." });
  }
  const createdAtFilter = buildCreatedAtFilter(dateRange);

  try {
    const allJobs = await prisma.printJob.findMany({
      where: { 
        status: PrintJobStatus.COMPLETED,
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {})
      },
      select: { createdAt: true, totalCost: true },
    });
    
    const allUsers = await prisma.user.findMany({
      where: createdAtFilter ? { createdAt: createdAtFilter } : {},
      select: { id: true, createdAt: true, printJobs: { select: { createdAt: true } } },
    });

    const totalRevenueData = await prisma.printJob.aggregate({
      where: { 
        status: PrintJobStatus.COMPLETED,
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {})
      },
      _sum: { totalCost: true },
    });

    // Peak Hours Calculation
    const peakHours = new Array(24).fill(0);
    allJobs.forEach((job) => {
      const hour = job.createdAt.getHours();
      peakHours[hour]++;
    });

    // ARPU (Average Revenue Per User)
    const totalRevenue = totalRevenueData._sum.totalCost || 0;
    const totalUsersCount = allUsers.length || 1;
    const arpu = totalRevenue / totalUsersCount;

    // Churn Rate (Inactive for > 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    let activeUsers = 0;
    let churnedUsers = 0;

    allUsers.forEach((user) => {
      const latestJob = user.printJobs.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      )[0];
      
      if (latestJob && latestJob.createdAt > thirtyDaysAgo) {
        activeUsers++;
      } else {
        churnedUsers++;
      }
    });

    const churnRate =
      allUsers.length > 0 ? (churnedUsers / allUsers.length) * 100 : 0;

    res.status(200).json({
      peakHours,
      arpu: arpu.toFixed(2),
      churnRate: churnRate.toFixed(2),
      totalRevenue,
      userMetrics: {
        total: allUsers.length,
        active: activeUsers,
        churned: churnedUsers,
      },
    });
  } catch (error) {
    console.error("[analysis/insights] Error:", error);
    res.status(500).json({ error: "Failed to fetch advanced insights." });
  }
});

export default app;

