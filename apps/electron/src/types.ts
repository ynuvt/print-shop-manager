import type { JobStatus as BaseJobStatus, File } from "@printowl/types";

export type JobStatus = BaseJobStatus | "CANCELED";
export type { File };

export interface BatchPrintFileConfig {
  path: string;
  copies: number;
  paperSize: string;
  colorMode: string;
  duplex: string;
  orientation: string;
  pagesPerSheet: number;
  id: string;
}

export interface BatchPrintProgressEvent {
  fileId: string;
  percent: number;
  printRunId?: string;
}

export interface PrintJobSummary {
  id: string;
  userId: string;
  totalCost: number;
  totalPages: number;
  estimatedTime: number;
  status: JobStatus;
  verificationCode: string;
  createdAt: string;
  notified: boolean;
  deleted: boolean;
}

export interface PrintJob extends PrintJobSummary {
  files: File[];
}

export type PrinterInfo = { name: string; isDefault: boolean };

/** Per-file download progress entry */
export interface FileDownloadEntry {
  fileIndex: number;
  fileName: string;
  percent: number;
}

/** State of a print job executing in the background */
export interface ActivePrintJobState {
  printRunId: string;
  jobId: string;
  verificationCode: string;
  job: PrintJob;
  phase: "downloading" | "printing" | "completed" | "failed";
  fileProgressMap: Record<string, FileDownloadEntry>;
  printProgress: {
    fileIndex: number;
    totalFiles: number;
    percent: number;
    fileName?: string;
  } | null;
  error: string | null;
}

declare global {
  interface Window {
    electronAPI: {
      downloadFiles: (
        files: { url: string; name: string }[],
      ) => Promise<string[]>;
      downloadFile: (
        file: { url: string; name: string },
        meta?: { fileIndex?: number; totalFiles?: number; printRunId?: string },
      ) => Promise<string>;
      deleteFiles: (paths: string[]) => Promise<void>;
      listPrinters: () => Promise<PrinterInfo[]>;
      printPDF: (
        filePath: string,
        printer: string,
        options: any,
        meta?: { fileIndex: number; totalFiles: number; printRunId?: string },
      ) => Promise<void>;
      onDownloadProgress: (
        listener: (payload: {
          fileIndex: number;
          totalFiles: number;
          percent: number;
          fileName?: string;
          fileId?: string;
          printRunId?: string;
        }) => void,
      ) => () => void;
      onPrintProgress: (
        listener: (payload: {
          fileIndex: number;
          totalFiles: number;
          percent: number;
          fileName?: string;
          printRunId?: string;
        }) => void,
      ) => () => void;
      printBatch: (
        printer: string,
        files: BatchPrintFileConfig[],
        meta?: { printRunId?: string }
      ) => Promise<void>;
      onBatchPrintProgress: (
        listener: (payload: BatchPrintProgressEvent) => void
      ) => () => void;
    };
  }
}
