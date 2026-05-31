"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface MT5Deal {
  _id: string;
  id: string;
  accountId: string;
  type: string;
  symbol: string;
  volume: number;
  price: number;
  profit: number;
  commission: number;
  swap: number;
  comment: string;
  time: string;
}

interface AccountInfo {
  name: string;
  balance: number;
  equity: number;
  currency: string;
  lastSynced: string;
}

interface TradesTableProps {
  /** Increment to trigger a re-fetch (e.g. after a sync completes). */
  refreshKey?: number;
}

export function TradesTable({ refreshKey }: TradesTableProps) {
  const [trades, setTrades] = useState<MT5Deal[]>([]);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/trades");
        if (!res.ok) return;
        const data = await res.json();
        setTrades(data.trades ?? []);
        setAccount(data.account ?? null);
      } catch {
        // fail silently
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshKey]);

  const formatCurrency = (val: number, currency = "USD") =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(val);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-24">
        <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
      </div>
    );
  }

  if (!trades.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No MT5 trades synced yet. Click <strong>Sync MT5</strong> above to fetch your trade history.
        </p>
      </div>
    );
  }

  const currency = account?.currency ?? "USD";

  return (
    <div className="space-y-3">
      {/* Account summary cards */}
      {account && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(
            [
              { label: "Account", value: account.name || "—" },
              { label: "Balance", value: formatCurrency(account.balance, currency) },
              { label: "Equity", value: formatCurrency(account.equity, currency) },
              {
                label: "Last Synced",
                value: account.lastSynced
                  ? format(new Date(account.lastSynced), "MMM d, h:mm a")
                  : "—",
              },
            ] as { label: string; value: string }[]
          ).map((item) => (
            <Card key={item.label} className="p-3">
              <p className="text-[11px] text-muted-foreground">{item.label}</p>
              <p className="text-sm font-semibold truncate">{item.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Deals table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px]">Time</TableHead>
                <TableHead className="text-[11px]">Symbol</TableHead>
                <TableHead className="text-[11px]">Type</TableHead>
                <TableHead className="text-[11px] text-right">Volume</TableHead>
                <TableHead className="text-[11px] text-right">Price</TableHead>
                <TableHead className="text-[11px] text-right">Profit</TableHead>
                <TableHead className="text-[11px] text-right">Commission</TableHead>
                <TableHead className="text-[11px] text-right">Swap</TableHead>
                <TableHead className="text-[11px]">Comment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((deal) => (
                <TableRow key={String(deal._id ?? deal.id)}>
                  <TableCell className="text-[12px] whitespace-nowrap">
                    {deal.time ? format(new Date(deal.time), "MMM d, HH:mm") : "—"}
                  </TableCell>
                  <TableCell className="text-[12px] font-medium">
                    {deal.symbol ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${
                        deal.type === "DEAL_TYPE_BUY"
                          ? "border-green-500 text-green-500"
                          : "border-red-500 text-red-500"
                      }`}
                    >
                      {deal.type === "DEAL_TYPE_BUY" ? "BUY" : "SELL"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[12px] text-right">
                    {deal.volume != null ? deal.volume.toFixed(2) : "—"}
                  </TableCell>
                  <TableCell className="text-[12px] text-right">
                    {deal.price != null ? deal.price.toFixed(5) : "—"}
                  </TableCell>
                  <TableCell
                    className={`text-[12px] text-right font-medium ${
                      (deal.profit ?? 0) >= 0 ? "text-green-500" : "text-red-500"
                    }`}
                  >
                    {deal.profit != null ? formatCurrency(deal.profit, currency) : "—"}
                  </TableCell>
                  <TableCell className="text-[12px] text-right text-muted-foreground">
                    {deal.commission != null ? formatCurrency(deal.commission, currency) : "—"}
                  </TableCell>
                  <TableCell className="text-[12px] text-right text-muted-foreground">
                    {deal.swap != null ? formatCurrency(deal.swap, currency) : "—"}
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground max-w-35 truncate">
                    {deal.comment || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
