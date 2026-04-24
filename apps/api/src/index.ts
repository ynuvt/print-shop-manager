import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import v1Routes from "./routes/index.js";
const app = express();

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many authentication requests. Please retry in a few minutes.",
  },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDistPath = path.resolve(__dirname, "../../web/dist");
const webIndexPath = path.join(webDistPath, "index.html");

app.get("/healthz", (req, res) => {
  res.json({ message: "The backend is healthy!" });
});

app.use("/api/v1/auth", authLimiter);
app.use("/api/v1", apiLimiter);
app.use("/api/v1", v1Routes);

if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));

  // Let React Router handle non-API routes in the browser.
  app.get(/^(?!\/api\/v1|\/healthz).*/, (req, res) => {
    res.sendFile(webIndexPath);
  });
}

// Global Express error handler — catches anything that slips through route-level try/catch
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[UNHANDLED EXPRESS ERROR]", err);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Process-level crash guards — prevent the server from dying on unexpected errors
process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason);
});

app.listen((process.env.PORT as unknown as number) || 4000, "0.0.0.0", () => {
  console.log(
    `API server running on http://localhost:${process.env.PORT || 4000}`,
  );
});
export default app;
