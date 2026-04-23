import { TradeSidebar } from "@/components/trade/sidebar";
import { AuthProvider } from "@/components/providers/auth-provider";
import { AppProvider } from "@/lib/context";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function TradeLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppProvider>
        <TooltipProvider>
          <div className="flex h-screen overflow-hidden bg-[#0c0e14]">
            <TradeSidebar />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </TooltipProvider>
      </AppProvider>
    </AuthProvider>
  );
}
