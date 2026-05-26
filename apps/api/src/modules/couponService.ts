// modules/couponService.ts
// Core business logic for coupon generation, assignment, validation, and redemption.

import { prisma } from "@printowl/db";
import { sendWhatsAppTextMessage, sendWhatsAppImageBuffer } from "./whatsappServices.js";
import { brandHasFeature } from "./brandPlanFeatures.js";
import QRCode from "qrcode";

// ─── COUPON CODE GENERATION ──────────────────────────────────────────────────

/**
 * Generate a unique coupon code like "MKH-A7X9K2".
 * Uses brand slug as prefix + random alphanumeric suffix.
 */
export async function generateCouponCode(brandSlug: string): Promise<string> {
  const prefix = brandSlug.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/1/0 to avoid confusion
  let code: string;
  let attempts = 0;

  do {
    let suffix = "";
    for (let i = 0; i < 6; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code = `${prefix}-${suffix}`;
    attempts++;

    // Ensure uniqueness
    const existing = await prisma.coupon.findUnique({ where: { code } });
    if (!existing) return code;
  } while (attempts < 10);

  // Fallback with timestamp
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  return `${prefix}-${ts}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

// ─── NEAREST OUTLET (HAVERSINE) ─────────────────────────────────────────────

/** Default print shop coordinates (Bangalore) */
const DEFAULT_SHOP_LAT = 12.9716;
const DEFAULT_SHOP_LNG = 77.5946;

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth radius in km
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find the nearest outlet of a brand to the given shop coordinates.
 */
export async function findNearestOutlet(
  brandId: string,
  shopLat: number = DEFAULT_SHOP_LAT,
  shopLng: number = DEFAULT_SHOP_LNG,
) {
  const outlets = await prisma.outlet.findMany({
    where: { brandId, isActive: true, latitude: { not: null }, longitude: { not: null } },
  });

  if (outlets.length === 0) {
    // Fallback: return any active outlet
    return prisma.outlet.findFirst({ where: { brandId, isActive: true } });
  }

  let nearest = outlets[0]!;
  let minDist = Infinity;

  for (const outlet of outlets) {
    const dist = haversineDistance(shopLat, shopLng, outlet.latitude!, outlet.longitude!);
    if (dist < minDist) {
      minDist = dist;
      nearest = outlet;
    }
  }

  return nearest;
}

// ─── QR CODE DATA ────────────────────────────────────────────────────────────

/**
 * Get the WhatsApp deep-link URL for a coupon QR code.
 */
export function getCouponQrData(couponCode: string): string {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  // wa.me uses the phone number, not the phone number ID.
  // The actual WhatsApp number should be in env as WHATSAPP_PHONE_NUMBER
  const phoneNumber = process.env.WHATSAPP_PHONE_NUMBER || phoneId;
  return `https://wa.me/${phoneNumber}?text=coupon:${couponCode}`;
}

// ─── COUPON ASSIGNMENT ───────────────────────────────────────────────────────

/**
 * Assign coupons to a user from ALL active brands with valid offers.
 * For each brand: checks if user is first-time or returning, then generates coupon.
 */
export async function assignCouponsToUser(userId: string): Promise<void> {
  // Find all brands that have at least one active COUPON offer
  const brands = await prisma.brand.findMany({
    where: {
      offers: { some: { isActive: true, campaignType: "COUPON" } },
    },
    include: {
      offers: { where: { isActive: true, campaignType: "COUPON" } },
    },
  });

  for (const brand of brands) {
    try {
      // Check if user has ever received a coupon from this brand
      const existingCoupon = await prisma.coupon.findFirst({
        where: { userId, brandId: brand.id },
      });

      const offerType = existingCoupon ? "RETURNING" : "FIRST_TIME";

      // Find the matching offer
      const offer = brand.offers.find((o) => o.offerType === offerType);
      if (!offer) continue; // No offer of this type configured

      // Generate unique code
      const code = await generateCouponCode(brand.slug);

      // Find nearest outlet
      const nearestOutlet = await findNearestOutlet(brand.id);

      // Default validity: 30 days from now
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 30);

      // Create the coupon
      const coupon = await prisma.coupon.create({
        data: {
          code,
          brandId: brand.id,
          offerId: offer.id,
          userId,
          nearestOutletId: nearestOutlet?.id ?? null,
          discountType: offer.discountType,
          discountValue: offer.discountValue,
          description: offer.description,
          offerType,
          validUntil,
        },
      });

      // Deliver based on plan
      await deliverCouponByPlan(coupon, brand, userId);

      // Emit real-time socket event for the earned coupon
      try {
        const { default: socket } = await import("../config/socket.js");
        const discountText =
          coupon.discountType === "PERCENTAGE"
            ? `${coupon.discountValue}% OFF`
            : `₹${coupon.discountValue} OFF`;

        socket.emit("coupon-earned", userId, {
          id: coupon.id,
          code: coupon.code,
          brandName: brand.name,
          discountText,
          description: coupon.description,
          validUntil: coupon.validUntil.toISOString(),
        });
      } catch (socketErr) {
        console.error("[coupon-socket] Failed to emit coupon-earned event:", socketErr);
      }
    } catch (err) {
      console.error(`[coupon] Failed to assign coupon from brand ${brand.name}:`, err);
    }
  }
}

/**
 * Deliver coupon via WhatsApp based on the brand's plan.
 * Standard: no WhatsApp delivery (website only).
 * Pro: plain text WhatsApp message.
 * Pro+: template message.
 */
