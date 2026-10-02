"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { ChartCandlestick, Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface FootprintAccess {
  url: string | null;
  online: boolean;
  since: number | null;
  lastSeen: number | null;
}

type Variant = "rail" | "full" | "mobile";

const PANEL_W = 300;

const clock = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");

/**
 * "Access Footprint": opens the Footprint Pro order-flow dashboard that runs on the trading Mac. Its public link
 * changes whenever Footprint restarts; the Footprint engine writes the current one to the database, so this
 * always shows the live link. Admins only. `rail` = collapsed sidebar, `full` = expanded sidebar, `mobile` = top bar.
 */
export function AccessFootprint({ variant }: { variant: Variant }) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<FootprintAccess | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // wraps the trigger: anchors the panel and tells clicks on the trigger from clicks outside
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/footprint-access", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 403 ? "Admins only" : `Could not load the link (${res.status})`);
      setData((await res.json()) as FootprintAccess);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the link");
    } finally {
      setLoading(false);
    }
  }, []);

  // status dot on the button: check now and then; while the panel is open, every 30 s
  useEffect(() => {
    if (!isAdmin) return;
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, open ? 30_000 : 120_000);
    return () => clearInterval(t);
  }, [isAdmin, open, load]);

  // place the panel next to the button
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      const vw = window.innerWidth;
      const left = variant === "rail" ? r.right + 8 : variant === "mobile" ? r.right - PANEL_W : r.left + 8;
      const top = variant === "rail" ? r.top + 8 : r.bottom + 8;
      setPos({ top, left: Math.max(8, Math.min(left, vw - PANEL_W - 8)) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, variant]);

  // close on a click outside or Escape
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !anchorRef.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  if (!isAdmin) return null;

  const live = !!data?.url && data.online;
  const dot = (
    <span
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        !data ? "bg-white/20" : live ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" : "bg-red-400/80",
      )}
    />
  );

  const openDashboard = () => {
    if (!data?.url) return;
    window.open(data.url, "_blank", "noopener,noreferrer");
  };

  const copy = () => {
    if (!data?.url) return;
    navigator.clipboard
      .writeText(data.url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };

  const trigger =
    variant === "rail" ? (
      <div ref={anchorRef} className="flex justify-center py-2.5 border-b border-sidebar-border">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                onClick={() => setOpen((v) => !v)}
                aria-label="Access Footprint"
                className={cn(
                  "relative flex items-center justify-center w-10 h-10 rounded-lg border transition-all duration-150",
                  open
                    ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-300"
                    : "bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20",
                )}
              />
            }
          >
            <ChartCandlestick className="h-[18px] w-[18px] shrink-0" />
            <span className="absolute right-1 top-1">{dot}</span>
          </TooltipTrigger>
          <TooltipContent side="right">Access Footprint</TooltipContent>
        </Tooltip>
      </div>
    ) : variant === "full" ? (
      <div ref={anchorRef} className="px-2 pt-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex w-full items-center gap-2.5 px-3 py-2 rounded-lg border text-[13px] font-medium transition-all duration-150",
            open
              ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-200"
              : "bg-emerald-500/10 border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/20",
          )}
        >
          <ChartCandlestick className="h-[15px] w-[15px] shrink-0" />
          <span className="flex-1 text-left">Access Footprint</span>
          {dot}
        </button>
      </div>
    ) : (
      <div ref={anchorRef} className="mr-1.5 shrink-0">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Access Footprint"
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px] font-medium transition",
            open ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-200" : "bg-emerald-500/10 border-emerald-500/25 text-emerald-300 active:bg-emerald-500/20",
          )}
        >
          <ChartCandlestick className="h-4 w-4 shrink-0" />
          <span>Footprint</span>
          {dot}
        </button>
      </div>
    );

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Access Footprint"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: PANEL_W }}
            className="z-[100] rounded-xl border border-border bg-popover p-3.5 text-popover-foreground shadow-2xl"
          >
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-400">
                <ChartCandlestick className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-tight">Footprint Pro</p>
                <p className="text-[11px] text-muted-foreground">Order flow dashboard</p>
              </div>
              <button
                onClick={() => void load()}
                className="rounded-md p-1.5 text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground"
                aria-label="Refresh"
                title="Refresh"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              </button>
            </div>

            <div className="mb-3 flex items-center gap-2 text-[12px]">
              {dot}
              {!data ? (
                <span className="text-muted-foreground">{error ?? "Checking…"}</span>
              ) : !data.url ? (
                <span className="text-muted-foreground">No link yet. Start Footprint on the trading Mac.</span>
              ) : live ? (
                <span>
                  Live <span className="text-muted-foreground">· since {clock(data.since)}</span>
                </span>
              ) : (
                <span className="text-red-300/90">
                  Offline <span className="text-muted-foreground">· last seen {clock(data.lastSeen)}. The Mac may be asleep or Docker stopped.</span>
                </span>
              )}
            </div>

            <button
              onClick={openDashboard}
              disabled={!data?.url}
              className={cn(
                "flex h-10 w-full items-center justify-center gap-2 rounded-lg text-[13.5px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
                live ? "bg-emerald-500 text-black hover:bg-emerald-400" : "border border-border bg-white/[0.06] text-foreground hover:bg-white/[0.1]",
              )}
            >
              <ExternalLink className="h-4 w-4" />
              Orderflow Access
            </button>

            {data?.url && (
              <div className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-border bg-black/20 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={data.url}>
                  {data.url.replace(/^https:\/\//, "")}
                </span>
                <button
                  onClick={copy}
                  className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground"
                  aria-label="Copy link"
                  title="Copy link"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}

            <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
              Sign in with your Footprint password. Your browser can remember it. The link updates by itself whenever Footprint restarts.
            </p>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {trigger}
      {panel}
    </>
  );
}
