import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/providers/auth-provider";
import { AppProvider } from "@/lib/context";
import { ClientLayout } from "./client-layout";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stratix — Life-Os & Tradebook",
  description: "Your all-in-one productivity tracker and trading journal platform.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Ambient glow orbs — provide the liquid-glass depth effect */}
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
          <div className="glow-orb-1 absolute -top-[25%] -left-[10%] h-[700px] w-[700px] rounded-full bg-indigo-500/[0.08] blur-[140px]" />
          <div className="glow-orb-2 absolute -bottom-[20%] right-[0%] h-[500px] w-[500px] rounded-full bg-violet-500/[0.055] blur-[110px]" />
        </div>
        <AuthProvider>
          <AppProvider>
            <TooltipProvider>
              <ClientLayout>{children}</ClientLayout>
            </TooltipProvider>
          </AppProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
