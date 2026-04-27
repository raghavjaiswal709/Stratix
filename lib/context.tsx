"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import type { HabitData, TodoData, TradeData, ScoreWeights, DiaryData, NotesData, UserPreferences, ApiTrade } from "@/types";

interface AppData {
  habitData: HabitData;
  todoData: TodoData;
  tradeData: TradeData;
  diaryData: DiaryData;
  notesData: NotesData;
  preferences: UserPreferences;
  scoreWeights: ScoreWeights;
  theme: "light" | "dark";
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
}

const defaultPreferences: UserPreferences = {
  accentColor: "#6366f1",
  defaultPage: "/dashboard",
  defaultTab: "todos",
  sectionOrder: ["todos", "habits", "diary", "notes"],
};

const defaultData: AppData = {
  habitData: { habits: [], logs: [] },
  todoData: { todos: [], tags: [] },
  tradeData: { trades: [], customStrategies: [] },
  diaryData: { entries: [] },
  notesData: { notes: [] },
  preferences: defaultPreferences,
  scoreWeights: { habitWeight: 0.5, todoWeight: 0.5 },
  theme: "dark",
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
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [data, setData] = useState<AppData>(defaultData);
  const [loading, setLoading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [sharedTrades, setSharedTrades] = useState<ApiTrade[]>([]);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load data from API
  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      setLoading(false);
      return;
    }

    fetch("/api/user-data")
      .then((res) => res.json())
      .then((userData) => {
        setData({
          habitData: userData.habitData || defaultData.habitData,
          todoData: userData.todoData || defaultData.todoData,
          tradeData: userData.tradeData || defaultData.tradeData,
          diaryData: userData.diaryData || defaultData.diaryData,
          notesData: userData.notesData || defaultData.notesData,
          preferences: userData.preferences || defaultPreferences,
          scoreWeights: userData.scoreWeights || defaultData.scoreWeights,
          theme: userData.theme || defaultData.theme,
        });
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [session, status]);

  // Save to API (debounced)
  const saveToApi = useCallback(
    (updates: Partial<AppData>) => {
      if (!session?.user) return;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        fetch("/api/user-data", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
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
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
