"use client";

import { useState } from "react";
import { Search, Loader2, X } from "lucide-react";

interface WebImageResult {
  imageUrl: string;
  thumbnailUrl: string;
  title: string;
  contextLink: string;
}

// "Search Photos" button + inline results grid, dropped next to the manual
// Upload button in the poster's image editor. Backed by Pexels (a curated
// stock library, not a live web crawl — see search-image/route.ts). Two-step
// by design (search, then pick) rather than auto-applying the top hit — an
// unreviewed top-1 pick is exactly the kind of thing that can be confidently
// wrong, so this keeps a human in the loop while still doing the actual
// search and download automatically.
export function WebImageSearch({ query, onSelect }: { query: string; onSelect: (dataUrl: string) => void }) {
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<WebImageResult[]>([]);
  const [fetchingIdx, setFetchingIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setOpen(true);
    setSearching(true);
    setError(null);
    setResults([]);
    try {
      const res = await fetch("/api/content-creator/search-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Search failed");
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const pick = async (result: WebImageResult, idx: number) => {
    setFetchingIdx(idx);
    setError(null);
    try {
      const res = await fetch("/api/content-creator/fetch-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: result.imageUrl }),
      });
      const data = await res.json();
      if (!res.ok || typeof data?.imageUrl !== "string") throw new Error(data?.error || "Could not fetch that image");
      onSelect(data.imageUrl);
      setOpen(false);
      setResults([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fetch that image");
    } finally {
      setFetchingIdx(null);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={search}
        disabled={searching || !query.trim()}
        title="Search stock photos matching this story"
        className="flex items-center gap-1.5 px-3 rounded-xl text-[10px] font-bold shrink-0 transition-all cursor-pointer border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
        Search Photos
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">
              {searching ? "Searching…" : results.length > 0 ? `${results.length} results — click one to use it` : "No results"}
            </span>
            <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/70 transition cursor-pointer">
              <X className="h-3 w-3" />
            </button>
          </div>
          {error && <p className="text-[10px] text-red-400/80 leading-snug">{error}</p>}
          {results.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5">
              {results.map((r, i) => (
                <button
                  key={r.imageUrl + i}
                  type="button"
                  onClick={() => pick(r, i)}
                  disabled={fetchingIdx !== null}
                  title={r.title}
                  className="relative aspect-square rounded-lg overflow-hidden border border-white/[0.08] hover:border-emerald-400/60 transition disabled:opacity-40 cursor-pointer"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- external thumbnail preview, not an optimizable local asset */}
                  <img src={r.thumbnailUrl} alt={r.title} className="w-full h-full object-cover" />
                  {fetchingIdx === i && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
