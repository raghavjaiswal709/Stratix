"use client";

import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { TradeSidebar } from "@/components/trade/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Menu, LogOut } from "lucide-react";

import { useAppContext } from "@/lib/context";
import { DASHBOARD_PALETTES } from "@/types";
import { StratixMark, StratixWordmark } from "@/components/shared/stratix-logo";

function MobileTopBar({ onMenuOpen }: { onMenuOpen: () => void }) {
  const { data: session } = useSession();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { hasUnsavedChanges, setHasUnsavedChanges } = useAppContext();

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

  return (
    <header className="flex md:hidden items-center px-3 py-2.5 bg-sidebar border-b border-sidebar-border shrink-0">
      {/* Hamburger */}
      <button
        onClick={onMenuOpen}
        className="p-1.5 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition shrink-0"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Logo — also opens the nav drawer, mirroring the desktop collapsed
          rail's logo (click to expand and reveal the full branded nav). */}
      <button
        onClick={onMenuOpen}
        className="flex items-center gap-2 ml-2 flex-1 min-w-0 rounded-lg hover:bg-sidebar-accent transition p-1 -m-1"
        aria-label="Open navigation"
      >
        <StratixMark size={24} />
        <StratixWordmark size={11} />
      </button>

      {/* User avatar + dropdown — always visible */}
      <div className="relative shrink-0">
        <button
          onClick={() => setDropdownOpen((v) => !v)}
          className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg hover:bg-sidebar-accent active:bg-sidebar-accent transition"
          aria-label="User menu"
        >
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={session?.user?.image ?? ""} />
            <AvatarFallback className="text-[10px] bg-white/[0.08] text-white/60 border border-white/[0.10]">
              {session?.user?.name?.charAt(0)?.toUpperCase() ?? "U"}
            </AvatarFallback>
          </Avatar>
          {session?.user?.name && (
            <span className="text-[12px] text-sidebar-foreground/60 max-w-[72px] truncate hidden xs:block">
              {session.user.name.split(" ")[0]}
            </span>
          )}
        </button>

        {dropdownOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
            <div className="absolute right-0 top-full mt-1.5 z-50 w-48 rounded-xl bg-popover border border-border shadow-2xl overflow-hidden">
              {session?.user && (
                <div className="px-3 py-2.5 border-b border-border/50">
                  <p className="text-[12px] font-semibold text-popover-foreground truncate">{session.user.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{session.user.email}</p>
                </div>
              )}
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] text-red-400 hover:bg-red-500/10 transition"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isAuthPage = pathname.startsWith("/auth");
  // Admin "view as" popup — a standalone read-only window, not part of the
  // normal app shell (its own banner/tabs replace the sidebar + top bar).
  const isAdminViewPage = pathname.startsWith("/admin/view/");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { preferences, theme } = useAppContext();
  // "default" (or unset) means: no full-palette override — fall through to
  // the normal dark/light + single-accent-color theme untouched. A palette
  // is strictly opt-in; only a real DASHBOARD_PALETTES id activates it.
  const palette = preferences.dashboardPalette && preferences.dashboardPalette !== "default"
    ? DASHBOARD_PALETTES.find((p) => p.id === preferences.dashboardPalette)
    : undefined;

  // Sync document root class when custom palette changes or main theme changes
  useEffect(() => {
    const root = document.documentElement;
    if (palette) {
      if (palette.mode === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    } else {
      if (theme === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
  }, [palette, theme]);

  // Client-side safety: redirect authenticated users away from auth pages
  // (server middleware handles the unauthenticated → signIn redirect)
  useEffect(() => {
    if (status === "authenticated" && isAuthPage) {
      router.replace("/dashboard");
    }
  }, [status, isAuthPage, router]);

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 bg-background">
        <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
        <p className="text-[12px] text-muted-foreground tracking-wide">Loading…</p>
      </div>
    );
  }

  if (isAuthPage || isAdminViewPage) {
    return <>{children}</>;
  }

  // Only build the override style object when a palette is actually active.
  // When "default", neither the class nor any inline var is applied, so the
  // normal .dark / :root cascade (dark-light toggle + single accent color)
  // governs everything exactly as it did before the palette feature existed.
  const paletteStyle: CSSProperties | undefined = palette
    ? ({
        backgroundColor: palette.background,
        "--background": palette.background,
        "--foreground": palette.text,
        "--card": palette.card,
        "--card-foreground": palette.text,
        "--popover": palette.card,
        "--popover-foreground": palette.text,
        "--border": palette.border,
        "--input": palette.border,
        "--muted": palette.border,
        "--muted-foreground": palette.textMuted,
        "--primary": palette.accent,
        "--primary-foreground": palette.text,
        "--ring": palette.accent,
        "--accent": `color-mix(in srgb, ${palette.accent} 16%, transparent)`,
        "--accent-foreground": palette.accent,
        "--sidebar": palette.card,
        "--sidebar-foreground": palette.text,
        "--sidebar-border": palette.border,
        "--sidebar-primary": palette.accent,
        "--sidebar-primary-foreground": palette.text,
        "--sidebar-accent": `color-mix(in srgb, ${palette.accent} 16%, transparent)`,
        "--sidebar-accent-foreground": palette.accent,
        "--sidebar-ring": palette.accent,
        "--dash-total": palette.accent,
        "--dash-pending": palette.icon,
        "--dash-done": palette.positive,
        "--dash-metric": palette.accent,
        "--dash-card-top": palette.accent,
        "--dash-icon": palette.icon,
        "--dash-badge-ring": palette.badge,
        "--dash-positive": palette.positive,
        "--dash-negative": palette.negative,
      } as CSSProperties)
    : undefined;

  return (
    <div
      className={`flex h-dvh w-full overflow-hidden bg-background${palette ? " app-theme-scope" : ""}`}
      style={paletteStyle}
    >
      <TradeSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative z-10">
        <MobileTopBar onMenuOpen={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}