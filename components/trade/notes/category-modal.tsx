"use client";

import { useState } from "react";
import { useAppContext } from "@/lib/context";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Target, 
  TrendingDown, 
  Brain, 
  AlertTriangle, 
  FileText,
  Plus,
  Trash2,
  Check
} from "lucide-react";
import type { TradeNoteCategory } from "@/types";
import { generateId } from "@/lib/habits";
import { cn } from "@/lib/utils";

const ICONS = [
  { name: "Target", icon: Target },
  { name: "TrendingDown", icon: TrendingDown },
  { name: "Brain", icon: Brain },
  { name: "AlertTriangle", icon: AlertTriangle },
  { name: "FileText", icon: FileText },
];

const COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#64748b", // slate
];

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CategoryModal({ isOpen, onClose }: CategoryModalProps) {
  const { tradeData, setTradeData } = useAppContext();
  const tradeNotes = tradeData.tradeNotes || { notes: [], categories: [] };
  const { categories, notes } = tradeNotes;

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [newIcon, setNewIcon] = useState(ICONS[0].name);

  const addCategory = () => {
    if (!newName.trim()) return;
    const newCategory: TradeNoteCategory = {
      id: generateId(),
      name: newName.trim(),
      color: newColor,
      icon: newIcon
    };
    
    setTradeData({
      ...tradeData,
      tradeNotes: {
        ...tradeNotes,
        categories: [...categories, newCategory]
      }
    });
    setIsAdding(false);
    setNewName("");
  };

  const deleteCategory = (id: string) => {
    if (categories.length <= 1) {
      alert("You must have at least one category.");
      return;
    }
    
    const hasNotes = notes.some(n => n.categoryId === id);
    if (hasNotes) {
      if (!confirm("There are notes in this category. Deleting it will delete those notes too. Continue?")) {
        return;
      }
    }

    setTradeData({
      ...tradeData,
      tradeNotes: {
        notes: notes.filter(n => n.categoryId !== id),
        categories: categories.filter(c => c.id !== id)
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px] bg-card border-border">
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Current Categories */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current Categories</Label>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg" style={{ backgroundColor: `${cat.color}20`, color: cat.color }}>
                      {(() => {
                        const Icon = ICONS.find(i => i.name === cat.icon)?.icon || FileText;
                        return <Icon className="h-4 w-4" />;
                      })()}
                    </div>
                    <span className="font-medium text-sm">{cat.name}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-red-500"
                    onClick={() => deleteCategory(cat.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Add New Section */}
          {!isAdding ? (
            <Button 
              variant="outline" 
              className="w-full border-dashed border-border gap-2"
              onClick={() => setIsAdding(true)}
            >
              <Plus className="h-4 w-4" />
              Add Category
            </Button>
          ) : (
            <div className="space-y-4 p-4 rounded-xl border border-white/[0.10] bg-white/[0.08]/5">
              <div className="space-y-2">
                <Label htmlFor="cat-name">Category Name</Label>
                <Input 
                  id="cat-name"
                  placeholder="e.g. Psychology"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="bg-card border-border"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110",
                        newColor === c && "ring-2 ring-blue-500 ring-offset-2 ring-offset-card"
                      )}
                      style={{ backgroundColor: c }}
                      onClick={() => setNewColor(c)}
                    >
                      {newColor === c && <Check className="h-3 w-3 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Icon</Label>
                <div className="flex gap-2">
                  {ICONS.map(({ name, icon: Icon }) => (
                    <button
                      key={name}
                      className={cn(
                        "p-2 rounded-lg border transition-all",
                        newIcon === name 
                          ? "bg-white/[0.09] text-white border-white/30" 
                          : "bg-card border-border text-muted-foreground hover:bg-muted"
                      )}
                      onClick={() => setNewIcon(name)}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1 border-border" onClick={() => setIsAdding(false)}>Cancel</Button>
                <Button size="sm" className="flex-1 bg-white/[0.10] hover:bg-white/[0.16] border border-white/[0.12] text-white font-semibold" onClick={addCategory}>Save Category</Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="w-full border-border">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
