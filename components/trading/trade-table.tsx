"use client";

import { useState, useMemo } from "react";
import { useAppContext } from "@/lib/context";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TradeForm } from "./trade-form";
import { EmptyState } from "@/components/shared/empty-state";
import { Plus, ArrowUpDown, TrendingUp, Pencil, Trash2, Filter } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { Trade } from "@/types";
import { cn } from "@/lib/utils";

type SortField = "entryDate" | "symbol" | "pnl" | "pnlPercent" | "rrr" | "quantity";
type SortDir = "asc" | "desc";

export function TradeTable() {
  const { tradeData, setTradeData } = useAppContext();
  const [showForm, setShowForm] = useState(false);
  const [editTrade, setEditTrade] = useState<Trade | undefined>();
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [sortField, setSortField] = useState<SortField>("entryDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterResult, setFilterResult] = useState<string>("all");
  const [filterAsset, setFilterAsset] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTrades = useMemo(() => {
    let trades = [...tradeData.trades];

    if (filterResult !== "all") {
      trades = trades.filter((t) => t.result === filterResult);
    }
    if (filterAsset !== "all") {
      trades = trades.filter((t) => t.assetClass === filterAsset);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      trades = trades.filter(
        (t) =>
          t.symbol.toLowerCase().includes(q) ||
          t.strategy.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }

    trades.sort((a, b) => {
      let compare = 0;
      switch (sortField) {
        case "entryDate":
          compare = new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime();
          break;
        case "symbol":
          compare = a.symbol.localeCompare(b.symbol);
          break;
        case "pnl":
          compare = a.pnl - b.pnl;
          break;
        case "pnlPercent":
          compare = a.pnlPercent - b.pnlPercent;
          break;
        case "rrr":
          compare = a.rrr - b.rrr;
          break;
        case "quantity":
          compare = a.quantity - b.quantity;
          break;
      }
      return sortDir === "asc" ? compare : -compare;
    });

    return trades;
  }, [tradeData.trades, filterResult, filterAsset, searchQuery, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const deleteTrade = (id: string) => {
    setTradeData({
      ...tradeData,
      trades: tradeData.trades.filter((t) => t.id !== id),
    });
    setSelectedTrade(null);
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <TableHead
      className="cursor-pointer hover:bg-muted/50 transition-colors whitespace-nowrap"
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-2 items-start md:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Search symbol, strategy, tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-[200px] h-9"
          />
          <Select value={filterResult} onValueChange={(v) => v && setFilterResult(v)}>
            <SelectTrigger className="w-[130px] h-9">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Results</SelectItem>
              <SelectItem value="win">Wins</SelectItem>
              <SelectItem value="loss">Losses</SelectItem>
              <SelectItem value="breakeven">Breakeven</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterAsset} onValueChange={(v) => v && setFilterAsset(v)}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assets</SelectItem>
              <SelectItem value="equity">Equity</SelectItem>
              <SelectItem value="futures">Futures</SelectItem>
              <SelectItem value="options">Options</SelectItem>
              <SelectItem value="forex">Forex</SelectItem>
              <SelectItem value="crypto">Crypto</SelectItem>
              <SelectItem value="commodity">Commodity</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => {
            setEditTrade(undefined);
            setShowForm(true);
          }}
          className="gap-1"
        >
          <Plus className="h-4 w-4" />
          Log Trade
        </Button>
      </div>

      {/* Table */}
      {filteredTrades.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No trades logged yet"
          description="Start logging your trades to see analytics and track performance."
          action={
            <Button onClick={() => { setEditTrade(undefined); setShowForm(true); }}>
              <Plus className="h-4 w-4 mr-1" />
              Log Your First Trade
            </Button>
          }
        />
      ) : (
        <ScrollArea className="w-full">
          <div className="min-w-[900px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader field="entryDate" label="Date" />
                  <SortHeader field="symbol" label="Symbol" />
                  <TableHead>Type</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Exit</TableHead>
                  <SortHeader field="quantity" label="Qty" />
                  <SortHeader field="pnl" label="P&L" />
                  <SortHeader field="pnlPercent" label="P&L %" />
                  <SortHeader field="rrr" label="RRR" />
                  <TableHead>Result</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTrades.map((trade) => (
                  <TableRow
                    key={trade.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedTrade(trade)}
                  >
                    <TableCell className="text-xs whitespace-nowrap">
                      {trade.entryDate ? format(parseISO(trade.entryDate), "MMM dd, yy") : "-"}
                    </TableCell>
                    <TableCell className="font-medium">{trade.symbol}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {trade.tradeType.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>{trade.entryPrice}</TableCell>
                    <TableCell>{trade.exitPrice}</TableCell>
                    <TableCell>{trade.quantity}</TableCell>
                    <TableCell
                      className={cn(
                        "font-medium",
                        trade.pnl >= 0 ? "text-green-500" : "text-red-500"
                      )}
                    >
                      {trade.pnl >= 0 ? "+" : ""}
                      {trade.pnl.toFixed(2)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        trade.pnlPercent >= 0 ? "text-green-500" : "text-red-500"
                      )}
                    >
                      {trade.pnlPercent >= 0 ? "+" : ""}
                      {trade.pnlPercent.toFixed(2)}%
                    </TableCell>
                    <TableCell>{trade.rrr.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "text-xs",
                          trade.result === "win"
                            ? "bg-green-500 text-white"
                            : trade.result === "loss"
                              ? "bg-red-500 text-white"
                              : "bg-yellow-500 text-black"
                        )}
                      >
                        {trade.result.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{trade.strategy}</TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditTrade(trade);
                            setShowForm(true);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => deleteTrade(trade.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}

      {/* Trade Detail Sheet */}
      <Sheet open={!!selectedTrade} onOpenChange={(o) => !o && setSelectedTrade(null)}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
          {selectedTrade && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {selectedTrade.symbol}
                  <Badge variant="outline">{selectedTrade.tradeType.toUpperCase()}</Badge>
                  <Badge
                    className={cn(
                      selectedTrade.result === "win"
                        ? "bg-green-500 text-white"
                        : selectedTrade.result === "loss"
                          ? "bg-red-500 text-white"
                          : "bg-yellow-500 text-black"
                    )}
                  >
                    {selectedTrade.result.toUpperCase()}
                  </Badge>
                </SheetTitle>
              </SheetHeader>

              <div className="space-y-6 mt-6">
                <div className="grid grid-cols-2 gap-4">
                  <InfoItem label="Asset Class" value={selectedTrade.assetClass} />
                  <InfoItem label="Timeframe" value={selectedTrade.timeframe} />
                  <InfoItem label="Entry Date" value={selectedTrade.entryDate ? format(parseISO(selectedTrade.entryDate), "MMM dd, yyyy HH:mm") : "-"} />
                  <InfoItem label="Exit Date" value={selectedTrade.exitDate ? format(parseISO(selectedTrade.exitDate), "MMM dd, yyyy HH:mm") : "-"} />
                  <InfoItem label="Entry Price" value={String(selectedTrade.entryPrice)} />
                  <InfoItem label="Exit Price" value={String(selectedTrade.exitPrice)} />
                  <InfoItem label="Quantity" value={String(selectedTrade.quantity)} />
                  <InfoItem label="Stop Loss" value={String(selectedTrade.stopLoss)} />
                  <InfoItem label="Take Profit" value={String(selectedTrade.takeProfit)} />
                  <InfoItem
                    label="P&L"
                    value={`${selectedTrade.pnl >= 0 ? "+" : ""}${selectedTrade.pnl.toFixed(2)}`}
                    className={selectedTrade.pnl >= 0 ? "text-green-500" : "text-red-500"}
                  />
                  <InfoItem
                    label="P&L %"
                    value={`${selectedTrade.pnlPercent >= 0 ? "+" : ""}${selectedTrade.pnlPercent.toFixed(2)}%`}
                    className={selectedTrade.pnlPercent >= 0 ? "text-green-500" : "text-red-500"}
                  />
                  <InfoItem label="RRR" value={selectedTrade.rrr.toFixed(2)} />
                </div>

                {selectedTrade.strategy && (
                  <InfoItem label="Strategy" value={selectedTrade.strategy} />
                )}
                {selectedTrade.setup && (
                  <InfoItem label="Setup" value={selectedTrade.setup} />
                )}
                {selectedTrade.emotionalState && (
                  <InfoItem label="Emotional State" value={selectedTrade.emotionalState} />
                )}

                {selectedTrade.tags.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedTrade.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTrade.preTradeNotes && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Pre-trade Notes</p>
                    <p className="text-sm">{selectedTrade.preTradeNotes}</p>
                  </div>
                )}
                {selectedTrade.postTradeReview && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Post-trade Review</p>
                    <p className="text-sm">{selectedTrade.postTradeReview}</p>
                  </div>
                )}

                {selectedTrade.images.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Screenshots</p>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedTrade.images.map((img, i) => (
                        <img
                          key={i}
                          src={img}
                          alt={`Trade screenshot ${i + 1}`}
                          className="rounded-md border w-full object-cover"
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setSelectedTrade(null);
                      setEditTrade(selectedTrade);
                      setShowForm(true);
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => deleteTrade(selectedTrade.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Trade Form */}
      <TradeForm
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditTrade(undefined);
        }}
        editTrade={editTrade}
      />
    </div>
  );
}

function InfoItem({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-medium", className)}>{value}</p>
    </div>
  );
}
