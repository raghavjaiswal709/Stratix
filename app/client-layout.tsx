"use client";

import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TradeSidebar } from "@/components/trade/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Menu, TrendingUp, LogOut } from "lucide-react";

import { useAppContext } from "@/lib/context";

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

      {/* Logo */}
      <div className="flex items-center gap-1.5 ml-2 flex-1 min-w-0">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-600/20 border border-blue-500/30">
          <TrendingUp className="h-3 w-3 text-blue-400" />
        </div>
        <span className="text-[13px] font-bold text-sidebar-foreground tracking-tight">Stratix</span>
      </div>

      {/* User avatar + dropdown — always visible */}
      <div className="relative shrink-0">
        <button
          onClick={() => setDropdownOpen((v) => !v)}
          className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg hover:bg-sidebar-accent active:bg-sidebar-accent transition"
          aria-label="User menu"
        >
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={session?.user?.image ?? ""} />
            <AvatarFallback className="text-[10px] bg-blue-500/20 text-blue-300">
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        <div className="h-5 w-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        <p className="text-[12px] text-muted-foreground tracking-wide">Loading…</p>
      </div>
    );
  }

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
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