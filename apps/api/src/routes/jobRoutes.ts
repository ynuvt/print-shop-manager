import { prisma } from "@printowl/db";
import { Job, JobSchema, JobUpdateSchema } from "@printowl/types";
import express from "express";
import socket from "../config/socket.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import type { ExtendedRequest } from "../middleware/authMiddleware.js";
import {
  analyzePrintJob,
  PrintJobAnalysisError,
} from "../utils/printJobAnalysis.js";
import { PrintJobStatus } from "../../../../packages/db/dist/generated/prisma/enums.js";

const app = express.Router();

function mapStatus(status: "processing" | "completed" | "rejected" | "failed") {
  switch (status) {
    case "processing":
      return "PROCESSING" as const;
    case "completed":
      return "COMPLETED" as const;
    case "rejected":
      return "REJECTED" as const;
    case "failed":
      return "FAILED" as const;
  }
}

function mapColorMode(colorMode: "bw" | "color") {
  return colorMode === "color" ? ("COLOR" as const) : ("BW" as const);
}

function mapPageRange(pageRange: "all" | "custom") {
  return pageRange === "custom" ? ("CUSTOM" as const) : ("ALL" as const);
}

function mapDuplex(duplex: "one" | "both") {
  return duplex === "both" ? ("BOTH" as const) : ("ONE" as const);
}

async function buildPrintJobCreateData(job: Job, userId: string) {
  const analyzedJob = await analyzePrintJob(job);

  return {
    userId: userId,
    totalCost: analyzedJob.totalCost,
    totalPages: analyzedJob.totalPages,
    estimatedTime: analyzedJob.estimatedTime,
    status: mapStatus(job.status),
    files: {
      create: analyzedJob.files.map((file) => ({
        name: file.name,
        pages: file.pages,
        url: file.url,
        option: {
          create: {
            paperSize: "A4" as const,
            colorMode: mapColorMode(file.options.colorMode),
            pageRange: mapPageRange(file.options.pageRange),
            customRange: file.options.customRange,
            duplex: mapDuplex(file.options.duplex),
            copies: file.options.copies,
          },
        },
      })),
    },
  };
}

app.post(
  "/create",
  authMiddleware(["admin", "customer"]),
  async (req: ExtendedRequest, res) => {
    const schema = JobSchema.safeParse({ ...req.body });
    if (!schema.success) {
      return res.status(400).json({ error: schema.error });
    }
    const job = schema.data;
    try {
      const createdJob = await prisma.printJob.create({
        data: await buildPrintJobCreateData(job, req.user!.uid),
      });
      res.status(201).json({
        message: "Job created successfully!",
        verificationCode: createdJob.verificationCode,
      });
    } catch (error) {
      console.log(error);
      if (error instanceof PrintJobAnalysisError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to create job." });
    } finally {
      socket.emit("job-created", "shop_id");
    }
  },
);

app.get("/all", authMiddleware(["admin"]), async (req, res) => {
  try {
    const jobs = await prisma.printJob.findMany();
    res.status(200).json(jobs);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch jobs." });
  }
});

app.put("/update-status/:id", authMiddleware(["admin"]), async (req, res) => {
  const { id } = req.params;
  const { status, userId } = req.body;
  const schema = JobUpdateSchema.safeParse({ id, status, userId });
  if (!schema.success) {
    return res.status(400).json({ error: schema.error });
  }
  try {
    const job = await prisma.printJob.update({
      where: { id: schema.data.id },
      data: { status: mapStatus(status) },
    });
    res.status(200).json(job);
  } catch (error) {
    res.status(500).json({ error: "Failed to update job status." });
  } finally {
    socket.emit("job-status-updated", userId);
  }
});

app.get(
  "/user-jobs",
  authMiddleware(["customer", "admin"]),
  async (req: ExtendedRequest, res) => {
    console.log("Fetching jobs for user:", req.user!.uid);
    try {
      const jobs = await prisma.printJob.findMany({
        where: { userId: req.user!.uid },
        include: {
          files: {
            include: {
              option: true,
            },
          },
        },
      });
      res.status(200).json(jobs);
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Failed to fetch user jobs." });
    }
  },
);

app.get(
  "/:verificationCode",
  authMiddleware(["admin", "customer"]),
  async (req, res) => {
    const { verificationCode } = req.params;
    if (isNaN(Number(verificationCode))) {
      return res
        .status(400)
        .json({ error: "Verification code must be a number." });
    }
    try {
      const job = await prisma.printJob.findFirst({
        where: {
          verificationCode: Number(verificationCode),
        },
        include: {
          files: {
            include: {
              option: true,
            },
          },
        },
      });
      if (!job) {
        return res.status(404).json({ error: "Job not found." });
      }
      res.status(200).json(job);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job." });
    }
  },
);

app.delete(
  "/delete/:id",
  authMiddleware(["admin", "customer"]),
  async (req: ExtendedRequest, res) => {
    const { id } = req.params;
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Job ID is required." });
    }
    let job;
    try {
      job = await prisma.printJob.update({
        where: { id: id },
        data: {
          status:
            req?.user.role === "admin"
              ? PrintJobStatus.REJECTED
              : PrintJobStatus.CANCELED,
          deleted: true,
        },
      });
      res.status(200).json({ message: "Job canceled successfully." });
    } catch (error) {
      res.status(500).json({ error: "Failed to cancel job." });
    } finally {
      if (req.user.role == "admin")
        socket.emit("job-status-updated", job?.userId);
    }
  },
);

export default app;
