"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useAppContext } from "@/lib/context";
import { Search, X, CheckSquare, StickyNote, Tag, FileText } from "lucide-react";

interface SearchResult {
  type: "todo" | "note" | "diary";
  title: string;
  preview: string;
  tags?: string[];
  date?: string;
}

export function GlobalSearch() {
  const { todoData, notesData, diaryData } = useAppContext();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: Ctrl/Cmd + K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const results = useMemo<SearchResult[]>(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const items: SearchResult[] = [];

    // Search todos
    (todoData.todos || []).forEach((t) => {
      if (
        t.title.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.tags?.some((tag) => tag.toLowerCase().includes(q)) ||
        t.category?.toLowerCase().includes(q)
      ) {
        items.push({
          type: "todo",
          title: t.title,
          preview: t.description || t.category || "",
          tags: t.tags,
          date: t.dueDate,
        });
      }
    });

    // Search notes
    (notesData.notes || []).forEach((n) => {
      if (
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags?.some((tag) => tag.toLowerCase().includes(q))
      ) {
        items.push({
          type: "note",
          title: n.title,
          preview: n.content.slice(0, 100),
          tags: n.tags,
        });
      }
    });

    // Search diary
    (diaryData.entries || []).forEach((e) => {
      if (e.content.toLowerCase().includes(q)) {
        items.push({
          type: "diary",
          title: `Diary — ${e.date}`,
          preview: e.content.slice(0, 100),
          date: e.date,
        });
      }
    });

    return items.slice(0, 20);
  }, [query, todoData, notesData, diaryData]);

  const close = useCallback(() => { setOpen(false); setQuery(""); }, []);

  const typeIcon = (type: SearchResult["type"]) => {
    switch (type) {
      case "todo": return <CheckSquare className="h-3.5 w-3.5 text-white/65 shrink-0" />;
      case "note": return <StickyNote className="h-3.5 w-3.5 text-amber-400 shrink-0" />;
      case "diary": return <FileText className="h-3.5 w-3.5 text-emerald-400 shrink-0" />;
    }
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="flex items-center gap-2 h-8 px-3 rounded-lg text-muted-foreground/50 hover:text-muted-foreground bg-muted/40 hover:bg-muted border border-border/50 transition-all text-[12px]"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Search…</span>
        <kbd className="hidden md:inline text-[10px] bg-background/60 px-1.5 py-0.5 rounded border border-border/60 font-mono">
          ⌘K
        </kbd>
      </button>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={close}>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg mx-4 rounded-xl bg-background border border-border shadow-2xl overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
              <Search className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              <input
                ref={inputRef}
                className="flex-1 bg-transparent text-sm outline-none placeholder-muted-foreground/40 text-foreground"
                placeholder="Search todos, notes, diary…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-muted-foreground/50 hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Results */}
            <div className="max-h-[50vh] overflow-y-auto">
              {query.trim() && results.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground/50">
                  No results found
                </div>
              )}
              {results.map((r, i) => (
                <button
                  key={`${r.type}-${i}`}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left border-b border-border/30 last:border-0"
                  onClick={close}
                >
                  <div className="mt-0.5">{typeIcon(r.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    {r.preview && (
                      <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{r.preview}</p>
                    )}
                    {r.tags && r.tags.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {r.tags.map((tag) => (
                          <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/65 flex items-center gap-0.5">
                            <Tag className="h-1.5 w-1.5" />{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] text-muted-foreground/40 uppercase shrink-0 mt-1">{r.type}</span>
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-border/40 flex items-center gap-3 text-[10px] text-muted-foreground/40">
              <span>↑↓ Navigate</span>
              <span>↵ Open</span>
              <span>Esc Close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
