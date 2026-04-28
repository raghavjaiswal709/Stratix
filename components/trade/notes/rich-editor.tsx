"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { useEffect, useState, useRef } from "react";
import { 
  Heading1, 
  Heading2, 
  Heading3, 
  List, 
  ListOrdered, 
  Quote, 
  Code, 
  Sigma,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Type
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RichEditorProps {
  content: string;
  onChange: (content: string) => void;
  editable: boolean;
}

export function RichEditor({ content, onChange, editable }: RichEditorProps) {
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
      }),
      Placeholder.configure({
        placeholder: "Press '/' for commands, or just start writing...",
      }),
    ],
    content: content,
    editable: editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      
      // Slash command detection
      const { selection } = editor.state;
      const textBefore = editor.state.doc.textBetween(Math.max(0, selection.from - 1), selection.from);
      
      if (textBefore === "/") {
        const { view } = editor;
        const coords = view.coordsAtPos(selection.from);
        setMenuPosition({ top: coords.top + window.scrollY + 20, left: coords.left + window.scrollX });
        setSelectedIndex(0);
      } else {
        setMenuPosition(null);
      }
    },
  });

  // Sync content from props if it changes externally (e.g. switching notes)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  const COMMANDS = [
    { 
      title: "Text", 
      icon: Type, 
      command: () => editor?.chain().focus().deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from }).setParagraph().run() 
    },
    { 
      title: "Heading 1", 
      icon: Heading1, 
      command: () => editor?.chain().focus().deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from }).setHeading({ level: 1 }).run() 
    },
    { 
      title: "Heading 2", 
      icon: Heading2, 
      command: () => editor?.chain().focus().deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from }).setHeading({ level: 2 }).run() 
    },
    { 
      title: "Bullet List", 
      icon: List, 
      command: () => editor?.chain().focus().deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from }).toggleBulletList().run() 
    },
    { 
      title: "Numbered List", 
      icon: ListOrdered, 
      command: () => editor?.chain().focus().deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from }).toggleOrderedList().run() 
    },
    { 
      title: "Quote", 
      icon: Quote, 
      command: () => editor?.chain().focus().deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from }).toggleBlockquote().run() 
    },
    { 
      title: "Code Block", 
      icon: Code, 
      command: () => editor?.chain().focus().deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from }).toggleCodeBlock().run() 
    },
    { 
      title: "Math Block", 
      icon: Sigma, 
      command: () => editor?.chain().focus().deleteRange({ from: editor.state.selection.from - 1, to: editor.state.selection.from }).insertContent("$$\n\n$$").run() 
    },
  ];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!menuPosition) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % COMMANDS.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + COMMANDS.length) % COMMANDS.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      COMMANDS[selectedIndex].command();
      setMenuPosition(null);
    } else if (e.key === "Escape") {
      setMenuPosition(null);
    }
  };

  return (
    <div className="relative w-full h-full" onKeyDown={handleKeyDown}>
      <EditorContent 
        editor={editor} 
        className="prose prose-invert prose-blue max-w-none focus:outline-none min-h-[500px]"
      />

      {menuPosition && (
        <div 
          ref={menuRef}
          className="fixed z-[100] w-64 bg-card border border-border rounded-xl shadow-2xl overflow-hidden py-1"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          <div className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Basic Blocks</div>
          {COMMANDS.map((cmd, i) => (
            <button
              key={cmd.title}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                selectedIndex === i ? "bg-blue-600 text-white" : "hover:bg-muted"
              )}
              onClick={() => {
                cmd.command();
                setMenuPosition(null);
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <div className={cn(
                "p-1.5 rounded-lg border border-border",
                selectedIndex === i ? "bg-white/20 border-white/20" : "bg-muted"
              )}>
                <cmd.icon className="h-4 w-4" />
              </div>
              <span className="font-medium">{cmd.title}</span>
            </button>
          ))}
        </div>
      )}

      {/* Floating Toolbar for selections */}
      {editor && editor.isEditable && !editor.state.selection.empty && !menuPosition && (
        <div className="fixed z-50 bottom-10 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur-xl border border-border rounded-full shadow-2xl px-2 py-1.5 flex items-center gap-1 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <ToolbarButton 
            active={editor.isActive("bold")} 
            onClick={() => editor.chain().focus().toggleBold().run()}
            icon={Bold}
          />
          <ToolbarButton 
            active={editor.isActive("italic")} 
            onClick={() => editor.chain().focus().toggleItalic().run()}
            icon={Italic}
          />
          <ToolbarButton 
            active={editor.isActive("underline")} 
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            icon={UnderlineIcon}
          />
          <div className="w-px h-4 bg-border mx-1" />
          <ToolbarButton 
            active={editor.isActive("heading", { level: 1 })} 
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            icon={Heading1}
          />
          <ToolbarButton 
            active={editor.isActive("heading", { level: 2 })} 
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            icon={Heading2}
          />
          <div className="w-px h-4 bg-border mx-1" />
          <ToolbarButton 
            active={editor.isActive("code")} 
            onClick={() => editor.chain().focus().toggleCode().run()}
            icon={Code}
          />
        </div>
      )}
    </div>
  );
}

function ToolbarButton({ active, onClick, icon: Icon }: { active: boolean, onClick: () => void, icon: any }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-2 rounded-full transition-all",
        active ? "bg-blue-600 text-white" : "hover:bg-muted text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
