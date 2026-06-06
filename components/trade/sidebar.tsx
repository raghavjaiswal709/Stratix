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
  Sun,
  Moon,
  Shield,
  ChevronUp,
  Pin,
  PinOff,
  ChartCandlestick,
  Radio,
  Plus,
  Check,
  BrainCircuit,
  Newspaper,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ProfileSwitcher, ProfileDot, ManageModal } from "@/components/trade/profile-switcher";
import { GraffitiLogo, GraffitiMark } from "@/components/shared/graffiti-logo";

interface NavItem {
  href: string;
  label: string;
  icon: any;
  beta?: boolean;
}

const tradeItems: NavItem[] = [
  { href: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
  { href: "/trades",      label: "Trades",      icon: ArrowLeftRight },
  { href: "/journal",     label: "Journal",     icon: BookOpen },
  { href: "/trade-notes", label: "Trade Notes", icon: FileText },
  { href: "/backtesting", label: "Backtesting", icon: ChartCandlestick, beta: true },
];

const adminTradeItems: NavItem[] = [
  { href: "/live-data",     label: "Live Data",     icon: Radio },
  { href: "/chart",         label: "Chart",          icon: ChartCandlestick },
  { href: "/ai-report",     label: "AI Report",      icon: BrainCircuit },
  { href: "/news-analysis", label: "News Analysis",  icon: Newspaper },
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
  const { hasUnsavedChanges, setHasUnsavedChanges, theme, setTheme, tradingProfiles, activeProfileId, setActiveProfileId } = useAppContext();
  const [profileOpen, setProfileOpen] = useState(false);
  const [showManage, setShowManage] = useState(false);

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
        <GraffitiMark size={32} />
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                onClick={onPin}
                className="flex items-center justify-center h-7 w-7 rounded-md text-white/25 hover:text-white/70 hover:bg-white/[0.07] transition-all"
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
        {/* Profile dot */}
        <ProfileDot />

        <div className="w-8 my-0.5 border-t border-white/[0.05]" />

        {/* Trading */}
        {tradeItems.map(({ href, label, icon: Icon, beta }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Tooltip key={href}>
              <TooltipTrigger
                render={
                  <Link
                    href={href}
                    onClick={(e) => handleNav(e, href)}
                    className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150",
                      active
                        ? "bg-white/[0.09] text-white border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                        : "text-white/35 hover:text-white/70 hover:bg-white/[0.06]"
                    )}
                  />
                }
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="flex items-center gap-1.5 font-medium">
                  {label}
                  {beta && (
                    <span className="px-1 py-0.5 text-[8px] font-bold leading-none uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-md">
                      Beta
                    </span>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}

        {/* Admin-only items */}
        {session?.user?.role === "admin" && adminTradeItems.map(({ href, label, icon: Icon, beta }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Tooltip key={href}>
              <TooltipTrigger
                render={
                  <Link
                    href={href}
                    onClick={(e) => handleNav(e, href)}
                    className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150",
                      active
                        ? "bg-white/[0.09] text-white border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                        : "text-white/35 hover:text-white/70 hover:bg-white/[0.06]"
                    )}
                  />
                }
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="flex items-center gap-1.5 font-medium">
                  {label}
                  {beta && (
                    <span className="px-1 py-0.5 text-[8px] font-bold leading-none uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-md">
                      Beta
                    </span>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}

        <div className="w-8 my-1 border-t border-white/[0.06]" />

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
                      "flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150",
                      active
                        ? "bg-white/[0.09] text-white border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                        : "text-white/35 hover:text-white/70 hover:bg-white/[0.06]"
                    )}
                  />
                }
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
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
                <AvatarFallback className="text-[10px] bg-white/[0.08] text-white/60 border border-white/[0.10]">
                  {session.user.name?.charAt(0)?.toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent side="right">{session.user.name ?? "Profile"}</TooltipContent>
          </Tooltip>

          {profileOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
              <div className="absolute bottom-4 left-full ml-2 z-20 w-52 rounded-xl border border-white/[0.08] shadow-2xl overflow-hidden backdrop-blur-2xl bg-[#111]/90">
                <div className="px-3 py-2.5 border-b border-white/[0.06]">
                  <p className="text-[12px] font-semibold text-white/80 truncate">{session.user.name}</p>
                  <p className="text-[10px] text-white/35 truncate">{session.user.email}</p>
                </div>

                {/* Trading Profiles section */}
                <div className="border-b border-white/[0.06] py-1">
                  <div className="px-3 py-1 text-[9px] font-bold text-white/20 uppercase tracking-wider">
                    Trading Profiles
                  </div>
                  
                  {/* All Profiles */}
                  <button
                    onClick={() => { setActiveProfileId(""); setProfileOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-all hover:bg-white/[0.05]",
                      !activeProfileId ? "text-white font-medium" : "text-white/55 hover:text-white/80"
                    )}
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-white/20 shrink-0" />
                    <span className="truncate">All Profiles</span>
                    {!activeProfileId && <Check className="h-3.5 w-3.5 ml-auto text-white/60 shrink-0" />}
                  </button>

                  {/* Individual Profiles */}
                  {tradingProfiles.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setActiveProfileId(p.id); setProfileOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-all hover:bg-white/[0.05]",
                        activeProfileId === p.id ? "text-white font-medium" : "text-white/55 hover:text-white/80"
                      )}
                    >
                      <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="truncate flex-1 text-left">{p.name}</span>
                      {activeProfileId === p.id && <Check className="h-3.5 w-3.5 ml-auto text-white/60 shrink-0" />}
                    </button>
                  ))}

                  {/* Create / Manage */}
                  <button
                    onClick={() => { setProfileOpen(false); setShowManage(true); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-white/35 hover:text-white/65 hover:bg-white/[0.05] transition-all"
                  >
                    <Plus className="h-3 w-3 text-white/35" />
                    <span>Manage Profiles</span>
                  </button>
                </div>
                {session.user.role === "admin" && (
                  <Link
                    href="/admin"
                    onClick={(e) => { setProfileOpen(false); handleNav(e, "/admin"); }}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-white/55 hover:text-white/85 hover:bg-white/[0.06] transition-all"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Admin Panel
                  </Link>
                )}
                <button
                  onClick={() => { setProfileOpen(false); setTheme(theme === "dark" ? "light" : "dark"); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] text-white/45 hover:text-white/75 hover:bg-white/[0.06] transition-all"
                >
                  {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </button>
                <button
                  onClick={() => { setProfileOpen(false); handleSignOut(); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition-all"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {showManage && <ManageModal onClose={() => setShowManage(false)} />}
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
  const { hasUnsavedChanges, setHasUnsavedChanges, theme, setTheme, tradingProfiles, activeProfileId, setActiveProfileId } = useAppContext();
  const [profileOpen, setProfileOpen] = useState(false);
  const [showManage, setShowManage] = useState(false);

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
        <GraffitiMark size={32} />
        <div className="flex flex-col leading-none flex-1 min-w-0">
          <GraffitiLogo size={20} className="mb-0.5" />
          <span className="text-[10px] mt-0.5 text-white/25 font-medium uppercase tracking-widest">Tradebook &amp; Life OS</span>
        </div>
        {/* Unpin / close button */}
        {!isMobile && onUnpin ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  onClick={onUnpin}
                  className="shrink-0 text-white/25 hover:text-white/70 hover:bg-white/[0.07] p-1.5 rounded-md transition-all"
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
        {/* Profile switcher */}
        <div className="mb-3">
          <ProfileSwitcher />
        </div>

        <p className="px-2 mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-white/20">Trading</p>
        {tradeItems.map(({ href, label, icon: Icon, beta }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={(e) => handleNav(e, href)}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150",
                active
                  ? "bg-white/[0.08] text-white border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]"
                  : "text-white/38 hover:text-white/72 hover:bg-white/[0.05]"
              )}
            >
              <Icon className="h-[15px] w-[15px] shrink-0" />
              <span>{label}</span>
              {beta && (
                <span className="px-1.5 py-0.5 text-[8px] font-bold leading-none uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-md">
                  Beta
                </span>
              )}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/60" />}
            </Link>
          );
        })}

        {/* Admin-only items */}
        {session?.user?.role === "admin" && adminTradeItems.map(({ href, label, icon: Icon, beta }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={(e) => handleNav(e, href)}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150",
                active
                  ? "bg-white/[0.08] text-white border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]"
                  : "text-white/38 hover:text-white/72 hover:bg-white/[0.05]"
              )}
            >
              <Icon className="h-[15px] w-[15px] shrink-0" />
              <span>{label}</span>
              {beta && (
                <span className="px-1.5 py-0.5 text-[8px] font-bold leading-none uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-md">
                  Beta
                </span>
              )}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/60" />}
            </Link>
          );
        })}

        <div className="my-3 border-t border-white/[0.055]" />

        <p className="px-2 mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-white/20">Life-OS</p>
        {lifeItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={(e) => handleNav(e, href)}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150",
                active
                  ? "bg-white/[0.08] text-white border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]"
                  : "text-white/38 hover:text-white/72 hover:bg-white/[0.05]"
              )}
            >
              <Icon className="h-[15px] w-[15px] shrink-0" />
              {label}
              {active && <span className="ml-auto h-1 w-1 rounded-full bg-white/50" />}
            </Link>
          );
        })}
      </nav>

      {/* User profile — dropup */}
      {session?.user && (
        <div className="px-3 pb-4 pt-2 border-t border-white/[0.055] relative">
          {profileOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
              <div className="absolute bottom-full left-3 right-3 mb-2 z-20 rounded-xl border border-white/[0.08] shadow-2xl overflow-hidden backdrop-blur-2xl bg-[#111]/90">
                <div className="px-3 py-2.5 border-b border-white/[0.06]">
                  <p className="text-[12px] font-semibold text-white/80 truncate">{session.user.name}</p>
                  <p className="text-[10px] text-white/35 truncate">{session.user.email}</p>
                </div>

                {/* Trading Profiles section */}
                <div className="border-b border-white/[0.06] py-1">
                  <div className="px-3 py-1 text-[9px] font-bold text-white/20 uppercase tracking-wider">
                    Trading Profiles
                  </div>
                  
                  {/* All Profiles */}
                  <button
                    onClick={() => { setActiveProfileId(""); setProfileOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-all hover:bg-white/[0.05]",
                      !activeProfileId ? "text-white font-medium" : "text-white/55 hover:text-white/80"
                    )}
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-white/20 shrink-0" />
                    <span className="truncate">All Profiles</span>
                    {!activeProfileId && <Check className="h-3.5 w-3.5 ml-auto text-white/60 shrink-0" />}
                  </button>

                  {/* Individual Profiles */}
                  {tradingProfiles.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setActiveProfileId(p.id); setProfileOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-all hover:bg-white/[0.05]",
                        activeProfileId === p.id ? "text-white font-medium" : "text-white/55 hover:text-white/80"
                      )}
                    >
                      <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="truncate flex-1 text-left">{p.name}</span>
                      {activeProfileId === p.id && <Check className="h-3.5 w-3.5 ml-auto text-white/60 shrink-0" />}
                    </button>
                  ))}

                  {/* Create / Manage */}
                  <button
                    onClick={() => { setProfileOpen(false); setShowManage(true); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-white/35 hover:text-white/65 hover:bg-white/[0.05] transition-all"
                  >
                    <Plus className="h-3 w-3 text-white/35" />
                    <span>Manage Profiles</span>
                  </button>
                </div>
                {session.user.role === "admin" && (
                  <Link
                    href="/admin"
                    onClick={(e) => { setProfileOpen(false); handleNav(e, "/admin"); }}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-white/55 hover:text-white/85 hover:bg-white/[0.06] transition-all duration-150"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Admin Panel
                  </Link>
                )}
                <button
                  onClick={() => { setProfileOpen(false); setTheme(theme === "dark" ? "light" : "dark"); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] text-white/45 hover:text-white/75 hover:bg-white/[0.06] transition-all duration-150"
                >
                  {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </button>
                <button
                  onClick={() => { setProfileOpen(false); handleSignOut(); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            </>
          )}
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.05] transition-all duration-150"
          >
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarImage src={session.user.image ?? ""} />
              <AvatarFallback className="text-[10px] bg-white/[0.08] text-white/60 border border-white/[0.10]">
                {session.user.name?.charAt(0)?.toUpperCase() ?? "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[12px] font-medium text-white/75 truncate">
                {session.user.name?.split(" ")[0]}
              </p>
              <p className="text-[10px] text-white/30 truncate">{session.user.email}</p>
            </div>
            <ChevronUp
              className={cn(
                "h-3 w-3 shrink-0 text-white/25 transition-transform duration-150",
                profileOpen ? "rotate-0" : "rotate-180"
              )}
            />
          </button>
        </div>
      )}
      {showManage && <ManageModal onClose={() => setShowManage(false)} />}
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

