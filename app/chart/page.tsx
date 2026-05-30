"use client";

import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Dynamically import LiveChart to prevent SSR canvas issues
const LiveChart = dynamic(
  () => import("@/chart-page/client/LiveChart").then((m) => ({ default: m.LiveChart })),
  { ssr: false }
);

export default function Page() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Redirect to signin if unauthenticated
  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      router.replace("/auth/signin");
    }
  }, [session, status, router]);

  if (status === "loading" || !session?.user) {
    return null;
  }

  return (
    <div className="flex h-full w-full bg-[#0f0f0f]">
      <LiveChart />
    </div>
  );
}
