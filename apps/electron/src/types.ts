import type { JobStatus as BaseJobStatus, File } from "@printowl/types";

export type JobStatus = BaseJobStatus | "CANCELED";
export type { File };

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

declare global {
  interface Window {
    electronAPI: {
      downloadFiles: (
        files: { url: string; name: string }[],
      ) => Promise<string[]>;
      deleteFiles: (paths: string[]) => Promise<void>;
      listPrinters: () => Promise<PrinterInfo[]>;
      printPDF: (
        filePath: string,
        printer: string,
        options: any,
        meta?: { fileIndex: number; totalFiles: number },
      ) => Promise<void>;
      onDownloadProgress: (
        listener: (payload: {
          fileIndex: number;
          totalFiles: number;
          percent: number;
          fileName?: string;
        }) => void,
      ) => () => void;
      onPrintProgress: (
        listener: (payload: {
          fileIndex: number;
          totalFiles: number;
          percent: number;
          fileName?: string;
        }) => void,
      ) => () => void;
    };
  }
}
