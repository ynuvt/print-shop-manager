import z from "zod";
import { fileSchema } from "./fileValidator.js";

const JobSchema = z.object({
  files: z.array(fileSchema),
  totalCost: z.number(),
  totalPages: z.number(),
  estimatedTime: z.number(),
  status: z.enum(["processing", "completed", "rejected", "failed"]),
  verificationCode: z.string().regex(/^\d{4}$/),
});

const JobUpdateSchema = z.object({
  id: z.string(),
  status: z.enum(["processing", "completed", "rejected", "failed"]),
  userId: z.string(),
});
export type JobUpdate = z.infer<typeof JobUpdateSchema>;
export type Job = z.infer<typeof JobSchema>;
export { JobSchema, JobUpdateSchema };
