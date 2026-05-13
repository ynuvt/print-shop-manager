import { motion, AnimatePresence } from "framer-motion";
import type { ActivePrintJobState } from "../types";
import { X } from "lucide-react";

interface Props {
  activePrintJobs: ActivePrintJobState[];
  onClickJob: (printRunId: string) => void;
  onClearJob: (printRunId: string) => void;
}

function JobPill({
  job,
  onClick,
  onClear,
}: {
  job: ActivePrintJobState;
  onClick: () => void;
  onClear: () => void;
}) {
  const { verificationCode, phase, fileProgressMap, job: printJob, error } = job;
  const totalFiles = printJob?.files?.length ?? 1;

  const entries = Object.values(fileProgressMap ?? {});
  const overallPercent =
    entries.length > 0
      ? Math.round(entries.reduce((s, e) => s + e.percent, 0) / totalFiles)
      : 0;
  const completedFiles = entries.filter((e) => e.percent >= 100).length;

  const isActive = phase === "downloading" || phase === "printing";
  const isDone = phase === "completed";
  const isFailed = phase === "failed";

  // Phase-based styling
  let pillBg = "bg-gradient-to-r from-blue-600 to-indigo-600";
  let statusText = `Downloading ${completedFiles}/${totalFiles}`;
  let iconBg = "bg-blue-400/30";

  if (phase === "printing") {
    pillBg = "bg-gradient-to-r from-violet-600 to-purple-600";
    statusText = "Printing…";
    iconBg = "bg-violet-400/30";
  } else if (isDone) {
    pillBg = "bg-gradient-to-r from-emerald-600 to-green-600";
    statusText = "Completed ✓";
    iconBg = "bg-emerald-400/30";
  } else if (isFailed) {
    pillBg = "bg-gradient-to-r from-red-500 to-rose-600";
    statusText = error?.slice(0, 30) || "Failed";
    iconBg = "bg-red-400/30";
  }

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, x: 50, scale: 0.8 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
      whileHover={{ scale: 1.02 }}
      className="group relative"
    >
      <button
        type="button"
        onClick={onClick}
        className={`relative flex items-center gap-3 rounded-2xl ${pillBg} py-3 pl-3 pr-5 text-white shadow-2xl ring-1 ring-white/10 transition-all duration-200 hover:ring-white/20 active:scale-[0.97]`}
        style={{ minWidth: 220 }}
      >
        {/* Icon circle */}
        <div className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          {isActive ? (
            <>
              {/* Spinning loader */}
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12" cy="12" r="10"
                  stroke="currentColor" strokeWidth="2.5"
                  strokeDasharray="31.416" strokeDashoffset="8"
                  strokeLinecap="round" opacity="0.9"
                />
              </svg>
              {/* Ping */}
              <span className="absolute inset-0 animate-ping rounded-xl bg-white/10" />
            </>
          ) : isDone ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          )}
        </div>

        {/* Text content */}
        <div className="min-w-0 flex-1 text-left">
          <p className="text-sm font-black leading-tight tracking-wide">
            #{verificationCode}
          </p>
          <p className="text-[10px] font-bold leading-tight opacity-80 uppercase tracking-widest mt-1">
            {statusText}
          </p>
        </div>

        {/* Cost — right-aligned */}
        <span className="shrink-0 text-base font-black tabular-nums tracking-tight" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>
          ₹{(printJob?.totalCost ?? 0).toFixed(0)}
        </span>

        {/* Mini progress bar for downloading */}
        {phase === "downloading" && (
          <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden rounded-b-2xl bg-white/10">
            <div
              className="h-full rounded-b-2xl bg-white/50 transition-all duration-300 ease-out"
              style={{ width: `${overallPercent}%` }}
            />
          </div>
        )}

        {/* Shimmer for printing */}
        {phase === "printing" && (
          <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden rounded-b-2xl bg-white/10">
            <div className="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] bg-white/40 rounded-full" />
          </div>
        )}
      </button>

      {/* Dismiss × for completed/failed */}
      {(isDone || isFailed) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-gray-950 text-[10px] font-black text-white shadow-xl transition-all hover:scale-110 hover:bg-black"
          aria-label="Dismiss"
        >
          <X size={10} strokeWidth={3} />
        </button>
      )}
    </motion.div>
  );
}

export default function ActivePrintIndicator({
  activePrintJobs,
  onClickJob,
  onClearJob,
}: Props) {
  if (!Array.isArray(activePrintJobs) || activePrintJobs.length === 0)
    return null;

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col-reverse gap-3">
      <AnimatePresence mode="popLayout">
        {activePrintJobs.map((job) => (
          <JobPill
            key={job.printRunId}
            job={job}
            onClick={() => onClickJob(job.printRunId)}
            onClear={() => onClearJob(job.printRunId)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
