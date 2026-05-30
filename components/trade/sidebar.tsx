"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useAppContext } from "@/lib/context";
import { useState } from "react";
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
  Shield,
  ChevronUp,
  Pin,
  PinOff,
  ChartCandlestick,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const tradeItems = [
  { href: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
  { href: "/trades",      label: "Trades",      icon: ArrowLeftRight },
  { href: "/journal",     label: "Journal",     icon: BookOpen },
  { href: "/trade-notes", label: "Trade Notes", icon: FileText },
];

const adminTradeItems = [
  { href: "/backtesting", label: "Backtesting", icon: ChartCandlestick },
];

const lifeItems = [
  { href: "/todo",   label: "To-Do",  icon: ListTodo },
  { href: "/habits", label: "Habits", icon: Activity },
  { href: "/diary",  label: "Diary",  icon: PenLine },
  { href: "/notes",  label: "Notes",  icon: StickyNote },
];

interface TradeSidebarProps {
  open: boolean;
  onClose: () => void;
}

// ─── Collapsed (icon-only) sidebar ───────────────────────────────────────────
function CollapsedSidebar({
  onClose,
  onPin,
}: {
  onClose: () => void;
  onPin: () => void;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { hasUnsavedChanges, setHasUnsavedChanges, theme, setTheme } = useAppContext();
  const [profileOpen, setProfileOpen] = useState(false);

  function handleSignOut() {
    if (hasUnsavedChanges) {
      if (!window.confirm("You have unsaved changes. Are you sure you want to log out?")) return;
      setHasUnsavedChanges(false);
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    signOut({ callbackUrl: `${origin}/auth/signin` });
  }

  function handleNav(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (pathname === href || pathname.startsWith(href + "/")) { onClose(); return; }
    if (hasUnsavedChanges) {
      if (!window.confirm("You have unsaved changes. Are you sure you want to leave?")) {
        e.preventDefault();
        return;
      }
      setHasUnsavedChanges(false);
    }
    onClose();
  }

  return (
    <aside className="flex flex-col w-14 h-full bg-sidebar border-r border-sidebar-border">
      {/* Logo + pin button */}
      <div className="flex flex-col items-center gap-2.5 py-4 border-b border-sidebar-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20 border border-blue-500/30 shrink-0">
          <Sunrise className="text-indigo-400" style={{ width: 18, height: 18 }} />
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                onClick={onPin}
                className="flex items-center justify-center h-7 w-7 rounded-md text-sidebar-foreground/30 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all"
              />
            }
          >
            <Pin className="h-3.5 w-3.5" />
          </TooltipTrigger>
          <TooltipContent side="right">Pin sidebar</TooltipContent>
        </Tooltip>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col items-center px-2 pt-4 gap-1 overflow-y-auto">
        {/* Trading */}
        {tradeItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Tooltip key={href}>
              <TooltipTrigger
                render={
                  <Link
                    href={href}
                    onClick={(e) => handleNav(e, href)}
                    className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-lg transition-all",
                      active
                        ? "bg-blue-600/15 text-blue-400 border border-blue-500/20"
                        : "text-sidebar-foreground/45 hover:text-sidebar-foreground/80 hover:bg-sidebar-accent"
                    )}
                  />
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          );
        })}

        {/* Admin-only items */}
        {session?.user?.role === "admin" && adminTradeItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Tooltip key={href}>
              <TooltipTrigger
                render={
                  <Link
                    href={href}
                    onClick={(e) => handleNav(e, href)}
                    className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-lg transition-all",
                      active
                        ? "bg-amber-600/15 text-amber-400 border border-amber-500/20"
                        : "text-sidebar-foreground/45 hover:text-sidebar-foreground/80 hover:bg-sidebar-accent"
                    )}
                  />
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          );
        })}

        <div className="w-8 my-1 border-t border-sidebar-border" />

        {/* Life-OS */}
        {lifeItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Tooltip key={href}>
              <TooltipTrigger
                render={
                  <Link
                    href={href}
                    onClick={(e) => handleNav(e, href)}
                    className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-lg transition-all",
                      active
                        ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20"
                        : "text-sidebar-foreground/45 hover:text-sidebar-foreground/80 hover:bg-sidebar-accent"
                    )}
                  />
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      {/* Profile — avatar only */}
      {session?.user && (
        <div className="relative px-2 pb-4 pt-2 border-t border-sidebar-border flex justify-center">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  onClick={() => setProfileOpen((v) => !v)}
                  className="flex items-center justify-center"
                />
              }
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={session.user.image ?? ""} />
                <AvatarFallback className="text-[10px] bg-blue-500/20 text-blue-300">
                  {session.user.name?.charAt(0)?.toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent side="right">{session.user.name ?? "Profile"}</TooltipContent>
          </Tooltip>

          {profileOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
              <div className="absolute bottom-4 left-full ml-2 z-20 w-48 rounded-xl bg-[#1a1f2e] border border-white/10 shadow-2xl overflow-hidden">
                <div className="px-3 py-2.5 border-b border-white/8">
                  <p className="text-[12px] font-semibold text-white/80 truncate">{session.user.name}</p>
                  <p className="text-[10px] text-white/35 truncate">{session.user.email}</p>
                </div>
                {session.user.role === "admin" && (
                  <Link
                    href="/admin"
                    onClick={(e) => { setProfileOpen(false); handleNav(e, "/admin"); }}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-violet-400 hover:bg-violet-500/10 transition-all"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Admin Panel
                  </Link>
                )}
                <button
                  onClick={() => { setProfileOpen(false); setTheme(theme === "dark" ? "light" : "dark"); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] text-sidebar-foreground/60 hover:bg-sidebar-accent transition-all"
                >
                  {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </button>
                <button
                  onClick={() => { setProfileOpen(false); handleSignOut(); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] text-red-400 hover:bg-red-500/10 transition-all"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}

// ─── Expanded sidebar ─────────────────────────────────────────────────────────
function ExpandedSidebar({
  isMobile = false,
  onClose,
  onUnpin,
}: {
  isMobile?: boolean;
  onClose: () => void;
  onUnpin?: () => void;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { hasUnsavedChanges, setHasUnsavedChanges, theme, setTheme } = useAppContext();
  const [profileOpen, setProfileOpen] = useState(false);

  function handleSignOut() {
    if (hasUnsavedChanges) {
      if (!window.confirm("You have unsaved changes. Are you sure you want to log out?")) return;
      setHasUnsavedChanges(false);
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    signOut({ callbackUrl: `${origin}/auth/signin` });
  }

  function handleNav(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (pathname === href || pathname.startsWith(href + "/")) { onClose(); return; }
    if (hasUnsavedChanges) {
      if (!window.confirm("You have unsaved changes. Are you sure you want to leave?")) {
        e.preventDefault();
        return;
      }
      setHasUnsavedChanges(false);
    }
    onClose();
  }

  return (
    <aside className="flex flex-col w-55 h-full bg-sidebar border-r border-sidebar-border">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20 border border-blue-500/30 shrink-0">
          <Sunrise className="text-indigo-400" style={{ width: 22, height: 22 }} />
        </div>
        <div className="flex flex-col leading-none flex-1 min-w-0">
          <span className="text-[18px] font-bold text-sidebar-foreground tracking-tight">Stratix PRO</span>
          <span className="text-[10px] mt-1 text-sidebar-foreground/40 font-medium uppercase tracking-wider">Tradebook &amp; Life OS</span>
        </div>
        {/* Unpin / close button */}
        {!isMobile && onUnpin ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  onClick={onUnpin}
                  className="shrink-0 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 p-1.5 rounded transition-all"
                />
              }
            >
              <PinOff className="h-3.5 w-3.5" />
            </TooltipTrigger>
            <TooltipContent side="right">Collapse sidebar</TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={onClose}
            className="md:hidden text-sidebar-foreground/40 hover:text-sidebar-foreground/80 transition p-1"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        )}
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

        {/* Admin-only items */}
        {session?.user?.role === "admin" && adminTradeItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={(e) => handleNav(e, href)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150",
                active
                  ? "bg-amber-600/15 text-amber-400 border border-amber-500/20"
                  : "text-sidebar-foreground/45 hover:text-sidebar-foreground/80 hover:bg-sidebar-accent"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-400" />}
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

      {/* User profile — dropup */}
      {session?.user && (
        <div className="px-3 pb-4 pt-2 border-t border-sidebar-border relative">
          {profileOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
              <div className="absolute bottom-full left-3 right-3 mb-2 z-20 rounded-xl bg-[#1a1f2e] border border-white/10 shadow-2xl overflow-hidden">
                <div className="px-3 py-2.5 border-b border-white/8">
                  <p className="text-[12px] font-semibold text-white/80 truncate">{session.user.name}</p>
                  <p className="text-[10px] text-white/35 truncate">{session.user.email}</p>
                </div>
                {session.user.role === "admin" && (
                  <Link
                    href="/admin"
                    onClick={(e) => { setProfileOpen(false); handleNav(e, "/admin"); }}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-violet-400 hover:bg-violet-500/10 transition-all duration-150"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Admin Panel
                  </Link>
                )}
                <button
                  onClick={() => { setProfileOpen(false); setTheme(theme === "dark" ? "light" : "dark"); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] text-sidebar-foreground/60 hover:bg-sidebar-accent transition-all duration-150"
                >
                  {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </button>
                <button
                  onClick={() => { setProfileOpen(false); handleSignOut(); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] text-red-400 hover:bg-red-500/10 transition-all duration-150"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            </>
          )}
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-sidebar-accent transition-all duration-150"
          >
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarImage src={session.user.image ?? ""} />
              <AvatarFallback className="text-[10px] bg-blue-500/20 text-blue-300">
                {session.user.name?.charAt(0)?.toUpperCase() ?? "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[12px] font-medium text-sidebar-foreground/80 truncate">
                {session.user.name?.split(" ")[0]}
              </p>
              <p className="text-[10px] text-sidebar-foreground/35 truncate">{session.user.email}</p>
            </div>
            <ChevronUp
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-sidebar-foreground/30 transition-transform duration-150",
                profileOpen ? "rotate-0" : "rotate-180"
              )}
            />
          </button>
        </div>
      )}
    </aside>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────
export function TradeSidebar({ open, onClose }: TradeSidebarProps) {
  const [pinned, setPinned] = useState(false);

  return (
    <>
      {/* Desktop sidebar — collapsed by default, expands when pinned */}
      <div className="hidden md:flex h-full">
        {pinned ? (
          <ExpandedSidebar onClose={onClose} onUnpin={() => setPinned(false)} />
        ) : (
          <CollapsedSidebar onClose={onClose} onPin={() => setPinned(true)} />
        )}
      </div>

      {/* Mobile sidebar — overlay drawer, always expanded */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 z-50 flex md:hidden">
            <ExpandedSidebar isMobile onClose={onClose} />
          </div>
        </>
      )}
    </>
  );
}

