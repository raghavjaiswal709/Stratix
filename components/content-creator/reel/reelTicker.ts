// Drives the export render loop from a Web Worker timer instead of the main
// thread. requestAnimationFrame is fully suspended while a tab is hidden
// (its scheduling is tied to the compositor, which doesn't run for
// non-visible pages) and main-thread setTimeout/setInterval get throttled
// the longer a tab stays backgrounded — either can silently stretch or
// stall an in-progress export if the user switches tabs mid-recording.
// A Worker's timers are not subject to page-visibility throttling at all,
// so this keeps pacing accurate regardless of tab focus. Falls back to a
// main-thread setInterval if Worker/Blob creation is unavailable (e.g. a
// strict CSP that blocks blob: workers).
export function createTicker(intervalMs: number, onTick: () => void): { stop: () => void } {
  try {
    const workerSource = `setInterval(() => postMessage(0), ${Math.max(1, intervalMs)});`;
    const blob = new Blob([workerSource], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    worker.onmessage = () => onTick();
    let stopped = false;
    return {
      stop: () => {
        if (stopped) return;
        stopped = true;
        worker.terminate();
        URL.revokeObjectURL(url);
      },
    };
  } catch {
    const id = setInterval(onTick, intervalMs);
    let stopped = false;
    return {
      stop: () => {
        if (stopped) return;
        stopped = true;
        clearInterval(id);
      },
    };
  }
}
