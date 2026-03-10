import z from "zod";
// {
//   userId: string,          // user.uid
//   files: [                 // array of uploaded files
//     {
//       name: string,        // original file name
//       pages: number,       // total pages in file
//       url: string,         // Firebase Storage download URL
//       options: {
//         paperSize: string,       // "A4"
//         colorMode: string,       // "bw" | "color"
//         pageRange: string,       // "all" | "custom"
//         customRange: string,     // e.g. "1-5,8,10-12"
//         customRangeError: string,
//         duplex: string,          // "one" | "both"
//         copies: number,
//       },
//       cost: number,        // cost for this specific file
//     }
//   ],
//   totalCost: number,       // sum of all files cost
//   totalPages: number,      // sum of all files pages
//   estimatedTime: number,   // Math.ceil(totalPages * 0.2) in minutes
//   status: string,          // "processing" | "completed" | "rejected" | "failed"
//   verificationCode: string, // 4-digit code e.g. "4821"
//   createdAt: Timestamp,    // Firebase serverTimestamp()
//   notified: boolean,       // false on creation, true after completion notify
// }

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
  createdAt: z.date(),
  notified: z.boolean(),
});

const JobUpdateSchema = z.object({
  id: z.string(),
  status: z.enum(["processing", "completed", "rejected", "failed"]),
  userId: z.string(),
});
export type JobUpdate = z.infer<typeof JobUpdateSchema>;
export type Job = z.infer<typeof JobSchema>;
export { JobSchema, JobUpdateSchema };
