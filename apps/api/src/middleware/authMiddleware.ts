// middleware/auth.ts
import { NextFunction, Request, Response } from "express";
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

// Extend request to include user info
export interface ExtendedRequest extends Request {
  user?: {
    uid: string;
    role: string;
    createdAt: number;
  };
}

/**
 * Auth middleware
 * @param allowedRoles - array of roles allowed to access the route
 */
export function authMiddleware(allowedRoles: string[] = []) {
  return async (req: ExtendedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: "Authorization header missing" });
    }

    const token = authHeader.split(" ")[1]; // Expect "Bearer <token>"
    if (!token) {
      return res.status(401).json({ message: "Token missing" });
    }

    try {
      const decoded = jwt.verify(token, getJwtSecret()) as {
        uid: string;
        role: string;
        createdAt: number;
      };

      req.user = decoded;

      // Check role
      if (allowedRoles.length && !allowedRoles.includes(decoded.role)) {
        return res.status(403).json({ message: "Access denied for this role" });
      }

      // NOTE: Keep middleware stateless.
      // If a route requires the User row to exist, it should create it explicitly.

      next();
    } catch (err) {
      return res.status(401).json({ message: "Invalid token" });
    }
  };
}
