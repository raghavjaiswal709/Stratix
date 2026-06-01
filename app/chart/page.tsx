"use client";

// Chart service is temporarily paused.
// Dynamic import and candle stream are disabled — no Binance/Dukascopy calls.
// import dynamic from "next/dynamic";
// const LiveChart = dynamic(
//   () => import("@/chart-page/client/LiveChart").then((m) => ({ default: m.LiveChart })),
//   { ssr: false }
// );

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChartCandlestick } from "lucide-react";

export default function Page() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      router.replace("/auth/signin");
    } else if (session.user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [session, status, router]);

  if (status === "loading" || !session?.user || session.user.role !== "admin") {
    return null;
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0f0f0f]">
      <div className="flex flex-col items-center gap-5 text-center max-w-xs px-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.08]">
          <ChartCandlestick className="h-6 w-6 text-white/25" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-[14px] font-semibold text-white/60 tracking-tight">
            Live Chart — Service Paused
          </h2>
          <p className="text-[12px] text-white/25 leading-relaxed">
            Real-time chart streaming has been temporarily disabled. This page
            will be available once the service is restored.
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06]">
          <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
          <span className="text-[10px] text-white/25 font-medium uppercase tracking-widest">
            Offline
          </span>
        </div>
      </div>
    </div>
  );
}