async function deliverCouponByPlan(
  coupon: { code: string; discountType: string; discountValue: number; description: string | null; nearestOutletId: string | null },
  brand: { id: string; name: string; plan: string },
  userId: string,
): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) return;

  // Find user's WhatsApp number
  const waUser = await prisma.whatsAppUser.findFirst({
    where: { userId },
    select: { phoneNumber: true },
  });

  if (!waUser) return; // No WhatsApp linked

  const discountText =
    coupon.discountType === "PERCENTAGE"
      ? `${coupon.discountValue}% OFF`
      : `₹${coupon.discountValue} OFF`;

  const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL ?? "").replace(/\/$/, "");
  const rewardsUrl = `${FRONTEND_BASE_URL}/rewards`;
  const brandNameUpper = brand.name.toUpperCase();

  const message = [
    `Hello from *${brandNameUpper}*!`,
    ``,
    `You have earned a new discount coupon!`,
    ``,
    `Discount: *${discountText}*`,
    coupon.description ? `_${coupon.description}_` : "",
    ``,
    `Claim and view your coupon details here:`,
    `👉 ${rewardsUrl}`,
  ].filter(line => line !== null).join("\n");

  // Send plain text notification to everyone
  await sendWhatsAppTextMessage({
    to: waUser.phoneNumber,
    phoneNumberId,
    message,
  });
}

// ─── COUPON VALIDATION ───────────────────────────────────────────────────────

export interface CouponValidationResult {
  valid: boolean;
  message: string;
  coupon?: {
    code: string;
    discountType: string;
    discountValue: number;
    description: string | null;
    brandName: string;
    offerType: string;
    validUntil: Date;
  };
  worker?: {
    name: string;
    outletName: string;
    outletId: string;
  };
}

/**
 * Validate a coupon code sent by an outlet worker via WhatsApp.
 * Checks: worker registered, coupon exists, ACTIVE, not expired, same brand.
 */
export async function validateCoupon(
  code: string,
  workerPhoneNumber: string,
): Promise<CouponValidationResult> {
  // Look up worker
  const worker = await prisma.outletWorker.findUnique({
    where: { phoneNumber: workerPhoneNumber, isActive: true },
    include: { outlet: { include: { brand: true } } },
  });

  if (!worker) {
    return {
      valid: false,
      message: "❌ You are not registered as an outlet worker. Contact your brand admin.",
    };
  }

  // Look up coupon
  const coupon = await prisma.coupon.findUnique({
    where: { code: code.toUpperCase() },
    include: { brand: true },
  });

  if (!coupon) {
    return { valid: false, message: "❌ Invalid coupon code." };
  }

  if (coupon.brandId !== worker.outlet.brandId) {
    return { valid: false, message: "❌ This coupon is not for your brand." };
  }

  if (coupon.status !== "ACTIVE") {
    const statusMsg =
      coupon.status === "REDEEMED"
        ? "already been redeemed"
        : coupon.status === "EXPIRED"
          ? "expired"
          : "been revoked";
    return { valid: false, message: `❌ This coupon has ${statusMsg}.` };
  }

  if (new Date() > coupon.validUntil) {
    // Auto-mark as expired
    await prisma.coupon.update({ where: { id: coupon.id }, data: { status: "EXPIRED" } });
    return { valid: false, message: "❌ This coupon has expired." };
  }

  return {
    valid: true,
    message: "✅ Coupon is valid!",
    coupon: {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      description: coupon.description,
      brandName: coupon.brand.name,
      offerType: coupon.offerType,
      validUntil: coupon.validUntil,
    },
    worker: {
      name: worker.name,
      outletName: worker.outlet.name,
      outletId: worker.outlet.id,
    },
  };
}

// ─── COUPON REDEMPTION ───────────────────────────────────────────────────────

export interface CouponRedemptionResult {
  success: boolean;
  message: string;
}

/**
 * Redeem a coupon: create CouponRedemption record and mark coupon as REDEEMED.
 */
export async function redeemCoupon(
  code: string,
  workerPhoneNumber: string,
): Promise<CouponRedemptionResult> {
  // Re-validate first
  const validation = await validateCoupon(code, workerPhoneNumber);
  if (!validation.valid || !validation.worker) {
    return { success: false, message: validation.message };
  }

  const worker = await prisma.outletWorker.findUnique({
    where: { phoneNumber: workerPhoneNumber },
  });

  if (!worker) {
    return { success: false, message: "❌ Worker not found." };
  }

  const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon) {
    return { success: false, message: "❌ Coupon not found." };
  }

  // Create redemption and update status atomically
  await prisma.$transaction([
    prisma.couponRedemption.create({
      data: {
        couponId: coupon.id,
        outletId: worker.outletId,
        workerId: worker.id,
      },
    }),
    prisma.coupon.update({
      where: { id: coupon.id },
      data: { status: "REDEEMED" },
    }),
  ]);

  const discountText =
    coupon.discountType === "PERCENTAGE"
      ? `${coupon.discountValue}% OFF`
      : `₹${coupon.discountValue} OFF`;

  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  return {
    success: true,
    message: `🎉 Coupon Redeemed Successfully!\n\n🎟️ Code: ${coupon.code}\n💰 Discount: ${discountText}\n🏪 Outlet: ${validation.worker.outletName}\n👤 Redeemed by: ${validation.worker.name}\n🕐 Time: ${now}`,
  };
}
