"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle, XCircle, ExternalLink, Clock } from "lucide-react";
import { format } from "date-fns";

type SyncStatus = "idle" | "triggering" | "queued" | "in_progress" | "completed" | "failed";

interface SyncRun {
  id: number;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
}

interface SyncButtonProps {
  onComplete?: () => void;
}

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_MS = 120_000; // 2 minutes

const STATUS_LABEL: Record<SyncStatus, string> = {
  idle: "Sync MT5",
  triggering: "Triggering…",
  queued: "Queued…",
  in_progress: "Syncing…",
  completed: "Synced",
  failed: "Retry Sync",
};

export function SyncButton({ onComplete }: SyncButtonProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [run, setRun] = useState<SyncRun | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  const clearPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const applyRun = useCallback(
    (data: SyncRun, onDone?: () => void) => {
      setRun(data);
      if (data.status === "queued") {
        setSyncStatus("queued");
      } else if (data.status === "in_progress") {
        setSyncStatus("in_progress");
      } else if (data.status === "completed") {
        clearPoll();
        const final: SyncStatus = data.conclusion === "success" ? "completed" : "failed";
        setSyncStatus(final);
        setLastSynced(data.updated_at);
        if (final === "completed") onDone?.();
      }
    },
    [],
  );

  // On mount: check for an existing recent run to show last-synced info
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/sync/status");
        if (!res.ok) return;
        const { run: latestRun } = await res.json();
        if (latestRun?.status === "completed") {
          setRun(latestRun);
          setSyncStatus(latestRun.conclusion === "success" ? "completed" : "failed");
          setLastSynced(latestRun.updated_at);
        }
      } catch {
        // ignore — non-blocking
      }
    })();
  }, []);

  const startPolling = useCallback(() => {
    clearPoll();
    pollStartRef.current = Date.now();

    pollRef.current = setInterval(async () => {
      if (Date.now() - pollStartRef.current > MAX_POLL_MS) {
        clearPoll();
        setSyncStatus("failed");
        setError("Sync timed out. Check GitHub Actions for the run status.");
        return;
      }

      try {
        const res = await fetch("/api/sync/status");
        if (!res.ok) return;
        const { run: latestRun } = await res.json();
        if (latestRun) applyRun(latestRun, onComplete);
      } catch {
        // network hiccup — keep polling
      }
    }, POLL_INTERVAL_MS);
  }, [applyRun, onComplete]);

  const handleSync = async () => {
    setError(null);
    setSyncStatus("triggering");

    try {
      const res = await fetch("/api/sync/trigger", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to trigger sync");
      }
      setSyncStatus("queued");
      startPolling();
    } catch (err) {
      setSyncStatus("failed");
      setError(err instanceof Error ? err.message : "Failed to trigger sync");
    }
  };

  // Clean up on unmount
  useEffect(() => () => clearPoll(), []);

  const isActive = (["triggering", "queued", "in_progress"] as SyncStatus[]).includes(syncStatus);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSync}
          disabled={isActive}
          size="sm"
          variant={syncStatus === "failed" ? "destructive" : "default"}
          className="gap-2 h-8 text-[12px]"
        >
          {syncStatus === "completed" ? (
            <CheckCircle className="h-3.5 w-3.5" />
          ) : syncStatus === "failed" ? (
            <XCircle className="h-3.5 w-3.5" />
          ) : (
            <RefreshCw className={`h-3.5 w-3.5 ${isActive ? "animate-spin" : ""}`} />
          )}
          {STATUS_LABEL[syncStatus]}
        </Button>

        {run?.html_url && (
          <a
            href={run.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            View run
          </a>
        )}
      </div>

      {lastSynced && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Last synced {format(new Date(lastSynced), "MMM d, h:mm a")}
        </p>
      )}

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
