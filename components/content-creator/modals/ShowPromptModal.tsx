"use client";

import { useState, useEffect } from "react";
import { X, Copy, Check, AlertCircle, Loader2, Upload, Eye } from "lucide-react";


// Shows the EXACT system prompt + user message the app sends to the AI for a
// given batch category, plus the JSON shape the response must match — the
// same `previewOnly` mechanism the Content Calendar's "Copy Prompt" uses,
// surfaced directly from the main Generate menu so nothing about what the
// model is told (curation rules, voice, image-prompt formula, output schema)
// is hidden behind a black box.
export function ShowPromptModal({
  category,
  onClose,
  onImport,
}: {
  category: "news" | "facts" | "learnings";
  onClose: () => void;
  onImport: (category: "news" | "facts" | "learnings", rawText: string) => Promise<void>;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userMessage, setUserMessage] = useState("");
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    const endpoint = category === "news" ? "news-batch" : category === "facts" ? "facts-batch" : "learnings-batch";
    setLoading(true);
    setError(null);
    fetch(`/api/content-creator/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ previewOnly: true }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setSystemPrompt(d.systemPrompt || "");
        setUserMessage(d.userMessage || "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load prompt"))
      .finally(() => setLoading(false));
  }, [category]);

  const categoryLabel = category === "news" ? "News Batch" : category === "facts" ? "Facts" : "Learnings";

  const fullText = `=== SYSTEM PROMPT (sent to the AI) ===\n${systemPrompt}\n\n${"─".repeat(60)}\n\n=== USER MESSAGE (sent to the AI) ===\n${userMessage}\n\n${"─".repeat(60)}\n\nPaste this whole thing into ChatGPT, Claude, Grok, or any capable AI. Copy its reply and paste it into the "Paste The AI's Reply" box in Stratix to render the poster batch.`;

  function copy(text: string, section: string) {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection((s) => (s === section ? null : s)), 2000);
  }

  async function handleImport() {
    setImporting(true);
    setImportError(null);
    try {
      await onImport(category, pasteText);
      onClose();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border overflow-hidden"
        style={{ background: "#0f0f0f", borderColor: "rgba(255, 255, 255, 0.08)" }}
      >
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b shrink-0"
          style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}
        >
          <div className="flex items-center gap-2.5">
            <Eye className="h-4 w-4 text-white/60" />
            <span className="text-[13px] font-bold text-white tracking-wide uppercase">
              Full Generation Prompt ({categoryLabel})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => copy(fullText, "all")}
              disabled={loading || !!error}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border border-white/[0.08] bg-white/5 hover:bg-white/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {copiedSection === "all" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copiedSection === "all" ? "Copied" : "Copy Everything"}
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center h-7 w-7 rounded-lg hover:bg-white/5 transition-all text-white/40 hover:text-white/80 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <p className="px-5 py-2.5 text-[10.5px] text-white/40 border-b shrink-0" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
          This is exactly what the app sends the AI when you click Generate — curation rules, voice, the image-prompt formula, and the JSON shape the poster renderer expects back. Nothing hidden.
        </p>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-white/40 text-[12px]">
              <Loader2 className="h-4 w-4 animate-spin" /> Building the live prompt…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-red-300 text-[11px]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}
          {!loading && !error && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">System Prompt</span>
                  <button
                    onClick={() => copy(systemPrompt, "system")}
                    className="flex items-center gap-1 text-[9.5px] font-bold text-white/40 hover:text-white/80 transition cursor-pointer"
                  >
                    {copiedSection === "system" ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                    {copiedSection === "system" ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="text-[10.5px] leading-relaxed whitespace-pre-wrap text-white/75 bg-white/[0.02] border border-white/[0.06] rounded-xl p-3 max-h-64 overflow-y-auto" style={{ fontFamily: "ui-monospace, monospace" }}>
                  {systemPrompt}
                </pre>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">User Message</span>
                  <button
                    onClick={() => copy(userMessage, "user")}
                    className="flex items-center gap-1 text-[9.5px] font-bold text-white/40 hover:text-white/80 transition cursor-pointer"
                  >
                    {copiedSection === "user" ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                    {copiedSection === "user" ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="text-[10.5px] leading-relaxed whitespace-pre-wrap text-white/75 bg-white/[0.02] border border-white/[0.06] rounded-xl p-3 max-h-40 overflow-y-auto" style={{ fontFamily: "ui-monospace, monospace" }}>
                  {userMessage}
                </pre>
              </div>

              <div className="pt-1 border-t border-white/[0.06]">
                <div className="flex items-center justify-between mb-1.5 pt-4">
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Paste The AI&apos;s Reply</span>
                </div>
                <p className="text-[10px] text-white/35 mb-2">
                  Ran the prompt above in ChatGPT, Claude, Grok, or anywhere else? Paste its JSON reply below — it&apos;ll be converted and rendered as the poster batch automatically.
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => { setPasteText(e.target.value); setImportError(null); }}
                  placeholder="Paste the AI's JSON reply here…"
                  spellCheck={false}
                  className="w-full h-32 resize-none rounded-xl p-3 text-[10.5px] leading-relaxed outline-none transition-all bg-white/[0.02] border border-white/[0.08] text-white/80 focus:border-white/[0.20]"
                  style={{ fontFamily: "ui-monospace, monospace" }}
                />
                {importError && (
                  <div className="flex items-center gap-2 mt-2 p-2.5 rounded-lg border border-red-500/20 bg-red-500/5 text-red-300 text-[10.5px]">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {importError}
                  </div>
                )}
                <button
                  onClick={handleImport}
                  disabled={importing || !pasteText.trim()}
                  className="mt-2.5 w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-[11px] font-bold transition-all border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {importing ? "Rendering…" : "Render Poster"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
