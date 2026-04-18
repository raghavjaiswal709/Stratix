"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useAppContext } from "@/lib/context";
import { BarChart2, Activity, TrendingUp, Sun, Moon, LogOut, Menu, X, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/productivity", label: "Productivity", icon: Activity },
  { href: "/trading-journal", label: "Trading", icon: TrendingUp },
];

export function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { theme, setTheme } = useAppContext();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="glass-nav sticky top-0 z-50">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">

        {/* Left: Brand + links */}
        <div className="flex items-center gap-5">
          <Link href="/productivity" className="flex items-center gap-2 shrink-0">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-[8px]"
              style={{
                background: "rgba(99,102,241,0.18)",
                border: "1px solid rgba(99,102,241,0.3)",
              }}
            >
              <BarChart2 style={{ width: 14, height: 14 }} className="text-indigo-400" />
            </div>
            <span className="text-[15px] font-semibold tracking-tight">Stratix</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-0.5">
            {navLinks.map((link) => {
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150",
                    isActive
                      ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20"
                      : "text-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.05]"
                  )}
                >
                  <link.icon className="h-3.5 w-3.5 shrink-0" />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1">

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-150"
            aria-label="Toggle theme"
          >
            {theme === "dark"
              ? <Sun style={{ width: 15, height: 15 }} />
              : <Moon style={{ width: 15, height: 15 }} />}
          </button>

          {/* User / avatar dropdown */}
          {session?.user && (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-lg hover:bg-muted transition-all duration-150">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={session.user.image ?? ""} alt={session.user.name ?? "User"} />
                  <AvatarFallback className="text-[10px] bg-indigo-500/20 text-indigo-300">
                    {session.user.name?.charAt(0)?.toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown style={{ width: 11, height: 11 }} className="text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[210px]">
                <div className="px-3 py-2.5 border-b border-border/40 space-y-0.5">
                  <p className="text-[13px] font-medium truncate">{session.user.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{session.user.email}</p>
                </div>
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                  className="mt-1 text-red-400 focus:text-red-300 focus:bg-red-500/10"
                >
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-150"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen
              ? <X style={{ width: 15, height: 15 }} />
              : <Menu style={{ width: 15, height: 15 }} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border/40 bg-background/90 backdrop-blur-xl px-3 py-2 space-y-0.5">
          {navLinks.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                    : "text-foreground/50 hover:text-foreground/80 hover:bg-muted"
                )}
              >
                <link.icon className="h-4 w-4 shrink-0" />
                {link.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}

