"use client";

import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const BacktestingPage = dynamic(
  () => import("@/components/backtesting/BacktestingPage").then((m) => ({ default: m.BacktestingPage })),
  { ssr: false }
);

export default function Page() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user || session.user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [session, status, router]);

  if (status === "loading" || !session?.user || session.user.role !== "admin") {
    return null;
  }

  return (
    <div className="flex h-full w-full">
      <BacktestingPage />
    </div>
  );
}
