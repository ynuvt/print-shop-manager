import React, { useState, useEffect, useMemo } from "react";
import {
  Printer,
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Settings,
  RefreshCw,
  History,
  Clock,
} from "lucide-react";

const StatusBadge = ({ status }) => {
  const styles = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    downloading: "bg-blue-100 text-blue-800 border-blue-200",
    printing: "bg-purple-100 text-purple-800 border-purple-200",
    ready: "bg-green-100 text-green-800 border-green-200",
    completed: "bg-gray-100 text-gray-800 border-gray-200",
    rejected: "bg-red-100 text-red-800 border-red-200",
    error: "bg-red-500 text-white border-red-600",
  };

  const labels = {
    pending: "Needs Approval",
    downloading: "Downloading...",
    printing: "Printing...",
    ready: "Ready for Pickup",
    completed: "History (Handed Over)",
    rejected: "Rejected",
    error: "Error",
  };

  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${
        styles[status] || styles.pending
      }`}
    >
      {labels[status] || status}
    </span>
  );
};

const JobCard = ({ job, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
        job.status === "pending"
          ? "bg-white border-l-4 border-l-yellow-400"
          : "bg-white border-gray-200"
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="text-xl font-bold text-gray-800">#{job.jobCode}</h3>
          <p className="text-sm text-gray-500">
            {job.createdAt?._seconds
              ? new Date(job.createdAt._seconds * 1000).toLocaleTimeString()
              : "Just now"}
          </p>
        </div>
        <StatusBadge status={job.status} />
      </div>

      <div className="flex items-center gap-2 mb-3">
        <FileText size={16} className="text-blue-500" />
        <span className="font-medium text-gray-700 truncate max-w-[200px]">
          {job.fileName}
        </span>
      </div>

      <div className="flex justify-between items-end border-t pt-3 mt-2">
        <div className="text-sm text-gray-600">
          <p>
            {job.printOptions.copies} Copies •{" "}
            {job.printOptions.colorMode.toUpperCase()}
          </p>
        </div>
        <div className="text-lg font-bold text-green-600">₹{job.cost}</div>
      </div>
    </div>
  );
};

function App() {
  const [jobs, setJobs] = useState([]);
  const [filteredJobs, setFilteredJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentTab, setCurrentTab] = useState("queue"); // 'queue' (pending/ready) or 'history' (completed/rejected)
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    window.electron.onJobsUpdate((data) => setJobs(data));
    window.electron.onAuthError((msg) => setError(msg));
    window.electron.onConnectionError((msg) => setError(msg));

    const loadPrinters = async () => {
      const list = await window.electron.getPrinters();
      setPrinters(list);
      const def = list.find((p) => p.isDefault) || list[0];
      if (def) setSelectedPrinter(def.deviceId || def.name);
    };
    loadPrinters();
  }, []);

  // --- Revised Filtering Logic ---
  useEffect(() => {
    let result = jobs;

    // 1. Tab Logic
    if (currentTab === "queue") {
      // Queue shows Pending, Printing, and Ready jobs
      result = result.filter((j) =>
        ["pending", "printing", "downloading", "ready", "error"].includes(
          j.status
        )
      );
    } else {
      // History shows Completed and Rejected
      result = result.filter((j) =>
        ["completed", "rejected"].includes(j.status)
      );
    }

    // 2. Search Logic
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(
        (j) =>
          j.jobCode?.toString().includes(lowerTerm) ||
          j.customerPhone?.includes(lowerTerm)
      );
    }

    setFilteredJobs(result);
  }, [jobs, searchTerm, currentTab]);

  const handleApproveAndPrint = async () => {
    if (!selectedJob || !selectedPrinter) return;
    setProcessingId(selectedJob.id);
    const result = await window.electron.processJob({
      job: selectedJob,
      printerName: selectedPrinter,
    });
    if (!result.success) alert(`Print Failed: ${result.error}`);
    setProcessingId(null);
    setSelectedJob(null);
  };

  const handleMarkCompleted = async () => {
    if (!selectedJob) return;
    // This moves it from 'queue' tab to 'history' tab
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
    const today = new Date().setHours(0, 0, 0, 0);
    const todayJobs = jobs.filter((j) => {
      const jobDate = j.createdAt?._seconds * 1000;
      return (
        jobDate > today && (j.status === "completed" || j.status === "ready")
      );
    });
    return {
      pending: jobs.filter((j) => j.status === "pending").length,
      revenue: todayJobs.reduce((acc, curr) => acc + (curr.cost || 0), 0),
    };
  }, [jobs]);

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
              Live Sync Active
            </p>
          </div>
        </div>

        <div className="flex gap-8">
          <div className="text-center">
            <p className="text-gray-500 text-xs uppercase font-bold tracking-wide">
              Queue
            </p>
            <p className="font-bold text-xl text-yellow-600">
              {stats.pending} Jobs
            </p>
          </div>
          <div className="text-center">
            <p className="text-gray-500 text-xs uppercase font-bold tracking-wide">
              Today's Revenue
            </p>
            <p className="font-bold text-xl text-green-600">₹{stats.revenue}</p>
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
              placeholder="Search by Job Code (4721)..."
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
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Clock size={48} className="mb-4 opacity-50" />
              <p>
                No jobs in {currentTab === "queue" ? "active queue" : "history"}
              </p>
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
            {/* Modal Header */}
            <div className="bg-gray-50 border-b px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800">
                  #{selectedJob.jobCode}
                </h2>
                <span className="text-sm text-gray-500">
                  Customer: {selectedJob.customerPhone}
                </span>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle size={24} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                <FileText className="text-blue-600 mt-1" size={24} />
                <div className="flex-1">
                  <p className="font-semibold text-blue-900 break-all">
                    {selectedJob.fileName}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-gray-500">Mode</p>
                  <p className="font-bold text-gray-900 capitalize">
                    {selectedJob.printOptions.colorMode === "bw"
                      ? "Black & White"
                      : "Color"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-gray-500">Sides</p>
                  <p className="font-bold text-gray-900 capitalize">
                    {selectedJob.printOptions.duplex === "two-sided"
                      ? "Duplex"
                      : "Single"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-gray-500">Copies</p>
                  <p className="font-bold text-gray-900">
                    {selectedJob.printOptions.copies}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-gray-500">Total Cost</p>
                  <p className="font-bold text-green-600 text-lg">
                    ₹{selectedJob.cost}
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 flex justify-between items-center gap-3">
              {/* STATUS: PENDING -> Show Approve */}
              {selectedJob.status === "pending" && (
                <>
                  <button
                    onClick={handleReject}
                    className="px-4 py-2 text-red-600 hover:bg-red-50 font-medium rounded-lg"
                  >
                    Reject
                  </button>
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
                    Approve & Print
                  </button>
                </>
              )}

              {/* STATUS: READY -> Show Handover */}
              {selectedJob.status === "ready" && (
                <button
                  onClick={handleMarkCompleted}
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold shadow-md flex items-center justify-center gap-2"
                >
                  <CheckCircle size={20} /> Handover to Customer
                </button>
              )}

              {/* STATUS: COMPLETED -> Show Closed */}
              {["completed", "rejected"].includes(selectedJob.status) && (
                <span className="text-center w-full text-gray-500 text-sm font-medium">
                  This order is in History.
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
