"use client";

import { useRef, useState } from "react";
import { UploadCloud, FileText, CheckCircle2, AlertCircle, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImportResult {
  imported: number;
  updated: number;
  total: number;
  skippedRows: number;
}

interface CsvImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

export function CsvImportModal({ onClose, onImported }: CsvImportModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function pickFile(f: File) {
    if (!f.name.endsWith(".csv") && f.type !== "text/csv") {
      setErrorMsg("Please select a .csv file exported from MT5.");
      return;
    }
    setFile(f);
    setErrorMsg(null);
    setState("idle");
    setResult(null);
  }

  async function upload() {
    if (!file) return;
    setState("uploading");
    setErrorMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/trade/import-csv", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setState("error");
        setErrorMsg(data.error ?? "Import failed.");
        return;
      }
      setResult(data);
      setState("done");
      onImported();
    } catch {
      setState("error");
      setErrorMsg("Network error — please try again.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="rounded-xl border border-border bg-card p-6 w-full max-w-md space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Import MT5 CSV</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Upload the History report exported from MT5 mobile or desktop
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* How to export */}
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-1.5">
          <p className="text-[11px] font-semibold text-foreground uppercase tracking-wide">
            How to export from MT5 Mobile
          </p>
          <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Open the MT5 app → tap the <strong className="text-foreground">menu (☰)</strong></li>
            <li>
              Tap <strong className="text-foreground">History</strong> → pick date range (e.g.
              &quot;3 months&quot;)
            </li>
            <li>
              Tap the <strong className="text-foreground">share / export icon</strong> (top-right)
              → <strong className="text-foreground">Send as CSV</strong>
            </li>
            <li>Save or AirDrop the file to your Mac</li>
          </ol>
        </div>

        {/* Drop zone */}
        {state !== "done" && (
          <div
            className={cn(
              "rounded-xl border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center gap-2 py-8 px-4 text-center",
              dragging
                ? "border-white/30 bg-white/[0.06]"
                : file
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-border hover:border-border/80 hover:bg-muted/20"
            )}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) pickFile(f);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
            />
            {file ? (
              <>
                <FileText className="h-8 w-8 text-emerald-400" />
                <p className="text-[13px] font-medium text-foreground">{file.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB — click to change
                </p>
              </>
            ) : (
              <>
                <UploadCloud className="h-8 w-8 text-muted-foreground" />
                <p className="text-[13px] font-medium text-foreground">
                  Drop your CSV here, or click to browse
                </p>
                <p className="text-[11px] text-muted-foreground">Supports MT5 mobile &amp; desktop history exports</p>
              </>
            )}
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success result */}
        {state === "done" && result && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Import complete
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "New", value: result.imported },
                { label: "Updated", value: result.updated },
                { label: "Total", value: result.total },
              ].map((s) => (
                <div key={s.label} className="rounded-md bg-emerald-500/10 py-2">
                  <p className="text-lg font-bold text-emerald-400">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            {result.skippedRows > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {result.skippedRows} row(s) skipped (balance/credit lines or unrecognised format).
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {state === "done" ? (
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[13px] font-semibold transition"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-lg border border-border text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition"
              >
                Cancel
              </button>
              <button
                onClick={upload}
                disabled={!file || state === "uploading"}
                className="flex-1 py-2 rounded-lg bg-white/[0.10] hover:bg-white/[0.16] border border-white/[0.12] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold transition flex items-center justify-center gap-2"
              >
                {state === "uploading" ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing…</>
                ) : (
                  "Import Trades"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
