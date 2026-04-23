"use client";

import { Diary } from "@/components/diary/diary";

export default function DiaryPage() {
  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-white tracking-tight">Diary</h1>
        <p className="text-[13px] text-white/40 mt-0.5">Reflect on your day</p>
      </div>
      <div className="bg-[#141720] rounded-2xl border border-white/[0.07] p-5">
        <Diary />
      </div>
    </div>
  );
}
