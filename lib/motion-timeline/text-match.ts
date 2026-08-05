/**
 * Matching printed words against spoken words.
 *
 * The decomposer already reads every text block on a poster (tesseract, no AI)
 * and the transcript already carries every spoken word with its exact ms. The
 * only thing standing between those two facts and a fully synced video is a
 * matcher that survives the ways they legitimately disagree: OCR mangles a
 * character, the script says "compounding ka jaadu" where the slide prints
 * "COMPOUNDING KA JAADU!", a transcriber writes "dekho" for "dekh".
 *
 * Everything here is statistics on the two documents themselves — no model, no
 * stopword list, no language setting. A word's worth is its inverse document
 * frequency *in this transcript*, so "hai" spoken forty times counts for almost
 * nothing and "compounding" spoken twice counts for a lot, in any language,
 * without anybody having to declare which language it is.
 */

import type { TranscriptWord } from "./transcript";

/**
 * Lowercase, decompose accents, keep only letters and digits.
 *
 * Unicode-aware on purpose: `[^a-z0-9]` would erase Devanagari, Arabic and CJK
 * entirely, so every token from such a transcript would normalize to the empty
 * string and match everything or nothing. NFD + dropping combining marks keeps
 * the Latin behaviour identical ("Bal-ti," → "balti").
 */
export function normalizeToken(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Splits free text into normalized tokens, dropping anything that empties out. */
export function tokenize(s: string): string[] {
  if (!s) return [];
  return s
    .split(/[\s ]+/)
    .map(normalizeToken)
    .filter((t) => t.length > 0);
}

/** True when `a` and `b` differ by at most one insert, delete or substitution. */
export function withinEditDistance1(a: string, b: string): boolean {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (a === b) return true;

  if (la === lb) {
    let diffs = 0;
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i] && ++diffs > 1) return false;
    }
    return true;
  }

  // One is exactly one character longer — walk both, allowing a single skip.
  const [short, long] = la < lb ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    j++;
  }
  return true;
}

/**
 * Numbers, spoken and printed.
 *
 * A poster prints "10 SAAL" and the voiceover says "das saal"; it prints "2X"
 * and the voiceover says "double". Neither is a spelling variant, so no amount
 * of edit distance will bridge them — but they are the same number, and hook
 * and pay-off slides are made almost entirely of numbers. Without this the two
 * slides most likely to carry a figure are also the two least likely to match.
 *
 * English and the Hinglish this app is actually written in, both directions.
 */
const NUMERAL_WORDS: Record<string, string[]> = {
  "0": ["zero", "shunya", "nil"],
  "1": ["one", "ek", "first", "pehla"],
  "2": ["two", "do", "double", "dusra", "second"],
  "3": ["three", "teen", "tisra"],
  "4": ["four", "char", "chaar"],
  "5": ["five", "paanch", "panch"],
  "6": ["six", "chah", "chhah"],
  "7": ["seven", "saat"],
  "8": ["eight", "aath"],
  "9": ["nine", "nau"],
  "10": ["ten", "das", "dus"],
  "11": ["eleven", "gyarah"],
  "12": ["twelve", "barah"],
  "15": ["fifteen", "pandrah"],
  "20": ["twenty", "bees", "bis"],
  "25": ["twentyfive", "pachees", "pachchis"],
  "30": ["thirty", "tees"],
  "40": ["forty", "chalees"],
  "50": ["fifty", "pachas", "pachaas"],
  "60": ["sixty", "saath"],
  "100": ["hundred", "sau", "sao"],
  "1000": ["thousand", "hazaar", "hazar", "hajaar"],
  "100000": ["lakh", "lac", "lakhs"],
  "10000000": ["crore", "cr", "crores"],
};

/** token → the numeral family it belongs to, both directions, built once. */
const NUMERAL_ALIASES: Map<string, Set<string>> = (() => {
  const map = new Map<string, Set<string>>();
  Object.entries(NUMERAL_WORDS).forEach(([digits, spellings]) => {
    const family = new Set<string>([digits, ...spellings]);
    family.forEach((member) => map.set(member, family));
  });
  return map;
})();

