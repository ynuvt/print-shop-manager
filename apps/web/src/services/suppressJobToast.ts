// When the user performs an action on a job locally (delete, change shop), we
// already show our own confirmation toast. The backend then emits a
// `job-status-updated` socket event for that same job, which would otherwise
// produce a second, redundant toast. We briefly mark such jobs here so the
// socket listener can skip them. Shop-initiated status changes are NOT marked,
// so those still notify the user as normal.

const suppressed = new Map<string, number>();

export function suppressJobToast(jobId: string, windowMs = 8000): void {
  suppressed.set(jobId, Date.now() + windowMs);
}

// Returns true if a toast for this job should be suppressed. Consumes the entry
// so it only suppresses the single expected follow-up event.
export function isJobToastSuppressed(jobId: string): boolean {
  const expiresAt = suppressed.get(jobId);
  if (expiresAt === undefined) return false;
  suppressed.delete(jobId);
  return Date.now() <= expiresAt;
}
