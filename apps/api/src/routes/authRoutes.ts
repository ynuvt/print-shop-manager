import express from "express";
import jwt from "jsonwebtoken";
import { generateTokenForUser, generateUserToken } from "../utils/token.js";
import { prisma } from "@printowl/db";
import {
  authMiddleware,
} from "../middleware/authMiddleware.js";
import { sendWhatsAppTextMessage } from "../modules/whatsappServices.js";

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

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is missing. Add it to apps/api/.env before starting the API.",
    );
  }
  return secret;
}

function getOptionalTokenUserId(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.split(" ")[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as {
      uid: string;
      role: string;
      createdAt: number;
    };
    return decoded?.uid ?? null;
  } catch {
    return null;
  }
}

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
  async (req, res) => {
    const code = String(req.body?.code ?? "").trim();
    if (!code) {
      return res.status(400).json({ error: "Missing login code." });
    }

    let tokenUserId = getOptionalTokenUserId(req);
    if (!tokenUserId) {
      const generated = generateUserToken();
      tokenUserId = generated.userId;
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

    if (tokenUserId) {
      await prisma.user.upsert({
        where: { id: tokenUserId },
        create: { id: tokenUserId },
        update: {},
      });
    }

    const whatsAppUser = otp.whatsAppUser;
    if (!whatsAppUser) {
      return res.status(400).json({ error: "Invalid login code." });
    }

    const tokenUserLink = await prisma.whatsAppUser.findFirst({
      where: { userId: tokenUserId },
      select: { phoneNumber: true },
    });

    let resolvedUserId = tokenUserId!;
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

    const senderPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (senderPhoneNumberId) {
      try {
        await sendWhatsAppTextMessage({
          to: whatsAppUser.phoneNumber,
          phoneNumberId: senderPhoneNumberId,
          message:
            "*Synced with WhatsApp successfully* ✅\n\nYou can use Zopy now.",
        });
      } catch (error) {
        console.error("Failed to send WhatsApp login success message:", error);
      }
    }

    return res.status(200).json({ token, userId });
  },
);
export default router;
