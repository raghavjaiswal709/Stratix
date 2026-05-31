"use client";

import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle } from "lucide-react";

const BacktestingPage = dynamic(
  () => import("@/components/backtesting/BacktestingPage").then((m) => ({ default: m.BacktestingPage })),
  { ssr: false }
);

export default function Page() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [showBetaModal, setShowBetaModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      router.replace("/auth/signin");
      return;
    }
    
    // Check if user has already dismissed the beta modal
    const dismissed = localStorage.getItem("stratix-backtesting-beta-dismissed");
    if (!dismissed) {
      setShowBetaModal(true);
    }
  }, [session, status, router]);

  const handleAcknowledge = () => {
    if (dontShowAgain) {
      localStorage.setItem("stratix-backtesting-beta-dismissed", "true");
    }
    setShowBetaModal(false);
  };

  if (status === "loading" || !session?.user) {
    return null;
  }

  return (
    <div className="flex h-full w-full relative">
      <BacktestingPage />
      
      <Dialog open={showBetaModal} onOpenChange={setShowBetaModal}>
        <DialogContent className="sm:max-w-md bg-[#0f0f0f]/95 border border-white/[0.08] backdrop-blur-xl text-white/90 p-6 rounded-2xl shadow-2xl">
          <DialogHeader className="flex flex-col items-center text-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <DialogTitle className="text-xl font-heading font-semibold text-white tracking-tight">
              Backtesting Beta Warning
            </DialogTitle>
            <DialogDescription className="text-white/60 text-sm leading-relaxed max-w-sm mt-1">
              The backtesting feature is currently in <span className="text-amber-400 font-semibold">Beta</span>. 
              We are actively developing this feature, so you may encounter bugs or unexpected behavior.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex items-center gap-3 py-3 border-t border-b border-white/[0.06] my-2 select-none">
            <Checkbox 
              id="dont-show-again" 
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(!!checked)}
            />
            <label 
              htmlFor="dont-show-again" 
              className="text-xs text-white/40 cursor-pointer font-medium hover:text-white/60 transition-colors"
            >
              Don't show this message again
            </label>
          </div>

          <DialogFooter className="-mx-6 -mb-6 mt-4 p-4 bg-white/[0.02] border-t border-white/[0.06] flex items-center justify-end">
            <Button 
              onClick={handleAcknowledge}
              className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-[#0f0f0f] font-semibold tracking-tight shadow-lg shadow-amber-500/10 px-6 py-2 rounded-lg"
            >
              I Understand &amp; Agree
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
