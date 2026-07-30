/**
 * Lenient JSON extraction.
 *
 * The timeline arrives by copy-paste out of a chat window, so it routinely
 * carries a ```json fence, a sentence of preamble, "// beat 3" comments and a
 * trailing comma or two. None of that is worth making the user hand-clean, and
 * none of it changes the meaning of the document — so it is stripped here
 * rather than rejected.
 */

/** Removes a leading/trailing markdown code fence, if present. */
function stripFences(text: string): string {
  const fence = /```(?:json5?|jsonc|javascript|js)?\s*([\s\S]*?)```/i.exec(text);
  return fence ? fence[1] : text;
}

/** Grabs the outermost balanced `{ … }`, ignoring braces inside strings. */
function extractObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Drops `//` and `/* *\/` comments and trailing commas outside of strings. */
function stripCommentsAndTrailingCommas(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
      continue;
    }
    out += ch;
  }

  return out.replace(/,(\s*[}\]])/g, "$1");
}

export interface LooseJsonResult<T> {
  value: T | null;
  error: string | null;
}

export function parseLooseJson<T = unknown>(raw: string): LooseJsonResult<T> {
  const text = (raw ?? "").trim();
  if (!text) return { value: null, error: "Nothing pasted yet." };

  const candidates = [text, stripFences(text)];
  const objectSlice = extractObject(stripFences(text));
  if (objectSlice) candidates.push(objectSlice);

  let lastError = "Could not read this as JSON.";
  for (const candidate of candidates) {
    for (const attempt of [candidate, stripCommentsAndTrailingCommas(candidate)]) {
      try {
        const value = JSON.parse(attempt);
        if (value && typeof value === "object") return { value: value as T, error: null };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
  }
  return { value: null, error: lastError };
}
