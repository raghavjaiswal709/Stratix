"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import type { HabitData, TodoData, TradeData, ScoreWeights } from "@/types";

interface AppData {
  habitData: HabitData;
  todoData: TodoData;
  tradeData: TradeData;
  scoreWeights: ScoreWeights;
  theme: "light" | "dark";
}

interface AppContextType extends AppData {
  setHabitData: (data: HabitData) => void;
  setTodoData: (data: TodoData) => void;
  setTradeData: (data: TradeData) => void;
  setScoreWeights: (weights: ScoreWeights) => void;
  setTheme: (theme: "light" | "dark") => void;
  loading: boolean;
}

const defaultData: AppData = {
  habitData: { habits: [], logs: [] },
  todoData: { todos: [] },
  tradeData: { trades: [], customStrategies: [] },
  scoreWeights: { habitWeight: 0.5, todoWeight: 0.5 },
  theme: "dark",
};

const AppContext = createContext<AppContextType>({
  ...defaultData,
  setHabitData: () => {},
  setTodoData: () => {},
  setTradeData: () => {},
  setScoreWeights: () => {},
  setTheme: () => {},
  loading: true,
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [data, setData] = useState<AppData>(defaultData);
  const [loading, setLoading] = useState(true);
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

  return (
    <AppContext.Provider
      value={{
        ...data,
        setHabitData,
        setTodoData,
        setTradeData,
        setScoreWeights,
        setTheme,
        loading,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
