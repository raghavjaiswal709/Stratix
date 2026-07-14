"use client";

import { ContentCreatorPage } from "@/components/content-creator/ContentCreatorPage";
import { Layers2 } from "lucide-react";

export default function Page() {
  return (
    <div className="flex flex-col h-full overflow-hidden text-[#d1d5db] font-sans bg-[#0f0f0f]">
      <div className="flex-1 overflow-hidden">
        <ContentCreatorPage />
      </div>
    </div>
  );
}
