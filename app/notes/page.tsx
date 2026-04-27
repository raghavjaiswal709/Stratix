"use client";

import { Notes } from "@/components/notes/notes";

export default function NotesPage() {
  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Notes</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">Capture thoughts and ideas</p>
      </div>
      <div className="bg-card rounded-2xl border border-border p-5">
        <Notes />
      </div>
    </div>
  );
}
