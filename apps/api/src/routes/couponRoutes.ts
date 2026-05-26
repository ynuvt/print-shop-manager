// routes/couponRoutes.ts
// User-facing coupon routes: view assigned coupons.

import express, { Response } from "express";
import { prisma } from "@printowl/db";
import { authMiddleware, type ExtendedRequest } from "../middleware/authMiddleware.js";
import { getCouponQrData } from "../modules/couponService.js";

const router = express.Router();

/**
 * GET /coupons/advertisements
 * Get all active brand advertisements.
 */
router.get(
  "/advertisements",
  authMiddleware(["customer"]),
  async (req: ExtendedRequest, res: Response) => {
    try {
      const brandOffers = await prisma.brandOffer.findMany({
        where: { isActive: true, campaignType: "ADVERTISEMENT" },
        include: {
          brand: { select: { id: true, name: true, slug: true, logo: true } },
        },
      });

      const mappedOffers = brandOffers.map((offer) => ({
        id: offer.id,
        imageUrl: offer.imageUrl,
        title: offer.name,
        description: offer.description,
        isActive: offer.isActive,
        brand: offer.brand,
        isOffer: false,
        offerType: offer.offerType,
        discountType: offer.discountType,
        discountValue: offer.discountValue,
      }));

      res.json({ advertisements: mappedOffers });
    } catch (err) {
      console.error("[coupons] advertisements error:", err);
      res.status(500).json({ message: "Internal server error." });
    }
  }
);

/**
 * GET /coupons/my-coupons
 * Get all coupons assigned to the current user.
 */
router.get(
  "/my-coupons",
  authMiddleware(["customer"]),
  async (req: ExtendedRequest, res: Response) => {
    try {
      const userId = req.user!.uid;

      const coupons = await prisma.coupon.findMany({
        where: { userId },
        include: {
          brand: { select: { id: true, name: true, slug: true, logo: true } },
          nearestOutlet: {
            select: { id: true, name: true, address: true, mapLink: true, outletCode: true },
          },
          redemption: { select: { redeemedAt: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      const enriched = coupons.map((c) => ({
        id: c.id,
        code: c.code,
        brand: c.brand,
        discountType: c.discountType,
        discountValue: c.discountValue,
        description: c.description,
        offerType: c.offerType,
        status: c.status,
        validUntil: c.validUntil,
        createdAt: c.createdAt,
        nearestOutlet: c.nearestOutlet,
        redeemedAt: c.redemption?.redeemedAt ?? null,
        qrData: c.status === "ACTIVE" ? getCouponQrData(c.code) : null,
      }));

      res.json({ coupons: enriched });
    } catch (err) {
      console.error("[coupons] my-coupons error:", err);
      res.status(500).json({ message: "Internal server error." });
    }
  },
);

/**
 * GET /coupons/:id
 * Get a single coupon with full details.
 */
router.get(
  "/:id",
  authMiddleware(["customer"]),
  async (req: ExtendedRequest, res: Response) => {
    try {
      const userId = req.user!.uid;

      const coupon = await prisma.coupon.findFirst({
        where: { id: req.params.id as string, userId },
        include: {
          brand: { select: { id: true, name: true, slug: true, logo: true } },
          nearestOutlet: {
            select: { id: true, name: true, address: true, mapLink: true, outletCode: true, latitude: true, longitude: true },
          },
          redemption: {
            include: {
              outlet: { select: { name: true, outletCode: true } },
              worker: { select: { name: true } },
            },
          },
        },
      });

      if (!coupon) {
        return res.status(404).json({ message: "Coupon not found." });
      }

      res.json({
        ...coupon,
        qrData: coupon.status === "ACTIVE" ? getCouponQrData(coupon.code) : null,
      });
    } catch (err) {
      console.error("[coupons] get-coupon error:", err);
      res.status(500).json({ message: "Internal server error." });
    }
  },
);

export default router;
