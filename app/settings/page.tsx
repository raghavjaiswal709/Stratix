"use client";

import { useAppContext } from "@/lib/context";
import { ACCENT_PRESETS } from "@/types";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  BookOpen,
  FileText,
  ChartCandlestick,
  Newspaper,
  ListTodo,
  Activity,
  PenLine,
  StickyNote,
  Palette,
  Eye,
  Sliders,
  Settings as SettingsIcon,
  Check,
  Moon,
  Sun,
  Shield,
  ChevronDown,
  ChevronRight,
  Radio,
  BrainCircuit,
  Database,
} from "lucide-react";

const sidebarOptionMeta = [
  { key: "dashboard",    label: "Dashboard",     icon: LayoutDashboard, category: "Trading" },
  { key: "trades",       label: "Trades",        icon: ArrowLeftRight,  category: "Trading" },
  { key: "journal",      label: "Journal",       icon: BookOpen,        category: "Trading" },
  { key: "tradeNotes",   label: "Trade Notes",   icon: FileText,        category: "Trading" },
  { key: "backtesting",  label: "Backtesting",   icon: ChartCandlestick,category: "Trading" },
  { key: "data",         label: "Data",          icon: Database,        category: "Trading" },
  { key: "newsAnalysis", label: "News Analysis", icon: Newspaper,       category: "Trading" },
  { key: "liveData",     label: "Live Data",     icon: Radio,           category: "Trading", adminOnly: true },
  { key: "chart",        label: "Chart",         icon: ChartCandlestick,category: "Trading", adminOnly: true },
  { key: "aiReport",     label: "AI Report",     icon: BrainCircuit,    category: "Trading", adminOnly: true },
  { key: "todo",         label: "To-Do",         icon: ListTodo,        category: "Life-OS" },
  { key: "habits",       label: "Habits",        icon: Activity,        category: "Life-OS" },
  { key: "diary",        label: "Diary",         icon: PenLine,         category: "Life-OS" },
  { key: "notes",        label: "Notes",         icon: StickyNote,      category: "Life-OS" },
];

