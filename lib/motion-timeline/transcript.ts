/**
 * Word-level transcript CSV.
 *
 * The app never needs this to render — the timeline it drives is already
 * absolute-time — but loading the same CSV that was handed to the AI turns the
 * scrubber into a proof of sync: the word under the playhead is right there,
 * so a cue that fires half a second late is visible instead of theoretical.
 */

// Shared with the printed-text matcher, so a word snaps the same way whether it
// arrives from a cue or off a slide — and so non-Latin scripts survive
// normalization instead of collapsing to the empty string. text-match's only
// import from this file is a type, so there is no runtime cycle.
import { normalizeToken } from "./text-match";

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

const WORD_KEYS = ["word", "text", "token", "content", "label", "transcript", "words", "value"];
const START_KEYS = ["start", "start_time", "starttime", "start_ms", "startms", "start_s", "begin", "from", "onset", "tstart", "startsec", "startseconds", "starttimes"];
const END_KEYS = ["end", "end_time", "endtime", "end_ms", "endms", "end_s", "stop", "to", "offset", "tend", "endsec", "endseconds", "endtimes"];

/**
 * Column lookup in three widening tiers.
 *
 * Exact membership alone is too brittle for real exports: "Start Time (s)"
 * normalizes to "starttimes", which no fixed list will ever contain, and the
 * whole file was being rejected over it. Prefix and substring passes catch that
 * family, and are only consulted when nothing matched exactly — so a file with
 * a real `start` column can never lose it to a `restart` column.
 */
function findColumn(header: string[], keys: string[]): number {
  const exact = header.findIndex((h) => keys.includes(h));
  if (exact >= 0) return exact;

  const prefix = header.findIndex((h) => h && keys.some((k) => h.startsWith(k) || k.startsWith(h)));
  if (prefix >= 0) return prefix;

  return header.findIndex((h) => h && keys.some((k) => k.length >= 3 && h.includes(k)));
}

