"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Shield, X, LayoutDashboard, TrendingUp } from "lucide-react";
import { AppContext, defaultPreferences, type AppContextType } from "@/lib/context";
import type { ApiTrade, TradingProfile, UserPreferences } from "@/types";
import TradesPage from "@/app/trades/page";
import DashboardPage from "@/app/dashboard/page";
import { cn } from "@/lib/utils";

interface AdminMeta {
  user: { id: string; name: string; email: string; image: string };
  preferences: UserPreferences | null;
  tradingProfiles: TradingProfile[];
  activeProfileId: string;
}

// Admin "view as" page — lets an admin see a member's Dashboard/Trades exactly
// as that member sees them, without logging in as them. Reuses the same page
// components the member gets; a scoped AppContext.Provider below feeds them
// this member's preferences/profiles instead of the admin's own (which is
// what the normal, session-bound AppProvider in the root layout always
// supplies). Read-only: every mutation control is hidden inside those pages
// whenever a viewUserId prop is present (see the `readOnly` checks there).
export default function AdminViewUserPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams<{ userId: string }>();
  const userId = params.userId;

  const [meta, setMeta] = useState<AdminMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"trades" | "dashboard">("trades");
  const [localPreferences, setLocalPreferences] = useState<UserPreferences>(defaultPreferences);
  const [localActiveProfileId, setLocalActiveProfileId] = useState("");
  const [sharedTrades, setSharedTrades] = useState<ApiTrade[]>([]);

  // Guard — redirect non-admins, mirrors /admin's own guard.
  useEffect(() => {
    if (status === "loading") return;
    if (!session || session.user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [session, status, router]);

  useEffect(() => {
    if (session?.user.role !== "admin" || !userId) return;
    fetch(`/api/admin/users/${userId}/meta`)
      .then(async (res) => {
        if (!res.ok) {
          setError(res.status === 404 ? "User not found" : "Failed to load user");
          return;
        }
        const data: AdminMeta = await res.json();
        setMeta(data);
        setLocalPreferences(data.preferences ?? defaultPreferences);
        setLocalActiveProfileId(data.activeProfileId ?? "");
      })
      .catch(() => setError("Failed to load user"));
  }, [session, userId]);

  if (status === "loading" || (!meta && !error)) {
    return (
      <div className="flex items-center justify-center h-dvh bg-background">
        <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
      </div>
    );
  }

  if (error || !meta) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-background gap-3">
        <p className="text-sm text-muted-foreground">{error ?? "Failed to load user"}</p>
        <a href="/admin" className="text-[12px] text-white/50 hover:text-white/80 transition">
          Back to Admin Panel
        </a>
      </div>
    );
  }

  const contextValue: AppContextType = {
    habitData: { habits: [], logs: [] },
    todoData: { todos: [], tags: [] },
    tradeData: { trades: [], customStrategies: [], tradeNotes: { notes: [], categories: [] } },
    diaryData: { entries: [] },
    notesData: { notes: [] },
    preferences: localPreferences,
    // Habit scoring / theme aren't read by the reused Trades/Dashboard pages —
    // plain defaults are enough here.
    scoreWeights: { habitWeight: 0.5, todoWeight: 0.5 },
    theme: "dark",
    tradingProfiles: meta.tradingProfiles,
    activeProfileId: localActiveProfileId,
    setHabitData: () => {},
    setTodoData: () => {},
    setTradeData: () => {},
    setDiaryData: () => {},
    setNotesData: () => {},
    // Local-only — admin can reorder sort/filter while browsing, but nothing
    // persists to the member's saved preferences.
    setPreferences: (prefs) => setLocalPreferences(prefs),
    setScoreWeights: () => {},
    setTheme: () => {},
    sharedTrades,
    setSharedTrades,
    loading: false,
    metaLoading: false,
    saveStatus: "idle",
    hasUnsavedChanges: false,
    setHasUnsavedChanges: () => {},
    // Local-only — lets the admin switch between the member's own trading
    // profiles/accounts while browsing, without writing anything back.
    setActiveProfileId: (id) => setLocalActiveProfileId(id),
    createProfile: () => {},
    updateProfile: () => {},
    deleteProfile: () => {},
  };

  return (
    <AppContext.Provider value={contextValue}>
      <div className="flex flex-col h-dvh bg-background">
        {/* Banner */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-amber-500/20 bg-amber-500/[0.06]">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/20 shrink-0">
            <Shield className="h-4 w-4 text-amber-400" />
          </div>
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={meta.user.image ?? ""} alt={meta.user.name} />
            <AvatarFallback className="text-[10px] bg-white/[0.08] text-white/60">
              {meta.user.name?.charAt(0)?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-foreground truncate">
              Viewing {meta.user.name || meta.user.email}&rsquo;s trading results
            </p>
            <p className="text-[11px] text-amber-400/80 truncate">{meta.user.email} · Read-only admin view</p>
          </div>

          {/* Tab toggle */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shrink-0">
            <button
              onClick={() => setTab("trades")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors",
                tab === "trades" ? "bg-white/[0.08] text-white" : "text-muted-foreground hover:text-foreground/80"
              )}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Trades</span>
            </button>
            <button
              onClick={() => setTab("dashboard")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors",
                tab === "dashboard" ? "bg-white/[0.08] text-white" : "text-muted-foreground hover:text-foreground/80"
              )}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
          </div>

          <button
            onClick={() => (window.opener ? window.close() : router.push("/admin"))}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition shrink-0"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === "trades" ? <TradesPage viewUserId={userId} /> : <DashboardPage viewUserId={userId} />}
        </div>
      </div>
    </AppContext.Provider>
  );
}
