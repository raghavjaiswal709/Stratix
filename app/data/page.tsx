"use client";

import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const DataPage = dynamic(
  () => import("@/components/data/DataPage").then((m) => ({ default: m.DataPage })),
  { ssr: false }
);

export default function Page() {
  const { data: session, status } = useSession();
  const router = useRouter();

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
    <div className="flex h-full w-full relative">
      <DataPage />
    </div>
  );
}
