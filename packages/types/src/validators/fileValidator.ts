import z from "zod";

const optionsSchema = z.object({
  paperSize: z.enum(["A4"]),
  colorMode: z.enum(["BW", "COLOR"]),
  orientation: z.enum(["PORTRAIT", "LANDSCAPE"]),
  scaleMode: z.enum(["FIT", "SHRINK", "NOSCALE"]),
  pageRange: z.enum(["ALL", "CUSTOM"]),
  customRange: z.string().optional(),
  customRangeError: z.string().optional(),
  duplex: z.enum(["ONE", "BOTH"]),
  copies: z.number(),
  // N-up layout. Only supported via loadWebContent (webContents.print). Defaults to 1.
  pagesPerSheet: z.number().int().min(1).optional().default(1),
});

const fileSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  pages: z.number(),
  url: z.string().url(),
  option: optionsSchema,
  cost: z.number(),
});
export type File = z.infer<typeof fileSchema>;
export type PrintFileOption = z.infer<typeof optionsSchema>;
export { fileSchema, optionsSchema };
