"use client";

import { useRef, useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SwipeableTabsProps {
  tabs: { value: string; label: string }[];
  activeTab: string;
  onTabChange: (value: string) => void;
  children: ReactNode[];
  className?: string;
}

const SWIPE_THRESHOLD = 50;

export function SwipeableTabs({
  tabs,
  activeTab,
  onTabChange,
  children,
  className,
}: SwipeableTabsProps) {
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const activeIndex = tabs.findIndex((t) => t.value === activeTab);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartRef.current.y);
      const dt = Date.now() - touchStartRef.current.time;

      // Only register swipe if horizontal > threshold and not too vertical
      if (Math.abs(dx) > SWIPE_THRESHOLD && dy < 100 && dt < 500) {
        if (dx < 0 && activeIndex < tabs.length - 1) {
          onTabChange(tabs[activeIndex + 1].value);
        } else if (dx > 0 && activeIndex > 0) {
          onTabChange(tabs[activeIndex - 1].value);
        }
      }
      touchStartRef.current = null;
    },
    [activeIndex, tabs, onTabChange]
  );

  return (
    <div className={cn("w-full", className)}>
      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted/50 border border-border/40 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => onTabChange(tab.value)}
            className={cn(
              "px-4 py-1.5 text-[13px] font-medium rounded-md transition-all duration-150",
              activeTab === tab.value
                ? "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Swipeable content area */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="mt-5 touch-pan-y"
      >
        {children[activeIndex]}
      </div>
    </div>
  );
}
