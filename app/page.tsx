"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/lib/context";

export default function Home() {
  const { preferences, loading } = useAppContext();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      let dest = preferences.defaultPage || "/dashboard";
      if (dest === "/productivity" || dest === "/trade/trades" || dest === "/trades") {
        dest = "/dashboard";
      }
      router.replace(dest);
    }
  }, [loading, preferences.defaultPage, router]);

  return (
    <div className="flex items-center justify-center h-full">
      <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
    </div>
  );
}
