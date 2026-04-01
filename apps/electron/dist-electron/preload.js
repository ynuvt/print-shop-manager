"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("electronAPI", {
    downloadFiles: (files) => electron_1.ipcRenderer.invoke("download-files", files),
    downloadFile: (file, meta) => electron_1.ipcRenderer.invoke("download-file", file, meta),
    deleteFiles: (paths) => electron_1.ipcRenderer.invoke("delete-files", paths),
    listPrinters: () => electron_1.ipcRenderer.invoke("list-printers"),
    printPDF: (filePath, printer, options, meta) => electron_1.ipcRenderer.invoke("print-pdf", filePath, printer, options, meta),
    onDownloadProgress: (listener) => {
        const handler = (_event, payload) => listener(payload);
        electron_1.ipcRenderer.on("download-progress", handler);
        return () => electron_1.ipcRenderer.removeListener("download-progress", handler);
    },
    onPrintProgress: (listener) => {
        const handler = (_event, payload) => listener(payload);
        electron_1.ipcRenderer.on("print-progress", handler);
        return () => electron_1.ipcRenderer.removeListener("print-progress", handler);
    },
});
