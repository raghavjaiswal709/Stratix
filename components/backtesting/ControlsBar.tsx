"use client";

// ─── ControlsBar ──────────────────────────────────────────────────────────────
// Top control panel: instrument selector, date range, timeframe, lot size, load.

import type { ControlsState, Timeframe, InstrumentKey } from "./types";
import { INSTRUMENTS } from "./types";

interface Props {
  controls:  ControlsState;
  onChange:  (next: Partial<ControlsState>) => void;
  onLoad:    () => void;
  isLoading: boolean;
  progress:  number;  // 0-100
  loadLabel: string;
  dataSource?: string | null;
}

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1H", "4H", "1D"];

export function ControlsBar({ controls, onChange, onLoad, isLoading, progress, loadLabel, dataSource }: Props) {
  return (
    <div className="shrink-0 border-b border-[#2a2a2a]">
      <div className="flex flex-wrap items-end gap-3 px-4 py-3 bg-[#111]">

        {/* ── Instrument selector ─────────────────────────────────────── */}
        <Field label="Instrument">
          <div className="flex gap-px rounded-md overflow-hidden border border-[#F0B90B]/40">
            {INSTRUMENTS.map((inst) => (
              <button
                key={inst.key}
                disabled={isLoading}
                onClick={() => onChange({ instrument: inst.key as InstrumentKey })}
                className={`px-3 py-1.5 text-[11px] font-bold tracking-wide transition-colors disabled:opacity-40 ${
                  controls.instrument === inst.key
                    ? "bg-[#F0B90B] text-black"
                    : "bg-[#161616] text-[#F0B90B] hover:bg-[#1e1e1e]"
                }`}
                title={inst.description}
              >
                {inst.label}
              </button>
            ))}
          </div>
        </Field>

        {/* ── Date range ──────────────────────────────────────────────── */}
        <Field label="From">
          <DateInput value={controls.fromDate} max={controls.toDate} onChange={(v) => onChange({ fromDate: v })} />
        </Field>
        <Field label="To">
          <DateInput value={controls.toDate} min={controls.fromDate} onChange={(v) => onChange({ toDate: v })} />
        </Field>

        {/* ── Timeframe ───────────────────────────────────────────────── */}
        <Field label="Timeframe">
          <div className="flex gap-px rounded-md overflow-hidden border border-[#2a2a2a]">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                disabled={isLoading}
                onClick={() => onChange({ timeframe: tf })}
                className={`px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                  controls.timeframe === tf
                    ? "bg-[#F0B90B] text-black"
                    : "bg-[#161616] text-[#8a9bb0] hover:bg-[#1e1e1e]"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </Field>

        {/* ── Lot size ────────────────────────────────────────────────── */}
        <Field label="Lot ($)">
          <input
            type="number"
            value={controls.lotSize}
            min={1}
            max={1_000_000}
            disabled={isLoading}
            onChange={(e) => onChange({ lotSize: Number(e.target.value) })}
            className="bg-[#161616] border border-[#2a2a2a] rounded-md px-2.5 py-1.5 text-[12px] text-[#d1d5db] w-24 focus:outline-none focus:border-[#F0B90B] transition-colors font-mono disabled:opacity-40"
          />
        </Field>

        {/* ── Load button & Data source pill ────────────────────────────── */}
        <div className="flex items-center gap-2 self-end">
          <button
            onClick={onLoad}
            disabled={isLoading}
            className="px-5 py-1.5 text-[12px] font-bold rounded-md bg-[#F0B90B] text-black hover:bg-[#d9a60a] disabled:opacity-50 transition-colors min-w-28"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-1.5">
                <span className="h-3 w-3 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                Loading…
              </span>
            ) : (
              "↓ Load Data"
            )}
          </button>
          {dataSource && (
            <div 
              className="px-2 py-1.5 text-[10px] rounded bg-[#161616] border border-[#2a2a2a] text-[#8a9bb0] font-mono cursor-help"
              title={`Candle data loaded from: ${dataSource === "GitHub CDN" ? "jsDelivr GitHub CDN (static CSV files)" : dataSource === "Local Static" ? "Local public assets (static CSV files)" : "Dukascopy Node API (live fetch)"}`}
            >
              🌐 {dataSource}
            </div>
          )}
        </div>
      </div>

      {/* Progress bar while loading */}
      {isLoading && (
        <div className="px-4 pb-2.5 flex items-center gap-3">
          <div className="flex-1 h-1 bg-[#1e1e1e] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#F0B90B] transition-all duration-300 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] text-[#4a5568] font-mono whitespace-nowrap">{loadLabel}</span>
        </div>
      )}
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#4a5568]">{label}</span>
      {children}
    </div>
  );
}

function DateInput({ value, min, max, onChange }: {
  value: string; min?: string; max?: string; onChange: (v: string) => void;
}) {
  return (
    <input
      type="date"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[#161616] border border-[#2a2a2a] rounded-md px-2.5 py-1.5 text-[12px] text-[#d1d5db] focus:outline-none focus:border-[#F0B90B] transition-colors"
    />
  );
}