function detectDelimiter(line: string): string {
  const counts: Array<[string, number]> = [
    ["\t", (line.match(/\t/g) || []).length],
    [";", (line.match(/;/g) || []).length],
    ["|", (line.match(/\|/g) || []).length],
    [",", (line.match(/,/g) || []).length],
  ];
  // Ties resolve to the earlier entry, which is why the comma is last: a
  // European export writing "0,340" as a decimal has as many commas as
  // semicolons, and reading it as comma-delimited splits every timestamp in
  // half. A file that genuinely has only commas still lands on the comma.
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

/**
 * Splits a phrase spanning [startMs, endMs] into evenly-timed words.
 *
 * Used for caption formats, which time whole lines rather than words. The
 * result is an approximation and says so, but a scene cut placed inside the
 * right sentence beats no video at all — and the segment boundaries themselves
 * are exact, which is what the slide segmenter leans on hardest.
 */
function spreadWords(text: string, startMs: number, endMs: number): TranscriptWord[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const span = Math.max(1, endMs - startMs);
  const step = span / tokens.length;
  return tokens.map((t, i) => ({
    text: t,
    startMs: startMs + step * i,
    endMs: startMs + step * (i + 1),
  }));
}

const TIMECODE = /(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/g;

/** SRT and WebVTT — detected by the "-->" cue arrow. */
function parseCaptions(raw: string): TranscriptParseResult {
  const words: TranscriptWord[] = [];
  const blocks = raw.split(/\r?\n/);
  let pending: { startMs: number; endMs: number } | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (pending && buffer.length) {
      words.push(...spreadWords(buffer.join(" "), pending.startMs, pending.endMs));
    }
    buffer = [];
  };

  blocks.forEach((line) => {
    if (line.includes("-->")) {
      flush();
      const stamps = line.match(TIMECODE);
      if (stamps && stamps.length >= 2) {
        const toMs = (s: string) => {
          const parts = s.replace(",", ".").split(":").map(Number);
          return parts.reduce((acc, p) => acc * 60 + p, 0) * 1000;
        };
        pending = { startMs: toMs(stamps[0]), endMs: toMs(stamps[1]) };
      } else pending = null;
      return;
    }
    const trimmed = line.trim();
    // Cue numbers and WEBVTT headers are not dialogue.
    if (!trimmed || /^\d+$/.test(trimmed) || /^WEBVTT/i.test(trimmed)) {
      if (!trimmed) flush();
      return;
    }
    // Strip the <c> and <00:00:01.000> markup WebVTT sprinkles through lines.
    buffer.push(trimmed.replace(/<[^>]*>/g, " ").trim());
  });
  flush();

  words.sort((a, b) => a.startMs - b.startMs);
  return {
    words,
    unit: "s",
    durationMs: words.length ? words[words.length - 1].endMs : 0,
    warnings: words.length
      ? ["Caption file: word timings were spread evenly inside each caption, so they are approximate."]
      : ["No readable caption cues in that file."],
  };
}

/** Whisper / whisperX / ElevenLabs JSON, in any of the shapes they emit. */
function parseTranscriptJson(raw: string): TranscriptParseResult {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return { words: [], unit: "ms", durationMs: 0, warnings: ["That looked like JSON but could not be parsed."] };
  }

  const out: TranscriptWord[] = [];
  // Unit evidence, weighed once at the end rather than per word — `start: 0` is
  // zero in both units and must not vote.
  let usedMsKey = false;
  let sawFraction = false;
  let maxTime = 0;

  const readWord = (w: Record<string, unknown>): void => {
    const text = [w.word, w.text, w.token, w.value].find((v) => typeof v === "string") as string | undefined;
    if (text === undefined) return;

    // A key literally named `startMs` settles the unit question outright.
    if (typeof w.startMs === "number" || typeof w.endMs === "number") usedMsKey = true;

    const start = [w.start, w.startMs, w.start_time, w.startTime, w.from, w.offset].find(
      (v) => typeof v === "number"
    ) as number | undefined;
    if (start === undefined) return;
    const end = [w.end, w.endMs, w.end_time, w.endTime, w.to].find((v) => typeof v === "number") as number | undefined;

    if (!Number.isInteger(start) || (end !== undefined && !Number.isInteger(end))) sawFraction = true;
    maxTime = Math.max(maxTime, start, end ?? 0);

    out.push({ text, startMs: start, endMs: end ?? start });
  };

  const walk = (node: unknown, depth = 0): void => {
    if (depth > 6 || !node) return;
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, depth + 1));
      return;
    }
    if (typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.words)) {
      obj.words.forEach((w) => {
        if (w && typeof w === "object") readWord(w as Record<string, unknown>);
      });
      return;
    }
    if (typeof obj.word === "string" || typeof obj.text === "string") {
      const before = out.length;
      readWord(obj);
      if (out.length > before) return;
    }
    ["segments", "chunks", "results", "transcript", "items", "alignment"].forEach((key) => {
      if (obj[key]) walk(obj[key], depth + 1);
    });
  };

  walk(doc);

  // Same reading as the CSV path: an explicit ms key wins, then fractional
  // values mean seconds, then a whole timeline under an hour means seconds.
  const isSeconds = usedMsKey ? false : sawFraction || maxTime < 3600;
  const factor = isSeconds ? 1000 : 1;
  const words = out
    .map((w) => ({ text: w.text, startMs: w.startMs * factor, endMs: Math.max(w.endMs * factor, w.startMs * factor) }))
    .sort((a, b) => a.startMs - b.startMs);

  return {
    words,
    unit: isSeconds ? "s" : "ms",
    durationMs: words.length ? words[words.length - 1].endMs : 0,
    warnings: words.length ? [] : ["No timed words found in that JSON."],
  };
}

/**
 * Reads a transcript in whatever the user's tool exported.
 *
 * Dispatches on content rather than file extension, because a `.txt` from
 * Whisper is as likely to be an SRT as a table, and a `.csv` that is really
 * JSON should still load.
 */
