"use client";

// ─── ResultsPanel ─────────────────────────────────────────────────────────────
// Shows replay metrics and a paginated trade log for manually placed trades.

import { useState, useMemo } from "react";
import type { ManualTrade } from "./types";
import { computeMetrics } from "./tradeTracker";

interface Props {
  trades:         ManualTrade[];
  initialCapital: number;
}

const PAGE_SIZE = 20;

type SortKey = "id" | "entryTime" | "entryPrice" | "exitPrice" | "pnl" | "pnlPct";

export function ResultsPanel({ trades, initialCapital }: Props) {
  const m = useMemo(() => computeMetrics(trades, initialCapital), [trades, initialCapital]);

  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 gap-3">
        <span className="text-4xl opacity-30">📈</span>
        <p className="text-[13px] text-[#4a5568] font-medium">
          Place trades during replay to see results here
        </p>
        <p className="text-[11px] text-[#4a5568]">
          Start a replay, set a start bar, then use the <span className="text-[#F0B90B]">BUY / SELL</span> buttons on the chart
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto p-4">
      {/* ── Metric cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <MetricCard label="Total Trades"  value={String(m.totalTrades)} />
        <MetricCard
          label="Win Rate"
          value={m.winRate.toFixed(1) + "%"}
          color={m.winRate >= 50 ? "#22c55e" : "#ef4444"}
        />
        <MetricCard
          label="Total P&L"
          value={(m.totalPnl >= 0 ? "+" : "") + "$" + m.totalPnl.toFixed(2)}
          color={m.totalPnl >= 0 ? "#22c55e" : "#ef4444"}
        />
        <MetricCard
          label="Profit Factor"
          value={m.profitFactor === 999 ? "∞" : m.profitFactor.toFixed(2)}
          color={m.profitFactor >= 1 ? "#22c55e" : "#ef4444"}
        />
        <MetricCard label="Avg Win"   value={"+" + m.avgWin.toFixed(2)}   color="#22c55e" />
        <MetricCard label="Avg Loss"  value={"-"  + m.avgLoss.toFixed(2)} color="#ef4444" />
        <MetricCard label="Best Trade"  value={"+" + m.bestTrade.toFixed(2)}  color="#22c55e" />
        <MetricCard label="Worst Trade" value={m.worstTrade.toFixed(2)} color="#ef4444" />
      </div>

      {/* ── Trade log ──────────────────────────────────────────────────── */}
      <TradeLog trades={trades} />
    </div>
  );
}

// ─── Trade log ────────────────────────────────────────────────────────────────

function TradeLog({ trades }: { trades: ManualTrade[] }) {
  const [page, setPage]  = useState(0);
  const [sortKey, setSK] = useState<SortKey>("id");
  const [sortAsc, setSA] = useState(true);

  // Closed trades only (open trade has no exitTime)
  const closed = trades.filter((t) => t.exitTime != null);

  const sorted = [...closed].sort((a, b) => {
    const av = (a[sortKey] ?? 0) as number;
    const bv = (b[sortKey] ?? 0) as number;
    return sortAsc ? av - bv : bv - av;
  });

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const rows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSA((v) => !v);
    else { setSK(key); setSA(true); }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4a5568]">
        Trade Log ({closed.length})
      </p>
      <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead>
            <tr className="bg-[#161616] text-[#4a5568]">
              <SortTh label="#"        col="id"         active={sortKey} asc={sortAsc} onSort={toggleSort} />
              <th className="px-2 py-2 text-left font-semibold">Dir</th>
              <SortTh label="Entry"    col="entryTime"  active={sortKey} asc={sortAsc} onSort={toggleSort} />
              <SortTh label="E.Price"  col="entryPrice" active={sortKey} asc={sortAsc} onSort={toggleSort} />
              <SortTh label="Exit"     col="exitPrice"  active={sortKey} asc={sortAsc} onSort={toggleSort} />
              <SortTh label="P&L $"    col="pnl"        active={sortKey} asc={sortAsc} onSort={toggleSort} />
              <SortTh label="P&L %"    col="pnlPct"     active={sortKey} asc={sortAsc} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const win = (t.pnl ?? 0) >= 0;
              return (
                <tr
                  key={t.id}
                  className={`border-t border-[#1e1e1e] transition-colors ${
                    win ? "hover:bg-green-900/10" : "hover:bg-red-900/10"
                  }`}
                >
                  <td className="px-2 py-1.5 text-[#4a5568]">{t.id}</td>
                  <td className="px-2 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      t.direction === "LONG"
                        ? "bg-green-500/15 text-green-400"
                        : "bg-red-500/15 text-red-400"
                    }`}>
                      {t.direction}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-[#8a9bb0]">{fmtTime(t.entryTime)}</td>
                  <td className="px-2 py-1.5 text-[#d1d5db]">{t.entryPrice.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-[#d1d5db]">{(t.exitPrice ?? 0).toFixed(2)}</td>
                  <td className={`px-2 py-1.5 font-semibold ${win ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                    {win ? "+" : ""}{(t.pnl ?? 0).toFixed(2)}
                  </td>
                  <td className={`px-2 py-1.5 ${win ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                    {win ? "+" : ""}{(t.pnlPct ?? 0).toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-[11px] text-[#4a5568]">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="px-2 py-1 rounded border border-[#2a2a2a] hover:border-[#F0B90B] disabled:opacity-30 transition-colors"
          >
            ← Prev
          </button>
          <span>Page {page + 1} / {totalPages}</span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="px-2 py-1 rounded border border-[#2a2a2a] hover:border-[#F0B90B] disabled:opacity-30 transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-[#161616] border border-[#2a2a2a] rounded-lg px-3 py-2.5 flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#4a5568]">{label}</span>
      <span className="text-[15px] font-bold font-mono" style={{ color: color ?? "#d1d5db" }}>
        {value}
      </span>
    </div>
  );
}

function SortTh({ label, col, active, asc, onSort }: {
  label: string; col: SortKey; active: SortKey; asc: boolean; onSort: (k: SortKey) => void;
}) {
  return (
    <th
      className="px-2 py-2 text-left font-semibold cursor-pointer select-none hover:text-[#F0B90B] transition-colors"
      onClick={() => onSort(col)}
    >
      {label}{active === col ? (asc ? " ↑" : " ↓") : ""}
    </th>
  );
}

function fmtTime(ts: number) {
  return new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 16);
}
