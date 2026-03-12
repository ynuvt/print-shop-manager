import z from "zod";

const optionsSchema = z.object({
  paperSize: z.enum(["A4"]),
  colorMode: z.enum(["bw", "color"]),
  pageRange: z.enum(["all", "custom"]),
  customRange: z.string().optional(),
  customRangeError: z.string().optional(),
  duplex: z.enum(["one", "both"]),
  copies: z.number(),
});

const fileSchema = z.object({
  name: z.string(),
  pages: z.number(),
  url: z.string().url(),
  options: optionsSchema,
  cost: z.number(),
});
export type File = z.infer<typeof fileSchema>;
export type PrintFileOption = z.infer<typeof optionsSchema>;
export { fileSchema, optionsSchema };
