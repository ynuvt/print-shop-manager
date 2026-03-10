import { prisma } from "@printowl/db";
import { JobSchema, JobUpdateSchema } from "@printowl/types";
import express from "express";
import socket from "../config/socket";
const app = express.Router();
app.post("/create", (req, res) => {
  const schema = JobSchema.safeParse(req.body);
  if (!schema.success) {
    return res.status(400).json({ error: schema.error });
  }
  const job = schema.data;
  try {
    prisma.$connect().printJob.create({ data: job });
    res.status(201).json({ message: "Job created successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Failed to create job." });
  } finally {
    socket.emit("job-created", "shop_id");
  }
});

app.get("/all", async (req, res) => {
  try {
    const jobs = await prisma.$connect().printJob.findMany();
    res.status(200).json(jobs);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch jobs." });
  }
});

app.get("/:otp", async (req, res) => {
  const { otp } = req.params;
  if (isNaN(Number(otp))) {
    return res.status(400).json({ error: "OTP must be a number." });
  }
  try {
    const job = await prisma.$connect().printJob.findUnique({
      where: {
        verificationOtp: Number(otp),
      },
    });
    if (!job) {
      return res.status(404).json({ error: "Job not found." });
    }
    res.status(200).json(job);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch job." });
  }
});

app.put("/update-status/:id", async (req, res) => {
  const { id } = req.params;
  const { status, userId } = req.body;
  const schema = JobUpdateSchema.safeParse({ id, status, userId });
  if (!schema.success) {
    return res.status(400).json({ error: schema.error });
  }
  try {
    const job = await prisma.$connect().printJob.update({
      where: { id },
      data: { status },
    });
    res.status(200).json(job);
  } catch (error) {
    res.status(500).json({ error: "Failed to update job status." });
  } finally {
    socket.emit("job-status-updated", userId);
  }
});

export default app;
