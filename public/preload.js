const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  // Listeners
  onJobsUpdate: (callback) =>
    ipcRenderer.on("jobs-update", (event, data) => callback(data)),
  onAuthError: (callback) =>
    ipcRenderer.on("auth-error", (event, msg) => callback(msg)),
  onConnectionError: (callback) =>
    ipcRenderer.on("connection-error", (event, msg) => callback(msg)),

  // Actions
  getPrinters: () => ipcRenderer.invoke("get-printers"),
  processJob: (data) => ipcRenderer.invoke("process-job", data), // data = { job, printerName }
  markCompleted: (jobId) => ipcRenderer.invoke("mark-completed", jobId),
  rejectJob: (data) => ipcRenderer.invoke("reject-job", data),

  // Utils
  openExternal: (url) => ipcRenderer.send("open-external", url), // If needed for preview
});
