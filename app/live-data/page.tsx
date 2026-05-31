"use client";

import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Dynamically import LiveDataPage to prevent SSR issues with canvas/Lightweight Charts and window APIs
const LiveDataPage = dynamic(
  () => import("./LiveDataPage").then((m) => ({ default: m.LiveDataPage })),
  { ssr: false }
);

export default function Page() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Redirect to signin if not authenticated, or to dashboard if not admin
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
    <div className="flex h-full w-full bg-[#0f0f0f]">
      <LiveDataPage />
    </div>
  );
}
