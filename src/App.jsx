import React, { useState, useEffect, useMemo } from "react";
import {
  Printer,
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  RefreshCw,
  History,
  Bug,
} from "lucide-react";

const StatusBadge = ({ status }) => {
  const s = (status || "unknown").toLowerCase();

  const styles = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    downloading: "bg-blue-100 text-blue-800 border-blue-200",
    printing: "bg-purple-100 text-purple-800 border-purple-200",
    ready: "bg-green-100 text-green-800 border-green-200",
    completed: "bg-gray-100 text-gray-800 border-gray-200",
    rejected: "bg-red-100 text-red-800 border-red-200",
    error: "bg-red-500 text-white border-red-600",
  };

  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${
        styles[s] || "bg-gray-200 text-gray-800"
      }`}
    >
      {status || "Unknown"}
    </span>
  );
};

const JobCard = ({ job, onClick }) => {
  // Safe Accessors for new JSON structure
  const fileCount = job.files?.length || 0;
  const copies = job.options?.copies || job.printOptions?.copies || 1;
  const colorMode =
    job.options?.colorMode || job.printOptions?.colorMode || "bw";
  const displayCost = job.totalCost || job.cost || 0;
  const customerName = job.customerName || "Unknown Customer";
  const verificationCode = job.verificationCode || job.jobCode;

  return (
    <div
      onClick={onClick}
      className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md bg-white ${
        job.status?.toLowerCase() === "pending"
          ? "border-l-4 border-l-yellow-400"
          : "border-gray-200"
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="text-xl font-bold text-gray-800">
            #{verificationCode}
          </h3>
          <p className="text-sm text-gray-600 font-medium">{customerName}</p>
          <p className="text-xs text-gray-400">
            {job.createdAt?._seconds
              ? new Date(job.createdAt._seconds * 1000).toLocaleTimeString()
              : "Just now"}
          </p>
        </div>
        <StatusBadge status={job.status} />
      </div>

      <div className="flex items-center gap-2 mb-3">
        <FileText size={16} className="text-blue-500" />
        <span className="font-medium text-gray-700">
          {fileCount} File{fileCount !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex justify-between items-end border-t pt-3 mt-2">
        <div className="text-sm text-gray-600">
          <p>
            {copies} Copies • {colorMode.toUpperCase()}
          </p>
        </div>
        <div className="text-lg font-bold text-green-600">₹{displayCost}</div>
      </div>
    </div>
  );
};

function App() {
  const [jobs, setJobs] = useState([]);
  const [filteredJobs, setFilteredJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentTab, setCurrentTab] = useState("queue");
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    if (window.electron) {
      window.electron.onJobsUpdate((data) => {
        setJobs(data);
      });
      window.electron.onAuthError((msg) => setError(msg));
      window.electron.onConnectionError((msg) => setError(msg));

      const loadPrinters = async () => {
        const list = await window.electron.getPrinters();
        setPrinters(list);
        const def = list.find((p) => p.isDefault) || list[0];
        if (def) setSelectedPrinter(def.deviceId || def.name);
      };
      loadPrinters();
    } else {
      setError("Electron bridge failed. Check preload.js");
    }
  }, []);

  useEffect(() => {
    let result = jobs;

    if (currentTab === "queue") {
      // Show Pending, Processing, Ready, Error
      result = result.filter((j) => {
        const s = (j.status || "").toLowerCase();
        return !["completed", "rejected"].includes(s);
      });
    } else {
      // Show History
      result = result.filter((j) => {
        const s = (j.status || "").toLowerCase();
        return ["completed", "rejected"].includes(s);
      });
    }

    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(
        (j) =>
          j.verificationCode?.toString().toLowerCase().includes(lowerTerm) ||
          j.jobCode?.toString().toLowerCase().includes(lowerTerm) ||
          j.customerPhone?.includes(lowerTerm) ||
          j.customerName?.toLowerCase().includes(lowerTerm)
      );
    }

    setFilteredJobs(result);
  }, [jobs, searchTerm, currentTab]);

  const handleApproveAndPrint = async () => {
    if (!selectedJob || !selectedPrinter) return;
    setProcessingId(selectedJob.id);

    // Add try-catch safety net to UI
    try {
      const result = await window.electron.processJob({
        job: selectedJob,
        printerName: selectedPrinter,
      });

      if (!result.success) {
        alert(`Print Failed: ${result.error}`);
      }
    } catch (e) {
      alert(`System Error: ${e.message}`);
    } finally {
      setProcessingId(null);
      setSelectedJob(null);
    }
  };

  const handleMarkCompleted = async () => {
    if (!selectedJob) return;
    await window.electron.markCompleted(selectedJob.id);
    setSelectedJob(null);
  };

  const handleReject = async () => {
    const reason = prompt("Enter reason for rejection:");
    if (reason) {
      await window.electron.rejectJob({ jobId: selectedJob.id, reason });
      setSelectedJob(null);
    }
  };

  const stats = useMemo(() => {
    return {
      total: jobs.length,
      pending: jobs.filter(
        (j) =>
          !["completed", "rejected"].includes((j.status || "").toLowerCase())
      ).length,
    };
  }, [jobs]);

  // --- HELPER FOR BUTTON LOGIC ---
  const renderModalActions = () => {
    const status = (selectedJob.status || "").toLowerCase();

    // 1. READY -> Show HANDOVER (This is the Priority Success State)
    if (status === "ready") {
      return (
        <button
          onClick={handleMarkCompleted}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold shadow-md flex items-center justify-center gap-2 animate-pulse"
        >
          <CheckCircle size={20} /> Handover to Customer
        </button>
      );
    }

    // 2. HISTORY -> Show Closed
    if (["completed", "rejected"].includes(status)) {
      return (
        <span className="text-center w-full text-gray-500 text-sm font-medium">
          This order is in History ({status}).
        </span>
      );
    }

    // 3. PENDING, ERROR, OR STUCK PROCESSING -> Show APPROVE/RETRY
    // We group 'downloading' and 'printing' here so you can 'Force Print' if it gets stuck.
    return (
      <button
        onClick={handleApproveAndPrint}
        disabled={!!processingId}
        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-bold shadow-md flex items-center justify-center gap-2"
      >
        {processingId === selectedJob.id ? (
          <RefreshCw className="animate-spin" />
        ) : (
          <Printer />
        )}
        {["downloading", "printing"].includes(status)
          ? "Retry Print"
          : "Approve & Print"}
      </button>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 text-slate-800 font-sans">
      {/* Header */}
      <header className="bg-white shadow-sm px-6 py-4 flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white p-2 rounded-lg">
            <Printer size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              Cloud Print Manager
            </h1>
            <p className="text-xs text-green-600 flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Connected
            </p>
          </div>
        </div>

        <div className="flex gap-8">
          <div className="text-center">
            <p className="text-gray-400 text-xs font-bold">RAW DATA</p>
            <p className="font-mono text-gray-600">{stats.total} Fetched</p>
          </div>
          <div className="text-center">
            <p className="text-gray-500 text-xs uppercase font-bold tracking-wide">
              Pending
            </p>
            <p className="font-bold text-xl text-yellow-600">{stats.pending}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setCurrentTab("queue")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              currentTab === "queue"
                ? "bg-white text-blue-600 shadow"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Active Queue
          </button>
          <button
            onClick={() => setCurrentTab("history")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              currentTab === "history"
                ? "bg-white text-blue-600 shadow"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <History size={16} /> History
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col p-6 max-w-7xl mx-auto w-full">
        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-4 flex items-center gap-2 border border-red-200">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex justify-between mb-6">
          <div className="relative w-96">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search by ID"
              className="w-full pl-10 pr-4 py-2 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Printer size={16} className="text-gray-400" />
            <select
              className="border rounded px-3 py-2 text-sm bg-white outline-none focus:border-blue-500"
              value={selectedPrinter}
              onChange={(e) => setSelectedPrinter(e.target.value)}
            >
              {printers.map((p, i) => (
                <option key={i} value={p.deviceId || p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto">
          {filteredJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full pb-32 text-gray-400">
              <Bug size={48} className="mb-4 opacity-50 text-red-300" />
              <p>No jobs visible in {currentTab} list.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
              {filteredJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onClick={() => setSelectedJob(job)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-gray-50 border-b px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800">
                  #{selectedJob.verificationCode || selectedJob.jobCode}
                </h2>
                <span className="text-sm text-gray-500">
                  Phone: {selectedJob.customerPhone}
                </span>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1 mb-3">
                <p className="text-sm text-gray-500">Customer Name</p>
                <p className="font-bold text-lg text-gray-800">
                  {selectedJob.customerName || "Unknown Customer"}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-700 mb-2">
                  Files:
                </p>
                {(selectedJob.files || []).map((file, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100"
                  >
                    <FileText
                      className="text-blue-600 mt-1 flex-shrink-0"
                      size={20}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-blue-900 truncate">
                        {file.name || "Unknown File"}
                      </p>
                      <div className="flex gap-4 mt-1 text-xs text-gray-600">
                        <span>{file.pages || 0} pages</span>
                        <span className="font-semibold text-green-600">
                          ₹{file.price || file.cost || file.totalCost || 0}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const fileUrl =
                            file.url || file.fileUrl || file.downloadUrl;
                          if (!fileUrl) {
                            alert("File URL not available");
                            return;
                          }
                          const result = await window.electron.openFile({
                            fileUrl: fileUrl,
                          });
                          if (!result.success) {
                            alert(`Failed to open file: ${result.error}`);
                          }
                        } catch (error) {
                          alert(`Error opening file: ${error.message}`);
                        }
                      }}
                      className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded font-medium flex-shrink-0"
                    >
                      View Doc
                    </button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm pt-3 border-t">
                <div className="space-y-1">
                  <p className="text-gray-500">Status</p>
                  <p className="font-bold text-gray-900 capitalize">
                    {selectedJob.status}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-gray-500">Total Cost</p>
                  <p className="font-bold text-green-600 text-xl">
                    ₹{selectedJob.totalCost || selectedJob.cost || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 flex justify-between items-center gap-3">
              <button
                onClick={handleReject}
                className="px-4 py-2 text-red-600 hover:bg-red-50 font-medium rounded-lg"
              >
                Reject
              </button>

              {/* Dynamic Action Buttons */}
              {renderModalActions()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
