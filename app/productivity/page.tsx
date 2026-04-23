"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProductivityPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/trade/todo");
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <div className="h-5 w-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
    </div>
  );
}

