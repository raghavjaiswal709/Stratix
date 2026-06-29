"use client";

import { ContentCreatorPage } from "@/components/content-creator/ContentCreatorPage";
import { Layers2 } from "lucide-react";

export default function Page() {
  return (
    <div className="flex flex-col h-full overflow-hidden text-[#d1d5db] font-sans bg-[#0f0f0f]">
      {/* Upper Navigation Header matching the Stratix app style */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#0f0f0f] shrink-0">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Tools</span>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Layers2 className="w-5 h-5 text-white/80 shrink-0" /> Content Creator
          </h1>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ContentCreatorPage />
      </div>
    </div>
  );
}
