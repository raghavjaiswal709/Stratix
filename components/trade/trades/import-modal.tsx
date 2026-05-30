"use client";

import { useRef, useState } from "react";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  AlertTriangle,
  SkipForward,
  RefreshCw,
  ClipboardPaste,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConflictItem } from "@/app/api/trade/import-json/route";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
}

type Phase =
  | "idle"
  | "uploading"
  | "conflict"
  | "resolving"
  | "done"
  | "error";

type InputTab = "file" | "paste";

interface ConflictState {
  conflicts: ConflictItem[];
  newCount: number;
  conflictCount: number;
  total: number;
}

interface ImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Detect whether raw text looks like JSON (starts with '{' or '[' after trim) */
function looksLikeJson(text: string) {
  const t = text.trimStart();
  return t.startsWith("{") || t.startsWith("[");
}

/** Convert pasted text into a File object so we can reuse the upload helpers */
function textToFile(text: string): File {
  const isJson = looksLikeJson(text);
  const mime = isJson ? "application/json" : "text/csv";
  const ext = isJson ? "json" : "csv";
  return new File([text], `paste.${ext}`, { type: mime });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImportModal({ onClose, onImported }: ImportModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [inputTab, setInputTab] = useState<InputTab>("file");
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [conflictState, setConflictState] = useState<ConflictState | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  // ── File picking ──────────────────────────────────────────────────────────

  function pickFile(f: File) {
    const name = f.name.toLowerCase();
    if (!name.endsWith(".json") && !name.endsWith(".csv")) {
      setErrorMsg("Please select a .json or .csv file exported from MT5.");
      return;
    }
    setFile(f);
    setErrorMsg(null);
    setPhase("idle");
    setResult(null);
    setConflictState(null);
  }

  // ── Upload helpers ────────────────────────────────────────────────────────

  function isJsonFile(f: File) {
    return f.name.toLowerCase().endsWith(".json");
  }

  async function doUpload(f: File, resolution?: "skip" | "replace") {
    const form = new FormData();
    form.append("file", f);

    const url = isJsonFile(f)
      ? `/api/trade/import-json${resolution ? `?resolution=${resolution}` : ""}`
      : "/api/trade/import-csv";

    const res = await fetch(url, { method: "POST", body: form });
    return { res, data: await res.json() };
  }

  /** Resolve the active file: either picked file or synthesised from paste */
  function getActiveFile(): File | null {
    if (inputTab === "file") return file;
    const t = pasteText.trim();
    if (!t) return null;
    return textToFile(t);
  }

  // ── First upload (no resolution) ─────────────────────────────────────────

  async function upload() {
    const f = getActiveFile();
    if (!f) return;
    setPhase("uploading");
    setErrorMsg(null);

    try {
      const { res, data } = await doUpload(f);

      if (res.status === 409 && data.conflicts) {
        setConflictState({
          conflicts: data.conflicts as ConflictItem[],
          newCount: data.newCount ?? 0,
          conflictCount: data.conflictCount ?? 0,
          total: data.total ?? 0,
        });
        setPhase("conflict");
        return;
      }

      if (!res.ok) {
        setPhase("error");
        setErrorMsg(data.error ?? "Import failed.");
        return;
      }

      setResult(data as ImportResult);
      setPhase("done");
      onImported();
    } catch {
      setPhase("error");
      setErrorMsg("Network error — please try again.");
    }
  }

  // ── Resolution upload ─────────────────────────────────────────────────────

  async function resolveWith(resolution: "skip" | "replace") {
    const f = getActiveFile();
    if (!f) return;
    setPhase("resolving");
    setErrorMsg(null);

    try {
      const { res, data } = await doUpload(f, resolution);

      if (!res.ok) {
        setPhase("error");
        setErrorMsg(data.error ?? "Import failed after conflict resolution.");
        return;
      }

      setResult(data as ImportResult);
      setPhase("done");
      onImported();
    } catch {
      setPhase("error");
      setErrorMsg("Network error — please try again.");
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const busy = phase === "uploading" || phase === "resolving";
  const showInputArea = phase !== "done" && phase !== "conflict";
  const canImport = inputTab === "file" ? !!file : pasteText.trim().length > 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="rounded-xl border border-border bg-card p-6 w-full max-w-md space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Import Trades</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Upload or paste a JSON or CSV export from MT5
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Tab switcher (only before done/conflict) ── */}
        {showInputArea && (
          <div className="flex rounded-lg border border-border overflow-hidden text-[12px] font-medium">
            <button
              onClick={() => { setInputTab("file"); setErrorMsg(null); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 transition",
                inputTab === "file"
                  ? "bg-blue-600 text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <UploadCloud className="h-3.5 w-3.5" />
              Upload file
            </button>
            <button
              onClick={() => { setInputTab("paste"); setErrorMsg(null); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 transition border-l border-border",
                inputTab === "paste"
                  ? "bg-blue-600 text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              Paste text
            </button>
          </div>
        )}

        {/* ── How to export (idle + file tab only) ── */}
        {phase === "idle" && inputTab === "file" && (
          <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-1.5">
            <p className="text-[11px] font-semibold text-foreground uppercase tracking-wide">
              How to export from MT5
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div>
                <p className="text-[10px] font-semibold text-blue-400 mb-1">Mobile (JSON)</p>
                <ol className="text-[11px] text-muted-foreground space-y-0.5 list-decimal list-inside">
                  <li>Open MT5 → History</li>
                  <li>Share icon → Export JSON</li>
                  <li>Send file to your Mac</li>
                </ol>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-violet-400 mb-1">Desktop (CSV)</p>
                <ol className="text-[11px] text-muted-foreground space-y-0.5 list-decimal list-inside">
                  <li>Account History tab</li>
                  <li>Right-click → Save as Report</li>
                  <li>Choose CSV format</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* ── Drop zone (file tab) ── */}
        {showInputArea && inputTab === "file" && (
          <div
            className={cn(
              "rounded-xl border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center gap-2 py-8 px-4 text-center",
              busy && "pointer-events-none opacity-60",
              dragging
                ? "border-blue-500 bg-blue-500/10"
                : file
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-border hover:border-border/80 hover:bg-muted/20"
            )}
            onClick={() => !busy && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!busy) {
                const f = e.dataTransfer.files[0];
                if (f) pickFile(f);
              }
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".json,.csv,application/json,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickFile(f);
              }}
            />
            {file ? (
              <>
                <FileText className="h-8 w-8 text-emerald-400" />
                <p className="text-[13px] font-medium text-foreground">{file.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                  {!busy && <span className="text-muted-foreground/60"> · click to change</span>}
                </p>
              </>
            ) : (
              <>
                <UploadCloud className="h-8 w-8 text-muted-foreground" />
                <p className="text-[13px] font-medium text-foreground">
                  Drop your file here, or click to browse
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Supports MT5 Trade Extractor JSON and desktop CSV exports
                </p>
              </>
            )}
          </div>
        )}

        {/* ── Paste area ── */}
        {showInputArea && inputTab === "paste" && (
          <div className="space-y-2">
            <textarea
              disabled={busy}
              placeholder={`Paste your JSON or CSV here…\n\nJSON example: {"ticket":123456, "symbol":"XAUUSD", …}\nCSV example: #,Time,Type,Size,…`}
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                setErrorMsg(null);
                setResult(null);
                setConflictState(null);
                if (phase === "error") setPhase("idle");
              }}
              className={cn(
                "w-full h-44 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-[12px] font-mono text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition",
                busy && "opacity-60 cursor-not-allowed"
              )}
            />
            {pasteText.trim().length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Detected:{" "}
                <span className="font-semibold text-blue-400">
                  {looksLikeJson(pasteText) ? "JSON" : "CSV"}
                </span>{" "}
                · {pasteText.trim().length.toLocaleString()} characters
              </p>
            )}
          </div>
        )}

        {/* ── Conflict resolution UI ── */}
        {phase === "conflict" && conflictState && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-amber-400">
                  {conflictState.conflictCount} trade
                  {conflictState.conflictCount !== 1 ? "s" : ""} already exist
                  {conflictState.newCount > 0 && (
                    <span className="text-amber-300/70"> · {conflictState.newCount} new</span>
                  )}
                </p>
                <p className="text-[11px] text-amber-300/70 mt-0.5">
                  These tickets are already in your journal. Choose how to proceed:
                </p>
              </div>
            </div>

            {/* Conflict table */}
            <div className="rounded-lg border border-border overflow-hidden max-h-44 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-3 py-1.5 text-muted-foreground font-semibold">Ticket</th>
                    <th className="text-left px-3 py-1.5 text-muted-foreground font-semibold">Symbol</th>
                    <th className="text-right px-3 py-1.5 text-muted-foreground font-semibold">Current P&L</th>
                    <th className="text-right px-3 py-1.5 text-muted-foreground font-semibold">New P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {conflictState.conflicts.map((c) => (
                    <tr key={c.ticket} className="hover:bg-muted/20">
                      <td className="px-3 py-1.5 font-mono text-foreground/70">{c.ticket}</td>
                      <td className="px-3 py-1.5 text-foreground">{c.symbol}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">
                        ${c.current.profit.toFixed(2)}
                      </td>
                      <td className={cn(
                        "px-3 py-1.5 text-right font-semibold",
                        c.incoming.profit > c.current.profit
                          ? "text-blue-400"
                          : c.incoming.profit < c.current.profit
                          ? "text-red-400"
                          : "text-foreground/60"
                      )}>
                        ${c.incoming.profit.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Resolution buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => resolveWith("skip")}
                className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition"
              >
                <SkipForward className="h-3.5 w-3.5" />
                Skip existing
                {conflictState.newCount > 0 && (
                  <span className="text-[10px] text-emerald-400">(+{conflictState.newCount})</span>
                )}
              </button>
              <button
                onClick={() => resolveWith("replace")}
                className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-600/90 hover:bg-amber-500 text-white text-[12px] font-semibold transition"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Replace all
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              Journal notes, screenshots and analysis are never overwritten.
            </p>
          </div>
        )}

        {/* ── Error message ── */}
        {errorMsg && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ── Success result ── */}
        {phase === "done" && result && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Import complete
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: "New", value: result.imported },
                { label: "Updated", value: result.updated },
                { label: "Skipped", value: result.skipped },
                { label: "Total", value: result.total },
              ].map((s) => (
                <div key={s.label} className="rounded-md bg-emerald-500/10 py-2">
                  <p className="text-lg font-bold text-emerald-400">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Footer actions ── */}
        {phase === "done" ? (
          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[13px] font-semibold transition"
          >
            Done
          </button>
        ) : phase === "conflict" ? (
          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg border border-border text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition"
          >
            Cancel
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-border text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition"
            >
              Cancel
            </button>
            <button
              onClick={upload}
              disabled={!canImport || busy}
              className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold transition flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Importing…
                </>
              ) : (
                "Import Trades"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

