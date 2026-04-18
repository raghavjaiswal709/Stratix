"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Navbar } from "@/components/shared/navbar";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isAuthPage = pathname.startsWith("/auth");

  // Client-side safety: redirect authenticated users away from auth pages
  // (server middleware handles the unauthenticated → signIn redirect)
  useEffect(() => {
    if (status === "authenticated" && isAuthPage) {
      router.replace("/productivity");
    }
  }, [status, isAuthPage, router]);

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <div className="h-5 w-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        <p className="text-[12px] text-white/25 tracking-wide">Loading…</p>
      </div>
    );
  }

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      <main className="relative z-10 flex-1">{children}</main>
    </>
  );
}
