import { prisma } from "@printowl/db";
import { JobSchema, JobUpdateSchema } from "@printowl/types";
import express from "express";
import socket from "../config/socket.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import type { ExtendedRequest } from "../middleware/authMiddleware.js";

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

function buildPrintJobCreateData(job: {
  userId: string;
  files: Array<{
    name: string;
    pages: number;
    url: string;
    options: {
      paperSize: string;
      colorMode: "bw" | "color";
      pageRange: "all" | "custom";
      customRange?: string;
      duplex: "one" | "both";
      copies: number;
    };
    cost: number;
  }>;
  totalCost: number;
  totalPages: number;
  estimatedTime: number;
  status: "processing" | "completed" | "rejected" | "failed";
}) {
  return {
    userId: job.userId,
    totalCost: job.totalCost,
    totalPages: job.totalPages,
    estimatedTime: job.estimatedTime,
    status: mapStatus(job.status),
    files: {
      create: job.files.map((file) => ({
        name: file.name,
        pages: file.pages,
        url: file.url,
        option: {
          create: {
            paperSize: file.options.paperSize === "A4" ? "A4" : "A4",
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
    console.log("Received job creation request:", req.body);
    const schema = JobSchema.safeParse({ ...req.body, userId: req.user!.uid });
    if (!schema.success) {
      return res.status(400).json({ error: schema.error });
    }
    const job = schema.data;
    try {
      const createdJob = await prisma.printJob.create({
        data: buildPrintJobCreateData(job),
      });
      res.status(201).json({
        message: "Job created successfully!",
        verificationCode: createdJob.verificationCode,
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Failed to create job." });
    } finally {
      socket.emit("job-created", "shop_id");
    }
  },
);

app.get("/all", authMiddleware(["admin"]), async (req, res) => {
  try {
    const jobs = await prisma.$connect().printJob.findMany();
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
      where: { id },
      data: { status: mapStatus(status) },
    });
    res.status(200).json(job);
  } catch (error) {
    res.status(500).json({ error: "Failed to update job status." });
  } finally {
    socket.emit("job-status-updated", userId);
  }
});

app.get("/user-jobs", authMiddleware(["customer", "admin"]), async (req, res) => {
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
});

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
      const job = await prisma.printJob.findUnique({
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

export default app;