export function parseTranscriptFile(raw: string): TranscriptParseResult {
  const text = (raw ?? "").replace(/^﻿/, "").trim();
  if (!text) return { words: [], unit: "ms", durationMs: 0, warnings: ["The transcript file is empty."] };

  if (text.includes("-->")) return parseCaptions(text);
  if (text.startsWith("{") || text.startsWith("[")) return parseTranscriptJson(text);
  return parseTranscriptCsv(text);
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

  let wordCol = findColumn(header, WORD_KEYS);
  let startCol = findColumn(header, START_KEYS);
  let endCol = findColumn(header, END_KEYS);

  // A header row is one whose cells name things rather than being data —
  // decided structurally, not by whether the names are recognised. A file
  // headed "kelime,baslangic,bitis" has a header row just as much as one headed
  // "word,start,end", and counting its labels as data poisons every column
  // statistic below.
  const secondRow = lines[1] ? splitRow(lines[1], delimiter) : null;
  const countNums = (row: string[]) => row.filter((c) => toNumber(c) !== null).length;
  const namedColumns = wordCol >= 0 || startCol >= 0;
  const hasHeader = countNums(firstRow) === 0 && (!secondRow || countNums(secondRow) > 0 || namedColumns);

  const bodyRows = (hasHeader ? lines.slice(1) : lines).map((l) => splitRow(l, delimiter));

  /* ── Column sniffing ──────────────────────────────────────────────────
     The header is a hint, not the authority. Exports name these columns
     everything under the sun and in every language, but the *data* is
     unmistakable: word times ascend, and words are not numbers. So every
     header guess is checked against the body, and anything unresolved — or
     resolved to a column the data contradicts — is decided from the body
     instead. This is what turns "No start-time column found" from a dead end
     into a file that just loads. */
  const columnCount = Math.max(...bodyRows.map((r) => r.length), header.length);
  const stats = Array.from({ length: columnCount }, (_, c) => {
    const cells = bodyRows.map((r) => r[c] ?? "");
    const nums = cells.map(toNumber);
    const parsed = nums.filter((n): n is number => n !== null);
    let ascending = 0;
    for (let i = 1; i < parsed.length; i++) if (parsed[i] >= parsed[i - 1]) ascending++;
    const letters = cells.filter((v) => /\p{L}/u.test(v)).length;
    return {
      index: c,
      numericShare: cells.length ? parsed.length / cells.length : 0,
      ascendingShare: parsed.length > 1 ? ascending / (parsed.length - 1) : 0,
      letterShare: cells.length ? letters / cells.length : 0,
      first: parsed[0] ?? Infinity,
      mean: parsed.length ? parsed.reduce((a, b) => a + b, 0) / parsed.length : Infinity,
    };
  });

  // A time column is numeric and goes forwards. Ties break on the smaller mean,
  // which is what separates start from end when both look identical.
  const timeCols = stats
    .filter((s) => s.numericShare >= 0.8 && s.ascendingShare >= 0.9)
    .sort((a, b) => a.mean - b.mean);
  const textCols = stats
    .filter((s) => s.letterShare >= 0.5 && s.numericShare < 0.5)
    .sort((a, b) => b.letterShare - a.letterShare);

  const isTime = (c: number) => c >= 0 && (stats[c]?.numericShare ?? 0) >= 0.8;
  const isText = (c: number) => c >= 0 && (stats[c]?.letterShare ?? 0) >= 0.5;

  if (!isTime(startCol)) startCol = timeCols[0]?.index ?? -1;
  if (!isTime(endCol) || endCol === startCol) {
    endCol = timeCols.find((s) => s.index !== startCol)?.index ?? -1;
  }
  if (!isText(wordCol)) wordCol = textCols[0]?.index ?? -1;

  if (startCol < 0) {
    // Say what was actually seen. "No start-time column" with nothing else is
    // unactionable; the header and a sample row make it obvious in one glance.
    const shown = header.filter(Boolean).join(" | ") || firstRow.join(" | ");
    return {
      words: [],
      unit: "ms",
      durationMs: 0,
      warnings: [
        `No column of ascending timestamps found. Read ${columnCount} column(s) split on "${
          delimiter === "\t" ? "tab" : delimiter
        }": ${shown}. The transcript needs a word column and a start-time column.`,
      ],
    };
  }
  if (wordCol < 0) {
    wordCol = stats.find((s) => s.index !== startCol && s.index !== endCol)?.index ?? 0;
    warnings.push("No obvious word column — used the first non-time column.");
  }
  if (!hasHeader) warnings.push("No header row found — read the columns from the data.");

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

/* normalizeToken is imported at the top of this file — it is shared with the
   printed-text matcher so a word snaps the same way whether it arrives from a
   cue or from a slide. */

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
