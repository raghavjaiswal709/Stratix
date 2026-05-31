"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Wifi, WifiOff, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Phase =
  | "idle"        // form not yet submitted
  | "detecting"   // MetaApi is auto-detecting broker settings; counting down to retry
  | "connecting"  // account created; polling for DEPLOYED state
  | "connected"   // successfully deployed
  | "error";      // permanent failure

interface MT5Status {
  state: string;
  connected: boolean;
  mt5Login?: string;
  mt5Server?: string;
  mt5AccountId?: string;
}

interface ConnectMT5FormProps {
  onConnected: (info: { mt5Login: string; mt5Server: string; mt5AccountId: string }) => void;
  deployingAccountId?: string;
}

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_MS = 5 * 60 * 1_000; // 5 minutes

export function ConnectMT5Form({ onConnected, deployingAccountId }: ConnectMT5FormProps) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [phase, setPhase] = useState<Phase>(deployingAccountId ? "connecting" : "idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [suggestedServers, setSuggestedServers] = useState<string[]>([]);
  // For 202 auto-retry
  const [countdown, setCountdown] = useState(0);
  const pendingTxIdRef = useRef<string | null>(null);
  const pendingLoginRef = useRef("");
  const pendingPasswordRef = useRef("");
  const pendingServerRef = useRef("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  const clearPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = useCallback(() => {
    clearPoll();
    pollStartRef.current = Date.now();

    pollRef.current = setInterval(async () => {
      if (Date.now() - pollStartRef.current > MAX_POLL_MS) {
        clearPoll();
        setPhase("error");
        setErrorMsg("Deployment timed out (>5 min). Please check app.metaapi.cloud or try again.");
        return;
      }

      try {
        const res = await fetch("/api/mt5/status");
        if (!res.ok) return;
        const data: MT5Status = await res.json();

        if (data.state === "DEPLOYED" && data.connected) {
          clearPoll();
          setPhase("connected");
          onConnected({
            mt5Login: data.mt5Login ?? "",
            mt5Server: data.mt5Server ?? "",
            mt5AccountId: data.mt5AccountId ?? "",
          });
        }
      } catch {
        // non-fatal — will retry
      }
    }, POLL_INTERVAL_MS);
  }, [onConnected]);

  // If starting in deploying mode, begin polling immediately
  useEffect(() => {
    if (deployingAccountId) startPolling();
    return clearPoll;
  }, [deployingAccountId, startPolling]);

  // Countdown for 202 broker-detection retry
  useEffect(() => {
    if (phase !== "detecting" || countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // When countdown reaches 0 in detecting phase, auto-retry
  useEffect(() => {
    if (phase !== "detecting" || countdown > 0) return;
    // Retry with stored credentials + same transaction-id
    void submitConnect(
      pendingLoginRef.current,
      pendingPasswordRef.current,
      pendingServerRef.current,
      pendingTxIdRef.current ?? undefined
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, countdown]);

  async function submitConnect(
    l: string,
    pw: string,
    srv: string,
    txId?: string
  ) {
    setErrorMsg(null);
    setSuggestedServers([]);
    setPhase("connecting");

    try {
      const res = await fetch("/api/mt5/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: l,
          password: pw,
          server: srv,
          ...(txId ? { transactionId: txId } : {}),
        }),
      });

      const data = await res.json();

      if (res.status === 202) {
        // MetaApi is auto-detecting broker settings.
        // Store transaction-id + credentials and count down to auto-retry.
        const seconds: number = data.retryAfterSeconds ?? 65;
        pendingTxIdRef.current = data.transactionId ?? null;
        pendingLoginRef.current = l;
        pendingPasswordRef.current = pw;
        pendingServerRef.current = srv;
        setCountdown(seconds);
        setPhase("detecting");
        return;
      }

      if (!res.ok) {
        setPhase("error");
        setErrorMsg(data.error ?? "Failed to register MT5 account.");
        if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setSuggestedServers(data.suggestions as string[]);
        }
        return;
      }

      // 201 — account created; poll for DEPLOYED state
      startPolling();
    } catch {
      setPhase("error");
      setErrorMsg("Network error — please try again.");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!login.trim() || !password.trim() || !server.trim()) {
      setErrorMsg("All three fields are required.");
      return;
    }
    void submitConnect(login.trim(), password, server.trim());
  }

  // ── Connected ────────────────────────────────────────────────────────────────
  if (phase === "connected") {
    return (
      <div className="flex items-center gap-2 text-sm text-green-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>MT5 account connected successfully.</span>
      </div>
    );
  }

  // ── Broker settings detection (202 auto-retry countdown) ─────────────────────
  if (phase === "detecting") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-yellow-400" />
          <span>
            MetaApi is detecting your broker settings…{" "}
            <strong className="text-foreground">
              retrying in {countdown}s
            </strong>
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          This is automatic. Keep this page open — we&apos;ll retry once MetaApi finishes.
        </p>
      </div>
    );
  }

  // ── Deploying / polling ──────────────────────────────────────────────────────
  if (phase === "connecting") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/65" />
          <span>
            Connecting to MetaApi —{" "}
            <strong className="text-foreground">this typically takes 1–3 minutes</strong>…
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          MetaApi is deploying a cloud terminal for your MT5 account. Please keep this page open.
        </p>
      </div>
    );
  }

  // ── Form (idle or error) ─────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      <div className="space-y-1">
        <Label htmlFor="mt5-login">MT5 Login (Account Number)</Label>
        <Input
          id="mt5-login"
          type="text"
          inputMode="numeric"
          placeholder="e.g. 12345678"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="mt5-password">MT5 Password</Label>
        <Input
          id="mt5-password"
          type="password"
          placeholder="Your MT5 account password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <p className="text-[11px] text-muted-foreground">
          Sent once to MetaApi to register your account — never stored.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="mt5-server">Broker Server</Label>
        <Input
          id="mt5-server"
          type="text"
          placeholder="e.g. Deriv-Demo"
          value={server}
          onChange={(e) => setServer(e.target.value)}
          autoComplete="off"
        />
        <p className="text-[11px] text-muted-foreground">
          Find this in MT5 desktop → File → Login to Trade Account → Server.
        </p>
      </div>

      {errorMsg && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
          {suggestedServers.length > 0 && (
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-sm">
              <p className="text-yellow-400 font-medium mb-1">
                Suggested server names — click to use:
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {suggestedServers.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setServer(s)}
                    className="rounded bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-300 hover:bg-yellow-500/40 transition-colors font-mono"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Button type="submit" className="w-full gap-2">
        <Wifi className="h-4 w-4" />
        Connect MT5
      </Button>

      <p className="text-[11px] text-muted-foreground text-center">
        Connection via{" "}
        <a
          href="https://metaapi.cloud"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          MetaApi
        </a>{" "}
        — takes 1–3 minutes on first connect.
      </p>
    </form>
  );
}

// ── DisconnectMT5Button ──────────────────────────────────────────────────────
interface DisconnectMT5ButtonProps {
  mt5Login: string;
  mt5Server: string;
  onDisconnected: () => void;
}

export function DisconnectMT5Button({ mt5Login, mt5Server, onDisconnected }: DisconnectMT5ButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDisconnect() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mt5/connect", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to disconnect.");
        return;
      }
      onDisconnected();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <Wifi className="h-4 w-4 text-green-400 shrink-0" />
        <span className="text-foreground font-medium">{mt5Login}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{mt5Server}</span>
      </div>
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
        onClick={handleDisconnect}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <WifiOff className="h-3 w-3" />}
        Disconnect MT5
      </Button>
    </div>
  );
}
