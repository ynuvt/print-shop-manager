// utils/token.ts
import jwt from "jsonwebtoken";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      "JWT_SECRET is missing. Add it to apps/api/.env before starting the API.",
    );
  }

  return secret;
}

export function generateUserToken(
  role: "admin" | "customer" = "customer",
  additionalPayload?: Record<string, any>,
) {
  // For now, payload can just be a random UUID or timestamp
  const payload = {
    uid: crypto.randomUUID(), // Node 18+ builtin
    createdAt: Date.now(),
    role: role, // To allow for future roles like "admin", "customer", etc.
    ...additionalPayload,
  };

  return { token: jwt.sign(payload, getJwtSecret()), userId: payload.uid };
}

export function generateTokenForUser(
  userId: string,
  role: "admin" | "customer" = "customer",
) {
  const payload = {
    uid: userId,
    createdAt: Date.now(),
    role,
  };

  return { token: jwt.sign(payload, getJwtSecret()), userId };
}

export function generateBrandToken(brandId: string) {
  const payload = {
    uid: brandId,
    createdAt: Date.now(),
    role: "brand" as const,
  };

  return { token: jwt.sign(payload, getJwtSecret()), brandId };
}
