"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useAppContext } from "@/lib/context";
import {
  Plus,
  Search,
  MoreVertical,
  Trash2,
  FileText,
  Target,
  TrendingDown,
  Brain,
  AlertTriangle,
  Calendar,
  Check,
  ChevronDown,
  X,
} from "lucide-react";
import { format } from "date-fns";
import type { TradeNote, TradeNoteCategory } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RichEditor } from "@/components/trade/notes/rich-editor";
import { cn } from "@/lib/utils";
import { generateId } from "@/lib/habits";

// ── Constants ──────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  Target,
  TrendingDown,
  Brain,
  AlertTriangle,
  FileText,
};

const ICON_LIST = [
  { name: "FileText", Icon: FileText },
  { name: "Target", Icon: Target },
  { name: "TrendingDown", Icon: TrendingDown },
  { name: "Brain", Icon: Brain },
  { name: "AlertTriangle", Icon: AlertTriangle },
];

const CAT_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
  "#0891b2",
];

function CatIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] || FileText;
  return <Icon className={className} />;
}

// ── Save indicator ─────────────────────────────────────────────────────────
type SaveStatus = "saved" | "saving" | "unsaved";

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "saved")
    return (
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
        <Check className="h-3 w-3" /> Saved
      </span>
    );
  if (status === "saving")
    return (
      <span className="text-[11px] text-muted-foreground/50 animate-pulse">
        Saving…
      </span>
    );
  return <span className="text-[11px] text-muted-foreground/40">Unsaved</span>;
}

