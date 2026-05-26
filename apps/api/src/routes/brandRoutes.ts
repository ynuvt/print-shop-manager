// routes/brandRoutes.ts
// Brand management routes: profile, outlets, workers, offers, coupons, templates, dashboard.
// All routes require brand authentication.

import express, { Response } from "express";
import { prisma } from "@printowl/db";
import { authMiddleware, type ExtendedRequest } from "../middleware/authMiddleware.js";
import { brandHasFeature } from "../modules/brandPlanFeatures.js";
import { createPresignedUploadUrl } from "../utils/r2Storage.js";

const router = express.Router();

// All routes require brand auth
router.use(authMiddleware(["brand"]));

// ─── ASSETS / UPLOAD ─────────────────────────────────────────────────────────

router.post("/presign-upload", async (req: ExtendedRequest, res: Response) => {
  try {
    const { fileName, contentType } = req.body;
    if (!fileName || !contentType) {
      return res.status(400).json({ message: "fileName and contentType are required." });
    }

    const brand = await prisma.brand.findUnique({
      where: { id: req.user!.uid },
      select: { slug: true }
    });
    if (!brand) return res.status(404).json({ message: "Brand not found." });

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
    const key = `brand/${brand.slug}/${Date.now()}-${safeName}`;
    const presigned = await createPresignedUploadUrl({ key, contentType });

    res.json({
      uploadUrl: presigned.uploadUrl,
      publicUrl: presigned.publicUrl,
      key: presigned.key
    });
  } catch (err) {
    console.error("[brand] presign upload error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

// ─── PROFILE ─────────────────────────────────────────────────────────────────

router.get("/profile", async (req: ExtendedRequest, res: Response) => {
  try {
    const brand = await prisma.brand.findUnique({
      where: { id: req.user!.uid },
      select: {
        id: true, name: true, slug: true, logo: true,
        email: true, plan: true, createdAt: true,
        _count: { select: { outlets: true, coupons: true } },
      },
    });
    if (!brand) return res.status(404).json({ message: "Brand not found." });
    res.json(brand);
  } catch (err) {
    console.error("[brand] profile error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

router.put("/profile", async (req: ExtendedRequest, res: Response) => {
  try {
    const { name, logo } = req.body;
    const brand = await prisma.brand.update({
      where: { id: req.user!.uid },
      data: { ...(name && { name }), ...(logo && { logo }) },
      select: { id: true, name: true, slug: true, logo: true, email: true, plan: true },
    });
    res.json(brand);
  } catch (err) {
    console.error("[brand] update profile error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

// ─── OUTLETS ─────────────────────────────────────────────────────────────────

router.get("/outlets", async (req: ExtendedRequest, res: Response) => {
  try {
    const outlets = await prisma.outlet.findMany({
      where: { brandId: req.user!.uid },
      include: { _count: { select: { workers: true, redemptions: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ outlets });
  } catch (err) {
    console.error("[brand] list outlets error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

router.post("/outlets", async (req: ExtendedRequest, res: Response) => {
  try {
    const { name, address, outletCode, latitude, longitude, mapLink } = req.body;
    if (!name || !outletCode) {
      return res.status(400).json({ message: "name and outletCode are required." });
    }

    const existing = await prisma.outlet.findUnique({ where: { outletCode } });
    if (existing) return res.status(409).json({ message: "Outlet code already exists." });

    const outlet = await prisma.outlet.create({
      data: {
        brandId: req.user!.uid,
        name,
        address,
        outletCode,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        mapLink,
      },
    });
    res.status(201).json(outlet);
  } catch (err) {
    console.error("[brand] create outlet error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

router.put("/outlets/:id", async (req: ExtendedRequest, res: Response) => {
  try {
    const outlet = await prisma.outlet.findFirst({
      where: { id: req.params.id as string, brandId: req.user!.uid },
    });
    if (!outlet) return res.status(404).json({ message: "Outlet not found." });

    const { name, address, outletCode, latitude, longitude, mapLink, isActive } = req.body;
    const updated = await prisma.outlet.update({
      where: { id: req.params.id as string },
      data: {
        ...(name !== undefined && { name }),
        ...(address !== undefined && { address }),
        ...(outletCode !== undefined && { outletCode }),
        ...(latitude !== undefined && { latitude: latitude ? parseFloat(latitude) : null }),
        ...(longitude !== undefined && { longitude: longitude ? parseFloat(longitude) : null }),
        ...(mapLink !== undefined && { mapLink }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json(updated);
  } catch (err) {
    console.error("[brand] update outlet error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

router.delete("/outlets/:id", async (req: ExtendedRequest, res: Response) => {
  try {
    const outlet = await prisma.outlet.findFirst({
      where: { id: req.params.id as string, brandId: req.user!.uid },
    });
    if (!outlet) return res.status(404).json({ message: "Outlet not found." });

    await prisma.outlet.update({ where: { id: req.params.id as string }, data: { isActive: false } });
    res.json({ message: "Outlet deactivated." });
  } catch (err) {
    console.error("[brand] delete outlet error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

// ─── WORKERS ─────────────────────────────────────────────────────────────────

router.get("/outlets/:outletId/workers", async (req: ExtendedRequest, res: Response) => {
  try {
    // Verify outlet belongs to this brand
    const outlet = await prisma.outlet.findFirst({
      where: { id: req.params.outletId as string, brandId: req.user!.uid },
    });
    if (!outlet) return res.status(404).json({ message: "Outlet not found." });

    const workers = await prisma.outletWorker.findMany({
      where: { outletId: req.params.outletId as string },
      include: { _count: { select: { redemptions: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ workers, outlet });
  } catch (err) {
    console.error("[brand] list workers error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

router.post("/outlets/:outletId/workers", async (req: ExtendedRequest, res: Response) => {
  try {
    const outlet = await prisma.outlet.findFirst({
      where: { id: req.params.outletId as string, brandId: req.user!.uid },
    });
    if (!outlet) return res.status(404).json({ message: "Outlet not found." });

    const { phoneNumber, name } = req.body;
    if (!phoneNumber || !name) {
      return res.status(400).json({ message: "phoneNumber and name are required." });
    }

    // Check if worker already exists
    const existing = await prisma.outletWorker.findUnique({ where: { phoneNumber } });
    if (existing) {
      return res.status(409).json({ message: "A worker with this phone number already exists." });
    }

    const worker = await prisma.outletWorker.create({
      data: { phoneNumber, name, outletId: req.params.outletId as string },
    });
    res.status(201).json(worker);
  } catch (err) {
    console.error("[brand] create worker error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

router.put("/workers/:id", async (req: ExtendedRequest, res: Response) => {
  try {
    const worker = await prisma.outletWorker.findUnique({
      where: { id: req.params.id as string },
      include: { outlet: { select: { brandId: true } } },
    });
    if (!worker || worker.outlet.brandId !== req.user!.uid) {
      return res.status(404).json({ message: "Worker not found." });
    }

    const { name, phoneNumber, isActive } = req.body;
    const updated = await prisma.outletWorker.update({
      where: { id: req.params.id as string },
      data: {
        ...(name !== undefined && { name }),
        ...(phoneNumber !== undefined && { phoneNumber }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json(updated);
  } catch (err) {
    console.error("[brand] update worker error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

router.delete("/workers/:id", async (req: ExtendedRequest, res: Response) => {
  try {
    const worker = await prisma.outletWorker.findUnique({
      where: { id: req.params.id as string },
      include: { outlet: { select: { brandId: true } } },
    });
    if (!worker || worker.outlet.brandId !== req.user!.uid) {
      return res.status(404).json({ message: "Worker not found." });
    }

    // Delete associated redemptions first
    await prisma.couponRedemption.deleteMany({ where: { workerId: req.params.id as string } });
    await prisma.outletWorker.delete({ where: { id: req.params.id as string } });
    res.json({ message: "Worker deleted." });
  } catch (err) {
    console.error("[brand] delete worker error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

// ─── OFFERS ──────────────────────────────────────────────────────────────────

router.get("/offers", async (req: ExtendedRequest, res: Response) => {
  try {
    const offers = await prisma.brandOffer.findMany({
      where: { brandId: req.user!.uid },
      orderBy: { offerType: "asc" },
    });
    res.json({ offers });
  } catch (err) {
    console.error("[brand] list offers error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

router.put("/offers/first-time", async (req: ExtendedRequest, res: Response) => {
  try {
    const { name, description, discountType, discountValue, isActive, imageUrl, campaignType } = req.body;
    if (!name || (campaignType !== "ADVERTISEMENT" && (!discountType || discountValue === undefined))) {
      return res.status(400).json({ message: "name, discountType, and discountValue are required for coupons." });
    }

    const cleanDiscountType = campaignType === "ADVERTISEMENT" ? "PERCENTAGE" : discountType;
    const cleanDiscountValue = campaignType === "ADVERTISEMENT" ? 0 : parseFloat(discountValue);

    const offer = await prisma.brandOffer.upsert({
      where: { brandId_offerType: { brandId: req.user!.uid, offerType: "FIRST_TIME" } },
      create: {
        brandId: req.user!.uid,
        offerType: "FIRST_TIME",
        campaignType: campaignType || "COUPON",
        name,
        description,
        discountType: cleanDiscountType,
        discountValue: cleanDiscountValue,
        isActive: isActive ?? true,
        imageUrl,
      },
      update: {
        name,
        description,
        discountType: cleanDiscountType,
        discountValue: cleanDiscountValue,
        imageUrl,
        campaignType: campaignType || "COUPON",
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json(offer);
  } catch (err) {
    console.error("[brand] upsert first-time offer error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

router.put("/offers/returning", async (req: ExtendedRequest, res: Response) => {
  try {
    const { name, description, discountType, discountValue, isActive, imageUrl, campaignType } = req.body;
    if (!name || (campaignType !== "ADVERTISEMENT" && (!discountType || discountValue === undefined))) {
      return res.status(400).json({ message: "name, discountType, and discountValue are required for coupons." });
    }

    const cleanDiscountType = campaignType === "ADVERTISEMENT" ? "PERCENTAGE" : discountType;
    const cleanDiscountValue = campaignType === "ADVERTISEMENT" ? 0 : parseFloat(discountValue);

    const offer = await prisma.brandOffer.upsert({
      where: { brandId_offerType: { brandId: req.user!.uid, offerType: "RETURNING" } },
      create: {
        brandId: req.user!.uid,
        offerType: "RETURNING",
        campaignType: campaignType || "COUPON",
        name,
        description,
        discountType: cleanDiscountType,
        discountValue: cleanDiscountValue,
        isActive: isActive ?? true,
        imageUrl,
      },
      update: {
        name,
        description,
        discountType: cleanDiscountType,
        discountValue: cleanDiscountValue,
        imageUrl,
        campaignType: campaignType || "COUPON",
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json(offer);
  } catch (err) {
    console.error("[brand] upsert returning offer error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

// ─── ADVERTISEMENT ───────────────────────────────────────────────────────────



// ─── COUPONS ─────────────────────────────────────────────────────────────────

router.get("/coupons", async (req: ExtendedRequest, res: Response) => {
  try {
    const { offerType, status, skip = "0", take = "20", search } = req.query;

    const where: any = { brandId: req.user!.uid };
    if (offerType) where.offerType = offerType;
    if (status) where.status = status;
    if (search) where.code = { contains: (search as string).toUpperCase() };

    const [coupons, total] = await Promise.all([
      prisma.coupon.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } },
          nearestOutlet: { select: { name: true, outletCode: true } },
          redemption: {
            include: {
              outlet: { select: { name: true } },
              worker: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: parseInt(skip as string),
        take: parseInt(take as string),
      }),
      prisma.coupon.count({ where }),
    ]);

    res.json({ coupons, total });
  } catch (err) {
    console.error("[brand] list coupons error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

router.put("/coupons/:id/revoke", async (req: ExtendedRequest, res: Response) => {
  try {
    const coupon = await prisma.coupon.findFirst({
      where: { id: req.params.id as string, brandId: req.user!.uid },
    });
    if (!coupon) return res.status(404).json({ message: "Coupon not found." });
    if (coupon.status !== "ACTIVE") {
      return res.status(400).json({ message: "Only active coupons can be revoked." });
    }

    await prisma.coupon.update({ where: { id: req.params.id as string }, data: { status: "REVOKED" } });
    res.json({ message: "Coupon revoked." });
  } catch (err) {
    console.error("[brand] revoke coupon error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});



// ─── DASHBOARD / ANALYTICS ──────────────────────────────────────────────────

router.get("/dashboard/summary", async (req: ExtendedRequest, res: Response) => {
  try {
    const brandId = req.user!.uid;

    const [
      total, active, redeemed, expired,
      ftTotal, ftActive, ftRedeemed, ftExpired,
      retTotal, retActive, retRedeemed, retExpired
    ] = await Promise.all([
      // Global
      prisma.coupon.count({ where: { brandId } }),
      prisma.coupon.count({ where: { brandId, status: "ACTIVE" } }),
      prisma.coupon.count({ where: { brandId, status: "REDEEMED" } }),
      prisma.coupon.count({ where: { brandId, status: "EXPIRED" } }),
      
      // First Time
      prisma.coupon.count({ where: { brandId, offerType: "FIRST_TIME" } }),
      prisma.coupon.count({ where: { brandId, offerType: "FIRST_TIME", status: "ACTIVE" } }),
      prisma.coupon.count({ where: { brandId, offerType: "FIRST_TIME", status: "REDEEMED" } }),
      prisma.coupon.count({ where: { brandId, offerType: "FIRST_TIME", status: "EXPIRED" } }),
      
      // Returning
      prisma.coupon.count({ where: { brandId, offerType: "RETURNING" } }),
      prisma.coupon.count({ where: { brandId, offerType: "RETURNING", status: "ACTIVE" } }),
      prisma.coupon.count({ where: { brandId, offerType: "RETURNING", status: "REDEEMED" } }),
      prisma.coupon.count({ where: { brandId, offerType: "RETURNING", status: "EXPIRED" } }),
    ]);

    res.json({
      total,
      active,
      redeemed,
      expired,
      revoked: total - active - redeemed - expired,
      firstTime: {
        total: ftTotal,
        active: ftActive,
        redeemed: ftRedeemed,
        expired: ftExpired,
      },
      returning: {
        total: retTotal,
        active: retActive,
        redeemed: retRedeemed,
        expired: retExpired,
      },
    });
  } catch (err) {
    console.error("[brand] dashboard summary error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

router.get("/dashboard/outlets", async (req: ExtendedRequest, res: Response) => {
  try {
    const outlets = await prisma.outlet.findMany({
      where: { brandId: req.user!.uid },
      include: {
        _count: { select: { workers: true, redemptions: true } },
        redemptions: {
          include: { coupon: { select: { offerType: true } } },
        },
      },
    });

    const result = outlets.map((o) => ({
      id: o.id,
      name: o.name,
      outletCode: o.outletCode,
      address: o.address,
      mapLink: o.mapLink,
      isActive: o.isActive,
      workerCount: o._count.workers,
      totalRedemptions: o._count.redemptions,
      firstTimeRedemptions: o.redemptions.filter((r) => r.coupon.offerType === "FIRST_TIME").length,
      returningRedemptions: o.redemptions.filter((r) => r.coupon.offerType === "RETURNING").length,
    }));

    res.json({ outlets: result });
  } catch (err) {
    console.error("[brand] dashboard outlets error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

router.get("/dashboard/redemptions", async (req: ExtendedRequest, res: Response) => {
  try {
    const { skip = "0", take = "10" } = req.query;

    const [redemptions, total] = await Promise.all([
      prisma.couponRedemption.findMany({
        where: { coupon: { brandId: req.user!.uid } },
        include: {
          coupon: { select: { code: true, offerType: true, discountType: true, discountValue: true } },
          outlet: { select: { name: true, outletCode: true } },
          worker: { select: { name: true } },
        },
        orderBy: { redeemedAt: "desc" },
        skip: parseInt(skip as string),
        take: parseInt(take as string),
      }),
      prisma.couponRedemption.count({ where: { coupon: { brandId: req.user!.uid } } }),
    ]);

    res.json({ redemptions, total });
  } catch (err) {
    console.error("[brand] dashboard redemptions error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

router.get("/dashboard/timeline", async (req: ExtendedRequest, res: Response) => {
  try {
    const brandId = req.user!.uid;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const redemptions = await prisma.couponRedemption.findMany({
      where: {
        coupon: { brandId },
        redeemedAt: { gte: thirtyDaysAgo },
      },
      select: { redeemedAt: true },
      orderBy: { redeemedAt: "asc" },
    });

    // Group by date
    const grouped: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      grouped[d.toISOString().slice(0, 10)] = 0;
    }
    for (const r of redemptions) {
      const key = r.redeemedAt.toISOString().slice(0, 10);
      if (grouped[key] !== undefined) grouped[key]++;
    }

    const timeline = Object.entries(grouped).map(([date, count]) => ({ date, count }));
    res.json({ timeline });
  } catch (err) {
    console.error("[brand] dashboard timeline error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

export default router;
