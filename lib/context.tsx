"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import type { HabitData, TodoData, TradeData, ScoreWeights, DiaryData, NotesData, UserPreferences, ApiTrade, TradingProfile } from "@/types";

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
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (val: boolean) => void;
  // Trading profiles
  setActiveProfileId: (id: string) => void;
  createProfile: (profile: Omit<TradingProfile, "id" | "createdAt">) => void;
  updateProfile: (id: string, updates: Partial<Omit<TradingProfile, "id" | "createdAt">>) => void;
  deleteProfile: (id: string) => void;
}

const defaultPreferences: UserPreferences = {
  accentColor: "#6366f1",
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
  hasUnsavedChanges: false,
  setHasUnsavedChanges: () => {},
  setActiveProfileId: () => {},
  createProfile: () => {},
  updateProfile: () => {},
  deleteProfile: () => {},
});

const LS_ACTIVE_PROFILE_KEY = "stratix_activeProfileId";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [data, setData] = useState<AppData>(defaultData);
  const [loading, setLoading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [sharedTrades, setSharedTrades] = useState<ApiTrade[]>([]);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<Partial<AppData>>({});

  // Load data from API
  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      const timer = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(timer);
    }

    fetch("/api/user-data")
      .then((res) => res.json())
      .then((userData) => {
        // Prefer localStorage for activeProfileId (instant, no round-trip)
        const localActiveId = typeof window !== "undefined"
          ? (localStorage.getItem(LS_ACTIVE_PROFILE_KEY) ?? "")
          : "";

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

  // Save to API (debounced)
  const saveToApi = useCallback(
    (updates: Partial<AppData>) => {
      if (!session?.user) return;

      pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates };

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        const updatesToSend = pendingUpdatesRef.current;
        pendingUpdatesRef.current = {};
        
        fetch("/api/user-data", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatesToSend),
        }).catch(console.error);
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

  // Apply accent color
  useEffect(() => {
    document.documentElement.style.setProperty("--accent-color", data.preferences.accentColor || "#6366f1");
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
