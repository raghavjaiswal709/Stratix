"use client";

import { useState } from "react";
import { TradeSidebar } from "@/components/trade/sidebar";
import { AuthProvider } from "@/components/providers/auth-provider";
import { AppProvider } from "@/lib/context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Menu, TrendingUp } from "lucide-react";

function TradeShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0c0e14]">
      <TradeSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex md:hidden items-center gap-3 px-4 py-3 bg-[#0f1117] border-b border-white/6 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600/20 border border-blue-500/30">
              <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <span className="text-[14px] font-bold text-white tracking-tight">Stratix</span>
            <span className="text-[10px] text-white/30 uppercase tracking-wider font-medium">Tradebook</span>
          </div>
        </header>

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
