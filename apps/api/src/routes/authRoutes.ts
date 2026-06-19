import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { generateTokenForUser, generateUserToken } from "../utils/token.js";
import { prisma } from "@printowl/db";
import { PrintJobStatus } from "../../../../packages/db/dist/generated/prisma/enums.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { sendWhatsAppTextMessage, sendWhatsAppButtonMessage } from "../modules/whatsappServices.js";

const router = express.Router();
function waBold(text: string): string {
  return `*${text}*`;
}

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

router.post("/shop-login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "username and password are required." });
  }

  try {
    const shop = await prisma.printShop.findUnique({
      where: { username: username.toLowerCase() },
    });

    if (!shop || !shop.isActive) {
      return res.status(401).json({ error: "Invalid username or password, or shop is inactive." });
    }

    const valid = await bcrypt.compare(password, shop.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const { token } = generateUserToken("admin", { shopId: shop.shopId });

    res.status(200).json({
      message: "Shop login successful!",
      token,
      shop: {
        id: shop.id,
        username: shop.username,
        shopId: shop.shopId,
      },
    });
  } catch (error) {
    console.error("[shop-login] Error:", error);
    res.status(500).json({ error: "Failed to login." });
  }
});

router.post("/whatsapp-login", async (req, res) => {
  try {
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

    // ── Already verified: redirect user back to WhatsApp with a friendly message ──
    if (otp.usedAt) {
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      if (phoneNumberId && otp.whatsAppUser?.phoneNumber) {
        try {
          await sendWhatsAppButtonMessage({
            to: otp.whatsAppUser.phoneNumber,
            phoneNumberId,
            body: [
              "*Already verified* ✅",
              "Your WhatsApp is already synced! You can send your documents here directly.",
              "",
              "▸ *Edit* › set print options & submit",
              "▸ *Current* › check your print job",
              "▸ *Help* › see all commands",
            ].join("\n"),
            buttons: [
              { type: "reply", reply: { id: "edit", title: "Edit" } },
              { type: "reply", reply: { id: "status", title: "Current" } },
              { type: "reply", reply: { id: "help", title: "Help" } },
            ],
          });
        } catch (error) {
          console.error("Failed to send already-verified WhatsApp message:", error);
        }
      }
      return res.status(200).json({ alreadyVerified: true });
    }

    if (otp.expiresAt.getTime() < now.getTime()) {
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
        const { phoneNumber } = await prisma.whatsAppUser.update({
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
        // Send sync success to the user's WhatsApp number
        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        if (phoneNumberId) {
           try {
            await sendWhatsAppButtonMessage({
              to: whatsAppUser.phoneNumber,
              phoneNumberId,
              body: [
                "*Synced successfully* ✅",
                "Your WhatsApp is now connected! All your files are ready.",
                "",
                "▸ *Edit* › set print options & submit",
                "▸ *Current* › check your print job",
                "▸ *Help* › see all commands",
                "",
                "_Tap Edit to review your files & submit!_",
              ].join("\n"),
              buttons: [
                { type: "reply", reply: { id: "edit", title: "Edit" } },
                { type: "reply", reply: { id: "status", title: "Current" } },
                { type: "reply", reply: { id: "help", title: "Help" } },
              ],
            });
          } catch (error) {
            console.error(
              "Failed to send WhatsApp login success message:",
              error,
            );
          }
        }

        return res.status(200).json({ token, userId });
      }

      const whatsappUser = await prisma.whatsAppUser.update({
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

    // ── Draft merge: if user has both a WhatsApp draft and web draft, merge them ──
    try {
      const allDrafts = await prisma.printJob.findMany({
        where: { userId: resolvedUserId, status: PrintJobStatus.DRAFT, expired: false },
        include: {
          files: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      });

      if (allDrafts.length > 1) {
        // Prioritize the WEB draft as the primary one
        const webDraft = allDrafts.find((d) => d.source === "WEB");
        const primaryDraft = webDraft || allDrafts[0]!;
        const mergedFileNames: string[] = [];

        for (const draft of allDrafts) {
          if (draft.id === primaryDraft.id) continue;
          
          if (draft.files.length > 0) {
            // Move files to the primary draft
            await prisma.file.updateMany({
              where: { printJobId: draft.id },
              data: { printJobId: primaryDraft.id },
            });
            mergedFileNames.push(...draft.files.map((f) => f.name));
          }
          // Delete the duplicate draft
          await prisma.printJob.delete({ where: { id: draft.id } });
        }

        // Recalculate totals for the primary draft
        const updatedFiles = await prisma.file.findMany({
          where: { printJobId: primaryDraft.id },
          select: { pages: true },
        });
        const totalPages = updatedFiles.reduce((sum, f) => sum + (f.pages ?? 0), 0);
        await prisma.printJob.update({
          where: { id: primaryDraft.id },
          data: { totalPages, totalCost: totalPages * 2 },
        });

        // Notify user about the merge
        if (mergedFileNames.length > 0) {
          const mergePhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
          if (mergePhoneNumberId) {
            const displayNames = mergedFileNames
              .slice(0, 10)
              .map((n) => n.replace(/\.pdf$/i, ""));
            const extra = mergedFileNames.length > 10 ? `\n... and ${mergedFileNames.length - 10} more` : "";
            sendWhatsAppTextMessage({
              to: whatsAppUser.phoneNumber,
              phoneNumberId: mergePhoneNumberId,
              message: [
                `${waBold("Files merged")} 📂`,
                `Files found on web, adding to your draft:`,
                displayNames.join(", ") + extra,
              ].join("\n"),
            }).catch((err) => console.error("[draft-merge] notify error:", err));
          }
        }
      }
    } catch (mergeErr) {
      console.error("[draft-merge] error:", mergeErr);
      // Non-critical — don't block the sync
    }

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

    // Send sync success to the user's WhatsApp number
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (phoneNumberId) {
      try {
        await sendWhatsAppButtonMessage({
          to: whatsAppUser.phoneNumber,
          phoneNumberId,
          body: [
            "*Synced successfully* ✅",
            "Your WhatsApp is now connected! All your files are ready.",
            "",
            "▸ *Edit* › set print options & submit",
            "▸ *Current* › check your print job",
            "▸ *Help* › see all commands",
            "",
            "_Tap Edit to review your files & submit!_",
          ].join("\n"),
          buttons: [
            { type: "reply", reply: { id: "edit", title: "Edit" } },
            { type: "reply", reply: { id: "status", title: "Current" } },
            { type: "reply", reply: { id: "help", title: "Help" } },
          ],
        });
      } catch (error) {
        console.error("Failed to send WhatsApp login success message:", error);
      }
    }

    return res.status(200).json({ token, userId });
  } catch (error) {
    console.error("[whatsapp-login] Unexpected error:", error);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ── Mobile App Sync ──────────────────────────────────────────────────────────

/** POST /auth/mobile-sync — generate a one-time OTP for the mobile app */
router.post("/mobile-sync", async (_req, res) => {
  try {
    const syncId = crypto.randomUUID();
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60_000); // 5 minutes

    // Clean up old unused OTPs
    await prisma.mobileSyncOtp.deleteMany({
      where: { usedAt: null, expiresAt: { lt: new Date() } },
    });

    await prisma.mobileSyncOtp.create({
      data: { syncId, otp, expiresAt },
    });

    return res.status(200).json({ syncId, otp });
  } catch (error) {
    console.error("[mobile-sync] Error:", error);
    return res.status(500).json({ error: "Failed to generate sync code." });
  }
});

/** GET /auth/mobile-sync/status?syncId=xxx — poll to check if OTP was used */
router.get("/mobile-sync/status", async (req, res) => {
  try {
    const syncId = String(req.query.syncId ?? "").trim();
    if (!syncId) {
      return res.status(400).json({ error: "Missing syncId." });
    }

    const record = await prisma.mobileSyncOtp.findUnique({
      where: { syncId },
    });

    if (!record) {
      return res.status(404).json({ status: "not_found" });
    }

    if (record.usedAt && record.token && record.userId) {
      return res.status(200).json({
        status: "linked",
        token: record.token,
        userId: record.userId,
      });
    }

    if (record.expiresAt.getTime() < Date.now()) {
      return res.status(200).json({ status: "expired" });
    }

    return res.status(200).json({ status: "pending" });
  } catch (error) {
    console.error("[mobile-sync/status] Error:", error);
    return res.status(500).json({ error: "Failed to check status." });
  }
});

/** GET /open-app — redirect page: tries deep link, falls back to homepage */
router.get("/open-app", (req, res) => {
  const syncId = String(req.query.syncId ?? "");
  const FRONTEND = (
    process.env.FRONTEND_BASE_URL ?? "https://zopy.co.in"
  ).replace(/\/$/, "");

  // Android intent:// scheme — if app is installed, opens instantly.
  // S.browser_fallback_url sends user to homepage if app not installed.
  const intentUrl = `intent://sync-complete?syncId=${syncId}#Intent;scheme=zopy;package=com.zopy.mobile;S.browser_fallback_url=${encodeURIComponent(FRONTEND + "/")};end`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zopy</title>
</head>
<body style="margin:0;background:#0f0f0f;">
  <script>
    // Android: use intent scheme (instant, handles fallback natively)
    var isAndroid = /android/i.test(navigator.userAgent);
    if (isAndroid) {
      window.location = "${intentUrl}";
    } else {
      // iOS/other: try custom scheme, fallback fast
      window.location = "zopy://sync-complete?syncId=${syncId}";
      setTimeout(function() { window.location = "${FRONTEND}/"; }, 1000);
    }
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  return res.send(html);
});

export default router;
