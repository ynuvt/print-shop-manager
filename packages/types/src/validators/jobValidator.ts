import z from "zod";
import { fileSchema } from "./fileValidator.js";

const JobStatusEnum = [
  "PROCESSING",
  "PENDING",
  "COMPLETED",
  "REJECTED",
  "FAILED",
  "CANCELED",
] as const;
export type JobStatus = (typeof JobStatusEnum)[number];

const JobSchema = z.object({
  files: z.array(fileSchema),
  totalCost: z.number(),
  totalPages: z.number(),
  estimatedTime: z.number(),
  status: z.enum(JobStatusEnum),
  verificationCode: z.string().regex(/^\d{4}$/),
});

const JobUpdateSchema = z.object({
  id: z.string(),
  status: z.enum(JobStatusEnum),
  userId: z.string(),
});
export type JobUpdate = z.infer<typeof JobUpdateSchema>;
export type Job = z.infer<typeof JobSchema>;
export { JobSchema, JobUpdateSchema };
