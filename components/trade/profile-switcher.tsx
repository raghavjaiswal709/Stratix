"use client";

import { useState, useRef, useEffect } from "react";
import { useAppContext } from "@/lib/context";
import type { TradingProfile } from "@/types";
import { ChevronDown, Plus, Edit2, Trash2, X, Check, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const COLOR_PRESETS = [
  // Neutrals
  "#ffffff", "#d1d5db", "#9ca3af", "#6b7280",
  // Greens / emerald
  "#10b981", "#34d399", "#22c55e", "#4ade80",
  // Lime
  "#84cc16", "#a3e635",
  // Yellow / amber
  "#eab308", "#facc15", "#f59e0b", "#fbbf24",
  // Orange
  "#f97316", "#fb923c",
  // Red
  "#ef4444", "#f87171",
  // Rose / pink
  "#f43f5e", "#ec4899",
];

interface ProfileFormData {
  name: string;
  broker: string;
  accountType: "live" | "demo" | "paper";
  currency: string;
  color: string;
  initialBalance: string;
  description: string;
}

const EMPTY_FORM: ProfileFormData = {
  name: "",
  broker: "",
  accountType: "live",
  currency: "USD",
  color: COLOR_PRESETS[0],
  initialBalance: "",
  description: "",
};

function ProfileForm({
  initial,
  onSave,
  onCancel,
  saveLabel,
}: {
  initial: ProfileFormData;
  onSave: (data: ProfileFormData) => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  const [form, setForm] = useState<ProfileFormData>(initial);
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Profile name is required"); return; }
    setError("");
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && (
        <p className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Name */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Profile Name *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Main Live Account"
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/25 focus:outline-none focus:border-white/20"
        />
      </div>

      {/* Broker */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Broker</label>
        <input
          type="text"
          value={form.broker}
          onChange={(e) => setForm((f) => ({ ...f, broker: e.target.value }))}
          placeholder="e.g. Exness, IC Markets"
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/25 focus:outline-none focus:border-white/20"
        />
      </div>

      {/* Account Type + Currency */}
      <div className="flex gap-2">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Account Type</label>
          <select
            value={form.accountType}
            onChange={(e) => setForm((f) => ({ ...f, accountType: e.target.value as "live" | "demo" | "paper" }))}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-white/20 appearance-none"
          >
            <option value="live" className="bg-[#111]">Live</option>
            <option value="demo" className="bg-[#111]">Demo</option>
            <option value="paper" className="bg-[#111]">Paper</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 w-28">
          <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Currency</label>
          <input
            type="text"
            value={form.currency}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
            placeholder="USD"
            maxLength={4}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/25 focus:outline-none focus:border-white/20"
          />
        </div>
      </div>

      {/* Color */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Color</label>
        <div className="flex items-center gap-2 flex-wrap">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm((f) => ({ ...f, color: c }))}
              className={cn(
                "h-6 w-6 rounded-full border-2 transition-all",
                form.color.toLowerCase() === c.toLowerCase() ? "border-white/70 scale-110" : "border-transparent hover:border-white/30"
              )}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}

          {/* Custom color picker — pick any color */}
          <label
            className={cn(
              "relative h-6 w-6 rounded-full border-2 cursor-pointer overflow-hidden flex items-center justify-center transition-all",
              !COLOR_PRESETS.some((c) => c.toLowerCase() === form.color.toLowerCase())
                ? "border-white/70 scale-110"
                : "border-white/20 hover:border-white/40"
            )}
            title="Custom color"
            style={{
              background: COLOR_PRESETS.some((c) => c.toLowerCase() === form.color.toLowerCase())
                ? "conic-gradient(#ef4444,#f59e0b,#22c55e,#10b981,#ec4899,#ef4444)"
                : form.color,
            }}
          >
            {COLOR_PRESETS.some((c) => c.toLowerCase() === form.color.toLowerCase()) && (
              <Plus className="h-3 w-3 text-white drop-shadow" />
            )}
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>

          {/* Hex value display / manual entry */}
          <input
            type="text"
            value={form.color}
            onChange={(e) => {
              const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
              setForm((f) => ({ ...f, color: v.slice(0, 7) }));
            }}
            className="w-[88px] bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1 text-[12px] font-mono text-white/80 placeholder-white/25 focus:outline-none focus:border-white/20"
            placeholder="#10b981"
            maxLength={7}
          />
        </div>
      </div>

      {/* Initial Balance */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Initial Balance (optional)</label>
        <input
          type="number"
          value={form.initialBalance}
          onChange={(e) => setForm((f) => ({ ...f, initialBalance: e.target.value }))}
          placeholder="e.g. 10000"
          min="0"
          step="0.01"
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/25 focus:outline-none focus:border-white/20"
        />
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Description (optional)</label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Short note about this account"
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white placeholder-white/25 focus:outline-none focus:border-white/20"
        />
      </div>

      {/* Buttons */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg border border-white/[0.08] text-[13px] text-white/50 hover:text-white/80 hover:bg-white/[0.05] transition-all"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 py-2 rounded-lg bg-white/[0.10] hover:bg-white/[0.16] border border-white/[0.12] text-[13px] font-semibold text-white transition-all"
        >
          {saveLabel}
        </button>
      </div>
    </form>
  );
}

// ── Manage Profiles Modal ─────────────────────────────────────────────────────
export function ManageModal({ onClose, initialEditId }: { onClose: () => void; initialEditId?: string }) {
  const { tradingProfiles, createProfile, updateProfile, deleteProfile } = useAppContext();
  const [view, setView] = useState<"list" | "create" | "edit">(initialEditId ? "edit" : "list");
  const [editingId, setEditingId] = useState<string | null>(initialEditId ?? null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const editingProfile = tradingProfiles.find((p) => p.id === editingId);

  function handleCreate(data: ProfileFormData) {
    createProfile({
      name: data.name.trim(),
      broker: data.broker.trim() || undefined,
      accountType: data.accountType,
      currency: data.currency.trim() || "USD",
      color: data.color,
      initialBalance: data.initialBalance ? parseFloat(data.initialBalance) : undefined,
      description: data.description.trim() || undefined,
    });
    setView("list");
  }

  function handleEdit(data: ProfileFormData) {
    if (!editingId) return;
    updateProfile(editingId, {
      name: data.name.trim(),
      broker: data.broker.trim() || undefined,
      accountType: data.accountType,
      currency: data.currency.trim() || "USD",
      color: data.color,
      initialBalance: data.initialBalance ? parseFloat(data.initialBalance) : undefined,
      description: data.description.trim() || undefined,
    });
    setView("list");
    setEditingId(null);
  }

  function startEdit(profile: TradingProfile) {
    setEditingId(profile.id);
    setView("edit");
  }

  function handleDelete(id: string) {
    deleteProfile(id);
    setDeleteConfirmId(null);
  }

  const accountTypeBadge = (type: string) => {
    if (type === "live") return <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">Live</span>;
    if (type === "demo") return <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/[0.06] text-white/50 border border-white/[0.08]">Demo</span>;
    return <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/[0.06] text-white/50 border border-white/[0.08]">Paper</span>;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-[460px] rounded-2xl bg-[#111] border border-white/[0.08] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            {view !== "list" && (
              <button
                onClick={() => { setView("list"); setEditingId(null); }}
                className="text-white/40 hover:text-white/80 transition mr-1"
              >
                ←
              </button>
            )}
            <h2 className="text-[15px] font-semibold text-white">
              {view === "list" ? "Trading Profiles" : view === "create" ? "New Profile" : "Edit Profile"}
            </h2>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {view === "list" && (
            <div className="flex flex-col gap-2">
              {tradingProfiles.length === 0 && (
                <p className="text-[13px] text-white/35 text-center py-6">No profiles yet. Create one to get started.</p>
              )}
              {tradingProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition"
                >
                  <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: profile.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-white/90 truncate">{profile.name}</span>
                      {accountTypeBadge(profile.accountType)}
                    </div>
                    {(profile.broker || profile.currency) && (
                      <p className="text-[11px] text-white/35 truncate">
                        {[profile.broker, profile.currency].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  {deleteConfirmId === profile.id ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] text-white/40">Delete?</span>
                      <button
                        onClick={() => handleDelete(profile.id)}
                        className="p-1.5 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="p-1.5 rounded-md hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(profile)}
                        className="p-1.5 rounded-md hover:bg-white/[0.08] text-white/35 hover:text-white/70 transition"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(profile.id)}
                        className="p-1.5 rounded-md hover:bg-red-500/10 text-white/35 hover:text-red-400 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              <button
                onClick={() => setView("create")}
                className="flex items-center justify-center gap-2 w-full py-2.5 mt-2 rounded-xl border border-dashed border-white/[0.10] text-[13px] text-white/40 hover:text-white/70 hover:border-white/20 hover:bg-white/[0.03] transition"
              >
                <Plus className="h-4 w-4" />
                New Profile
              </button>
            </div>
          )}

          {view === "create" && (
            <ProfileForm
              initial={EMPTY_FORM}
              onSave={handleCreate}
              onCancel={() => setView("list")}
              saveLabel="Create Profile"
            />
          )}

          {view === "edit" && editingProfile && (
            <ProfileForm
              initial={{
                name: editingProfile.name,
                broker: editingProfile.broker ?? "",
                accountType: editingProfile.accountType,
                currency: editingProfile.currency,
                color: editingProfile.color,
                initialBalance: editingProfile.initialBalance != null ? String(editingProfile.initialBalance) : "",
                description: editingProfile.description ?? "",
              }}
              onSave={handleEdit}
              onCancel={() => { setView("list"); setEditingId(null); }}
              saveLabel="Save Changes"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── ProfileSwitcher (full sidebar version) ────────────────────────────────────
export function ProfileSwitcher() {
  const { tradingProfiles, activeProfileId, setActiveProfileId, deleteProfile } = useAppContext();
  const [open, setOpen] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [manageEditId, setManageEditId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  function openEdit(id: string) {
    setManageEditId(id);
    setShowManage(true);
    setOpen(false);
  }

  const activeProfile = tradingProfiles.find((p) => p.id === activeProfileId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmDeleteId(null);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <>
      <div ref={dropdownRef} className="relative w-full">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.10] transition-all"
        >
          <div
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: activeProfile?.color ?? "#6b7280" }}
          />
          <span className="flex-1 text-left text-[12px] font-medium text-white/70 truncate">
            {activeProfile?.name ?? "All Profiles"}
          </span>
          <ChevronDown className={cn("h-3 w-3 text-white/30 transition-transform duration-150 shrink-0", open && "rotate-180")} />
        </button>

        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-white/[0.08] shadow-2xl overflow-hidden backdrop-blur-2xl bg-[#111]/95">
            {/* All Profiles option */}
            <button
              onClick={() => { setActiveProfileId(""); setOpen(false); }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] transition-all hover:bg-white/[0.05]",
                !activeProfileId ? "text-white font-medium" : "text-white/55 hover:text-white/80"
              )}
            >
              <div className="h-2.5 w-2.5 rounded-full bg-white/20 shrink-0" />
              All Profiles
              {!activeProfileId && <Check className="h-3 w-3 ml-auto text-white/60" />}
            </button>

            {tradingProfiles.length > 0 && (
              <div className="border-t border-white/[0.05]">
                {tradingProfiles.map((profile) => (
                  <div
                    key={profile.id}
                    className={cn(
                      "group/row flex items-center gap-2.5 px-3 py-2.5 text-[13px] transition-all hover:bg-white/[0.05]",
                      activeProfileId === profile.id ? "text-white font-medium" : "text-white/55"
                    )}
                  >
                    {confirmDeleteId === profile.id ? (
                      <>
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: profile.color }} />
                        <span className="flex-1 text-left truncate text-white/60">Delete this profile?</span>
                        <button
                          onClick={() => { deleteProfile(profile.id); setConfirmDeleteId(null); }}
                          className="p-1 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 transition shrink-0"
                          title="Confirm delete"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="p-1 rounded-md hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition shrink-0"
                          title="Cancel"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setActiveProfileId(profile.id); setOpen(false); }}
                          className="flex items-center gap-2.5 flex-1 min-w-0 text-left hover:text-white/80 transition-colors"
                        >
                          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: profile.color }} />
                          <span className="flex-1 truncate">{profile.name}</span>
                        </button>
                        {activeProfileId === profile.id && (
                          <Check className="h-3 w-3 text-white/60 shrink-0 group-hover/row:hidden" />
                        )}
                        {/* Inline edit / delete — revealed on hover */}
                        <div className="hidden group-hover/row:flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => openEdit(profile.id)}
                            className="p-1 rounded-md hover:bg-white/[0.08] text-white/40 hover:text-white/80 transition"
                            title="Edit profile"
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(profile.id)}
                            className="p-1 rounded-md hover:bg-red-500/10 text-white/40 hover:text-red-400 transition"
                            title="Delete profile"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-white/[0.05]">
              <button
                onClick={() => { setOpen(false); setShowManage(true); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12px] text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-all"
              >
                <Settings className="h-3.5 w-3.5" />
                Manage Profiles
              </button>
            </div>
          </div>
        )}
      </div>

      {showManage && (
        <ManageModal
          initialEditId={manageEditId ?? undefined}
          onClose={() => { setShowManage(false); setManageEditId(null); }}
        />
      )}
    </>
  );
}

// ── ProfileDot (collapsed sidebar version) ────────────────────────────────────
export function ProfileDot() {
  const { tradingProfiles, activeProfileId } = useAppContext();
  const [showManage, setShowManage] = useState(false);
  const activeProfile = tradingProfiles.find((p) => p.id === activeProfileId);

  return (
    <>
      <button
        onClick={() => setShowManage(true)}
        title="Manage Profiles"
        className="flex items-center justify-center w-10 h-10 rounded-lg text-white/35 hover:text-white/70 hover:bg-white/[0.06] transition-all duration-150"
      >
        <div
          className="h-3 w-3 rounded-full border border-white/20"
          style={{ backgroundColor: activeProfile?.color ?? "#6b7280" }}
        />
      </button>
      {showManage && <ManageModal onClose={() => setShowManage(false)} />}
    </>
  );
}
