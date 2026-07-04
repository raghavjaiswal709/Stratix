"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import type { HabitData, TodoData, TradeData, ScoreWeights, DiaryData, NotesData, UserPreferences, ApiTrade, TradingProfile } from "@/types";
import { ACCENT_PRESETS } from "@/types";

// Best-contrast text color for an arbitrary hex fill — used as a fallback for
// legacy/custom accent values that aren't one of the curated ACCENT_PRESETS
// (which each already carry a hand-picked `foreground`).
function contrastForeground(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return "#ffffff";
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? "#000000" : "#ffffff";
}

// Subset of AppData fetched server-side in the root layout for zero-flicker shell rendering.
export interface InitialMeta {
  preferences: UserPreferences | null;
  scoreWeights: ScoreWeights | null;
  theme: "light" | "dark" | null;
  tradingProfiles: TradingProfile[] | null;
  activeProfileId: string | null;
}

interface AppData {
  habitData: HabitData;
  todoData: TodoData;
  tradeData: TradeData;
  diaryData: DiaryData;
  notesData: NotesData;
  preferences: UserPreferences;
  scoreWeights: ScoreWeights;
  theme: "light" | "dark";
  tradingProfiles: TradingProfile[];
  activeProfileId: string;
}

interface AppContextType extends AppData {
  setHabitData: (data: HabitData) => void;
  setTodoData: (data: TodoData) => void;
  setTradeData: (data: TradeData) => void;
  setDiaryData: (data: DiaryData) => void;
  setNotesData: (data: NotesData) => void;
  setPreferences: (prefs: UserPreferences) => void;
  setScoreWeights: (weights: ScoreWeights) => void;
  setTheme: (theme: "light" | "dark") => void;
  // Shared in-memory trade cache — syncs trades page ↔ journal page within same session
  sharedTrades: ApiTrade[];
  setSharedTrades: (t: ApiTrade[]) => void;
  loading: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (val: boolean) => void;
  // Trading profiles
  setActiveProfileId: (id: string) => void;
  createProfile: (profile: Omit<TradingProfile, "id" | "createdAt">) => void;
  updateProfile: (id: string, updates: Partial<Omit<TradingProfile, "id" | "createdAt">>) => void;
  deleteProfile: (id: string) => void;
}

const defaultPreferences: UserPreferences = {
  accentColor: "#10b981",
  defaultPage: "/dashboard",
  defaultTab: "todos",
  sectionOrder: ["todos", "habits", "diary", "notes"],
  showQuotes: true,
  sidebarItems: {
    dashboard: true,
    trades: true,
    journal: true,
    tradeNotes: true,
    backtesting: true,
    data: true,
    newsAnalysis: true,
    liveData: true,
    chart: true,
    aiReport: true,
    todo: true,
    habits: true,
    diary: true,
    notes: true,
    contentCreator: true,
  },
};

const defaultData: AppData = {
  habitData: { habits: [], logs: [] },
  todoData: { todos: [], tags: [] },
  tradeData: {
    trades: [],
    customStrategies: [],
    tradeNotes: {
      notes: [],
      categories: []
    }
  },
  diaryData: { entries: [] },
  notesData: { notes: [] },
  preferences: defaultPreferences,
  scoreWeights: { habitWeight: 0.5, todoWeight: 0.5 },
  theme: "dark",
  tradingProfiles: [],
  activeProfileId: "",
};

const AppContext = createContext<AppContextType>({
  ...defaultData,
  setHabitData: () => {},
  setTodoData: () => {},
  setTradeData: () => {},
  setDiaryData: () => {},
  setNotesData: () => {},
  setPreferences: () => {},
  setScoreWeights: () => {},
  setTheme: () => {},
  sharedTrades: [],
  setSharedTrades: () => {},
  loading: true,
  saveStatus: "idle",
  hasUnsavedChanges: false,
  setHasUnsavedChanges: () => {},
  setActiveProfileId: () => {},
  createProfile: () => {},
  updateProfile: () => {},
  deleteProfile: () => {},
});

const LS_ACTIVE_PROFILE_KEY = "stratix_activeProfileId";
const LS_PENDING_SAVE_KEY = "stratix_pending_save";

