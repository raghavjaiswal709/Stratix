"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useAppContext } from "@/lib/context";
import {
  LayoutDashboard,
  ArrowLeftRight,
  BookOpen,
  LogOut,
  ListTodo,
  Activity,
  PenLine,
  StickyNote,
  FileText,
  X,
  Sunrise,
  Sun,
  Moon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const tradeItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trades",   label: "Trades",    icon: ArrowLeftRight },
  { href: "/journal",  label: "Journal",   icon: BookOpen },
  { href: "/trade-notes", label: "Trade Notes", icon: FileText },
];

const lifeItems = [
  { href: "/todo",   label: "To-Do",   icon: ListTodo },
  { href: "/habits", label: "Habits",  icon: Activity },
  { href: "/diary",  label: "Diary",   icon: PenLine },
  { href: "/notes",  label: "Notes",   icon: StickyNote },
];

interface TradeSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function TradeSidebar({ open, onClose }: TradeSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { hasUnsavedChanges, setHasUnsavedChanges, theme, setTheme } = useAppContext();

  function handleSignOut() {
    if (hasUnsavedChanges) {
      if (!window.confirm("You have unsaved changes. Are you sure you want to log out?")) {
        return;
      }
      setHasUnsavedChanges(false);
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    signOut({ callbackUrl: `${origin}/auth/signin` });
  }

  function handleNav(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (pathname === href || pathname.startsWith(href + "/")) {
      onClose();
      return;
    }
    if (hasUnsavedChanges) {
      if (!window.confirm("You have unsaved changes. Are you sure you want to leave this page?")) {
        e.preventDefault();
        return;
      }
      setHasUnsavedChanges(false);
    }
    onClose();
  }

  const sidebarContent = (
    <aside className="flex flex-col w-[220px] h-full bg-sidebar border-r border-sidebar-border">
      {/* Logo + close btn (mobile) */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-sidebar-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20 border border-blue-500/30 shrink-0">
              <Sunrise className="h-5.5 w-5.5 text-indigo-400" style={{ width: 22, height: 22 }} />
        </div>
        <div className="flex flex-col leading-none flex-1 min-w-0">
          <span className="text-[18px] font-bold text-sidebar-foreground tracking-tight">Stratix PRO</span>
          <span className="text-[10px] mt-1 text-sidebar-foreground/40 font-medium uppercase tracking-wider">Tradebook &amp; Life OS</span>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="md:hidden text-sidebar-foreground/40 hover:text-sidebar-foreground/80 transition p-1"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 pt-4 space-y-0.5 overflow-y-auto">
        <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/25">Trading</p>
        {tradeItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={(e) => handleNav(e, href)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150",
                active
                  ? "bg-blue-600/15 text-blue-400 border border-blue-500/20"
                  : "text-sidebar-foreground/45 hover:text-sidebar-foreground/80 hover:bg-sidebar-accent"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400" />}
            </Link>
          );
        })}

        <div className="my-3 border-t border-sidebar-border" />

        <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/25">Life-OS</p>
        {lifeItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={(e) => handleNav(e, href)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150",
                active
                  ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20"
                  : "text-sidebar-foreground/45 hover:text-sidebar-foreground/80 hover:bg-sidebar-accent"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400" />}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      {session?.user && (
        <div className="px-3 pb-4 pt-2 border-t border-sidebar-border">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg">
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarImage src={session.user.image ?? ""} />
              <AvatarFallback className="text-[10px] bg-blue-500/20 text-blue-300">
                {session.user.name?.charAt(0)?.toUpperCase() ?? "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-sidebar-foreground/80 truncate">
                {session.user.name?.split(" ")[0]}
              </p>
              <p className="text-[10px] text-sidebar-foreground/35 truncate">{session.user.email}</p>
            </div>
            {/* Theme toggle — icon only, sits next to avatar */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground/80 hover:bg-sidebar-accent transition-all duration-150 shrink-0"
              aria-label="Toggle theme"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark"
                ? <Sun className="h-3.5 w-3.5" />
                : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>
          <button
            onClick={handleSignOut}
            className="mt-1 flex w-full items-center gap-2.5 px-3 py-1.5 rounded-lg text-[12px] text-sidebar-foreground/35 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      )}
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar — always visible */}
      <div className="hidden md:flex h-full">
        {sidebarContent}
      </div>

      {/* Mobile sidebar — overlay drawer */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50 flex md:hidden">
            {sidebarContent}
          </div>
        </>
      )}
    </>
  );
}