export default function SettingsPage() {
  const { data: session } = useSession();
  const { theme, setTheme, preferences, setPreferences } = useAppContext();
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Admin states
  const isAdmin = session?.user?.role === "admin";
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Fetch users list for Admin view
  useEffect(() => {
    if (isAdmin) {
      setLoadingUsers(true);
      fetch("/api/admin/users")
        .then((res) => res.json())
        .then((data) => {
          setUsersList(data.users || []);
        })
        .catch(console.error)
        .finally(() => setLoadingUsers(false));
    }
  }, [isAdmin]);

  const updatePreference = (key: string, value: any) => {
    const updated = {
      ...preferences,
      [key]: value,
    };
    setPreferences(updated);
    triggerSaveAlert("Settings saved");
  };

  const updateSidebarPreference = (itemKey: string, show: boolean) => {
    const currentSidebarItems = preferences.sidebarItems || {
      dashboard: true,
      trades: true,
      journal: true,
      tradeNotes: true,
      backtesting: true,
      data: true,
      newsAnalysis: true,
      liveData: true,
      chart: true,
      aiReport: true,
      todo: true,
      habits: true,
      diary: true,
      notes: true,
    };

    const updated = {
      ...preferences,
      sidebarItems: {
        ...currentSidebarItems,
        [itemKey]: show,
      },
    };
    setPreferences(updated);
    triggerSaveAlert("Settings saved");
  };

  const triggerSaveAlert = (message: string) => {
    setSaveStatus(message);
    setTimeout(() => setSaveStatus(null), 2000);
  };

  // Admin Actions to update other user preferences
  const saveUserPrefToApi = async (targetUserId: string, updatedPrefs: any, updatedTheme: string, updatedRole?: string) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: targetUserId,
          preferences: updatedPrefs,
          theme: updatedTheme,
          role: updatedRole,
        }),
      });
      if (res.ok) {
        triggerSaveAlert("User settings updated");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const adminUpdateUserRole = async (targetUserId: string, newRole: string) => {
    const targetUser = usersList.find((u) => u._id === targetUserId);
    if (!targetUser) return;

    setUsersList((prev) =>
      prev.map((u) => {
        if (u._id === targetUserId) {
          return {
            ...u,
            role: newRole,
          };
        }
        return u;
      })
    );

    await saveUserPrefToApi(
      targetUserId,
      targetUser.userData?.preferences || {},
      targetUser.userData?.theme || "dark",
      newRole
    );
  };

  const adminUpdateUserPreference = async (targetUserId: string, key: string, value: any) => {
    const targetUser = usersList.find((u) => u._id === targetUserId);
    if (!targetUser) return;

    const currentPrefs = targetUser.userData?.preferences || {};
    const updatedPrefs = {
      ...currentPrefs,
      [key]: value,
    };

    setUsersList((prev) =>
      prev.map((u) => {
        if (u._id === targetUserId) {
          return {
            ...u,
            userData: {
              ...u.userData,
              preferences: updatedPrefs,
            },
          };
        }
        return u;
      })
    );

    await saveUserPrefToApi(
      targetUserId,
      updatedPrefs,
      targetUser.userData?.theme || "dark",
      targetUser.role
    );
  };

  const adminUpdateUserTheme = async (targetUserId: string, newTheme: "light" | "dark") => {
    const targetUser = usersList.find((u) => u._id === targetUserId);
    if (!targetUser) return;

    setUsersList((prev) =>
      prev.map((u) => {
        if (u._id === targetUserId) {
          return {
            ...u,
            userData: {
              ...u.userData,
              theme: newTheme,
            },
          };
        }
        return u;
      })
    );

    await saveUserPrefToApi(
      targetUserId,
      targetUser.userData?.preferences || {},
      newTheme,
      targetUser.role
    );
  };

  const adminUpdateUserSidebar = async (targetUserId: string, itemKey: string, show: boolean) => {
    const targetUser = usersList.find((u) => u._id === targetUserId);
    if (!targetUser) return;

    const currentSidebar = targetUser.userData?.preferences?.sidebarItems || {
      dashboard: true,
      trades: true,
      journal: true,
      tradeNotes: true,
      backtesting: true,
      data: true,
      newsAnalysis: true,
      liveData: true,
      chart: true,
      aiReport: true,
      todo: true,
      habits: true,
      diary: true,
      notes: true,
    };

    const updatedPrefs = {
      ...(targetUser.userData?.preferences || {}),
      sidebarItems: {
        ...currentSidebar,
        [itemKey]: show,
      },
    };

    setUsersList((prev) =>
      prev.map((u) => {
        if (u._id === targetUserId) {
          return {
            ...u,
            userData: {
              ...u.userData,
              preferences: updatedPrefs,
            },
          };
        }
        return u;
      })
    );

    await saveUserPrefToApi(
      targetUserId,
      updatedPrefs,
      targetUser.userData?.theme || "dark",
      targetUser.role
    );
  };

  const currentSidebarItems = preferences.sidebarItems || {
    dashboard: true,
    trades: true,
    journal: true,
    tradeNotes: true,
    backtesting: true,
    data: true,
    newsAnalysis: true,
    liveData: true,
    chart: true,
    aiReport: true,
    todo: true,
    habits: true,
    diary: true,
    notes: true,
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8 animate-fade-in pb-16">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-accent" />
            <h1 className="text-2xl font-bold tracking-tight text-white/90">Settings</h1>
          </div>
          <p className="text-xs text-white/40">
            Personalize your dashboard, sidebar views, theme, and application choices.
          </p>
        </div>

        {/* Save indicator toast */}
        {saveStatus && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium animate-scale-in">
            <Check className="h-3.5 w-3.5" />
            {saveStatus}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Visual preferences */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Section: Theme */}
          <div className="glass-card p-6 rounded-xl border border-white/[0.05] bg-white/[0.01] space-y-4">
            <div className="flex items-center gap-2">
              <Moon className="h-4 w-4 text-accent" />
              <h2 className="text-[14px] font-semibold text-white/80">Application Theme</h2>
            </div>
            <p className="text-xs text-white/40 leading-relaxed">
              Switch between Dark Mode and Light Mode. Choose Dark Mode for a premium terminal appearance.
            </p>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setTheme("dark")}
                className={`flex items-center justify-center gap-2 py-3 rounded-lg border text-xs font-medium transition-all ${
                  theme === "dark"
                    ? "bg-white/[0.08] text-white border-white/20 shadow-md"
                    : "bg-transparent text-white/40 border-white/[0.05] hover:text-white/60 hover:bg-white/[0.02]"
                }`}
              >
                <Moon className="h-3.5 w-3.5" />
                Dark Theme
              </button>
              <button
                onClick={() => setTheme("light")}
                className={`flex items-center justify-center gap-2 py-3 rounded-lg border text-xs font-medium transition-all ${
                  theme === "light"
                    ? "bg-white/[0.08] text-white border-white/20 shadow-md"
                    : "bg-transparent text-white/40 border-white/[0.05] hover:text-white/60 hover:bg-white/[0.02]"
                }`}
              >
                <Sun className="h-3.5 w-3.5" />
                Light Theme
              </button>
            </div>
          </div>

          {/* Section: Accent Color */}
          <div className="glass-card p-6 rounded-xl border border-white/[0.05] bg-white/[0.01] space-y-4">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-accent" />
              <h2 className="text-[14px] font-semibold text-white/80">Accent Color Preset</h2>
            </div>
            <p className="text-xs text-white/40 leading-relaxed">
              Select a primary color accent to apply across borders, active highlights, and buttons.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
              {ACCENT_PRESETS.map((preset) => {
                const isActive = (preferences.accentColor || "#6366f1") === preset.value;
                return (
                  <button
                    key={preset.value}
                    onClick={() => updatePreference("accentColor", preset.value)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-xs transition-all ${
                      isActive
                        ? "bg-white/[0.08] border-white/20 text-white font-medium shadow-md"
                        : "bg-transparent border-white/[0.04] text-white/45 hover:text-white/70 hover:bg-white/[0.02]"
                    }`}
                  >
                    <span
                      className="h-3 w-3 rounded-full shrink-0 border border-black/30"
                      style={{ backgroundColor: preset.value }}
                    />
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section: Extra Personalization */}
          <div className="glass-card p-6 rounded-xl border border-white/[0.05] bg-white/[0.01] space-y-5">
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-accent" />
              <h2 className="text-[14px] font-semibold text-white/80">Dashboard & Loading Options</h2>
            </div>
            
            {/* Quote Toggle */}
            <div className="flex items-start justify-between gap-4 pt-1">
              <div className="space-y-0.5">
                <label className="text-[13px] font-medium text-white/80">
                  Show Inspirational Trading Quotes
                </label>
                <p className="text-xs text-white/35 leading-relaxed">
                  Display high-impact wisdom cards before entering the dashboard. Disable to jump straight in.
                </p>
              </div>
              <button
                onClick={() => updatePreference("showQuotes", preferences.showQuotes !== false ? false : true)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  preferences.showQuotes !== false ? "bg-accent" : "bg-white/[0.08]"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    preferences.showQuotes !== false ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="h-px bg-white/[0.04]" />

            {/* Default Landing Page */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <label className="text-[13px] font-medium text-white/80">
                  Default Landing Route
                </label>
                <p className="text-xs text-white/35 leading-relaxed">
                  Choose the page you want to open automatically when loading the app.
                </p>
              </div>
              <select
                value={preferences.defaultPage || "/dashboard"}
                onChange={(e) => updatePreference("defaultPage", e.target.value)}
                className="h-9 px-2 rounded-lg bg-black border border-white/[0.08] text-xs font-medium text-white/70 focus:outline-none focus:border-white/20 min-w-[160px]"
              >
                <option value="/dashboard">Dashboard</option>
                <option value="/trades">Trades</option>
                <option value="/journal">Journal</option>
                <option value="/todo">To-Do</option>
                <option value="/habits">Habits</option>
                <option value="/diary">Diary</option>
                <option value="/notes">Notes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Right Column: Sidebar link visibility choices */}
        <div className="md:col-span-1">
          <div className="glass-card p-6 rounded-xl border border-white/[0.05] bg-white/[0.01] space-y-4 h-full">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-accent" />
              <h2 className="text-[14px] font-semibold text-white/80">Customize Sidebar Links</h2>
            </div>
            <p className="text-xs text-white/40 leading-relaxed">
              Show or hide specific sidebar buttons to tailor the sidebar for your usage only.
            </p>

            <div className="space-y-4 pt-3">
              {/* Group Trading */}
              <div>
                <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mb-2 px-1">
                  Trading Modules
                </p>
                <div className="space-y-2.5">
                  {sidebarOptionMeta
                    .filter((opt) => opt.category === "Trading" && (!opt.adminOnly || isAdmin))
                    .map((opt) => {
                      const isChecked = currentSidebarItems[opt.key as keyof typeof currentSidebarItems] !== false;
                      return (
                        <div key={opt.key} className="flex items-center justify-between gap-3 px-1 py-0.5">
                          <div className="flex items-center gap-2 text-white/60">
                            <opt.icon className="h-3.5 w-3.5 shrink-0 text-white/30" />
                            <span className="text-xs font-medium">{opt.label}</span>
                          </div>
                          <button
                            onClick={() => updateSidebarPreference(opt.key, !isChecked)}
                            className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              isChecked ? "bg-accent" : "bg-white/[0.08]"
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                isChecked ? "translate-x-3" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="h-px bg-white/[0.04] my-2" />

              {/* Group Life-OS */}
              <div>
                <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mb-2 px-1">
                  Life-OS Modules
                </p>
                <div className="space-y-2.5">
                  {sidebarOptionMeta
                    .filter((opt) => opt.category === "Life-OS")
                    .map((opt) => {
                      const isChecked = currentSidebarItems[opt.key as keyof typeof currentSidebarItems] !== false;
                      return (
                        <div key={opt.key} className="flex items-center justify-between gap-3 px-1 py-0.5">
                          <div className="flex items-center gap-2 text-white/60">
                            <opt.icon className="h-3.5 w-3.5 shrink-0 text-white/30" />
                            <span className="text-xs font-medium">{opt.label}</span>
                          </div>
                          <button
                            onClick={() => updateSidebarPreference(opt.key, !isChecked)}
                            className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              isChecked ? "bg-accent" : "bg-white/[0.08]"
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                isChecked ? "translate-x-3" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Section: Accordion for user settings */}
      {isAdmin && (
        <div className="glass-card p-6 rounded-xl border border-white/[0.05] bg-white/[0.01] space-y-4 mt-8">
          <div className="flex items-center gap-2 pb-2 border-b border-white/[0.04]">
            <Shield className="h-4.5 w-4.5 text-accent" />
            <h2 className="text-[15px] font-semibold text-white/80">Admin Control Panel — User Preferences</h2>
          </div>
          <p className="text-xs text-white/40 leading-relaxed">
            Manage the configuration and sidebar visibility options for all Stratix users. Changes are saved automatically in real-time.
          </p>

          {loadingUsers ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {usersList.map((user) => {
                const isExpanded = expandedUserId === user._id;
                const uPref = user.userData?.preferences || {};
                const uTheme = user.userData?.theme || "dark";
                const uSidebar = uPref.sidebarItems || {
                  dashboard: true,
                  trades: true,
                  journal: true,
                  tradeNotes: true,
                  backtesting: true,
                  data: true,
                  newsAnalysis: true,
                  liveData: true,
                  chart: true,
                  aiReport: true,
                  todo: true,
                  habits: true,
                  diary: true,
                  notes: true,
                };

                return (
                  <div
                    key={user._id}
                    className="rounded-lg border border-white/[0.04] bg-white/[0.01] overflow-hidden"
                  >
                    {/* Accordion Trigger */}
                    <button
                      onClick={() => setExpandedUserId(isExpanded ? null : user._id)}
                      className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.02] transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-white/[0.06] border border-white/[0.10] flex items-center justify-center text-xs font-semibold text-white/70 overflow-hidden shrink-0">
                          {user.image ? (
                            <img src={user.image} alt={user.name} className="h-full w-full object-cover" />
                          ) : (
                            user.name?.charAt(0)?.toUpperCase() ?? "?"
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[12.5px] font-medium text-white/85">{user.name}</span>
                            {user.role === "admin" && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-white/[0.06] border border-white/[0.08] text-white/45 tracking-wider">
                                ADMIN
                              </span>
                            )}
                          </div>
                          <p className="text-[10.5px] text-white/35">{user.email}</p>
                        </div>
                      </div>

                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-white/40" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-white/40" />
                      )}
                    </button>

                    {/* Accordion Content */}
                    {isExpanded && (
                      <div className="border-t border-white/[0.04] p-4 bg-black/20 space-y-5 animate-scale-in">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          
                          {/* Sub-col 1: Theme & Basic */}
                          <div className="space-y-4">
                            <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest px-1">
                              General Settings
                            </p>
                            
                            {/* Theme */}
                            <div className="space-y-1.5 px-1">
                              <label className="text-[11px] font-medium text-white/60">Application Theme</label>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => adminUpdateUserTheme(user._id, "dark")}
                                  className={`py-1.5 rounded-md border text-[10.5px] transition-all ${
                                    uTheme === "dark"
                                      ? "bg-white/[0.08] text-white border-white/20"
                                      : "bg-transparent text-white/30 border-white/[0.03] hover:text-white/50"
                                  }`}
                                >
                                  Dark
                                </button>
                                <button
                                  onClick={() => adminUpdateUserTheme(user._id, "light")}
                                  className={`py-1.5 rounded-md border text-[10.5px] transition-all ${
                                    uTheme === "light"
                                      ? "bg-white/[0.08] text-white border-white/20"
                                      : "bg-transparent text-white/30 border-white/[0.03] hover:text-white/50"
                                  }`}
                                >
                                  Light
                                </button>
                              </div>
                            </div>

                            {/* Quotes */}
                            <div className="flex items-center justify-between gap-4 px-1 py-1.5">
                              <div className="space-y-0.5">
                                <label className="text-[11px] font-medium text-white/60">
                                  Show Trading Quotes
                                </label>
                                <p className="text-[9.5px] text-white/30">Display quote screen before dashboard load</p>
                              </div>
                              <button
                                onClick={() => adminUpdateUserPreference(user._id, "showQuotes", uPref.showQuotes !== false ? false : true)}
                                className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                  uPref.showQuotes !== false ? "bg-accent" : "bg-white/[0.08]"
                                }`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                    uPref.showQuotes !== false ? "translate-x-3" : "translate-x-0"
                                  }`}
                                />
                              </button>
                            </div>

                            {/* Default Page */}
                            <div className="space-y-1.5 px-1">
                              <label className="text-[11px] font-medium text-white/60">Default Route</label>
                              <select
                                value={uPref.defaultPage || "/dashboard"}
                                onChange={(e) => adminUpdateUserPreference(user._id, "defaultPage", e.target.value)}
                                className="w-full h-8 px-2 rounded-md bg-black border border-white/[0.08] text-[11px] text-white/60 focus:outline-none focus:border-white/20"
                              >
                                <option value="/dashboard">Dashboard</option>
                                <option value="/trades">Trades</option>
                                <option value="/journal">Journal</option>
                                <option value="/todo">To-Do</option>
                                <option value="/habits">Habits</option>
                                <option value="/diary">Diary</option>
                                <option value="/notes">Notes</option>
                              </select>
                            </div>

                            {/* User Role */}
                            <div className="space-y-1.5 px-1">
                              <label className="text-[11px] font-medium text-white/60">User Role</label>
                              <select
                                value={user.role || "user"}
                                onChange={(e) => adminUpdateUserRole(user._id, e.target.value)}
                                className="w-full h-8 px-2 rounded-md bg-black border border-white/[0.08] text-[11px] text-white/60 focus:outline-none focus:border-white/20"
                              >
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                              </select>
                            </div>
                          </div>

                          {/* Sub-col 2: Accent Color */}
                          <div className="space-y-3">
                            <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest px-1">
                              Accent Preset Color
                            </p>
                            <div className="grid grid-cols-2 gap-1.5 pt-1">
                              {ACCENT_PRESETS.map((preset) => {
                                const isActive = (uPref.accentColor || "#6366f1") === preset.value;
                                return (
                                  <button
                                    key={preset.value}
                                    onClick={() => adminUpdateUserPreference(user._id, "accentColor", preset.value)}
                                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-[10.5px] transition-all ${
                                      isActive
                                        ? "bg-white/[0.08] border-white/20 text-white font-medium shadow-sm"
                                        : "bg-transparent border-white/[0.03] text-white/35 hover:text-white/60 hover:bg-white/[0.01]"
                                    }`}
                                  >
                                    <span
                                      className="h-2 w-2 rounded-full shrink-0 border border-black/30"
                                      style={{ backgroundColor: preset.value }}
                                    />
                                    {preset.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Sub-col 3: Sidebar Link Choices */}
                          <div className="space-y-3">
                            <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest px-1">
                              Sidebar Links Customization
                            </p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-1">
                              {sidebarOptionMeta
                                .filter((opt) => !opt.adminOnly || user.role === "admin")
                                .map((opt) => {
                                  const isChecked = uSidebar[opt.key as keyof typeof uSidebar] !== false;
                                  return (
                                    <div key={opt.key} className="flex items-center justify-between gap-2 py-0.5">
                                      <span className="text-[11px] text-white/50">{opt.label}</span>
                                      <button
                                        onClick={() => adminUpdateUserSidebar(user._id, opt.key, !isChecked)}
                                        className={`relative inline-flex h-3.5 w-6 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                          isChecked ? "bg-accent" : "bg-white/[0.08]"
                                        }`}
                                      >
                                        <span
                                          className={`pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                            isChecked ? "translate-x-2.5" : "translate-x-0"
                                          }`}
                                        />
                                      </button>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
