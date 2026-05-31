"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronRight, Shield, Users, TrendingUp, BookOpen } from "lucide-react";

interface UserEntry {
  _id: string;
  name: string;
  email: string;
  image?: string;
  role: string;
  emailVerified?: string;
  userData: Record<string, unknown> | null;
  tradeEntries: unknown[];
  mt5Configs: unknown[];
}

interface AdminData {
  users: UserEntry[];
  accounts: unknown[];
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<Record<string, string>>({});

  // Guard — redirect non-admins
  useEffect(() => {
    if (status === "loading") return;
    if (!session || session.user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [session, status, router]);

  useEffect(() => {
    if (session?.user.role !== "admin") return;
    (async () => {
      try {
        const res = await fetch("/api/admin/users");
        if (!res.ok) {
          router.replace("/dashboard");
          return;
        }
        setData(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, [session, router]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const tab = (id: string) => activeTab[id] ?? "overview";
  const setTab = (id: string, t: string) =>
    setActiveTab((p) => ({ ...p, [id]: t }));

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const totalHabits = data.users.reduce((s, u) => {
    const habits = (u.userData as Record<string, { habits?: unknown[] }> | null)
      ?.habitData?.habits ?? [];
    return s + habits.length;
  }, 0);

  const totalTrades = data.users.reduce((s, u) => s + u.tradeEntries.length, 0);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] border border-white/[0.10]">
          <Shield className="h-4.5 w-4.5 text-white/60" />
        </div>
        <div>
          <h1 className="text-[18px] font-bold">Admin Panel</h1>
          <p className="text-[12px] text-muted-foreground">Stratix — full data view</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total users", value: data.users.length, icon: Users },
          { label: "Admins", value: data.users.filter((u) => u.role === "admin").length, icon: Shield },
          { label: "Trade entries", value: totalTrades, icon: TrendingUp },
          { label: "Habit definitions", value: totalHabits, icon: BookOpen },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              <span className="text-[11px]">{label}</span>
            </div>
            <p className="text-xl font-bold">{value}</p>
          </Card>
        ))}
      </div>

      {/* User list */}
      <div className="space-y-2">
        {data.users.map((user) => {
          const open = expanded.has(user._id);
          const ud = user.userData as Record<string, unknown> | null;
          const habits = (ud?.habitData as { habits?: unknown[] } | undefined)?.habits ?? [];
          const todos = (ud?.todoData as { todos?: unknown[] } | undefined)?.todos ?? [];
          const diaryEntries = (ud?.diaryData as { entries?: unknown[] } | undefined)?.entries ?? [];
          const notes = (ud?.notesData as { notes?: unknown[] } | undefined)?.notes ?? [];

          return (
            <div
              key={user._id}
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              {/* Row header — always visible */}
              <button
                onClick={() => toggle(user._id)}
                className="w-full flex items-center gap-3 p-3.5 hover:bg-muted/40 transition-colors text-left"
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={user.image ?? ""} alt={user.name} />
                  <AvatarFallback className="text-[11px] bg-white/[0.08] text-white/60">
                    {user.name?.charAt(0)?.toUpperCase() ?? "?"}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold truncate">{user.name}</span>
                    {user.role === "admin" && (
                      <Badge className="text-[9px] px-1.5 py-0 bg-white/[0.08] text-white/55 border-white/[0.12]">
                        ADMIN
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                </div>

                <div className="hidden sm:flex items-center gap-4 text-[11px] text-muted-foreground mr-2 shrink-0">
                  <span>{habits.length} habits</span>
                  <span>{user.tradeEntries.length} trades</span>
                  <span>{todos.length} todos</span>
                </div>

                {open
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              </button>

              {/* Expanded content */}
              {open && (
                <div className="border-t border-border/50 p-4 space-y-4">
                  {/* Sub-tabs */}
                  <div className="flex gap-1 text-[12px]">
                    {[
                      { id: "overview", label: "Overview" },
                      { id: "habits", label: `Habits (${habits.length})` },
                      { id: "todos", label: `Todos (${todos.length})` },
                      { id: "trades", label: `Trades (${user.tradeEntries.length})` },
                      { id: "diary", label: `Diary (${diaryEntries.length})` },
                      { id: "notes", label: `Notes (${notes.length})` },
                    ].map(({ id, label }) => (
                      <button
                        key={id}
                        onClick={() => setTab(user._id, id)}
                        className={`px-3 py-1 rounded-lg transition-colors ${
                          tab(user._id) === id
                            ? "bg-white/[0.08] text-white border border-white/[0.10]"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Overview tab */}
                  {tab(user._id) === "overview" && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[12px]">
                      {[
                        { label: "User ID", value: user._id },
                        { label: "Email", value: user.email },
                        { label: "Role", value: user.role },
                        { label: "Email verified", value: user.emailVerified ? format(new Date(user.emailVerified), "MMM d, yyyy") : "No" },
                        { label: "Habits", value: String(habits.length) },
                        { label: "Todos", value: String(todos.length) },
                        { label: "Trade entries", value: String(user.tradeEntries.length) },
                        { label: "Diary entries", value: String(diaryEntries.length) },
                        { label: "Notes", value: String(notes.length) },
                        { label: "MT5 configs", value: String(user.mt5Configs.length) },
                        { label: "Theme", value: String((ud as Record<string, unknown> | null)?.theme ?? "—") },
                      ].map(({ label, value }) => (
                        <div key={label} className="rounded-lg bg-muted/40 p-2.5">
                          <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                          <p className="font-medium truncate">{value}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Habits tab */}
                  {tab(user._id) === "habits" && (
                    <DataList
                      items={habits}
                      empty="No habits"
                      renderItem={(h: unknown) => {
                        const habit = h as Record<string, unknown>;
                        return (
                          <div key={String(habit.id)} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                            <span className="text-[12px] font-medium">{String(habit.name ?? "—")}</span>
                            <span className="text-[11px] text-muted-foreground">{String(habit.category ?? "—")}</span>
                          </div>
                        );
                      }}
                    />
                  )}

                  {/* Todos tab */}
                  {tab(user._id) === "todos" && (
                    <DataList
                      items={todos}
                      empty="No todos"
                      renderItem={(t: unknown) => {
                        const todo = t as Record<string, unknown>;
                        return (
                          <div key={String(todo.id)} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                            <span className={`text-[12px] ${todo.completed ? "line-through text-muted-foreground" : "font-medium"}`}>
                              {String(todo.text ?? "—")}
                            </span>
                            <span className="text-[11px] text-muted-foreground">{todo.completed ? "done" : "open"}</span>
                          </div>
                        );
                      }}
                    />
                  )}

                  {/* Trades tab */}
                  {tab(user._id) === "trades" && (
                    <DataList
                      items={user.tradeEntries}
                      empty="No trade entries"
                      renderItem={(t: unknown) => {
                        const trade = t as Record<string, unknown>;
                        const profit = Number(trade.profit ?? 0);
                        return (
                          <div key={String(trade._id)} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                            <div>
                              <span className="text-[12px] font-medium">{String(trade.symbol ?? "—")}</span>
                              <span className={`ml-2 text-[11px] ${trade.direction === "buy" ? "text-green-500" : "text-red-500"}`}>
                                {String(trade.direction ?? "").toUpperCase()}
                              </span>
                            </div>
                            <span className={`text-[12px] font-medium ${profit >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {profit >= 0 ? "+" : ""}{profit.toFixed(2)}
                            </span>
                          </div>
                        );
                      }}
                    />
                  )}

                  {/* Diary tab */}
                  {tab(user._id) === "diary" && (
                    <DataList
                      items={diaryEntries}
                      empty="No diary entries"
                      renderItem={(e: unknown) => {
                        const entry = e as Record<string, unknown>;
                        return (
                          <div key={String(entry.id)} className="py-1.5 border-b border-border/30 last:border-0">
                            <div className="flex items-center justify-between">
                              <span className="text-[12px] font-medium">{String(entry.date ?? "—")}</span>
                              <span className="text-[11px] text-muted-foreground">mood: {String(entry.mood ?? "—")}</span>
                            </div>
                            {!!entry.content && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                {String(entry.content).replace(/<[^>]*>/g, "")}
                              </p>
                            )}
                          </div>
                        );
                      }}
                    />
                  )}

                  {/* Notes tab */}
                  {tab(user._id) === "notes" && (
                    <DataList
                      items={notes}
                      empty="No notes"
                      renderItem={(n: unknown) => {
                        const note = n as Record<string, unknown>;
                        return (
                          <div key={String(note.id)} className="py-1.5 border-b border-border/30 last:border-0">
                            <p className="text-[12px] font-medium">{String(note.title ?? "Untitled")}</p>
                            {!!note.content && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                {String(note.content).replace(/<[^>]*>/g, "")}
                              </p>
                            )}
                          </div>
                        );
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── tiny helper ─────────────────────────────────────────────────────────────
function DataList({
  items,
  empty,
  renderItem,
}: {
  items: unknown[];
  empty: string;
  renderItem: (item: unknown) => React.ReactNode;
}) {
  if (!items.length) {
    return <p className="text-[12px] text-muted-foreground py-2">{empty}</p>;
  }
  return <div>{items.map(renderItem)}</div>;
}
