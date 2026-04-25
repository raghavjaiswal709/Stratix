"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/lib/context";

export default function Home() {
  const { preferences, loading } = useAppContext();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(preferences.defaultPage || "/trade/trades");
    }
  }, [loading, preferences.defaultPage, router]);

  return (
    <div className="flex items-center justify-center h-full">
      <div className="h-5 w-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
    </div>
  );
}
