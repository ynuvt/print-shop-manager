import express from "express";
import { generateUserToken } from "../utils/token.js";
import { prisma } from "@printowl/db";

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
export default router;
