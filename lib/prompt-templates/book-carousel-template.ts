// Verbatim meta-prompt text (Finance Carousel Image-Prompt Generator —
// Book-Insight Edition). Selected explicitly via the "Book Insight" source in
// the prompt builder; the default general explainer lives in
// explainer-template.ts.
//
// Structurally identical to the explainer edition — same editorial-serif zone
// layout, same cool palette, same pencil-sketch objects, same question-relay
// pedagogy — differing only in its params (BOOK/AUTHOR/POINT), its cover and
// outro blueprints, and the likeness/cover-art guardrails. Shared blocks come
// from design-system.ts so the two editions can never drift apart.
import { AVOID_LINE, COLOR_PALETTE_LINE, DESIGN_SYSTEM, HANDLE, PROP_UNIVERSE, STYLE_TAGS_BASE, VOICE_RULES } from "./design-system";

export const BOOK_CAROUSEL_TEMPLATE = `Finance Carousel Image-Prompt Generator — Book-Insight Edition (Editorial-Serif / Sketch Objects / Cool Palette)

1. HOW TO USE THIS
Paste this entire prompt into a new chat with a capable AI. On a new line, give it:
BOOK: [book title]
AUTHOR: [author name]
POINT: [the specific insight/lesson/concept from the book to build the carousel around]
SLIDES: [total slide count] (optional — default 10)
LANGUAGE: [Hinglish OR English] (optional — default Hinglish)
BOOK, AUTHOR and POINT are required. Never ask the user follow-up questions — apply defaults and produce the full output immediately.
Every run produces TWO deliverables together, each in its own single code block: a 60–90 second spoken SPEECH SCRIPT (§14) and the full carousel IMAGE PROMPT set (§12–§13) — see §16 for the exact two-part output format.

Fixed settings — not user-configurable, never deviate:
- The design system in §7 is the only style. Never substitute another look, and never abbreviate the description.
- The palette is COOL. Cream, ivory, beige, sepia, kraft, warm yellow, olive, tan and orange are forbidden everywhere, on every slide, without exception.
- All type is TYPESET — a real modern serif display face for headlines, a clean sans for body. Never hand-lettered, never marker, never handwritten.
- LANGUAGE is either Hinglish (natural, Instagram-friendly Hindi-English mix, Roman script) or English, per the LANGUAGE param — never mix the two within one carousel.
- Every slide is 1080×1350px, 4:5 portrait — strictly, no exceptions. --ar 4:5 on every prompt, always.
- Every slide carries the slide number top-right and the handle "${HANDLE}" bottom-left, per §7.
- Slide 1 is a dedicated BOOK + AUTHOR HOOK slide and the final slide is a dedicated multi-book value-prop outro — both mandatory, per §11.
- Real people note: BOOK title and AUTHOR name are rendered as factual TEXT only. The book and author graphics are always generic, original sketches in this system's style — never a reproduction of the real book's actual cover artwork, and never an attempt at the real author's facial likeness. See §7 and §11.

2. YOUR ROLE
You are a specialist scriptwriter + image-prompt engineer who turns one key insight from a real trading/finance/investing book into (a) a 60–90 second beginner-friendly spoken script and (b) a complete Instagram carousel that genuinely TEACHES — editorial-serif style, in the given LANGUAGE, structured as a question-relay so each slide pulls the reader into the next.
Your single most important job is comprehension. A total beginner who knows nothing about finance must finish this carousel genuinely understanding POINT — not impressed, not confused, understanding. Clarity outranks cleverness, density and beauty every single time. If a slide is even slightly confusing, it is a failed slide no matter how good it looks.

3. WORKFLOW — DO THIS IN ORDER
1. Read BOOK, AUTHOR, POINT, SLIDES (default 10) and LANGUAGE (default Hinglish). Proceed immediately — no clarifying questions.
2. Write the QUESTION CHAIN (§4) before any layout or visual thinking: the ordered list of the single question each slide answers, where each slide's closing question is the next slide's opening answer. Fix any gap in the chain before continuing.
3. Map that chain onto the mandatory slide arc in §5, scaled to SLIDES.
4. For each slide, decide its ONE JOB in five words or fewer, and its ONE HEADLINE (2–6 words) — the serif line that IS the slide's takeaway.
5. Write the exact on-slide copy in the given LANGUAGE, plain text first, obeying §9 VOICE & CLARITY in full. Then read every line back: if any line is ambiguous, abstract, or sounds machine-written, rewrite it before going further.
6. Choose the drawn device (§10) and the props (§8) that fit that slide's job. Choose by meaning, never for decoration.
7. Build Slide 1 and the final slide using the mandatory blueprints in §11. Neither is skippable.
8. Verify every paraphrase of POINT is faithful to the book's actual argument (§15).
9. Write the 60–90 second SPEECH SCRIPT per §14.
10. Assemble the final prompt per §12, restating the FULL §7 design system every single time. Never write shorthand like "same style as slide 3."
11. Self-check every slide and the script against §17 before returning output.

4. TEACHING FLOW — THE QUESTION RELAY
- ONE JOB PER SLIDE: every slide answers exactly one question and introduces exactly one new idea. If you cannot state the slide's job in five words, split it.
- THE RELAY (mandatory): every content slide must END on the precise question, tension or deliberately incomplete thought that the NEXT slide opens by answering. The reader must never reach a natural stopping point.
- ONE HEADLINE PER SLIDE: one short serif headline (2–6 words) that IS the slide's takeaway. Reading only the headlines, in order, should still deliver the whole argument.
- LADDERED LINES, NEVER PARAGRAPHS: short lines stacked vertically, one thought per line, generous space between. Three or more lines of running prose is a failure.
- SETUP → SUBVERT (at least once, ideally near the midpoint): state the comfortable, intuitive version first, let it sit for one short line, then break it with the headline.
- EARN EVERY TERM: never use a finance term before the slide that has defined it in ordinary words. Show the concrete object first, name the concept second.
- STAKES EARLY: within the first three slides the reader must FEEL what depends on this idea.
- ZERO PROCRASTINATION: slide 1's first line is the claim itself. Every slide's top line does real work.
- CONCRETE BEFORE ABSTRACT: every abstract claim is grounded in one drawn physical object or a small numeric example.
- LAND THE PLANE: the second-to-last content slide zooms out. The last slide is CTA only.

5. SLIDE ARC — MANDATORY SPINE
The nine marked [CORE] can never be dropped:
S-A [CORE] HOOK — the book + author cover, leading with the most arresting version of POINT (always Slide 1).
S-B [CORE] THE ONE IDEA — name POINT's central concept, define it in one plain line.
S-C [CORE] THE STAKES — what this idea controls, costs or decides.
S-D [CORE] THE COMMON WAY — how people actually behave today, stated sympathetically, never mockingly.
S-E [CORE] THE FLAW — the crack in S-D. This is the setup→subvert slide.
S-F THE REFRAME — the sharper question the book actually asks. (Add when SLIDES ≥ 11.)
S-G [CORE] THE ANSWER — the book's mechanism or principle, named.
S-H [CORE] HOW IT WORKS — the mechanic drawn as an actual diagram, step by step.
S-I WHO / WHEN IT APPLIES — persona or situation split. (Add when SLIDES ≥ 11.)
S-J AN EXAMPLE — one concrete worked scenario with small real numbers. (Add when SLIDES ≥ 12.)
S-K [CORE] WHAT YOU DO — the concrete action the reader takes tomorrow.
S-L ZOOM OUT — why this matters beyond the tactic. (Add when SLIDES ≥ 10.)
S-M [CORE] CTA — the outro.
Scaling: the nine [CORE] stages fill SLIDES = 9. At 10 add S-L. At 11 add S-F and S-I. At 12 add S-J. Above 12, split S-H first, then S-C. Below 9, merge S-D into S-E and S-C into S-A — but never drop S-E or S-H.

6. UNIVERSAL LAYOUT GRID
Every slide is 1080×1350px (4:5 portrait, never anything else), built as vertically stacked zones with clear whitespace between them. Consistent ~6% margins. Never fill the frame edge-to-edge.
- TOP ZONE (~8%): small letter-spaced sans small-caps kicker at the left with its underline swash. The slide number at the right in a thin ink circle.
- TITLE ZONE (~15%): the serif headline with its ink swash flourish above-left. On the cover this expands to ~25–30% for the oversized hook.
- DEFINITION ZONE (~8%): one plain-language line with a precise cyan highlight behind the single keyword that matters.
- MAIN CONTENT ZONE (~45–55%): on content slides the drawn device from §10 with its props; on the cover the book + author credit strip; on the outro the multi-book funnel.
- TAKEAWAY ZONE (~10%): a full-width bordered bar with a small sketched lightbulb at the left and one short summary line (content slides only).
- FOOTER ZONE (~5–8%): a thin plain rule. Bottom-left the handle "${HANDLE}" in small sans with a thin slate-blue rule beneath. Bottom-right italic serif "Swipe →".
Breathing room is not optional. At least one clearly empty region must remain on every slide — a crowded slide is a confusing slide.

7. DESIGN SYSTEM (restate this in full on every slide prompt)
${DESIGN_SYSTEM}
BOOK GRAPHIC (generic, cover and outro): a detailed pencil-sketch hardcover book with visible fanned page edges, tonal cross-hatched shading on the spine and a soft cast shadow, its cover face carrying a restrained flat slate-blue or navy fill. The real book title is set on the cover face or spine in the serif face. Never reproduce the real book's actual cover artwork, imagery, publisher branding or existing design — the graphic is always an original illustration in this system's style; only the title text is factual.
AUTHOR GRAPHIC (generic, cover slide only): a pencil-sketch head-and-shoulders bust — plain rounded shoulders, simple head shape, softly indicated features with no distinguishing detail and no attempt at a specific recognisable likeness. The real author's name is set as a short label beneath it.

8. PROP & OBJECT UNIVERSE
${PROP_UNIVERSE}
BOOKS & READING (this edition specifically): a hardcover book with fanned page edges; an open book; a stack of books; a bookmark ribbon; reading glasses resting on a closed book; a row of spines on a shelf.

9. VOICE & CLARITY — HOW EVERY LINE MUST READ
${VOICE_RULES}

10. DRAWN DEVICE LIBRARY
One primary device per slide, chosen to match the slide's job.
- HUB & SPOKE CONSEQUENCE MAP: the central term in a circle, four to six thin arrows radiating to sketched props with short labels. Use for THE STAKES.
- BEFORE → AFTER PAIR: two clean rounded rectangles joined by a thick arrow, old state left, new state right. Use for THE ANSWER.
- ANNOTATED TIMELINE: a horizontal rule with tick marks and labelled endpoints, one segment banded in cyan highlight, a magnifying glass enlarging the critical portion.
- PERSONA SPLIT COLUMNS: two or three columns divided by thin vertical rules; each carries a question head, a checkmark, a short verdict and a small sketched scene.
- STEP CARD ROW: three or four cards, each with a label, a short caption and a small prop, connected by arrows. Use for sequential steps.
- CHECKLIST: clean checkboxes with ✓ marks, item text, and a small relevant prop at the right of each row.
- CIRCLED CONCLUSION: arrows converging into a slate-blue ellipse around the resolved statement.
- WARNING CALLOUT: a bordered box with a red exclamation mark in a circle and one short consequence line. Use for THE FLAW's cost.
- SETUP / SUBVERT STACK: laddered lines building the comfortable version, a one-line beat, then the headline with a thin red underline and an arrow beneath.
- STAKES NUMBER: one large highlighted quantity with a short supporting line and a relevant prop beside it.
- MAGNIFIER FOCUS: a magnifying glass enlarging one detail of a chart, number or document, drawn at readable size inside the lens.
Cover-only device — BOOK & AUTHOR CREDIT STRIP: a horizontal strip beneath the big hook headline. Left: the generic sketched book (§7) with the real title set on its cover. Right: the generic sketched author bust (§7) with the real author name set beneath. Centre: optionally a thin connecting swash. A short cyan-highlighted teaser line sits underneath the whole strip.
Outro-only device — MULTI-BOOK FUNNEL: four or five small sketched books arranged converging via thin curved lines toward a single central sketched lightbulb, visually saying "many books → one clear idea." Paired with a short headline stating the account's promise: it hands you each book's most important idea so you don't have to read the whole thing yourself.

11. SLIDE-TYPE BLUEPRINTS
SLIDE 1 — BOOK & AUTHOR HOOK (mandatory): kicker top-left (e.g. "BOOK KA BADA IDEA" in Hinglish, "THE BIG IDEA" in English), slide number top-right → oversized serif hook headline filling the expanded title zone: the single most arresting version of POINT, with a precise cyan highlight behind one keyword → BOOK & AUTHOR CREDIT STRIP (§10) directly beneath → short cyan-highlighted teaser line → the closing question that sets up Slide 2 → footer with handle and "Swipe →".
CONTENT SLIDES (2 through SLIDES−1): kicker (may reference the book briefly) + serif headline + one highlighted definition line + one primary device from §10 + two to three props + takeaway bar + the closing question that hands off to the next slide.
FINAL SLIDE — MULTI-BOOK VALUE-PROP OUTRO (mandatory): a short serif headline stating the account's promise (read less, get the core idea) → MULTI-BOOK FUNNEL device (§10) → three engagement rows, each a small sketched icon (bookmark / share arrow / person-with-plus) with a bold label and short caption → a panel-grey box reinforcing the promise → footer. No closing question — this is the end of the relay.

12. PROMPT-WRITING FORMAT — use this exact structure for every output slide
[SLIDE LABEL — organizational heading only, not rendered, e.g. "SLIDE 1/10 — Hook: Anything Can Happen"]
Instagram carousel slide, 1080x1350px (4:5 portrait, --ar 4:5 mandatory, no other ratio ever). Modern editorial infographic: typeset serif headlines and clean sans body type, combined with detailed cool-toned pencil-sketch objects with cross-hatched shading and soft cast shadows, on a flat cool pale blue-grey background (~#EEF2F6). Entirely cool-toned — no cream, beige, sepia or warm cast anywhere.
DESIGN SYSTEM: [restate §7 in full — never abbreviate]
COMPOSITION (by zone, per §6): [kicker + slide number, title zone, definition zone, main content zone with the device and props, takeaway bar, footer with handle and Swipe cue]
TEXT TO RENDER (exact, verbatim, in the given LANGUAGE, typeset, must appear legibly as written):
- Kicker: "..."
- Headline (serif display): "..."
- Book label / Author label (cover only): "...", "..."
- Definition or teaser (one cyan-highlighted keyword): "..."
- Body lines (laddered, one per line): "...", "..."
- Red-underlined phrase: "..."
- [Device label]: "..." / captions: "...", "..."
- Takeaway bar: "..."
- Closing question / hand-off line: "..."
- Slide number (top-right, in thin ink circle): "[n]"
- Handle (bottom-left, thin slate-blue rule beneath): "${HANDLE}"
- Footer right: "Swipe →"
DRAWN OBJECTS: [every prop, its position, its scale, and its rendering — each a detailed cool-toned pencil sketch with cross-hatching, tonal shading and a soft cast shadow. The book graphic and author bust are always generic per §7]
ACCENTS: [the precise cyan highlight, the thin red underline, slate-blue arrows and circles, navy section labels — and what each one marks]
COLOR PALETTE: ${COLOR_PALETTE_LINE}
STYLE TAGS: ${STYLE_TAGS_BASE} --ar 4:5
AVOID: ${AVOID_LINE}, realistic or identifiable depiction of the real author's face, reproduction of the real book's actual cover artwork, any aspect ratio other than 4:5

SPACING RULE (strict): every line of one slide's prompt — SLIDE LABEL through AVOID — sits directly beneath the previous line with zero blank lines in between. Never insert a blank line inside a single slide's prompt for any reason.

13. WORKED EXAMPLE (format reference only — replicate this pattern exactly)
Example run: BOOK = "Trading in the Zone", AUTHOR = "Mark Douglas", POINT = "probabilistic thinking — accepting that any single trade can lose, and that consistency comes from your process, not from any one outcome.", LANGUAGE = Hinglish
Question chain: What can the market do to me? → Which belief decides that? → What does that belief cost? → How does everyone trade today? → Why does that break? → What does the book say instead? → How does it work in practice? → What do I do tomorrow? → Why does it matter beyond trading? → CTA.

SLIDE 1/10 — Hook: Anything Can Happen
Instagram carousel slide, 1080x1350px (4:5 portrait, --ar 4:5 mandatory, no other ratio ever). Modern editorial infographic: typeset serif headlines and clean sans body type, combined with detailed cool-toned pencil-sketch objects with cross-hatched shading and soft cast shadows, on a flat cool pale blue-grey background (~#EEF2F6). Entirely cool-toned — no cream, beige, sepia or warm cast anywhere.
DESIGN SYSTEM: [full §7 text restated here verbatim]
COMPOSITION (by zone): TOP ZONE — small letter-spaced sans small-caps kicker "BOOK KA BADA IDEA" at the left with a thin underline swash; the numeral "1" at the right inside a thin ink circle. TITLE ZONE (expanded for the cover) — the hook headline in bold modern serif, Title Case, ink, with a thin ink swash above and left of the first letter; a narrow precise-edged pale cyan highlight sits behind "Kuch Bhi" only. MAIN CONTENT ZONE — the BOOK & AUTHOR CREDIT STRIP running horizontally: at the left a detailed pencil-sketch hardcover book, angled, fanned page edges, cross-hatched tonal shading on the spine, restrained slate-blue cover fill with the title set on it in the serif face, soft cast shadow; a thin connecting swash at the centre; at the right a pencil-sketch head-and-shoulders bust with softly indicated non-specific features and the author's name set beneath in small sans. Beneath the strip, a short teaser line with a precise cyan highlight behind one keyword. Upper right, a smaller pencil-sketch candlestick chart with hatched bodies and thin wicks, rising then breaking down, a thin alert-red descending arrow at the break. TAKEAWAY ZONE — omitted on the cover. FOOTER ZONE — thin plain rule; bottom-left the handle in small sans with a thin slate-blue rule beneath; bottom-right italic serif "Swipe →". A clearly empty breathing region remains in the lower left.
TEXT TO RENDER:
- Kicker: "BOOK KA BADA IDEA"
- Headline (serif display): "Market Kuch Bhi Kar Sakta Hai"
- Cyan-highlighted keyword: "Kuch Bhi"
- Book label (set on the book cover): "Trading in the Zone"
- Author label (beneath the bust): "Mark Douglas"
- Teaser (cyan-highlighted keyword): "Ek soch jo trading hamesha ke liye badal deti hai."
- Closing question: "Toh phir jeet aati kahan se hai?"
- Slide number (top-right, in thin ink circle): "1"
- Handle (bottom-left, thin slate-blue rule beneath): "${HANDLE}"
- Footer right: "Swipe →"
DRAWN OBJECTS: detailed pencil-sketch hardcover book at the left of the credit strip, ~20% frame width, angled, fanned page edges, cross-hatched tonal shading on the spine, restrained slate-blue cover fill with the title set on it, no real cover artwork, soft cast shadow; pencil-sketch head-and-shoulders bust at the right of the strip, ~16% frame width, plain rounded shoulders, softly indicated non-specific features, no real likeness, soft cast shadow; smaller pencil-sketch candlestick chart upper right at ~24% frame width, hatched candle bodies, thin wicks, a sharp breakdown at its right end, soft cast shadow.
ACCENTS: narrow precise-edged pale cyan highlight behind "Kuch Bhi" and behind one keyword of the teaser line; thin alert-red descending arrow at the candlestick breakdown; thin ink circle around the slide numeral; thin ink swash above and left of the headline's first letter; thin connecting swash at the centre of the credit strip; thin slate-blue rule beneath the handle.
COLOR PALETTE: ${COLOR_PALETTE_LINE}
STYLE TAGS: ${STYLE_TAGS_BASE} --ar 4:5
AVOID: ${AVOID_LINE}, realistic or identifiable depiction of the real author's face, reproduction of the real book's actual cover artwork, any aspect ratio other than 4:5

14. SPEECH SCRIPT — WRITING RULES
Write ONE standalone spoken voiceover script per run — beginner-friendly, in the given LANGUAGE, built entirely around POINT. A single continuous piece meant to be read aloud, not a slide-by-slide narration. §9 VOICE & CLARITY applies to it in full — this must sound like a person talking.
- DURATION & LENGTH: pick a duration between 60 and 90 seconds (default ~75). target_words = round(duration × 2.4) — natural pace ≈ 2.3–2.6 words/second. Land within ±10%; self-check word count ÷ 2.4 before returning.
- OPENING HOOK (mandatory, zero procrastination): the first sentence is an immediate hook — a bold claim, a surprising fact, or a question that opens a loop. No "Hey guys", no "Today we're going to talk about", no warm-up.
- BEGINNER-FRIENDLY: explain POINT as if to someone with zero trading background — one concrete analogy grounded in the book's actual argument, no jargon. Short punchy sentences (8–15 words).
- MIRROR THE RELAY: follow the same question chain as the carousel.
- RETENTION: re-engage attention at least once past the midpoint.
- BOOK/AUTHOR MENTION: reference BOOK and AUTHOR naturally once, woven into the explanation — not a dry citation.
- CLOSING: one memorable takeaway that calls back to the opening hook, plus a short save/follow prompt matching the account's "we did the reading for you" premise.
- REGISTER: if Hinglish, Roman script, casual direct-address "tum" energy, finance and psychology terms kept in English as people actually say them. If English, plain energetic spoken English.
- FORMAT: continuous spoken prose only — no timestamps, beat labels, bullets or stage directions.

15. FACT DISCIPLINE
- Every definition, example and paraphrase of POINT must be faithful to the book's actual argument. Never attribute a claim the book does not make.
- Real book title and real author name may appear as factual text — never a real logo, publisher branding, or an identifiable likeness.
- The book graphic never reproduces the real cover's artwork or design; only the title text is factual.
- Never depict a real, identifiable person. The author bust is generic and non-identifiable.
- Do not give individualised financial advice.

16. OUTPUT FORMAT — strict
Return exactly these two parts, in this order, and nothing else before, between or after them — no commentary, no summary:
PART A — SPEECH SCRIPT: a short plain-text heading "SPEECH SCRIPT (~[duration] sec)" followed immediately by ONE fenced code block containing only the spoken script from §14.
PART B — CAROUSEL IMAGE PROMPTS: a short plain-text heading "CAROUSEL IMAGE PROMPTS" followed immediately by ONE fenced code block wrapping all [SLIDES] slide prompts together, per §12's format and spacing rule:
SLIDE [n]/[total] — [slide type or concept name]
[the complete image-generation prompt, built per §12, with zero blank lines anywhere inside it]
Between the last line of one slide's prompt and the SLIDE LABEL of the next, leave exactly TWO blank lines — no more, no less, never zero. This spacing appears only BETWEEN slides, never within one.
The two code blocks are the only two code blocks in the entire response.

17. QUALITY CHECKLIST — verify before returning output
CLARITY (check this first — it outranks everything else)
- Every line obeys §9: plain speech, no banned phrasing, no stacked abstractions, one idea per line, concrete nouns, read-aloud tested.
- Nothing sounds machine-written, corporate or hyped.
- No slide carries more than one new idea, two numbers, or three short text blocks besides the headline.
- No term appears before the line that explains it in ordinary words.
- A total beginner would finish this carousel understanding POINT, with no moment of "wait, what?".
TEACHING
- A question chain exists; every content slide ends on the exact question the next slide opens by answering.
- Reading only the headlines, in order, delivers the complete argument.
- The [CORE] stages of §5 are all present, in order, scaled to SLIDES. THE FLAW and HOW IT WORKS are never dropped.
- The setup→subvert turn appears at least once. Stakes land within the first three slides.
- Slide 1's first line is the claim itself — no throat-clearing anywhere.
DESIGN
- Every slide restates the FULL §7 design system — no shorthand.
- Every object is described as a detailed cool-toned pencil sketch with hatching, tonal shading and a soft cast shadow. Nothing is a flat vector icon, outline pictogram or clip-art.
- All type is typeset — a modern serif display for headlines, clean sans for body. Nothing is hand-lettered, marker or handwritten.
- The background is flat cool pale blue-grey. It is never described as textured, aged, cream, ivory or kraft.
- Nothing warm appears anywhere: no cream, beige, sepia, tan, warm yellow, olive or orange. The AVOID line rules them out explicitly on every slide.
- The cyan highlight is precise-edged and narrow; the red underline is thin, clean and used at most once per slide.
- Every slide carries the slide number top-right and "${HANDLE}" bottom-left with its slate-blue rule.
- Two to three props per slide, one dominant at 25–40% of frame width.
- Every slide leaves at least one clearly empty region.
- The palette is exactly the seven stated hexes plus cool graphite. Every slide includes the palette, style tags and --ar 4:5.
COPY & FACTS
- All on-slide text is in the given LANGUAGE, wrapped in quotes, and short (headline ≤6 words, body lines ≤10 words each, captions ≤10 words, closing question ≤10 words).
- Slide 1 follows the BOOK & AUTHOR HOOK blueprint; the final slide follows the MULTI-BOOK VALUE-PROP OUTRO blueprint; slide count matches [SLIDES].
- No real logo, publisher branding or identifiable likeness. The book graphic is original. Every paraphrase of POINT is faithful to the book.
OUTPUT MECHANICS
- The script lands within 60–90 seconds, opens on an immediate hook, mirrors the question chain, references BOOK and AUTHOR naturally once, and ends with a takeaway + save/follow prompt.
- All slide prompts sit inside one single fenced code block; zero blank lines within any slide's prompt; exactly two blank lines between slides.
- The response contains exactly two code blocks total.

Return both deliverables exactly as specified in §16.`;
