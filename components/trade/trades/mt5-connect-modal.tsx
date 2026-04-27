"use client";

import { useState, useEffect } from "react";
import { X, Copy, RefreshCw, Wifi, WifiOff, CheckCircle2 } from "lucide-react";

interface MT5Config {
  webhookSecret: string;
  accountId?: string;
  broker?: string;
  connected: boolean;
  lastPingAt?: string;
  _id: string;
  userId: string;
}

interface MT5ConnectModalProps {
  onClose: () => void;
}

export function MT5ConnectModal({ onClose }: MT5ConnectModalProps) {
  const [config, setConfig] = useState<MT5Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [fullSecret, setFullSecret] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [broker, setBroker] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/trade/mt5")
      .then((r) => r.json())
      .then((data) => {
        setConfig(data);
        setAccountId(data.accountId ?? "");
        setBroker(data.broker ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/trade/webhook`
      : "/api/trade/webhook";

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  async function regenerateSecret() {
    setRegenerating(true);
    const res = await fetch("/api/trade/mt5?action=regenerate", { method: "PUT" });
    const data = await res.json();
    setFullSecret(data.webhookSecret);
    setConfig((prev) => prev ? { ...prev, webhookSecret: data.webhookSecret.slice(0, 4) + "****" + data.webhookSecret.slice(-4) } : prev);
    setRegenerating(false);
  }

  async function saveAccountInfo() {
    setSaving(true);
    await fetch("/api/trade/mt5", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, broker }),
    });
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="h-5 w-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const secretDisplay = fullSecret ?? config?.webhookSecret ?? "—";
  const userId = config?.userId ?? "—";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-[560px] rounded-2xl bg-card border border-border shadow-2xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${config?.connected ? "bg-emerald-600/20 border border-emerald-500/30" : "bg-muted border border-border"}`}>
            {config?.connected ? (
              <Wifi className="h-4 w-4 text-emerald-400" />
            ) : (
              <WifiOff className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-[15px] font-semibold text-card-foreground">Connect MetaTrader 5</h2>
            <p className="text-[11px] text-muted-foreground">
              {config?.connected
                ? `Connected · Last ping: ${config.lastPingAt ? new Date(config.lastPingAt).toLocaleTimeString() : "—"}`
                : "Not connected"}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground/80 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* How it works */}
          <div className="rounded-xl bg-blue-600/10 border border-blue-500/20 p-4">
            <h3 className="text-[12px] font-semibold text-blue-400 mb-2">How it works</h3>
            <ol className="space-y-1.5 text-[12px] text-muted-foreground list-none">
              <li className="flex gap-2"><span className="text-blue-400 font-bold">1.</span> Copy your Webhook URL and Secret below</li>
              <li className="flex gap-2"><span className="text-blue-400 font-bold">2.</span> Download the <span className="text-blue-300 font-medium">StratixEA.mq5</span> Expert Advisor from the Trades page</li>
              <li className="flex gap-2"><span className="text-blue-400 font-bold">3.</span> Open MetaEditor → paste your URL, UserID, and Secret into the EA inputs</li>
              <li className="flex gap-2"><span className="text-blue-400 font-bold">4.</span> Compile and attach the EA to any chart — all trades auto-log here</li>
            </ol>
          </div>

          {/* Webhook URL */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Webhook URL</label>
            <div className="flex gap-2">
              <div className="flex-1 rounded-xl bg-muted border border-border px-3 py-2.5 text-[12px] text-foreground/70 font-mono truncate">
                {webhookUrl}
              </div>
              <button
                onClick={() => copy(webhookUrl, "url")}
                className="px-3 rounded-xl bg-muted border border-border text-muted-foreground hover:text-foreground/80 transition"
              >
                {copied === "url" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* User ID */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Your User ID</label>
            <div className="flex gap-2">
              <div className="flex-1 rounded-xl bg-muted border border-border px-3 py-2.5 text-[12px] text-foreground/70 font-mono truncate">
                {userId}
              </div>
              <button
                onClick={() => copy(userId, "uid")}
                className="px-3 rounded-xl bg-muted border border-border text-muted-foreground hover:text-foreground/80 transition"
              >
                {copied === "uid" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Secret */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Webhook Secret</label>
            <div className="flex gap-2">
              <div className="flex-1 rounded-xl bg-muted border border-border px-3 py-2.5 text-[12px] text-foreground/70 font-mono truncate">
                {secretDisplay}
              </div>
              {fullSecret && (
                <button
                  onClick={() => copy(fullSecret, "secret")}
                  className="px-3 rounded-xl bg-muted border border-border text-muted-foreground hover:text-foreground/80 transition"
                >
                  {copied === "secret" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </button>
              )}
              <button
                onClick={regenerateSecret}
                disabled={regenerating}
                title="Regenerate secret"
                className="px-3 rounded-xl bg-muted border border-border text-muted-foreground hover:text-amber-400 transition disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${regenerating ? "animate-spin" : ""}`} />
              </button>
            </div>
            {!fullSecret && (
              <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                Click regenerate to reveal the full secret (copy it immediately — it will be masked again).
              </p>
            )}
          </div>

          {/* Optional: Account info */}
          <div className="border-t border-border pt-4">
            <h3 className="text-[12px] font-semibold text-muted-foreground mb-3">Account Info (optional)</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">MT5 Account #</label>
                <input
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  placeholder="e.g. 12345678"
                  className="w-full rounded-xl bg-muted border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-blue-500/50 transition"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Broker</label>
                <input
                  value={broker}
                  onChange={(e) => setBroker(e.target.value)}
                  placeholder="e.g. ICMarkets"
                  className="w-full rounded-xl bg-muted border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-blue-500/50 transition"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-[13px] font-medium text-muted-foreground hover:text-foreground/80 hover:bg-muted transition"
          >
            Close
          </button>
          <button
            onClick={saveAccountInfo}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-[13px] font-semibold text-white transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Info"}
          </button>
        </div>
      </div>
    </div>
  );
}
