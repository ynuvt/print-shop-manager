import express from "express";
import jobRoutes from "./jobRoutes.js";
import authRoutes from "./authRoutes.js";
import userRoutes from "./userRoutes.js";
import fileRoutes from "./fileRoutes.js";
import analysisRoutes from "./analysisRoutes.js";
import maintenanceRoutes from "./maintenanceRoutes.js";
const app = express.Router();

app.use("/auth", authRoutes);
app.use("/jobs", jobRoutes);
app.use("/users", userRoutes);
app.use("/files", fileRoutes);
app.use("/analysis", analysisRoutes);
app.use("/maintenance", maintenanceRoutes);
app.use("/webhooks", (await import("./webhookRoutes.js")).default);
export default app;
