import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Anton } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/providers/auth-provider";
import { AppProvider } from "@/lib/context";
import { ClientLayout } from "./client-layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { UserDataModel } from "@/lib/models/UserData";
import type { InitialMeta } from "@/lib/context";

// Inter is a variable font — omitting `weight` loads ONE variable file
// covering every weight instead of seven separate static files.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

// Condensed poster/display face used exclusively for the Content Creator's
// "Bold & Trending" headline (canvas-rendered) — matches the punchy,
// stroke-outlined look of the reference Instagram-poster style. Anton only
// ships one weight (400), which is by design already ultra-bold/condensed.
const anton = Anton({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stratix — Life-Os & Tradebook",
  description: "Your all-in-one productivity tracker and trading journal platform.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.json",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  let initialMeta: InitialMeta | null = null;
  if (session?.user?.id) {
    try {
      await dbConnect();
      const doc = await UserDataModel.findOne(
        { userId: session.user.id },
        "preferences scoreWeights theme tradingProfiles activeProfileId"
      ).lean();
      if (doc) {
        initialMeta = {
          preferences: (doc.preferences as InitialMeta["preferences"]) ?? null,
          scoreWeights: (doc.scoreWeights as InitialMeta["scoreWeights"]) ?? null,
          theme: (doc.theme as "light" | "dark") ?? null,
          tradingProfiles: (doc.tradingProfiles as InitialMeta["tradingProfiles"]) ?? null,
          activeProfileId: (doc.activeProfileId as string) ?? null,
        };
      }
    } catch {
      // Non-fatal — AppProvider will fetch on client as fallback
    }
  }

  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${anton.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider session={session}>
          <AppProvider initialMeta={initialMeta} initialUserId={session?.user?.id ?? null}>
            <TooltipProvider>
              <ClientLayout>{children}</ClientLayout>
            </TooltipProvider>
          </AppProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
