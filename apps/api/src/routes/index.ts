import express from "express";
import jobRoutes from "./jobRoutes.js";
import authRoutes from "./authRoutes.js";
import userRoutes from "./userRoutes.js";
const app = express.Router();

app.use("/auth", authRoutes);
app.use("/jobs", jobRoutes);
app.use("/users", userRoutes);

export default app;
