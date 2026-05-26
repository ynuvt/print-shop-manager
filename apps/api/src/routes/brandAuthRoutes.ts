// routes/brandAuthRoutes.ts
// Authentication routes for brand owners (login / register).

import express, { Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "@printowl/db";
import { generateBrandToken } from "../utils/token.js";
import { authMiddleware, type ExtendedRequest } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * POST /brand-auth/register
 * Admin-only: create a new brand account.
 */
router.post(
  "/register",
  async (req: ExtendedRequest, res: Response) => {
    try {
      const { name, slug, email, password, plan } = req.body;

      if (!name || !slug || !email || !password) {
        return res.status(400).json({ message: "name, slug, email, and password are required." });
      }

      // Check for existing brand
      const existing = await prisma.brand.findFirst({
        where: { OR: [{ email }, { slug }] },
      });
      if (existing) {
        return res.status(409).json({ message: "A brand with this email or slug already exists." });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const brand = await prisma.brand.create({
        data: {
          name,
          slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, ""),
          email: email.toLowerCase(),
          password: hashedPassword,
          plan: plan || "STANDARD",
        },
      });

      const { token } = generateBrandToken(brand.id);

      res.status(201).json({
        message: "Brand created successfully.",
        brand: {
          id: brand.id,
          name: brand.name,
          slug: brand.slug,
          email: brand.email,
          plan: brand.plan,
        },
        token,
      });
    } catch (err) {
      console.error("[brand-auth] Register error:", err);
      res.status(500).json({ message: "Internal server error." });
    }
  },
);

/**
 * POST /brand-auth/login
 * Brand owner login with email + password.
 */
router.post("/login", async (req: ExtendedRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const brand = await prisma.brand.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!brand) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const valid = await bcrypt.compare(password, brand.password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const { token } = generateBrandToken(brand.id);

    res.json({
      token,
      brand: {
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
        email: brand.email,
        plan: brand.plan,
        logo: brand.logo,
      },
    });
  } catch (err) {
    console.error("[brand-auth] Login error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

export default router;
