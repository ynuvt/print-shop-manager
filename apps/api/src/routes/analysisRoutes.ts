import express from "express";
import { prisma } from "@printowl/db";
import {
  PrintJobStatus,
  UserEventType,
  Source,
} from "../../../../packages/db/dist/generated/prisma/enums.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { createPresignedUploadUrl } from "../utils/r2Storage.js";
import { shopListCache } from "../utils/cache.js";

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

app.get("/summary", authMiddleware(["admin"]), async (req, res) => {
  let dateRange: DateRange | null;

  try {
    dateRange = parseDateQuery(req.query);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid date query.";
    return res.status(400).json({ error: message });
  }

  const createdAtFilter = buildCreatedAtFilter(dateRange);
  const shopId = typeof req.query.shopId === "string" && req.query.shopId !== "all" ? req.query.shopId : undefined;

  try {
    const jobWhere = {
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      ...(shopId ? { shopId } : {}),
    };

    const [
      statusGroups,
      sourceGroups,
      totals,
      expiredCount,
      dailyStats,
      otpStats,
      syncStats,
      fileStats,
      activeWhatsAppUsersGroups,
    ] = await Promise.all([
      prisma.printJob.groupBy({
        by: ["status"],
        where: jobWhere,
        _count: { _all: true },
        _sum: { totalCost: true, totalPages: true },
      }),
      prisma.printJob.groupBy({
        by: ["source"],
        where: jobWhere,
        _count: { _all: true },
        _sum: { totalCost: true, totalPages: true },
      }),
      prisma.printJob.aggregate({
        where: { ...jobWhere, status: PrintJobStatus.COMPLETED },
        _sum: { totalCost: true, totalPages: true },
        _count: { _all: true },
      }),
      prisma.printJob.groupBy({
        by: ["status"],
        where: { ...jobWhere, expired: true },
        _count: { _all: true },
      }),
      prisma.printJob.findMany({
        where: { ...jobWhere, status: PrintJobStatus.COMPLETED },
        select: { createdAt: true, totalCost: true, totalPages: true },
      }),
      prisma.whatsAppLoginOtp.aggregate({
        where: createdAtFilter ? { createdAt: createdAtFilter } : {},
        _count: { _all: true, usedAt: true },
      }),
      prisma.whatsAppUser.count({ where: { userId: { not: null } } }),
      prisma.file.findMany({
        where: {
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          ...(shopId ? { printJob: { shopId } } : {}),
        },
        select: { name: true },
      }),
      prisma.printJob.groupBy({
        by: ["userMetadataId"],
        where: {
          source: Source.WHATSAPP,
          userMetadataId: { not: null },
          ...jobWhere,
        },
      }),
    ]);

    const expiredBreakdown = (expiredCount as any[]).reduce<Record<string, number>>((acc, g) => {
      acc[g.status] = g._count._all;
      return acc;
    }, {});
    const totalExpired = (expiredCount as any[]).reduce((sum, g) => sum + g._count._all, 0);

    const statusBreakdown = statusGroups.reduce<Record<string, any>>((acc, g) => {
      acc[g.status] = {
        count: g._count._all,
        revenue: g._sum.totalCost || 0,
        pages: g._sum.totalPages || 0,
      };
      return acc;
    }, {});

    const sourceBreakdown = sourceGroups.reduce<Record<string, any>>((acc, g) => {
      acc[g.source] = {
        count: g._count._all,
        revenue: g._sum.totalCost || 0,
        pages: g._sum.totalPages || 0,
        avgPages: g._count._all > 0 ? (g._sum.totalPages || 0) / g._count._all : 0,
      };
      return acc;
    }, {});

    // Convert UTC to IST (+5:30) for daily trend grouping
    const dailySeries = dailyStats.reduce<Record<string, any>>((acc, job) => {
      const istDate = new Date(job.createdAt.getTime() + (5.5 * 60 * 60 * 1000));
      const day = istDate.toISOString().slice(0, 10);
      if (!acc[day]) acc[day] = { revenue: 0, pages: 0, count: 0 };
      acc[day].revenue += job.totalCost;
      acc[day].pages += job.totalPages;
      acc[day].count += 1;
      return acc;
    }, {});

    const sortedDaily = Object.entries(dailySeries)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    const completedCount = statusBreakdown[PrintJobStatus.COMPLETED]?.count || 0;
    const draftCount = statusBreakdown[PrintJobStatus.DRAFT]?.count || 0;
    const activePending = statusBreakdown[PrintJobStatus.PENDING]?.count || 0;
    const expiredPending = expiredBreakdown[PrintJobStatus.CANCELED] || 0;
    const pendingCount = activePending + expiredPending;

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
        syncedUsers: syncStats,
        activeWhatsAppUsers: activeWhatsAppUsersGroups.length,
      },
      trends: sortedDaily,
    });

  } catch (error) {
    console.error("[analysis/summary] Error:", error);
    res.status(500).json({ error: "Failed to build analysis summary." });
  }
});