function buildInitialData(initialMeta: InitialMeta | null): AppData {
  if (!initialMeta) return defaultData;
  return {
    ...defaultData,
    preferences: initialMeta.preferences ?? defaultPreferences,
    scoreWeights: initialMeta.scoreWeights ?? defaultData.scoreWeights,
    theme: initialMeta.theme ?? "dark",
    tradingProfiles: initialMeta.tradingProfiles ?? [],
    activeProfileId: initialMeta.activeProfileId ?? "",
  };
}

async function fetchWithRetry(url: string, options: RequestInit, maxAttempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

export function AppProvider({
  children,
  initialMeta = null,
}: {
  children: React.ReactNode;
  initialMeta?: InitialMeta | null;
}) {
  const { data: session, status } = useSession();
  const [data, setData] = useState<AppData>(() => buildInitialData(initialMeta));
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [sharedTrades, setSharedTrades] = useState<ApiTrade[]>([]);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<Partial<AppData>>({});

  // Load full data from API (content fields: habits, todos, diary, notes, tradeData)
  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      const timer = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(timer);
    }

    const localActiveId = typeof window !== "undefined"
      ? (localStorage.getItem(LS_ACTIVE_PROFILE_KEY) ?? "")
      : "";

    fetch("/api/user-data")
      .then((res) => res.json())
      .then((userData) => {
        const timer = setTimeout(() => {
          setData({
            habitData: userData.habitData || defaultData.habitData,
            todoData: userData.todoData || defaultData.todoData,
            tradeData: userData.tradeData || defaultData.tradeData,
            diaryData: userData.diaryData || defaultData.diaryData,
            notesData: userData.notesData || defaultData.notesData,
            preferences: userData.preferences || defaultPreferences,
            scoreWeights: userData.scoreWeights || defaultData.scoreWeights,
            theme: userData.theme || defaultData.theme,
            tradingProfiles: Array.isArray(userData.tradingProfiles) ? userData.tradingProfiles : [],
            activeProfileId: localActiveId || userData.activeProfileId || "",
          });
          setLoading(false);
        }, 0);
        return () => clearTimeout(timer);
      })
      .catch(() => {
        const timer = setTimeout(() => setLoading(false), 0);
        return () => clearTimeout(timer);
      });
  }, [session, status]);

  // After data loads, re-submit any save that failed in a previous session
  useEffect(() => {
    if (loading || !session?.user) return;
    const raw = typeof window !== "undefined" ? localStorage.getItem(LS_PENDING_SAVE_KEY) : null;
    if (!raw) return;
    let pending: Partial<AppData>;
    try {
      pending = JSON.parse(raw);
    } catch {
      localStorage.removeItem(LS_PENDING_SAVE_KEY);
      return;
    }

    // Apply locally so the UI reflects the recovered state
    setData(prev => ({ ...prev, ...pending }));

    fetch("/api/user-data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pending),
    })
      .then(res => { if (res.ok) localStorage.removeItem(LS_PENDING_SAVE_KEY); })
      .catch(() => {}); // Will be retried on the next session
  }, [loading, session]);

  // Save to API with retry and localStorage fallback
  const saveToApi = useCallback(
    (updates: Partial<AppData>) => {
      if (!session?.user) return;

      pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates };

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current);

      setSaveStatus("saving");

      saveTimeoutRef.current = setTimeout(async () => {
        const updatesToSend = pendingUpdatesRef.current;
        pendingUpdatesRef.current = {};

        try {
          await fetchWithRetry("/api/user-data", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatesToSend),
          });
          setSaveStatus("saved");
          localStorage.removeItem(LS_PENDING_SAVE_KEY);
          saveStatusTimeoutRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
        } catch (err) {
          console.error("Save failed after retries:", err);
          // Persist locally so we can recover on next session
          try {
            const existing = JSON.parse(localStorage.getItem(LS_PENDING_SAVE_KEY) || "{}");
            localStorage.setItem(LS_PENDING_SAVE_KEY, JSON.stringify({ ...existing, ...updatesToSend }));
          } catch {}
          setSaveStatus("error");
        }
      }, 500);
    },
    [session]
  );

  const setHabitData = useCallback(
    (habitData: HabitData) => {
      setData((prev) => ({ ...prev, habitData }));
      saveToApi({ habitData });
    },
    [saveToApi]
  );

  const setTodoData = useCallback(
    (todoData: TodoData) => {
      setData((prev) => ({ ...prev, todoData }));
      saveToApi({ todoData });
    },
    [saveToApi]
  );

  const setTradeData = useCallback(
    (tradeData: TradeData) => {
      setData((prev) => ({ ...prev, tradeData }));
      saveToApi({ tradeData });
    },
    [saveToApi]
  );

  const setDiaryData = useCallback(
    (diaryData: DiaryData) => {
      setData((prev) => ({ ...prev, diaryData }));
      saveToApi({ diaryData });
    },
    [saveToApi]
  );

  const setNotesData = useCallback(
    (notesData: NotesData) => {
      setData((prev) => ({ ...prev, notesData }));
      saveToApi({ notesData });
    },
    [saveToApi]
  );

  const setPreferences = useCallback(
    (preferences: UserPreferences) => {
      setData((prev) => ({ ...prev, preferences }));
      saveToApi({ preferences });
    },
    [saveToApi]
  );

  const setScoreWeights = useCallback(
    (scoreWeights: ScoreWeights) => {
      setData((prev) => ({ ...prev, scoreWeights }));
      saveToApi({ scoreWeights });
    },
    [saveToApi]
  );

  const setTheme = useCallback(
    (theme: "light" | "dark") => {
      setData((prev) => ({ ...prev, theme }));
      saveToApi({ theme });
    },
    [saveToApi]
  );

  // ── Trading profiles ──────────────────────────────────────────────────────────

  const setActiveProfileId = useCallback(
    (id: string) => {
      setData((prev) => ({ ...prev, activeProfileId: id }));
      if (typeof window !== "undefined") {
        localStorage.setItem(LS_ACTIVE_PROFILE_KEY, id);
      }
      saveToApi({ activeProfileId: id });
    },
    [saveToApi]
  );

  const createProfile = useCallback(
    (profile: Omit<TradingProfile, "id" | "createdAt">) => {
      const newProfile: TradingProfile = {
        ...profile,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };

      const newTradingProfiles = [...data.tradingProfiles, newProfile];
      setData((prev) => ({ ...prev, tradingProfiles: newTradingProfiles }));
      saveToApi({ tradingProfiles: newTradingProfiles });
    },
    [data.tradingProfiles, saveToApi]
  );

  const updateProfile = useCallback(
    (id: string, updates: Partial<Omit<TradingProfile, "id" | "createdAt">>) => {
      const newTradingProfiles = data.tradingProfiles.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      );
      setData((prev) => ({ ...prev, tradingProfiles: newTradingProfiles }));
      saveToApi({ tradingProfiles: newTradingProfiles });
    },
    [data.tradingProfiles, saveToApi]
  );

  const deleteProfile = useCallback(
    (id: string) => {
      const newTradingProfiles = data.tradingProfiles.filter((p) => p.id !== id);
      const activeProfileId = data.activeProfileId === id ? "" : data.activeProfileId;

      setData((prev) => ({ ...prev, tradingProfiles: newTradingProfiles, activeProfileId }));

      const apiUpdates: Partial<AppData> = { tradingProfiles: newTradingProfiles };
      if (activeProfileId !== data.activeProfileId) {
        apiUpdates.activeProfileId = activeProfileId;
        if (typeof window !== "undefined") {
          localStorage.setItem(LS_ACTIVE_PROFILE_KEY, "");
        }
      }
      saveToApi(apiUpdates);
    },
    [data.tradingProfiles, data.activeProfileId, saveToApi]
  );

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    if (data.theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [data.theme]);

  // Apply accent color — also sets a matching foreground so solid fills
  // (primary buttons, active sidebar nav item) stay readable regardless of
  // which of the 20 curated themes (or a legacy custom hex) is selected.
  useEffect(() => {
    const value = data.preferences.accentColor || "#10b981";
    const preset = ACCENT_PRESETS.find((p) => p.value.toLowerCase() === value.toLowerCase());
    const foreground = preset?.foreground ?? contrastForeground(value);
    document.documentElement.style.setProperty("--accent-color", value);
    document.documentElement.style.setProperty("--accent-color-foreground", foreground);
  }, [data.preferences.accentColor]);

  return (
    <AppContext.Provider
      value={{
        ...data,
        setHabitData,
        setTodoData,
        setTradeData,
        setDiaryData,
        setNotesData,
        setPreferences,
        setScoreWeights,
        setTheme,
        sharedTrades,
        setSharedTrades,
        loading,
        saveStatus,
        hasUnsavedChanges,
        setHasUnsavedChanges,
        setActiveProfileId,
        createProfile,
        updateProfile,
        deleteProfile,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
