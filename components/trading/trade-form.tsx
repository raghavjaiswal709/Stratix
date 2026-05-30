"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { useAppContext } from "@/lib/context";
import { generateId, calculatePnL, calculatePnLPercent, calculateRRR, determineResult } from "@/lib/trades";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X, ImagePlus } from "lucide-react";
import {
  SmileyWink,
  SmileyNervous,
  SmileyXEyes,
  SmileyMeh,
  SmileySad,
} from "@phosphor-icons/react";
import type { Trade, TradeType, AssetClass, Timeframe, EmotionalState } from "@/types";

interface TradeFormProps {
  open: boolean;
  onClose: () => void;
  editTrade?: Trade;
}

const DEFAULT_STRATEGIES = [
  "Breakout",
  "Reversal",
  "Trend Follow",
  "Range Trading",
  "Scalping",
  "Swing",
  "Momentum",
];

const SETUPS = ["Breakout", "Reversal", "Trend Follow", "Support/Resistance", "Gap Fill", "VWAP"];
const TAGS = [
  "followed rules",
  "impulsive entry",
  "perfect execution",
  "early exit",
  "late entry",
  "overtraded",
  "revenge trade",
];

export function TradeForm({ open, onClose, editTrade }: TradeFormProps) {
  const { tradeData, setTradeData } = useAppContext();

  const allStrategies = useMemo(
    () => [...new Set([...DEFAULT_STRATEGIES, ...tradeData.customStrategies])],
    [tradeData.customStrategies]
  );

  const [formData, setFormData] = useState<Partial<Trade>>(
    editTrade || {
      symbol: "",
      tradeType: "long",
      assetClass: "equity",
      entryDate: "",
      exitDate: "",
      entryPrice: 0,
      exitPrice: 0,
      quantity: 0,
      stopLoss: 0,
      takeProfit: 0,
      strategy: "",
      setup: "",
      timeframe: "15m",
      emotionalState: "neutral",
      preTradeNotes: "",
      postTradeReview: "",
      tags: [],
      images: [],
    }
  );

  const [customStrategy, setCustomStrategy] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>(editTrade?.tags || []);

  const pnl = useMemo(() => calculatePnL(formData), [formData]);
  const pnlPercent = useMemo(() => calculatePnLPercent(formData), [formData]);
  const rrr = useMemo(() => calculateRRR(formData), [formData]);
  const result = useMemo(() => determineResult(pnl), [pnl]);

  const updateField = (field: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.size > 2 * 1024 * 1024) return; // Max 2MB per image
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setFormData((prev) => ({
          ...prev,
          images: [...(prev.images || []), base64],
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      images: (prev.images || []).filter((_, i) => i !== index),
    }));
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const addCustomStrategy = () => {
    if (customStrategy.trim() && !allStrategies.includes(customStrategy.trim())) {
      setTradeData({
        ...tradeData,
        customStrategies: [...tradeData.customStrategies, customStrategy.trim()],
      });
      updateField("strategy", customStrategy.trim());
      setCustomStrategy("");
    }
  };

  const handleSubmit = () => {
    if (!formData.symbol || !formData.entryDate || !formData.exitDate || !formData.entryPrice || !formData.exitPrice) {
      return;
    }

    const trade: Trade = {
      id: editTrade?.id || generateId(),
      symbol: formData.symbol!.toUpperCase(),
      tradeType: formData.tradeType as TradeType,
      assetClass: formData.assetClass as AssetClass,
      entryDate: formData.entryDate!,
      exitDate: formData.exitDate!,
      entryPrice: Number(formData.entryPrice),
      exitPrice: Number(formData.exitPrice),
      quantity: Number(formData.quantity),
      stopLoss: Number(formData.stopLoss),
      takeProfit: Number(formData.takeProfit),
      pnl: Math.round(pnl * 100) / 100,
      pnlPercent: Math.round(pnlPercent * 100) / 100,
      rrr: rrr,
      result,
      strategy: formData.strategy || "",
      setup: formData.setup || "",
      timeframe: formData.timeframe as Timeframe,
      emotionalState: formData.emotionalState as EmotionalState,
      preTradeNotes: formData.preTradeNotes || "",
      postTradeReview: formData.postTradeReview || "",
      tags: selectedTags,
      images: formData.images || [],
      createdAt: editTrade?.createdAt || new Date().toISOString(),
    };

    if (editTrade) {
      setTradeData({
        ...tradeData,
        trades: tradeData.trades.map((t) => (t.id === editTrade.id ? trade : t)),
      });
    } else {
      setTradeData({
        ...tradeData,
        trades: [...tradeData.trades, trade],
      });
    }

    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[95vw] md:w-[80vw] max-w-none max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editTrade ? "Edit Trade" : "Log New Trade"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Basic Info
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Symbol *</Label>
                <Input
                  placeholder="e.g., NIFTY, BTC/USD"
                  value={formData.symbol || ""}
                  onChange={(e) => updateField("symbol", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Trade Type *</Label>
                <Select
                  value={formData.tradeType}
                  onValueChange={(v) => updateField("tradeType", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="long">Long</SelectItem>
                    <SelectItem value="short">Short</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Asset Class *</Label>
                <Select
                  value={formData.assetClass}
                  onValueChange={(v) => updateField("assetClass", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equity">Equity</SelectItem>
                    <SelectItem value="futures">Futures</SelectItem>
                    <SelectItem value="options">Options</SelectItem>
                    <SelectItem value="forex">Forex</SelectItem>
                    <SelectItem value="crypto">Crypto</SelectItem>
                    <SelectItem value="commodity">Commodity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Entry Date & Time *</Label>
                <Input
                  type="datetime-local"
                  value={formData.entryDate || ""}
                  onChange={(e) => updateField("entryDate", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Exit Date & Time *</Label>
                <Input
                  type="datetime-local"
                  value={formData.exitDate || ""}
                  onChange={(e) => updateField("exitDate", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Entry Price *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.entryPrice || ""}
                  onChange={(e) => updateField("entryPrice", parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Exit Price *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.exitPrice || ""}
                  onChange={(e) => updateField("exitPrice", parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  value={formData.quantity || ""}
                  onChange={(e) => updateField("quantity", parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Stop Loss</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.stopLoss || ""}
                  onChange={(e) => updateField("stopLoss", parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Take Profit</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.takeProfit || ""}
                  onChange={(e) => updateField("takeProfit", parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>

          {/* Calculated Fields */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Calculated Fields
            </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-3 rounded-lg border bg-card text-center">
                <p className="text-xs text-muted-foreground">P&L</p>
                <p className={`font-bold ${pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                  {pnl >= 0 ? "+" : ""}
                  {pnl.toFixed(2)}
                </p>
              </div>
              <div className="p-3 rounded-lg border bg-card text-center">
                <p className="text-xs text-muted-foreground">P&L %</p>
                <p className={`font-bold ${pnlPercent >= 0 ? "text-green-500" : "text-red-500"}`}>
                  {pnlPercent >= 0 ? "+" : ""}
                  {pnlPercent.toFixed(2)}%
                </p>
              </div>
              <div className="p-3 rounded-lg border bg-card text-center">
                <p className="text-xs text-muted-foreground">RRR</p>
                <p className="font-bold">{rrr.toFixed(2)}</p>
              </div>
              <div className="p-3 rounded-lg border bg-card text-center">
                <p className="text-xs text-muted-foreground">Result</p>
                <Badge
                  className={
                    result === "win"
                      ? "bg-green-500 text-white"
                      : result === "loss"
                        ? "bg-red-500 text-white"
                        : "bg-yellow-500 text-black"
                  }
                >
                  {result.toUpperCase()}
                </Badge>
              </div>
            </div>
          </div>

          {/* Additional Fields */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Additional Info
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Strategy</Label>
                <Select
                  value={formData.strategy || ""}
                  onValueChange={(v) => updateField("strategy", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {allStrategies.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-1">
                  <Input
                    placeholder="Custom strategy"
                    value={customStrategy}
                    onChange={(e) => setCustomStrategy(e.target.value)}
                    className="text-xs h-7"
                  />
                  <Button size="sm" variant="outline" onClick={addCustomStrategy} className="h-7 px-2">
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Setup / Pattern</Label>
                <Select
                  value={formData.setup || ""}
                  onValueChange={(v) => updateField("setup", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {SETUPS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Timeframe</Label>
                <Select
                  value={formData.timeframe || "15m"}
                  onValueChange={(v) => updateField("timeframe", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1m">1m</SelectItem>
                    <SelectItem value="5m">5m</SelectItem>
                    <SelectItem value="15m">15m</SelectItem>
                    <SelectItem value="1H">1H</SelectItem>
                    <SelectItem value="4H">4H</SelectItem>
                    <SelectItem value="Daily">Daily</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Emotional State at Entry</Label>
              <Select
                value={formData.emotionalState || "neutral"}
                onValueChange={(v) => updateField("emotionalState", v)}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="confident">
                    <span className="flex items-center gap-2">
                      <SmileyWink size={16} weight="fill" style={{ color: "#22c55e" }} />
                      Confident
                    </span>
                  </SelectItem>
                  <SelectItem value="anxious">
                    <span className="flex items-center gap-2">
                      <SmileyNervous size={16} weight="fill" style={{ color: "#f97316" }} />
                      Anxious
                    </span>
                  </SelectItem>
                  <SelectItem value="fomo">
                    <span className="flex items-center gap-2">
                      <SmileyXEyes size={16} weight="fill" style={{ color: "#a855f7" }} />
                      FOMO
                    </span>
                  </SelectItem>
                  <SelectItem value="neutral">
                    <span className="flex items-center gap-2">
                      <SmileyMeh size={16} weight="fill" style={{ color: "#94a3b8" }} />
                      Neutral
                    </span>
                  </SelectItem>
                  <SelectItem value="fearful">
                    <span className="flex items-center gap-2">
                      <SmileySad size={16} weight="fill" style={{ color: "#ef4444" }} />
                      Fearful
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2">
                {TAGS.map((tag) => (
                  <Badge
                    key={tag}
                    variant={selectedTags.includes(tag) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Pre-trade Notes</Label>
              <Textarea
                placeholder="What was your analysis?"
                value={formData.preTradeNotes || ""}
                onChange={(e) => updateField("preTradeNotes", e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Post-trade Review / Learnings</Label>
              <Textarea
                placeholder="What did you learn?"
                value={formData.postTradeReview || ""}
                onChange={(e) => updateField("postTradeReview", e.target.value)}
                rows={2}
              />
            </div>

            {/* Image Upload */}
            <div className="space-y-2">
              <Label>Screenshots</Label>
              <div className="flex flex-wrap gap-2">
                {(formData.images || []).map((img, i) => (
                  <div key={i} className="relative h-20 w-20 rounded-md overflow-hidden border group">
                    <Image src={img} alt={`Screenshot ${i + 1}`} fill className="object-cover" unoptimized />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute top-0.5 right-0.5 h-5 w-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <label className="h-20 w-20 rounded-md border-2 border-dashed flex items-center justify-center cursor-pointer hover:border-primary transition-colors">
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">Max 2MB per image</p>
            </div>
          </div>

          <Button onClick={handleSubmit} className="w-full">
            {editTrade ? "Update Trade" : "Log Trade"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