app.get("/users", authMiddleware(["admin"]), async (req, res) => {
  let dateRange: DateRange | null;

  try {
    dateRange = parseDateQuery(req.query);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid date query.";
    return res.status(400).json({ error: message });
  }

  const createdAtFilter = buildCreatedAtFilter(dateRange);
  const shopId = typeof req.query.shopId === "string" && req.query.shopId !== "all" ? req.query.shopId : undefined;

  try {
    const userWhere = {
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      ...(shopId ? { printJobs: { some: { shopId } } } : {}),
    };
    const jobWhere = {
      userId: { not: null },
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      ...(shopId ? { shopId } : {}),
    };

    const [
      totalUsers,
      onboardingGroups,
      skippedCount,
      activeUsers,
      activatedNewUsers,
      repeatUsers,
      webUsersWithWhatsApp,
    ] = await Promise.all([
      prisma.user.count({ where: userWhere }),
      prisma.user.groupBy({
        by: ["onboardingCompleted"],
        where: userWhere,
        _count: { _all: true },
      }),
      prisma.userEvent.count({
        where: {
          type: UserEventType.ONBOARDING_SKIPPED,
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          ...(shopId ? { user: { printJobs: { some: { shopId } } } } : {}),
        },
      }),
      prisma.printJob.groupBy({ by: ["userId"], where: jobWhere }),
      prisma.printJob.groupBy({
        by: ["userId"],
        where: {
          ...jobWhere,
          user: { createdAt: createdAtFilter ? createdAtFilter : undefined },
        },
      }),
      !dateRange
        ? prisma.printJob.groupBy({
            by: ["userId"],
            where: {
              userId: { not: null },
              status: PrintJobStatus.COMPLETED,
              ...(shopId ? { shopId } : {}),
            },
            having: { userId: { _count: { gt: 1 } } },
          })
        : prisma.printJob.groupBy({
            by: ["userId"],
            where: {
              userId: { not: null },
              status: PrintJobStatus.COMPLETED,
              createdAt: createdAtFilter,
              ...(shopId ? { shopId } : {}),
              user: {
                printJobs: {
                  some: {
                    status: PrintJobStatus.COMPLETED,
                    createdAt: { lt: dateRange.start },
                    ...(shopId ? { shopId } : {}),
                  },
                },
              },
            },
          }),
      prisma.user.count({
        where: {
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          whatsAppUser: { isNot: null },
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
        totalActiveUsers: activeUsers.length,
        usersWithAtLeastOneJob: activatedNewUsers.length,
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
        webUsersWithWhatsApp,
      },
    });

  } catch (error) {
    console.error("[analysis/users] Error:", error);
    return res.status(500).json({ error: "Failed to build user analysis." });
  }
});

app.get("/user-activity/:userId", authMiddleware(["admin"]), async (req, res) => {
  const userId = req.params.userId as string;

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

app.get("/insights", authMiddleware(["admin"]), async (req, res) => {
  let dateRange: DateRange | null;
  try {
    dateRange = parseDateQuery(req.query);
  } catch (error) {
    return res.status(400).json({ error: "Invalid date query." });
  }
  const createdAtFilter = buildCreatedAtFilter(dateRange);
  const shopId = typeof req.query.shopId === "string" && req.query.shopId !== "all" ? req.query.shopId : undefined;

  try {
    const completedJobWhere = {
      status: PrintJobStatus.COMPLETED,
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      ...(shopId ? { shopId } : {}),
    };

    const [allJobs, allUsers, totalRevenueData] = await Promise.all([
      prisma.printJob.findMany({
        where: completedJobWhere,
        select: {
          createdAt: true,
          totalCost: true,
          _count: { select: { files: true } },
        },
      }),
      prisma.user.findMany({
        where: {
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          ...(shopId ? { printJobs: { some: { shopId } } } : {}),
        },
        select: {
          id: true,
          createdAt: true,
          printJobs: {
            where: { status: PrintJobStatus.COMPLETED, ...(shopId ? { shopId } : {}) },
            select: { createdAt: true },
          },
        },
      }),
      prisma.printJob.aggregate({
        where: completedJobWhere,
        _sum: { totalCost: true },
      }),
    ]);

    // Peak Hours Calculation
    const peakHours = new Array(24).fill(0);
    allJobs.forEach((job) => {
      // Convert UTC to IST (+5:30) for peak hours analysis
      const istDate = new Date(job.createdAt.getTime() + (5.5 * 60 * 60 * 1000));
      const hour = istDate.getUTCHours();
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

    // Average files per completed job
    const totalFilesInJobs = allJobs.reduce((sum, j) => sum + ((j as any)._count?.files || 0), 0);
    const avgFilesPerJob = allJobs.length > 0 ? totalFilesInJobs / allJobs.length : 1;

    res.status(200).json({
      peakHours,
      arpu: arpu.toFixed(2),
      churnRate: churnRate.toFixed(2),
      totalRevenue,
      avgFilesPerJob: parseFloat(avgFilesPerJob.toFixed(2)),
      totalFilesInPeriod: totalFilesInJobs,
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

app.get("/shops", authMiddleware(["admin"]), async (req, res) => {
  let dateRange: DateRange | null;
  try {
    dateRange = parseDateQuery(req.query);
  } catch (error) {
    return res.status(400).json({ error: "Invalid date query." });
  }
  const createdAtFilter = buildCreatedAtFilter(dateRange);

  try {
    const [shops, stats] = await Promise.all([
      prisma.printShop.findMany({ orderBy: { username: "asc" } }),
      prisma.printJob.groupBy({
        by: ["shopId"],
        where: {
          status: "COMPLETED",
          shopId: { not: null },
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        },
        _sum: { totalPages: true, totalCost: true },
        _count: { id: true },
      }),
    ]);

    const statsMap = new Map(
      stats.map((s) => [s.shopId, {
        completedCount: s._count.id,
        totalPages: s._sum.totalPages || 0,
        revenue: s._sum.totalCost || 0,
      }])
    );

    const shopsWithStats = shops.map((shop) => {
      const s = statsMap.get(shop.shopId) || { completedCount: 0, totalPages: 0, revenue: 0 };
      return {
        id: shop.id,
        name: shop.name,
        username: shop.username,
        shopId: shop.shopId,
        landmark: shop.landmark,
        imageUrl: shop.imageUrl,
        latitude: shop.latitude,
        longitude: shop.longitude,
        priceBW: shop.priceBW,
        priceColor: shop.priceColor,
        isActive: shop.isActive,
        createdAt: shop.createdAt,
        completedJobsCount: s.completedCount,
        totalPagesPrinted: s.totalPages,
        totalRevenue: s.revenue,
      };
    });

    // Sort by completedJobsCount desc (leaderboard order)
    shopsWithStats.sort((a, b) => b.completedJobsCount - a.completedJobsCount);

    res.json({ shops: shopsWithStats });
  } catch (error) {
    console.error("[analysis/shops] Error:", error);
    res.status(500).json({ error: "Failed to fetch shop statistics." });
  }
});

app.post("/shops", authMiddleware(["admin"]), async (req, res) => {
  try {
    const { username, password, shopId, name, landmark, imageUrl, latitude, longitude, priceBW, priceColor, upiId } = req.body;
    if (!username || !password || !shopId) {
      return res.status(400).json({ error: "username, password, and shopId are required." });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanShopId = shopId.trim().toUpperCase();

    const [existingUsername, existingShopId] = await Promise.all([
      prisma.printShop.findUnique({ where: { username: cleanUsername } }),
      prisma.printShop.findUnique({ where: { shopId: cleanShopId } }),
    ]);
    if (existingUsername) {
      return res.status(409).json({ error: "Username already exists." });
    }
    if (existingShopId) {
      return res.status(409).json({ error: "Shop ID already exists." });
    }

    const { default: bcrypt } = await import("bcryptjs");
    const hashedPassword = await bcrypt.hash(password, 10);

    const shop = await prisma.printShop.create({
      data: {
        username: cleanUsername,
        password: hashedPassword,
        shopId: cleanShopId,
        name: name?.trim() ?? "",
        landmark: landmark?.trim() ?? null,
        imageUrl: typeof imageUrl === "string" && imageUrl.trim() ? imageUrl.trim() : null,
        latitude: typeof latitude === "number" ? latitude : null,
        longitude: typeof longitude === "number" ? longitude : null,
        priceBW: typeof priceBW === "number" && priceBW > 0 ? priceBW : 2,
        priceColor: typeof priceColor === "number" && priceColor > 0 ? priceColor : 7,
        upiId: typeof upiId === "string" && upiId.trim() ? upiId.trim() : null,
        isActive: true,
      },
    });

    shopListCache.delete("active_shops");

    res.status(201).json({
      id: shop.id,
      name: shop.name,
      username: shop.username,
      shopId: shop.shopId,
      landmark: shop.landmark,
      imageUrl: shop.imageUrl,
      latitude: shop.latitude,
      longitude: shop.longitude,
      priceBW: shop.priceBW,
      priceColor: shop.priceColor,
      isActive: shop.isActive,
      createdAt: shop.createdAt,
    });
  } catch (error) {
    console.error("[analysis/shops] Create error:", error);
    res.status(500).json({ error: "Failed to create print shop." });
  }
});

app.patch("/shops/:shopId", authMiddleware(["admin"]), async (req, res) => {
  const shopId = req.params.shopId as string;
  const { name, landmark, imageUrl, latitude, longitude, priceBW, priceColor, upiId, isActive } = req.body;

  try {
    const existing = await prisma.printShop.findUnique({ where: { shopId } });
    if (!existing) {
      return res.status(404).json({ error: "Shop not found." });
    }

    const updateData: Record<string, unknown> = {};
    if (typeof name === "string") updateData.name = name.trim();
    if (typeof landmark === "string") updateData.landmark = landmark.trim() || null;
    if (typeof imageUrl === "string") updateData.imageUrl = imageUrl.trim() || null;
    if (typeof latitude === "number") updateData.latitude = latitude;
    if (typeof longitude === "number") updateData.longitude = longitude;
    if (typeof priceBW === "number" && priceBW > 0) updateData.priceBW = priceBW;
    if (typeof priceColor === "number" && priceColor > 0) updateData.priceColor = priceColor;
    if (typeof upiId === "string") updateData.upiId = upiId.trim() || null;
    if (upiId === null) updateData.upiId = null;
    if (typeof isActive === "boolean") updateData.isActive = isActive;

    const updated = await prisma.printShop.update({
      where: { shopId },
      data: updateData,
    });

    shopListCache.delete("active_shops");

    res.json({
      id: updated.id,
      name: updated.name,
      username: updated.username,
      shopId: updated.shopId,
      landmark: updated.landmark,
      imageUrl: updated.imageUrl,
      latitude: updated.latitude,
      longitude: updated.longitude,
      priceBW: updated.priceBW,
      priceColor: updated.priceColor,
      isActive: updated.isActive,
    });
  } catch (error) {
    console.error("[analysis/shops] Patch error:", error);
    res.status(500).json({ error: "Failed to update shop." });
  }
});

app.post("/presign-upload", authMiddleware(["admin"]), async (req, res) => {
  try {
    const { fileName, contentType } = req.body;
    if (!fileName || !contentType) {
      return res.status(400).json({ error: "fileName and contentType are required." });
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
    const key = `shops/${Date.now()}-${safeName}`;
    const presigned = await createPresignedUploadUrl({ key, contentType });

    res.json({
      uploadUrl: presigned.uploadUrl,
      publicUrl: presigned.publicUrl,
      key: presigned.key
    });
  } catch (err) {
    console.error("[analysis] presign upload error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

export default app;

