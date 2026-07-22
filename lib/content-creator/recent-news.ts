import dbConnect from "@/lib/mongodb";
import { ContentCreatorGenerationModel } from "@/lib/models/ContentCreatorGeneration";

// How many past News Batch generations count as "recent" for the
// don't-repeat-the-same-story prompt rule. This is a ROLLING window, not a
// permanent ban — once this many newer batches have run, an older story
// ages out and is fair game again (e.g. the same event resurfacing months
// later, or a recurring release like the next NFP print).
const RECENT_GENERATIONS = 5;

interface RecentPosterLean {
  title?: string;
  date?: string;
  isCover?: boolean;
  isOutro?: boolean;
}

interface RecentGenerationLean {
  createdAt: Date;
  payload?: { posters?: RecentPosterLean[] };
}

/**
 * Builds the "recently covered" block injected into the News Batch prompt —
 * the real (non-cover/outro) poster titles from this user's last few News
 * Batch generations, so the curator model can avoid repeating the same
 * story two batches in a row while still allowing genuinely new
 * developments and normal recurring data releases.
 */
export async function getRecentlyCoveredBlock(userId: string): Promise<string> {
  await dbConnect();
  const recentDocs = await ContentCreatorGenerationModel.find({ userId, category: "news-batch" })
    .select("payload createdAt")
    .sort({ createdAt: -1 })
    .limit(RECENT_GENERATIONS)
    .lean<RecentGenerationLean[]>();

  if (recentDocs.length === 0) {
    return "(No prior News Batch generations for this account yet — nothing to avoid.)";
  }

  const lines: string[] = [];
  for (const doc of recentDocs) {
    const batchDate = new Date(doc.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const posters = Array.isArray(doc.payload?.posters) ? doc.payload!.posters! : [];
    for (const p of posters) {
      if (!p || p.isCover || p.isOutro || !p.title) continue;
      lines.push(`- "${p.title}" (used in the batch from ${batchDate})`);
    }
  }

  if (lines.length === 0) {
    return "(No prior News Batch generations for this account yet — nothing to avoid.)";
  }

  return lines.join("\n");
}