function sameNumber(a: string, b: string): boolean {
  const fam = NUMERAL_ALIASES.get(a);
  return fam ? fam.has(b) : false;
}

/**
 * Do two normalized tokens refer to the same word?
 *
 * Deliberately asymmetric in cost: an exact hit is free, and the fuzzy tiers
 * only open up for tokens long enough that a coincidence is unlikely. Short
 * tokens ("ka", "to", "hai") must match exactly or not at all — they are the
 * ones a loose rule would wrongly pair off by the dozen.
 */
export function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  // The same number written two ways — checked before the length guard, since
  // "10" and "das" are both too short to reach the fuzzy tiers below.
  if (sameNumber(a, b)) return true;
  const min = Math.min(a.length, b.length);
  if (min < 4) return false;
  // Shared stem: "liquidity" / "liquiditys", "gullak" / "gullakh".
  if (a.startsWith(b) || b.startsWith(a)) return true;
  if (min >= 5 && withinEditDistance1(a, b)) return true;
  return false;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Transcript index
 * ──────────────────────────────────────────────────────────────────────────*/

export interface TranscriptIndex {
  words: TranscriptWord[];
  /** Normalized token per word — "" for rows that were pure punctuation. */
  tokens: string[];
  /** Distinct vocabulary, for fuzzy resolution. */
  vocabulary: string[];
  /** token → ascending word indices. */
  positions: Map<string, number[]>;
  /** token → inverse-document-frequency weight. */
  idf: Map<string, number>;
  /** Silence before word i, in ms (0 for i = 0). */
  gapBeforeMs: Float64Array;
  /** 1 when the word before i closed a sentence — a natural place to cut. */
  sentenceEndBefore: Uint8Array;
  durationMs: number;
  /** Memoized fuzzy resolutions, so a repeated slide word costs nothing. */
  _resolved: Map<string, number[]>;
}

