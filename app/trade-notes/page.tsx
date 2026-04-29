"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useAppContext } from "@/lib/context";
import { 
  Plus, 
  Search, 
  Settings2, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  FileText,
  Target,
  TrendingDown,
  Brain,
  AlertTriangle,
  Calendar,
  Save,
  Eye,
  Type,
} from "lucide-react";
import { format } from "date-fns";
import type { TradeNote } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryModal } from "@/components/trade/notes/category-modal";
import { RichEditor } from "@/components/trade/notes/rich-editor";
import { cn } from "@/lib/utils";
import { generateId } from "@/lib/habits";
import katex from "katex";
import "katex/dist/katex.min.css";

const ICON_MAP: Record<string, React.ElementType> = {
  Target,
  TrendingDown,
  Brain,
  AlertTriangle,
  FileText,
};

function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] || FileText;
  return <Icon className={className} />;
}

// ── Math Renderer Component ───────────────────────────────────────────────
function MathRenderer({ content }: { content: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const html = content
      .replace(/\$\$(.*?)\$\$/g, (match, tex) => {
        try {
          return katex.renderToString(tex, { displayMode: true, throwOnError: false });
        } catch {
          return match;
        }
      })
      .replace(/\$(.*?)\$/g, (match, tex) => {
        try {
          return katex.renderToString(tex, { displayMode: false, throwOnError: false });
        } catch {
          return match;
        }
      });
      
    containerRef.current.innerHTML = html;
  }, [content]);

  return <div ref={containerRef} className="prose prose-invert max-w-none text-foreground/90 leading-relaxed" />;
}

