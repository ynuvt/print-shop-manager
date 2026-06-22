import { prisma } from "@printowl/db";

import socket from "../config/socket.js";
import { FileConversionStatus } from "../../../../packages/db/dist/generated/prisma/enums.js";

// Files normally convert in seconds. If one is still PENDING well past any
// reasonable conversion time, the background job likely died (e.g. a process
// restart mid-conversion). Mark it FAILED so the UI stops waiting forever.
const STUCK_AFTER_MS = 5 * 60 * 1000; // 5 minutes
const SWEEP_INTERVAL_MS = 2 * 60 * 1000; // every 2 minutes

async function sweepStuckPendingFiles(): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS);
  try {
    const stuck = await prisma.file.findMany({
      where: {
        conversionStatus: FileConversionStatus.PENDING,
        createdAt: { lt: cutoff },
      },
      select: { id: true, printJobId: true, printJob: { select: { userId: true } } },
    });
    if (stuck.length === 0) return;

    await prisma.file.updateMany({
      where: { id: { in: stuck.map((f) => f.id) } },
      data: { conversionStatus: FileConversionStatus.FAILED },
    });

    // Notify connected clients so the stuck files flip out of the "converting" state.
    const notified = new Set<string>();
    for (const f of stuck) {
      if (!notified.has(f.printJobId)) {
        notified.add(f.printJobId);
        socket.emit("job-file-added", f.printJobId);
      }
      const userId = f.printJob?.userId;
      if (userId && !notified.has(userId)) {
        notified.add(userId);
        socket.emit("job-file-added", userId);
      }
    }
    console.warn(
      `[pending-sweeper] Marked ${stuck.length} stuck PENDING file(s) as FAILED.`,
    );
  } catch (err) {
    console.error("[pending-sweeper] sweep failed:", err);
  }
}

export function startPendingFileSweeper(): void {
  const timer = setInterval(() => {
    void sweepStuckPendingFiles();
  }, SWEEP_INTERVAL_MS);
  // Don't keep the event loop alive solely for the sweeper.
  timer.unref?.();
}
