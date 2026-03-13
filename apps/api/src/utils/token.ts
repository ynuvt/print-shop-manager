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

export function generateUserToken(role: "admin" | "customer" = "customer") {
  // For now, payload can just be a random UUID or timestamp
  const payload = {
    uid: crypto.randomUUID(), // Node 18+ builtin
    createdAt: Date.now(),
    role: role, // To allow for future roles like "admin", "customer", etc.
  };

  return jwt.sign(payload, getJwtSecret());
}
