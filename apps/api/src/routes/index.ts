import express from "express";
import jobRoutes from "./jobRoutes.js";
import authRoutes from "./authRoutes.js";
const app = express.Router();

app.use("/auth", authRoutes);
app.use("/jobs", jobRoutes);

export default app;