// ── Main page ──────────────────────────────────────────────────────────────
// ── Loading skeleton ───────────────────────────────────────────────────────
function NotesSkeleton() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-background overflow-hidden">
      {/* Categories col */}
      <div className="w-52 shrink-0 border-r border-border bg-card/20 flex flex-col">
        <div className="px-3 py-3 border-b border-border">
          <div className="h-4 w-24 bg-muted/50 rounded animate-pulse" />
        </div>
        <div className="p-3 space-y-2">
          {[80, 65, 90, 70, 55].map((w, i) => (
            <div key={i} className={`h-8 bg-muted/40 rounded-lg animate-pulse`} style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
      {/* Notes col */}
      <div className="w-64 shrink-0 border-r border-border bg-card/10 flex flex-col">
        <div className="p-2.5 border-b border-border space-y-2">
          <div className="h-4 w-20 bg-muted/50 rounded animate-pulse" />
          <div className="h-7 bg-muted/40 rounded-lg animate-pulse" />
          <div className="h-7 bg-muted/40 rounded-lg animate-pulse" />
        </div>
        <div className="p-2 space-y-2 pt-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 bg-muted/30 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
      {/* Editor col */}
      <div className="flex-1 p-6 space-y-4">
        <div className="h-10 w-1/2 bg-muted/40 rounded-lg animate-pulse" />
        <div className="h-4 w-1/4 bg-muted/30 rounded animate-pulse" />
        <div className="h-8 bg-muted/20 rounded-lg animate-pulse mt-4" />
        <div className="space-y-2 mt-4">
          {[90, 75, 85, 60, 80, 70].map((w, i) => (
            <div key={i} className="h-4 bg-muted/20 rounded animate-pulse" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function TradeNotesPage() {
  const { tradeData, setTradeData, loading } = useAppContext();

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Category creation state
  const [addingCat, setAddingCat] = useState(false);
  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState(CAT_COLORS[0]);
  const [catIcon, setCatIcon] = useState("FileText");

  // Note local edit state
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always-current snapshot of tradeData — prevents stale-closure overwrites
  // when the debounced save fires after other data has changed.
  const tradeDataRef = useRef(tradeData);
  useEffect(() => { tradeDataRef.current = tradeData; }, [tradeData]);

  const tradeNotes = tradeData.tradeNotes || { notes: [], categories: [] };
  const { notes, categories } = tradeNotes;

  // Auto-select first category once real data loads (after loading completes)
  useEffect(() => {
    if (loading) return; // don't select from hardcoded defaults
    if (!selectedCategoryId && categories.length > 0) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId, loading]);

  // Notes for selected category + search filter
  const visibleNotes = useMemo(
    () =>
      notes
        .filter((n) => {
          const matchCat = selectedCategoryId ? n.categoryId === selectedCategoryId : true;
          const q = searchQuery.toLowerCase();
          const matchQ =
            !q ||
            n.title.toLowerCase().includes(q) ||
            n.content.toLowerCase().includes(q);
          return matchCat && matchQ;
        })
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        ),
    [notes, selectedCategoryId, searchQuery]
  );

  // Sync local editor state immediately when selected note changes.
  // Reads directly from tradeDataRef so it's always fresh even if a pending
  // save just updated tradeData in the same render cycle.
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const allNotes = tradeDataRef.current.tradeNotes?.notes ?? [];
    const note = allNotes.find((n) => n.id === selectedNoteId);
    if (note) {
      setEditTitle(note.title);
      setEditContent(note.content);
      setSaveStatus("saved");
    } else {
      setEditTitle("");
      setEditContent("");
      setSaveStatus("saved");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNoteId]);

  // ── Persist save — uses ref so closure is never stale ─────────────────────
  const persistSave = useCallback(
    (id: string, title: string, content: string) => {
      setSaveStatus("saving");
      const now = new Date().toISOString();
      // Read the LATEST tradeData from the ref, not from a captured closure.
      // This prevents debounced saves from overwriting category/note changes
      // that happened between when the timer was set and when it fires.
      const latest = tradeDataRef.current;
      const latestNotes = latest.tradeNotes?.notes ?? [];
      const latestTN = latest.tradeNotes ?? { notes: [], categories: [] };
      setTradeData({
        ...latest,
        tradeNotes: {
          ...latestTN,
          notes: latestNotes.map((n) =>
            n.id === id
              ? { ...n, title: title.trim() || "Untitled", content, updatedAt: now }
              : n
          ),
        },
      });
      setSaveStatus("saved");
    },
    [setTradeData] // setTradeData is stable; all data read from tradeDataRef
  );

  const handleTitleChange = (v: string) => {
    setEditTitle(v);
    setSaveStatus("unsaved");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (selectedNoteId) persistSave(selectedNoteId, v, editContent);
    }, 800);
  };

  const handleContentChange = (v: string) => {
    setEditContent(v);
    setSaveStatus("unsaved");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (selectedNoteId) persistSave(selectedNoteId, editTitle, v);
    }, 800);
  };

  // ── Category CRUD ─────────────────────────────────────────────────────────
  const saveCategory = () => {
    if (!catName.trim()) return;
    const cat: TradeNoteCategory = {
      id: generateId(),
      name: catName.trim(),
      color: catColor,
      icon: catIcon,
    };
    setTradeData({
      ...tradeData,
      tradeNotes: { ...tradeNotes, categories: [...categories, cat] },
    });
    setSelectedCategoryId(cat.id);
    setCatName("");
    setCatColor(CAT_COLORS[0]);
    setCatIcon("FileText");
    setAddingCat(false);
  };

  const deleteCategory = (id: string) => {
    if (!confirm("Delete this category and all its notes?")) return;
    const newCategories = categories.filter((c) => c.id !== id);
    const newNotes = notes.filter((n) => n.categoryId !== id);
    const nextCat = newCategories[0]?.id ?? null;
    setTradeData({
      ...tradeData,
      tradeNotes: { notes: newNotes, categories: newCategories },
    });
    if (selectedCategoryId === id) {
      setSelectedCategoryId(nextCat);
      setSelectedNoteId(null);
    }
  };

  // ── Note CRUD ─────────────────────────────────────────────────────────────
  const handleNewNote = () => {
    const catId = selectedCategoryId || categories[0]?.id || "1";
    const now = new Date().toISOString();
    const newNote: TradeNote = {
      id: generateId(),
      title: "",
      content: "",
      categoryId: catId,
      createdAt: now,
      updatedAt: now,
    };
    setTradeData({
      ...tradeData,
      tradeNotes: { ...tradeNotes, notes: [newNote, ...notes] },
    });
    setSelectedNoteId(newNote.id);
  };

  const deleteNote = (id: string) => {
    if (!confirm("Delete this note?")) return;
    setTradeData({
      ...tradeData,
      tradeNotes: { ...tradeNotes, notes: notes.filter((n) => n.id !== id) },
    });
    if (selectedNoteId === id) setSelectedNoteId(null);
  };

  const changeNoteCategory = (noteId: string, newCatId: string) => {
    const now = new Date().toISOString();
    setTradeData({
      ...tradeData,
      tradeNotes: {
        ...tradeNotes,
        notes: notes.map((n) =>
          n.id === noteId ? { ...n, categoryId: newCatId, updatedAt: now } : n
        ),
      },
    });
  };

  const selectedNote = notes.find((n) => n.id === selectedNoteId);
  const selectedCat = categories.find((c) => c.id === selectedNote?.categoryId);

  // ── Render ────────────────────────────────────────────────────────────────
  // Show skeleton while data is loading from API — prevents flash of hardcoded
  // default categories and empty note list before real data arrives.
  if (loading) return <NotesSkeleton />;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-background overflow-hidden">

      {/* ══ COL 1 — CATEGORIES ════════════════════════════════════════════ */}
      <div className="w-52 shrink-0 border-r border-border bg-card/20 flex flex-col">
        <div className="px-3 py-3 border-b border-border flex items-center justify-between shrink-0">
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Categories
          </span>
          <button
            onClick={() => setAddingCat(true)}
            className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Add category"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* "All" option */}
          <button
            onClick={() => { setSelectedCategoryId(null); setSelectedNoteId(null); }}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors text-sm",
              selectedCategoryId === null
                ? "bg-muted/60 text-foreground font-medium"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            )}
          >
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate">All Notes</span>
            <span className="text-[10px] text-muted-foreground/50">{notes.length}</span>
          </button>

          {/* Category list */}
          {categories.map((cat) => {
            const count = notes.filter((n) => n.categoryId === cat.id).length;
            const isActive = selectedCategoryId === cat.id;
            return (
              <div
                key={cat.id}
                className={cn(
                  "group flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors text-sm",
                  isActive
                    ? "bg-muted/60 font-medium"
                    : "hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                )}
                style={isActive ? { color: cat.color } : {}}
                onClick={() => { setSelectedCategoryId(cat.id); setSelectedNoteId(null); }}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <CatIcon name={cat.icon} className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="flex-1 truncate text-[13px]">{cat.name}</span>
                <span className="text-[10px] text-muted-foreground/50 group-hover:hidden">
                  {count}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id); }}
                  className="hidden group-hover:flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-red-400 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}

          {/* Inline category creation form */}
          {addingCat && (
            <div className="mx-2 my-2 p-3 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-2.5">
              <input
                autoFocus
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveCategory();
                  if (e.key === "Escape") setAddingCat(false);
                }}
                placeholder="Category name…"
                className="w-full text-[12px] bg-transparent border border-border rounded-lg px-2.5 py-1.5 outline-none text-foreground placeholder:text-muted-foreground/40"
              />

              {/* Color picker */}
              <div className="flex flex-wrap gap-1.5">
                {CAT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCatColor(c)}
                    className={cn(
                      "w-5 h-5 rounded-full border-2 transition-transform hover:scale-110",
                      catColor === c ? "border-white scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>

              {/* Icon picker */}
              <div className="flex gap-1">
                {ICON_LIST.map(({ name, Icon }) => (
                  <button
                    key={name}
                    onClick={() => setCatIcon(name)}
                    className={cn(
                      "p-1.5 rounded-md transition-colors",
                      catIcon === name
                        ? "bg-blue-600 text-white"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3 w-3" />
                  </button>
                ))}
              </div>

              <div className="flex gap-1.5">
                <button
                  onClick={() => setAddingCat(false)}
                  className="flex-1 text-[11px] py-1 rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveCategory}
                  className="flex-1 text-[11px] py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ COL 2 — NOTES LIST ═══════════════════════════════════════════ */}
      <div className="w-64 shrink-0 border-r border-border bg-card/10 flex flex-col">
        <div className="p-2.5 border-b border-border space-y-2 shrink-0">
          {/* Category name header */}
          <div className="flex items-center gap-2 px-1">
            {selectedCategoryId && (() => {
              const c = categories.find((c) => c.id === selectedCategoryId);
              if (!c) return null;
              return (
                <>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="text-[12px] font-semibold text-foreground truncate">{c.name}</span>
                </>
              );
            })()}
            {!selectedCategoryId && (
              <span className="text-[12px] font-semibold text-foreground">All Notes</span>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search…"
              className="pl-7 h-7 text-xs bg-muted/30 border-border"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* New note button */}
          <Button
            size="sm"
            className="w-full h-7 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
            onClick={handleNewNote}
          >
            <Plus className="h-3 w-3" />
            New Note
          </Button>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-1.5 space-y-0.5">
            {visibleNotes.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <FileText className="h-6 w-6 mx-auto mb-2 opacity-20" />
                <p className="text-[11px]">No notes</p>
              </div>
            ) : (
              visibleNotes.map((note) => {
                const cat = categories.find((c) => c.id === note.categoryId);
                const isSel = selectedNoteId === note.id;
                const preview = note.content
                  ?.replace(/<figure[^>]*>[\s\S]*?<\/figure>/g, "[Image]")
                  .replace(/<img[^>]*>/g, "[Image]")
                  .replace(/<[^>]*>/g, "")
                  .trim();

                return (
                  <div
                    key={note.id}
                    onClick={() => setSelectedNoteId(note.id)}
                    className={cn(
                      "relative p-2.5 rounded-lg cursor-pointer group transition-colors",
                      isSel ? "bg-blue-600/12 ring-1 ring-blue-500/25" : "hover:bg-muted/50"
                    )}
                  >
                    {/* Category dot + date */}
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {cat && (
                        <div
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                      )}
                      <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide font-medium">
                        {format(new Date(note.updatedAt), "MMM d")}
                      </span>
                    </div>

                    <h4
                      className={cn(
                        "text-[12px] font-semibold truncate pr-5 leading-tight",
                        isSel ? "text-blue-400" : "text-foreground"
                      )}
                    >
                      {note.title || "Untitled"}
                    </h4>

                    {preview && (
                      <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                        {preview}
                      </p>
                    )}

                    {/* Ellipsis menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className="absolute top-2 right-2 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded hover:bg-muted"
                          >
                            <MoreVertical className="h-3 w-3 text-muted-foreground" />
                          </button>
                        }
                      />
                      <DropdownMenuContent align="end" className="text-xs">
                        <DropdownMenuItem
                          className="gap-2 text-red-500 focus:text-red-500"
                          onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ══ COL 3 — NOTE EDITOR ══════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col bg-background overflow-hidden">
        {!selectedNote ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <FileText className="h-7 w-7 opacity-20" />
            </div>
            <h3 className="text-base font-semibold text-foreground/50">No note selected</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-[200px]">
              Pick a note from the list or create a new one.
            </p>
            <Button
              size="sm"
              className="mt-4 gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleNewNote}
            >
              <Plus className="h-4 w-4" />
              New Note
            </Button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-4 py-6 pb-24">
              {/* Title */}
              <input
                type="text"
                value={editTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Untitled"
                className="w-full text-4xl font-bold bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/20 mb-3 leading-tight"
                style={{ caretColor: "var(--foreground)" }}
              />

              {/* Metadata row */}
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                {/* Category selector */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-opacity hover:opacity-80"
                        style={
                          selectedCat
                            ? {
                                backgroundColor: `${selectedCat.color}18`,
                                color: selectedCat.color,
                              }
                            : {
                                backgroundColor: "var(--muted)",
                                color: "var(--muted-foreground)",
                              }
                        }
                      >
                        {selectedCat ? (
                          <>
                            <CatIcon name={selectedCat.icon} className="h-3 w-3" />
                            {selectedCat.name}
                          </>
                        ) : (
                          "No category"
                        )}
                        <ChevronDown className="h-3 w-3 opacity-60" />
                      </button>
                    }
                  />
                  <DropdownMenuContent align="start" className="text-xs">
                    {categories.map((cat) => (
                      <DropdownMenuItem
                        key={cat.id}
                        className="gap-2"
                        onClick={() => changeNoteCategory(selectedNote.id, cat.id)}
                      >
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        <CatIcon name={cat.icon} className="h-3 w-3" />
                        {cat.name}
                        {selectedNote.categoryId === cat.id && (
                          <Check className="h-3 w-3 ml-auto text-blue-400" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(selectedNote.updatedAt), "MMM d, yyyy")}
                </div>

                <div className="flex-1" />
                <SaveIndicator status={saveStatus} />
              </div>

              {/* Editor */}
              <RichEditor
                key={selectedNoteId}
                content={selectedNote?.content ?? ""}
                onChange={handleContentChange}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
