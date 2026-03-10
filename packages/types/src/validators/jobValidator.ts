import z from "zod";

const JobSchema = z.object({
  userId: z.string(),
  files: z.array(
    z.object({
      name: z.string(),
      pages: z.number(),
      url: z.string().url(),
      options: z.object({
        paperSize: z.string(),
        colorMode: z.enum(["bw", "color"]),
        pageRange: z.enum(["all", "custom"]),
        customRange: z.string().optional(),
        customRangeError: z.string().optional(),
        duplex: z.enum(["one", "both"]),
        copies: z.number(),
      }),
      cost: z.number(),
    }),
  ),
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