/** Sentence-enders across the scripts this app actually sees. */
const SENTENCE_END = /[.!?…।؟。]["')\]]?\s*$/;

export function buildTranscriptIndex(words: TranscriptWord[]): TranscriptIndex {
  const tokens = words.map((w) => normalizeToken(w.text));
  const positions = new Map<string, number[]>();

  tokens.forEach((t, i) => {
    if (!t) return;
    const list = positions.get(t);
    if (list) list.push(i);
    else positions.set(t, [i]);
  });

  const total = Math.max(1, tokens.filter(Boolean).length);
  const idf = new Map<string, number>();
  positions.forEach((list, token) => {
    // ln(N / df): a hapax in a 200-word reel scores ~5.3, a word said forty
    // times scores ~1.6, a word said in every other breath scores ~0.
    const raw = Math.log(total / list.length);
    // Two-character tokens are as often OCR debris as they are words, and a
    // one-character token never carries an argument. Discount rather than drop:
    // "1/10" still helps identify a page counter.
    const lengthFactor = token.length >= 4 ? 1 : token.length === 3 ? 0.8 : token.length === 2 ? 0.45 : 0.2;
    idf.set(token, Math.max(0.08, raw) * lengthFactor);
  });

  const gapBeforeMs = new Float64Array(words.length);
  const sentenceEndBefore = new Uint8Array(words.length);
  for (let i = 1; i < words.length; i++) {
    gapBeforeMs[i] = Math.max(0, words[i].startMs - words[i - 1].endMs);
    sentenceEndBefore[i] = SENTENCE_END.test(words[i - 1].text) ? 1 : 0;
  }

  return {
    words,
    tokens,
    vocabulary: [...positions.keys()],
    positions,
    idf,
    gapBeforeMs,
    sentenceEndBefore,
    durationMs: words.length ? words[words.length - 1].endMs : 0,
    _resolved: new Map(),
  };
}

/**
 * Every transcript position a printed token could be referring to.
 *
 * Exact hits win outright — the fuzzy sweep only runs when the word was not
 * spoken verbatim, so a correctly-read slide never pays for the vocabulary
 * scan and never risks a near-miss stealing its own occurrences.
 */
export function resolveToken(index: TranscriptIndex, token: string): number[] {
  if (!token) return [];
  const cached = index._resolved.get(token);
  if (cached) return cached;

  const exact = index.positions.get(token);
  // A numeral always sweeps the vocabulary even when it hit exactly: a script
  // that says "10" once and "das" twice should contribute all three, and
  // short-circuiting on the exact hit would throw away the majority of them.
  const isNumeral = NUMERAL_ALIASES.has(token);

  let found = exact;
  if (!found || isNumeral) {
    const merged = new Set<number>(exact ?? []);
    for (const vocab of index.vocabulary) {
      if (vocab !== token && tokensMatch(token, vocab)) {
        index.positions.get(vocab)!.forEach((p) => merged.add(p));
      }
    }
    found = [...merged].sort((a, b) => a - b);
  }

  index._resolved.set(token, found);
  return found;
}

/** What one printed token is worth, and where it lands. */
export interface WeightedToken {
  token: string;
  weight: number;
  /** Ascending transcript indices this token matches. Empty ⇒ never spoken. */
  positions: number[];
}

/**
 * Turns a printed string into weighted tokens.
 *
 * Repeats collapse — a headline that says "MORE MORE MORE" is not three times
 * the evidence — and an unspoken token keeps its entry so callers can report it
 * rather than silently pretending the slide said less than it did.
 */
export function weighPhrase(index: TranscriptIndex, phrase: string): WeightedToken[] {
  const seen = new Set<string>();
  const out: WeightedToken[] = [];

  tokenize(phrase).forEach((token) => {
    if (seen.has(token)) return;
    seen.add(token);
    const positions = resolveToken(index, token);
    // An unspoken token has no idf of its own; price it as a rare word so the
    // "how much of this element is spoken at all" number stays honest.
    const weight = positions.length
      ? index.idf.get(index.tokens[positions[0]]) ?? 1
      : Math.max(0.08, Math.log(Math.max(2, index.tokens.length))) * (token.length >= 4 ? 1 : 0.4);
    out.push({ token, weight, positions });
  });

  return out;
}

export interface PhraseLocation {
  /** Transcript index of the first matched word. */
  index: number;
  /** Exclusive index of the last matched word. */
  endIndex: number;
  startMs: number;
  /** Matched weight over spoken weight, 0–1. */
  score: number;
  /** Absolute idf weight matched — guards against a hit on filler alone. */
  matchedWeight: number;
  /** How many of the phrase's tokens landed inside the window. */
  matchedTokens: number;
  totalTokens: number;
}

export interface LocateOptions {
  /** First transcript index that may be used (inclusive). */
  fromIndex?: number;
  /** Last transcript index that may be used (exclusive). */
  toIndex?: number;
  /** Minimum share of the spoken weight that must land in the window. */
  minScore?: number;
  /** Minimum absolute idf weight, so filler-only hits are rejected. */
  minWeight?: number;
}

/**
 * Finds where a printed phrase is spoken.
 *
 * Scores a sliding window rather than demanding a consecutive run: a headline
 * reads "SIP ka asli fayda" and the voiceover says "SIP ka jo asli fayda hai" —
 * same sentence, four words apart, and an exact-run matcher sees nothing. The
 * window is allowed to be roughly twice the phrase's length, which admits the
 * filler a speaker adds without admitting the next sentence.
 *
 * Ties break earliest: an element enters when its words are *first* heard.
 */
export function locatePhrase(
  index: TranscriptIndex,
  phrase: string,
  options: LocateOptions = {}
): PhraseLocation | null {
  const from = Math.max(0, options.fromIndex ?? 0);
  const to = Math.min(index.words.length, options.toIndex ?? index.words.length);
  if (to <= from) return null;

  const weighted = weighPhrase(index, phrase);
  if (weighted.length === 0) return null;

  // Only tokens actually spoken somewhere inside the search range can be found,
  // so only they belong in the denominator. Judging a window by words that are
  // nowhere in the audio would score every window equally badly.
  const usable = weighted
    .map((w) => ({ ...w, positions: w.positions.filter((p) => p >= from && p < to) }))
    .filter((w) => w.positions.length > 0);
  if (usable.length === 0) return null;

  const spokenWeight = usable.reduce((sum, w) => sum + w.weight, 0);
  if (spokenWeight <= 0) return null;

  const minScore = options.minScore ?? 0;
  const minWeight = options.minWeight ?? 0;

  // Window length: the phrase plus the filler a natural reading adds around it.
  const span = Math.max(4, Math.ceil(weighted.length * 1.9) + 2);

  // Candidate starts are exactly the places a phrase token was heard — every
  // other index would score identically to the next one that is.
  const starts = [...new Set(usable.flatMap((w) => w.positions))].sort((a, b) => a - b);

  let best: PhraseLocation | null = null;

  for (const start of starts) {
    const end = Math.min(to, start + span);
    let matchedWeight = 0;
    let matchedTokens = 0;
    let lastHit = start;

    for (const w of usable) {
      // positions is ascending; a linear probe is cheaper than a binary search
      // at these sizes and stops at the first hit.
      for (const p of w.positions) {
        if (p >= end) break;
        if (p >= start) {
          matchedWeight += w.weight;
          matchedTokens++;
          if (p > lastHit) lastHit = p;
          break;
        }
      }
    }

    if (matchedWeight <= 0) continue;
    const score = matchedWeight / spokenWeight;
    if (score < minScore || matchedWeight < minWeight) continue;

    if (!best || score > best.score + 1e-9) {
      best = {
        index: start,
        endIndex: lastHit + 1,
        startMs: index.words[start].startMs,
        score,
        matchedWeight,
        matchedTokens,
        totalTokens: weighted.length,
      };
    }
  }

  return best;
}

/**
 * The one word that best identifies this phrase, as spelled in the transcript.
 *
 * Cues carry the transcript's own spelling rather than the slide's, so the
 * compiler's re-snap (compile.ts · snapToWord) finds it verbatim and the
 * timeline stays locked to the audio even after a save/reload round trip.
 */
export function strongestSpokenToken(
  index: TranscriptIndex,
  phrase: string,
  fromIndex = 0,
  toIndex = Number.MAX_SAFE_INTEGER
): { token: string; wordIndex: number } | null {
  let best: { token: string; wordIndex: number; weight: number } | null = null;

  // A plain loop, not forEach: assigning `best` inside a callback puts it
  // outside the compiler's control-flow analysis, which then reads it back as
  // `never` at the return.
  for (const w of weighPhrase(index, phrase)) {
    const hit = w.positions.find((p) => p >= fromIndex && p < toIndex);
    if (hit === undefined) continue;
    if (!best || w.weight > best.weight) {
      best = { token: index.words[hit].text, wordIndex: hit, weight: w.weight };
    }
  }

  return best ? { token: best.token, wordIndex: best.wordIndex } : null;
}

/** Index of the word whose start is nearest `tMs`, within `[from, to)`. */
export function nearestWordIndex(index: TranscriptIndex, tMs: number, from = 0, to = index.words.length): number {
  const lo = Math.max(0, from);
  const hi = Math.min(index.words.length, to);
  if (hi <= lo) return -1;

  let bestIdx = lo;
  let bestDist = Infinity;
  for (let i = lo; i < hi; i++) {
    const d = Math.abs(index.words[i].startMs - tMs);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
    // Word starts ascend, so once we are past `tMs` the distance only grows.
    if (index.words[i].startMs > tMs) break;
  }
  return bestIdx;
}
