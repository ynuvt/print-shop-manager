import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  downloadFiles: (files: { url: string; name: string }[]) =>
    ipcRenderer.invoke("download-files", files),
  downloadFile: (
    file: { url: string; name: string },
    meta?: { fileIndex?: number; totalFiles?: number; printRunId?: string },
  ) => ipcRenderer.invoke("download-file", file, meta),
  deleteFiles: (paths: string[]) => ipcRenderer.invoke("delete-files", paths),
  listPrinters: () => ipcRenderer.invoke("list-printers"),
  printPDF: (
    filePath: string,
    printer: string,
    options: any,
    meta?: { fileIndex: number; totalFiles: number; printRunId?: string },
  ) => ipcRenderer.invoke("print-pdf", filePath, printer, options, meta),
  onDownloadProgress: (
    listener: (payload: {
      fileIndex: number;
      totalFiles: number;
      percent: number;
      fileName?: string;
      fileId?: string;
      printRunId?: string;
    }) => void,
  ) => {
    const handler = (_event: unknown, payload: any) => listener(payload);
    ipcRenderer.on("download-progress", handler);
    return () => ipcRenderer.removeListener("download-progress", handler);
  },
  onPrintProgress: (
    listener: (payload: {
      fileIndex: number;
      totalFiles: number;
      percent: number;
      fileName?: string;
      printRunId?: string;
    }) => void,
  ) => {
    const handler = (_event: unknown, payload: any) => listener(payload);
    ipcRenderer.on("print-progress", handler);
    return () => ipcRenderer.removeListener("print-progress", handler);
  },
});