export default function TradeNotesPage() {
  const { tradeData, setTradeData } = useAppContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  
  // Local edit state
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  
  // Modal state
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  const tradeNotes = tradeData.tradeNotes || { notes: [], categories: [] };
  const { notes, categories } = tradeNotes;

  // Row 2: Filtered notes based on Category + Search
  const filteredNotes = useMemo(() => {
    return notes.filter(note => {
      const matchesSearch = note.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          note.content.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategoryId ? note.categoryId === selectedCategoryId : true;
      return matchesSearch && matchesCategory;
    }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [notes, searchQuery, selectedCategoryId]);

  // Selected Note
  const selectedNote = useMemo(() => 
    notes.find(n => n.id === selectedNoteId), 
  [notes, selectedNoteId]);

  // Effect: sync local edit state when selected note changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedNote) {
        setEditTitle(selectedNote.title);
        setEditContent(selectedNote.content);
        setIsEditing(false);
        setIsPreview(false);
      } else {
        setEditTitle("");
        setEditContent("");
        setIsEditing(false);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedNoteId, selectedNote]);

  const handleSave = () => {
    if (!selectedNoteId || !editTitle.trim()) return;
    
    const now = new Date().toISOString();
    const updatedNotes = notes.map(n => n.id === selectedNoteId ? {
      ...n,
      title: editTitle.trim(),
      content: editContent,
      updatedAt: now
    } : n);

    setTradeData({
      ...tradeData,
      tradeNotes: { ...tradeNotes, notes: updatedNotes }
    });
    setIsEditing(false);
  };

  const handleNewNote = () => {
    const catId = selectedCategoryId || (categories.length > 0 ? categories[0].id : "1");
    const now = new Date().toISOString();
    const newNote: TradeNote = {
      id: generateId(),
      title: "Untitled Note",
      content: "",
      categoryId: catId,
      createdAt: now,
      updatedAt: now
    };

    setTradeData({
      ...tradeData,
      tradeNotes: {
        ...tradeNotes,
        notes: [newNote, ...notes]
      }
    });
    setSelectedNoteId(newNote.id);
    setIsEditing(true);
  };

  const deleteNote = (id: string) => {
    if (!confirm("Are you sure you want to delete this note?")) return;
    const newNotes = notes.filter(n => n.id !== id);
    setTradeData({
      ...tradeData,
      tradeNotes: { ...tradeNotes, notes: newNotes }
    });
    if (selectedNoteId === id) setSelectedNoteId(null);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-background overflow-hidden">
      {/* ── ROW 1: CATEGORIES ────────────────────────────────────────────────── */}
      <div className="border-b border-border bg-card/30 px-4 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
        <Button 
          variant={selectedCategoryId === null ? "secondary" : "ghost"}
          size="sm"
          onClick={() => {
            setSelectedCategoryId(null);
            setSelectedNoteId(null);
          }}
          className="shrink-0 h-8 rounded-full"
        >
          All Notes
        </Button>
        <div className="w-px h-4 bg-border mx-1" />
        {categories.map((cat) => (
          <Button
            key={cat.id}
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedCategoryId(cat.id);
              setSelectedNoteId(null);
            }}
            className={cn(
              "shrink-0 h-8 rounded-full gap-2 transition-all",
              selectedCategoryId === cat.id ? "bg-secondary text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
            )}
            style={selectedCategoryId === cat.id ? { 
              backgroundColor: `${cat.color}15`,
              color: cat.color,
              borderColor: `${cat.color}30`
            } : {}}
          >
            <CategoryIcon name={cat.icon} className="h-3.5 w-3.5" />
            {cat.name}
          </Button>
        ))}
        <div className="flex-1" />
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 rounded-full text-muted-foreground"
          onClick={() => setIsCategoryModalOpen(true)}
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── ROW 2: NOTES LIST (Side Pane) ──────────────────────────────────── */}
        <div className="w-72 md:w-80 border-r border-border bg-card/10 flex flex-col shrink-0">
          <div className="p-3 border-b border-border">
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input 
                placeholder="Search notes..." 
                className="pl-8 h-8 text-xs bg-muted/30 border-border focus-visible:ring-1"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button 
              size="sm" 
              className="w-full h-8 gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
              onClick={handleNewNote}
            >
              <Plus className="h-3.5 w-3.5" />
              New Note
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {filteredNotes.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-xs">No notes found</p>
                </div>
              ) : (
                filteredNotes.map((note) => {
                  const cat = categories.find(c => c.id === note.categoryId);
                  const isSel = selectedNoteId === note.id;
                  return (
                    <div
                      key={note.id}
                      onClick={() => setSelectedNoteId(note.id)}
                      className={cn(
                        "w-full text-left p-3 rounded-xl transition-all group relative cursor-pointer",
                        isSel ? "bg-blue-600/10 ring-1 ring-blue-500/30" : "hover:bg-muted/50"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {cat && (
                          <div 
                            className="w-1.5 h-1.5 rounded-full" 
                            style={{ backgroundColor: cat.color }} 
                          />
                        )}
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                          {format(new Date(note.updatedAt), "MMM d, yyyy")}
                        </span>
                      </div>
                      <h4 className={cn(
                        "text-[13px] font-bold truncate pr-4",
                        isSel ? "text-blue-400" : "text-foreground"
                      )}>
                        {note.title || "Untitled Note"}
                      </h4>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                        {note.content?.replace(/<[^>]*>?/gm, "") || "No content..."}
                      </p>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger render={
                          <button 
                            type="button"
                            className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-md hover:bg-muted"
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Note options"
                          >
                            <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        } />
                        <DropdownMenuContent align="end" className="text-xs">
                          <DropdownMenuItem className="gap-2" onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}>
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ── ROW 3: BIG CONTENT AREA ───────────────────────────────────────── */}
        <div className="flex-1 flex flex-col bg-background relative">
          {!selectedNote ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-10 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileText className="h-8 w-8 opacity-20" />
              </div>
              <h3 className="text-lg font-semibold text-foreground/50">Select a note to read</h3>
              <p className="max-w-[240px] text-sm mt-1">Choose a note from the left or create a new one to start writing.</p>
            </div>
          ) : (
            <>
              {/* Note Header */}
              <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0 bg-card/10">
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <Input 
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="text-xl font-bold bg-transparent border-none p-0 focus-visible:ring-0 h-auto"
                      placeholder="Note Title..."
                      autoFocus
                    />
                  ) : (
                    <h2 className="text-xl font-bold text-foreground truncate">{selectedNote.title || "Untitled Note"}</h2>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    {categories.find(c => c.id === selectedNote.categoryId) && (
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        <CategoryIcon name={categories.find(c => c.id === selectedNote.categoryId)!.icon} className="h-2.5 w-2.5" />
                        {categories.find(c => c.id === selectedNote.categoryId)!.name}
                      </div>
                    )}
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                      <Calendar className="h-2.5 w-2.5" />
                      Updated {format(new Date(selectedNote.updatedAt), "PPP")}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="gap-2 text-xs" 
                        onClick={() => setIsPreview(!isPreview)}
                      >
                        {isPreview ? <Type className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {isPreview ? "Edit" : "Preview"}
                      </Button>
                      <Button 
                        size="sm" 
                        className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 shadow-lg shadow-emerald-500/10" 
                        onClick={handleSave}
                      >
                        <Save className="h-3.5 w-3.5" />
                        Save
                      </Button>
                    </>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="gap-2 text-xs border-border" 
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit Note
                    </Button>
                  )}
                </div>
              </div>

              {/* Note Body */}
              <ScrollArea className="flex-1 bg-background/50">
                <div className="max-w-4xl mx-auto p-8 md:p-12 min-h-full flex flex-col">
                  {isEditing && !isPreview ? (
                    <div className="flex-1 flex flex-col">
                      <RichEditor 
                        content={editContent}
                        onChange={setEditContent}
                        editable={true}
                      />
                    </div>
                  ) : (
                    <div className="flex-1">
                      {editContent ? (
                        <MathRenderer content={editContent} />
                      ) : (
                        <p className="text-muted-foreground italic">No content in this note.</p>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </div>

      <CategoryModal 
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
      />
    </div>
  );
}
