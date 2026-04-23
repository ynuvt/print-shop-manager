import express from "express";
import { prisma } from "@printowl/db";
import { authMiddleware } from "../middleware/authMiddleware.js";
import type { ExtendedRequest } from "../middleware/authMiddleware.js";
import { UserEventType } from "../../../../packages/db/dist/generated/prisma/enums.js";

const router = express.Router();

router.get("/session", authMiddleware(), async (req: ExtendedRequest, res) => {
  const userId = req.user?.uid;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const user = await prisma.user.upsert({
      where: { id: userId },
      create: { id: userId },
      update: {},
    });
    const whatsAppLink = await prisma.whatsAppUser.findFirst({
      where: { userId },
      select: { phoneNumber: true },
    });

    const skippedEvent = await prisma.userEvent.findFirst({
      where: {
        userId,
        type: UserEventType.ONBOARDING_SKIPPED,
      },
      select: { id: true },
    });

    res.status(200).json({
      userId,
      onboardingCompleted: user.onboardingCompleted,
      onboardingSkipped: !!skippedEvent,
      whatsappSynced: !!whatsAppLink?.phoneNumber,
    });
  } catch (error) {
    console.error("Failed to load session", error);
    res.status(500).json({ error: "Failed to load session" });
  }
});

router.post(
  "/onboarding/completed",
  authMiddleware(),
  async (req: ExtendedRequest, res) => {
    const userId = req.user?.uid;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      await prisma.user.upsert({
        where: { id: userId },
        create: { id: userId, onboardingCompleted: true },
        update: { onboardingCompleted: true },
      });

      res.status(200).json({ message: "Onboarding marked as completed" });
    } catch (error) {
      console.error("Failed to update onboarding completion", error);
      res.status(500).json({ error: "Failed to update onboarding completion" });
    }
  },
);

router.post(
  "/onboarding/skipped",
  authMiddleware(),
  async (req: ExtendedRequest, res) => {
    const userId = req.user?.uid;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      await prisma.user.upsert({
        where: { id: userId },
        create: { id: userId },
        update: {},
      });

      await prisma.userEvent.create({
        data: {
          userId,
          type: UserEventType.ONBOARDING_SKIPPED,
          metadata: req.body?.metadata ?? null,
        },
      });

      res.status(201).json({ message: "Onboarding skipped event recorded" });
    } catch (error) {
      console.error("Failed to record onboarding skipped event", error);
      res.status(500).json({ error: "Failed to record onboarding skipped" });
    }
  },
);

export default router;
