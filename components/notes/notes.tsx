"use client";

import { useState, useMemo } from "react";
import { useAppContext } from "@/lib/context";
import { generateId } from "@/lib/habits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Trash2,
  MoreVertical,
  Pin,
  PinOff,
  Search,
  StickyNote,
  Tag,
  X,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { Note } from "@/types";
import { cn } from "@/lib/utils";

const NOTE_COLORS = [
  "", "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#14b8a6", "#10b981",
  "#f43f5e", "#ec4899", "#a3a3a3", "#64748b",
];

export function Notes() {
  const { notesData, setNotesData } = useAppContext();
  const [showEditor, setShowEditor] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [noteColor, setNoteColor] = useState("");
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");

  const notes = useMemo(() => notesData.notes || [], [notesData.notes]);

  // Collect all unique tags across notes
  const allNoteTags = useMemo(() => {
    const tags = new Set<string>();
    notes.forEach((n) => n.tags?.forEach((t) => tags.add(t)));
    return Array.from(tags);
  }, [notes]);

  // Sort: pinned first, then by updatedAt desc
  const sortedNotes = useMemo(() => {
    let result = [...notes];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }
    return result.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [notes, searchQuery]);

  const resetForm = () => {
    setTitle("");
    setContent("");
    setNoteColor("");
    setNoteTags([]);
    setNewTagInput("");
    setEditingNote(null);
  };

  const saveNote = () => {
    if (!title.trim()) return;
    const now = new Date().toISOString();

    if (editingNote) {
      const updated = notes.map((n) =>
        n.id === editingNote.id
          ? { ...n, title: title.trim(), content, color: noteColor || undefined, tags: noteTags, updatedAt: now }
          : n
      );
      setNotesData({ notes: updated });
    } else {
      const note: Note = {
        id: generateId(),
        title: title.trim(),
        content,
        tags: noteTags,
        color: noteColor || undefined,
        pinned: false,
        createdAt: now,
        updatedAt: now,
      };
      setNotesData({ notes: [...notes, note] });
    }

    resetForm();
    setShowEditor(false);
  };

  const deleteNote = (id: string) => {
    setNotesData({ notes: notes.filter((n) => n.id !== id) });
  };

  const togglePin = (id: string) => {
    const updated = notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n));
    setNotesData({ notes: updated });
  };

  const startEdit = (note: Note) => {
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content);
    setNoteColor(note.color || "");
    setNoteTags(note.tags || []);
    setShowEditor(true);
  };

  const addTag = () => {
    const t = newTagInput.trim().toLowerCase();
    if (t && !noteTags.includes(t)) setNoteTags([...noteTags, t]);
    setNewTagInput("");
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-white/65" />
          Notes
          <span className="text-xs text-muted-foreground font-normal">({notes.length})</span>
        </h3>
        <Button
          size="sm"
          onClick={() => {
            resetForm();
            setShowEditor(true);
          }}
          className="gap-1"
        >
          <Plus className="h-4 w-4" /> New Note
        </Button>
      </div>

      {/* Search */}
      {notes.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <input
            className="w-full bg-transparent text-sm outline-none border border-border rounded-lg pl-9 pr-3 py-2 placeholder-muted-foreground/40 text-foreground"
            placeholder="Search notes…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      {/* Notes grid */}
      {sortedNotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/40">
          <StickyNote className="h-10 w-10 mb-2" />
          <p className="text-sm">{searchQuery ? "No matching notes" : "No notes yet"}</p>
          <p className="text-xs mt-1">Click &ldquo;New Note&rdquo; to create one</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedNotes.map((note) => (
            <div
              key={note.id}
              className={cn(
                "group rounded-lg p-4 transition-all hover:shadow-md cursor-pointer",
                "border border-[var(--table-border)] bg-[var(--glass-surface)]"
              )}
              style={{ borderLeft: note.color ? `3px solid ${note.color}` : undefined }}
              onClick={() => startEdit(note)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {note.pinned && <Pin className="h-3 w-3 text-white/65 shrink-0" />}
                    <h4 className="text-sm font-medium truncate">{note.title}</h4>
                  </div>
                  {note.content && (
                    <p className="text-[11px] text-muted-foreground/70 mt-1 line-clamp-3 whitespace-pre-wrap">
                      {note.content}
                    </p>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/30 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); togglePin(note.id); }}>
                      {note.pinned ? <PinOff className="mr-2 h-3.5 w-3.5" /> : <Pin className="mr-2 h-3.5 w-3.5" />}
                      {note.pinned ? "Unpin" : "Pin"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} className="text-red-400">
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Tags */}
              {note.tags && note.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {note.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/65 flex items-center gap-0.5"
                    >
                      <Tag className="h-2 w-2" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <p className="text-[9px] text-muted-foreground/40 mt-2">
                {format(parseISO(note.updatedAt), "MMM d, yyyy · h:mm a")}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Note Editor Dialog */}
      <Dialog
        open={showEditor}
        onOpenChange={(o) => {
          if (!o) {
            resetForm();
            setShowEditor(false);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingNote ? "Edit Note" : "New Note"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                placeholder="Note title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                placeholder="Write your note…"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                className="resize-none min-h-[200px] max-h-[400px] overflow-y-auto"
              />
            </div>

            {/* Color */}
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c || "none"}
                    onClick={() => setNoteColor(c)}
                    className={cn(
                      "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                      noteColor === c ? "scale-110 ring-2 ring-offset-1 ring-offset-background ring-foreground/30" : ""
                    )}
                    style={{
                      backgroundColor: c || "transparent",
                      borderColor: c || "var(--border)",
                    }}
                    title={c || "No color"}
                  >
                    {!c && noteColor === "" && (
                      <X className="h-3 w-3 text-muted-foreground mx-auto" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1.5 mb-1">
                {noteTags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.06] text-white/65 flex items-center gap-1"
                  >
                    {tag}
                    <button
                      onClick={() => setNoteTags(noteTags.filter((t) => t !== tag))}
                      className="hover:text-red-400"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add tag…"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  className="h-8 text-sm"
                />
                {allNoteTags.length > 0 && (
                  <select
                    className="bg-transparent text-xs outline-none cursor-pointer text-muted-foreground border border-border rounded px-2"
                    value=""
                    onChange={(e) => {
                      const t = e.target.value;
                      if (t && !noteTags.includes(t)) setNoteTags([...noteTags, t]);
                    }}
                  >
                    <option value="" className="bg-background">
                      Existing…
                    </option>
                    {allNoteTags
                      .filter((t) => !noteTags.includes(t))
                      .map((t) => (
                        <option key={t} value={t} className="bg-background">
                          {t}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            </div>

            <Button onClick={saveNote} disabled={!title.trim()} className="w-full">
              {editingNote ? "Update Note" : "Save Note"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
