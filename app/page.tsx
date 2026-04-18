"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/lib/context";

export default function Home() {
  const { preferences, loading } = useAppContext();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(preferences.defaultPage || "/productivity");
    }
  }, [loading, preferences.defaultPage, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <div className="h-5 w-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      <p className="text-[12px] text-muted-foreground">Loading…</p>
    </div>
  );
}
