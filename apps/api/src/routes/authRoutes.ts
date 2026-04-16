import express from "express";
import { generateTokenForUser, generateUserToken } from "../utils/token.js";
import { prisma } from "@printowl/db";
import {
  authMiddleware,
  type ExtendedRequest,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/register", async (req, res) => {
  // In version 1, no real registration logic
  // Just generate a unique token
  const { token, userId } = generateUserToken();

  try {
    await prisma.user.upsert({
      where: { id: userId },
      create: { id: userId },
      update: {},
    });
  } catch (error) {
    console.error("Failed to create user record", error);
    res.status(500).json({ error: "Failed to create user record" });
    return;
  }

  res.status(200).json({
    message: "Registration successful!",
    token,
    userId,
  });
});
const supportedAdminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
const supportedAdminPassword = process.env.ADMIN_PASSWORD || "admin123";

router.post("/admin-login", (req, res) => {
  const { email, password } = req.body;
  if (email === supportedAdminEmail && password === supportedAdminPassword) {
    const token = generateUserToken("admin");
    res.status(200).json({
      message: "Admin login successful!",
      token,
    });
  } else {
    res.status(401).json({ error: "Invalid admin credentials." });
  }
});

router.post(
  "/whatsapp-login",
  authMiddleware(["customer", "admin"]),
  async (req: ExtendedRequest, res) => {
    const code = String(req.body?.code ?? "").trim();
    if (!code) {
      return res.status(400).json({ error: "Missing login code." });
    }

    const tokenUserId = req.user?.uid;
    if (!tokenUserId) {
      return res.status(401).json({ error: "Unauthorized." });
    }

    const otp = await prisma.whatsAppLoginOtp.findUnique({
      where: { code },
      include: { whatsAppUser: true },
    });

    if (!otp) {
      return res.status(400).json({ error: "Invalid or expired code." });
    }

    const now = new Date();
    if (otp.usedAt || otp.expiresAt.getTime() < now.getTime()) {
      return res.status(400).json({ error: "Invalid or expired code." });
    }

    await prisma.user.upsert({
      where: { id: tokenUserId },
      create: { id: tokenUserId },
      update: {},
    });

    const whatsAppUser = otp.whatsAppUser;
    if (!whatsAppUser) {
      return res.status(400).json({ error: "Invalid login code." });
    }

    const tokenUserLink = await prisma.whatsAppUser.findFirst({
      where: { userId: tokenUserId },
      select: { phoneNumber: true },
    });

    let resolvedUserId = tokenUserId;
    if (!whatsAppUser.userId) {
      if (
        tokenUserLink &&
        tokenUserLink.phoneNumber !== whatsAppUser.phoneNumber
      ) {
        //here first create a new user then link it to whtasapp account then since it's new it wont have jobs so just return the token
        const { token, userId } = generateUserToken();

        try {
          await prisma.user.upsert({
            where: { id: userId },
            create: { id: userId },
            update: {},
          });
        } catch (error) {
          console.error("Failed to create user record", error);
          res.status(500).json({ error: "Failed to create user record" });
          return;
        }
        await prisma.whatsAppUser.update({
          where: { phoneNumber: whatsAppUser.phoneNumber },
          data: { userId },
        });
        await prisma.printJob.updateMany({
          where: { userMetadataId: whatsAppUser.phoneNumber },
          data: { userId },
        });
        await prisma.whatsAppLoginOtp.update({
          where: { id: otp.id },
          data: { usedAt: now },
        });
        return res.status(200).json({ token, userId });
      }

      await prisma.whatsAppUser.update({
        where: { phoneNumber: whatsAppUser.phoneNumber },
        data: { userId: tokenUserId },
      });
    } else if (whatsAppUser.userId !== tokenUserId) {
      resolvedUserId = whatsAppUser.userId;

      if (!tokenUserLink) {
        const tokenJobs = await prisma.printJob.findFirst({
          where: { userId: tokenUserId },
          select: { id: true },
        });

        if (tokenJobs) {
          await prisma.printJob.updateMany({
            where: { userId: tokenUserId },
            data: { userId: resolvedUserId },
          });
        }
      }
    }

    await prisma.printJob.updateMany({
      where: { userMetadataId: whatsAppUser.phoneNumber },
      data: { userId: resolvedUserId },
    });

    await prisma.user.upsert({
      where: { id: resolvedUserId },
      create: { id: resolvedUserId },
      update: {},
    });

    await prisma.whatsAppLoginOtp.update({
      where: { id: otp.id },
      data: { usedAt: now },
    });

    const { token, userId } = generateTokenForUser(resolvedUserId, "customer");
    return res.status(200).json({ token, userId });
  },
);
export default router;
