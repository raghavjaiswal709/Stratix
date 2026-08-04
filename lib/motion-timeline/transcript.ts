/**
 * Word-level transcript CSV.
 *
 * The app never needs this to render — the timeline it drives is already
 * absolute-time — but loading the same CSV that was handed to the AI turns the
 * scrubber into a proof of sync: the word under the playhead is right there,
 * so a cue that fires half a second late is visible instead of theoretical.
 */

export interface TranscriptWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TranscriptParseResult {
  words: TranscriptWord[];
  /** Unit detected in the source file, before conversion to ms. */
  unit: "ms" | "s";
  durationMs: number;
  warnings: string[];
}

const WORD_KEYS = ["word", "text", "token", "content", "label", "transcript"];
const START_KEYS = ["start", "start_time", "starttime", "start_ms", "startms", "start_s", "begin", "from", "onset", "tstart"];
const END_KEYS = ["end", "end_time", "endtime", "end_ms", "endms", "end_s", "stop", "to", "offset", "tend"];

function detectDelimiter(line: string): string {
  const counts: Array<[string, number]> = [
    ["\t", (line.match(/\t/g) || []).length],
    [",", (line.match(/,/g) || []).length],
    [";", (line.match(/;/g) || []).length],
    ["|", (line.match(/\|/g) || []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/** Splits one CSV row, honouring "quoted, fields" and "" escapes. */
function splitRow(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/["']/g, "").trim();
  if (!cleaned) return null;

  // Whisper-style "00:00:04,320" / "0:04.32" timestamps.
  if (/^\d{1,2}:\d{2}(:\d{2})?([.,]\d+)?$/.test(cleaned)) {
    const parts = cleaned.replace(",", ".").split(":").map(Number);
    const secs = parts.reduce((acc, p) => acc * 60 + p, 0);
    return Number.isFinite(secs) ? secs : null;
  }

  const n = Number(cleaned.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function parseTranscriptCsv(raw: string): TranscriptParseResult {
  const warnings: string[] = [];
  const lines = (raw ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { words: [], unit: "ms", durationMs: 0, warnings: ["The transcript file is empty."] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const firstRow = splitRow(lines[0], delimiter);
  const header = firstRow.map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ""));

  const findCol = (keys: string[]) => header.findIndex((h) => keys.includes(h));
  let wordCol = findCol(WORD_KEYS);
  let startCol = findCol(START_KEYS);
  let endCol = findCol(END_KEYS);

  const hasHeader = wordCol >= 0 || startCol >= 0;
  if (!hasHeader) {
    // Positional fallback: word, start, end — with a numeric column sniff so a
    // "start,end,word" ordering still lands correctly.
    const sample = splitRow(lines[0], delimiter);
    const numeric = sample.map((c) => toNumber(c) !== null);
    const textIdx = numeric.findIndex((n) => !n);
    wordCol = textIdx >= 0 ? textIdx : 0;
    const numericIdx = numeric.map((n, i) => (n ? i : -1)).filter((i) => i >= 0);
    startCol = numericIdx[0] ?? 1;
    endCol = numericIdx[1] ?? -1;
    warnings.push("No header row found — read the columns positionally.");
  }

  if (startCol < 0) {
    return { words: [], unit: "ms", durationMs: 0, warnings: ["No start-time column found in the transcript."] };
  }

  const headerSaysMs = hasHeader && /(^|_)ms$/.test(header[startCol] ?? "");
  const rows = hasHeader ? lines.slice(1) : lines;

  const raws: Array<{ text: string; start: number; end: number | null }> = [];
  let sawDecimal = false;

  rows.forEach((line, i) => {
    const cells = splitRow(line, delimiter);
    const start = toNumber(cells[startCol] ?? "");
    if (start === null) {
      if (i < 3) warnings.push(`Row ${i + 1} has no readable start time and was skipped.`);
      return;
    }
    const endRaw = endCol >= 0 ? toNumber(cells[endCol] ?? "") : null;
    const text = (cells[wordCol] ?? "").replace(/^"|"$/g, "");
    if (/[.,]\d/.test(cells[startCol] ?? "")) sawDecimal = true;
    raws.push({ text, start, end: endRaw });
  });

  if (raws.length === 0) {
    return { words: [], unit: "ms", durationMs: 0, warnings: [...warnings, "No usable rows in the transcript."] };
  }

  const maxTime = Math.max(...raws.map((r) => Math.max(r.start, r.end ?? 0)));
  // Anything under an hour expressed as a bare integer is almost certainly
  // seconds; a real millisecond timeline for a reel is tens of thousands.
  const unit: "ms" | "s" = headerSaysMs ? "ms" : sawDecimal || maxTime < 3600 ? "s" : "ms";
  const factor = unit === "s" ? 1000 : 1;

  const words: TranscriptWord[] = raws.map((r, i) => {
    const startMs = r.start * factor;
    const nextStart = raws[i + 1] ? raws[i + 1].start * factor : startMs + 300;
    const endMs = r.end !== null ? r.end * factor : Math.min(nextStart, startMs + 900);
    return { text: r.text, startMs, endMs: Math.max(endMs, startMs) };
  });

  words.sort((a, b) => a.startMs - b.startMs);

  return {
    words,
    unit,
    durationMs: words.length ? words[words.length - 1].endMs : 0,
    warnings,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Trigger-word lookup
 *
 * A cue that carries `"word": "balti"` is stating an intent the transcript can
 * verify: land this animation on that syllable. Resolving the word here and
 * overwriting the authored `atMs` is what turns sync from "the model did the
 * arithmetic right" into "the model named the right word" — a far easier job,
 * and the only one it is actually good at.
 * ────────────────────────────────────────────────────────────────────────*/

/** Lowercase, strip accents and every non-alphanumeric — "Bal-ti," → "balti". */
function normalizeToken(s: string): string {
  // NFD splits "é" into "e" + a combining mark, and the alphanumeric filter
  // then drops the mark — so accented spellings still match their plain form.
  return s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
}

export interface WordMatch {
  /** Start of the first word of the match. */
  startMs: number;
  /** End of the last word of the match. */
  endMs: number;
  /** Index into `words` of the first matched word. */
  index: number;
  /** How the match was found — exact run, or a single fuzzy fallback. */
  kind: "exact" | "prefix";
}

/**
 * Finds when `phrase` is spoken. Multi-word phrases match a consecutive run,
 * so `"stop loss"` lands on the "stop", not on whichever "loss" came first.
 *
 * `hintMs` breaks ties: a word repeated five times in a reel resolves to the
 * occurrence nearest where the author thought it was, which is what makes a
 * roughly-right authored `atMs` still useful even when it is off by a second.
 */
export function findWordTime(
  words: TranscriptWord[],
  phrase: string,
  hintMs?: number,
  minMs?: number
): WordMatch | null {
  if (words.length === 0) return null;

  const needles = phrase.split(/\s+/).map(normalizeToken).filter(Boolean);
  if (needles.length === 0) return null;

  const haystack = words.map((w) => normalizeToken(w.text));
  const candidates: WordMatch[] = [];

  for (let i = 0; i + needles.length <= haystack.length; i++) {
    let hit = true;
    for (let k = 0; k < needles.length; k++) {
      if (haystack[i + k] !== needles[k]) {
        hit = false;
        break;
      }
    }
    if (hit) {
      candidates.push({
        startMs: words[i].startMs,
        endMs: words[i + needles.length - 1].endMs,
        index: i,
        kind: "exact",
      });
    }
  }

  // Nothing exact: allow one word to stand in via prefix, which covers the
  // inflections a transcriber and a scriptwriter disagree about ("liquidity"
  // vs "liquiditys", "dekho" vs "dekh").
  if (candidates.length === 0) {
    const head = needles[0];
    if (head.length >= 4) {
      haystack.forEach((h, i) => {
        if (h.startsWith(head) || head.startsWith(h)) {
          if (Math.min(h.length, head.length) >= 4) {
            candidates.push({ startMs: words[i].startMs, endMs: words[i].endMs, index: i, kind: "prefix" });
          }
        }
      });
    }
  }

  if (candidates.length === 0) return null;

  // A hard floor, for callers walking the audio forwards: a beat's opening
  // word must be found at or after where the previous beat began, or a
  // repeated opener ("Dekho", "Lekin") drags the scene order backwards.
  const inRange = minMs === undefined ? candidates : candidates.filter((c) => c.startMs >= minMs);
  const pool = inRange.length > 0 ? inRange : candidates;

  if (pool.length === 1 || hintMs === undefined) return pool[0];

  return pool.reduce((best, c) =>
    Math.abs(c.startMs - hintMs) < Math.abs(best.startMs - hintMs) ? c : best
  );
}

/** Word under the playhead, or the one most recently spoken. */
export function wordAt(words: TranscriptWord[], tMs: number): TranscriptWord | null {
  if (words.length === 0) return null;
  let lo = 0;
  let hi = words.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].startMs <= tMs) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found >= 0 ? words[found] : null;
}
