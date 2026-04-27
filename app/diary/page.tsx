"use client";

import { Diary } from "@/components/diary/diary";

export default function DiaryPage() {
  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Diary</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">Reflect on your day</p>
      </div>
      <div className="bg-card rounded-2xl border border-border p-5">
        <Diary />
      </div>
    </div>
  );
}
