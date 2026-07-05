"use client";

// Minimal block-level markdown renderer for AI-generated text (headings,
// bullet/numbered lists, bold/italic, paragraphs). Not a full CommonMark
// implementation — just enough for the Hinglish "Explain" feature's output
// (### headings, "- **term**: text" bullets, "1. text" steps) to render as
// real formatted elements instead of literal "##"/"-" characters.

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineMarkdown(raw: string): string {
  return escapeHtml(raw)
    // Bold-italic first (must precede bold and italic rules)
    .replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<strong style="font-weight:700;font-style:italic">$1</strong>')
    .replace(/\*\*([\s\S]+?)\*\*/g, '<strong style="font-weight:700">$1</strong>')
    .replace(/\*([\s\S]+?)\*/g, '<em style="font-style:italic">$1</em>');
}

type Block =
  | { type: "h1" | "h2" | "h3" | "p"; text: string }
  | { type: "ul" | "ol"; items: string[] };

function parseBlocks(raw: string): Block[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let currentList: { type: "ul" | "ol"; items: string[] } | null = null;

  const flushList = () => {
    if (currentList) {
      blocks.push(currentList);
      currentList = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    // A blank line alone doesn't end a list — models often put a blank line
    // between numbered/bulleted points for readability. Only flush when the
    // next actual content line turns out to be a different block type.
    if (!line) continue;

    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      blocks.push({ type: level === 1 ? "h1" : level === 2 ? "h2" : "h3", text: headingMatch[2] });
      continue;
    }

    const bulletMatch = /^[-*]\s+(.*)$/.exec(line);
    if (bulletMatch) {
      if (!currentList || currentList.type !== "ul") {
        flushList();
        currentList = { type: "ul", items: [] };
      }
      currentList.items.push(bulletMatch[1]);
      continue;
    }

    const numberedMatch = /^\d+\.\s+(.*)$/.exec(line);
    if (numberedMatch) {
      if (!currentList || currentList.type !== "ol") {
        flushList();
        currentList = { type: "ol", items: [] };
      }
      currentList.items.push(numberedMatch[1]);
      continue;
    }

    flushList();
    blocks.push({ type: "p", text: line });
  }
  flushList();
  return blocks;
}

const HEADING_CLASSES: Record<"h1" | "h2" | "h3", string> = {
  h1: "text-base font-bold text-white mt-4 mb-1.5 first:mt-0",
  h2: "text-sm font-bold text-white mt-4 mb-1.5 first:mt-0",
  h3: "text-xs font-bold uppercase tracking-wide text-white/70 mt-4 mb-1.5 first:mt-0",
};

export function MarkdownText({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  const blocks = parseBlocks(text);
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        if (b.type === "h1" || b.type === "h2" || b.type === "h3") {
          return (
            <p key={i} className={HEADING_CLASSES[b.type]} dangerouslySetInnerHTML={{ __html: inlineMarkdown(b.text) }} />
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={i} className="list-disc list-outside pl-4 space-y-1 my-2">
              {b.items.map((it, j) => (
                    <li key={j} dangerouslySetInnerHTML={{ __html: inlineMarkdown(it) }} />
              ))}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={i} className="list-decimal list-outside pl-4 space-y-1 my-2">
              {b.items.map((it, j) => (
                    <li key={j} dangerouslySetInnerHTML={{ __html: inlineMarkdown(it) }} />
              ))}
            </ol>
          );
        }
        return (
          <p key={i} className="my-2 first:mt-0" dangerouslySetInnerHTML={{ __html: inlineMarkdown((b as { text: string }).text) }} />
        );
      })}
    </div>
  );
}
