export type JobStatus =
  | "PROCESSING"
  | "COMPLETED"
  | "REJECTED"
  | "FAILED"
  | "CANCELED";

export type ColorMode = "BW" | "COLOR";
export type Duplex = "ONE" | "BOTH";
export type PageRange = "ALL" | "CUSTOM";

export interface PrintOption {
  id: string;
  paperSize: "A4" | "A3" | "Letter" | "Legal";
  colorMode: ColorMode;
  pageRange: PageRange;
  customRange?: string | null;
  duplex: Duplex;
  copies: number;
}

export interface PrintFile {
  id: string;
  name: string;
  pages: number;
  url: string;
  option: PrintOption;
}

/** Returned by GET /api/v1/jobs/all — no files included */
export interface PrintJobSummary {
  id: string;
  userId: string;
  totalCost: number;
  totalPages: number;
  estimatedTime: number;
  status: JobStatus;
  verificationCode: number;
  createdAt: string;
  notified: boolean;
  deleted: boolean;
}

/** Returned by GET /api/v1/jobs/:verificationCode — files included */
export interface PrintJob extends PrintJobSummary {
  files: PrintFile[];
}
