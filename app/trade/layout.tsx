"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { TradeSidebar } from "@/components/trade/sidebar";
import { AuthProvider } from "@/components/providers/auth-provider";
import { AppProvider } from "@/lib/context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Menu, TrendingUp, LogOut } from "lucide-react";

function MobileTopBar({ onMenuOpen }: { onMenuOpen: () => void }) {
  const { data: session } = useSession();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  function handleSignOut() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    signOut({ callbackUrl: `${origin}/auth/signin` });
  }

  return (
    <header className="flex md:hidden items-center px-3 py-2.5 bg-[#0f1117] border-b border-white/6 shrink-0">
      {/* Hamburger */}
      <button
        onClick={onMenuOpen}
        className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition shrink-0"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Logo */}
      <div className="flex items-center gap-1.5 ml-2 flex-1 min-w-0">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-600/20 border border-blue-500/30">
          <TrendingUp className="h-3 w-3 text-blue-400" />
        </div>
        <span className="text-[13px] font-bold text-white tracking-tight">Stratix</span>
      </div>

      {/* User avatar + dropdown — always visible */}
      <div className="relative shrink-0">
        <button
          onClick={() => setDropdownOpen((v) => !v)}
          className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg hover:bg-white/5 active:bg-white/8 transition"
          aria-label="User menu"
        >
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={session?.user?.image ?? ""} />
            <AvatarFallback className="text-[10px] bg-blue-500/20 text-blue-300">
              {session?.user?.name?.charAt(0)?.toUpperCase() ?? "U"}
            </AvatarFallback>
          </Avatar>
          {session?.user?.name && (
            <span className="text-[12px] text-white/60 max-w-[72px] truncate hidden xs:block">
              {session.user.name.split(" ")[0]}
            </span>
          )}
        </button>

        {dropdownOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
            <div className="absolute right-0 top-full mt-1.5 z-50 w-48 rounded-xl bg-[#1a1f2e] border border-white/10 shadow-2xl overflow-hidden">
              {session?.user && (
                <div className="px-3 py-2.5 border-b border-white/8">
                  <p className="text-[12px] font-semibold text-white/90 truncate">{session.user.name}</p>
                  <p className="text-[10px] text-white/40 truncate mt-0.5">{session.user.email}</p>
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

function TradeShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0c0e14]">
      <TradeSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <MobileTopBar onMenuOpen={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function TradeLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppProvider>
        <TooltipProvider>
          <TradeShell>{children}</TradeShell>
        </TooltipProvider>
      </AppProvider>
    </AuthProvider>
  );
}
