import express from "express";
import { generateUserToken } from "../utils/token.js";

const router = express.Router();

router.get("/register", (req, res) => {
  // In version 1, no real registration logic
  // Just generate a unique token
  const { token, userId } = generateUserToken();

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
