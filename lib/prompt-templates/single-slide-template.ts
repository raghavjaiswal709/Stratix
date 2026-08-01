// Verbatim meta-prompt text (Single-Slide Test Prompt). A deliberately small
// companion to the carousel generators: give it any topic and any slide idea
// and it returns exactly ONE image prompt, so the look of the design system can
// be checked in a single generation instead of a full 10-slide run.
//
// It shares design-system.ts with the general concept/fact explainer — same
// DESIGN_SYSTEM_COLOR, same composed-page logic — so whatever this produces is
// exactly what a real general-explainer slide will look like. (The book and
// video templates use the monochrome DESIGN_SYSTEM instead.)
import { AVOID_LINE_COLOR, COLOR_PALETTE_LINE_COLOR, DESIGN_SYSTEM_COLOR, HANDLE, PROP_UNIVERSE, STYLE_TAGS_COLOR, VOICE_RULES } from "./design-system";

export const SINGLE_SLIDE_TEMPLATE = `Single-Slide Test Prompt — Editorial-Serif / Coloured-Pencil Objects / Cool Ground

1. WHAT THIS IS
A quick look-test. Give it any topic and any slide idea and it returns exactly ONE ready-to-paste image prompt — no script, no carousel, no extra slides. Use it to check the design system on a single generation before committing to a full carousel run.

2. HOW TO USE THIS
Paste this entire prompt into a new chat with a capable AI. On a new line, give it:
TOPIC: [any subject, e.g. "Stop Loss" or "Why the rupee is falling" or "How SIP works"]
SLIDE: [optional — which slide to make, described however you like: "the hook", "slide 4", "the stakes slide", "how it works", "the flaw", "the CTA", or just a sentence describing what the slide should say]
LANGUAGE: [Hinglish OR English] (optional — default Hinglish)
RATIO: [4:5 OR 9:16] (optional — default 4:5; use 9:16 to test a video frame)
Only TOPIC is required. If SLIDE is absent, build the HOOK slide. Never ask follow-up questions — apply defaults and produce the single prompt immediately.

3. WHAT TO DO
1. Read TOPIC, SLIDE, LANGUAGE and RATIO. Apply defaults for anything missing.
2. Decide the slide's ONE JOB in five words or fewer, and its ONE HEADLINE (2–6 words) — the serif line that IS the slide's takeaway.
3. Write the on-slide copy in the given LANGUAGE, obeying §4 VOICE & CLARITY in full. Read every line back: if it is ambiguous, abstract, or sounds machine-written, rewrite it.
4. Pick two to three props from §6 by MEANING — the object must be the thing the copy is literally about — with one clearly dominant.
5. Build the single prompt per §7, restating the FULL §5 design system inside it.
6. Check against §8, then return the prompt and nothing else.

4. VOICE & CLARITY — HOW EVERY LINE MUST READ
${VOICE_RULES}

5. DESIGN SYSTEM (restate this in full inside the prompt you produce)
${DESIGN_SYSTEM_COLOR}

6. PROP & OBJECT UNIVERSE
${PROP_UNIVERSE}

7. OUTPUT — return exactly this, inside ONE fenced code block, and nothing else
[SLIDE LABEL — organizational heading only, not rendered in the image]
Instagram carousel slide, 1080x1350px (4:5 portrait, --ar 4:5 mandatory) — or, if RATIO is 9:16, vertical short-form video still, 1080x1920px (9:16 portrait, --ar 9:16 mandatory). Modern editorial infographic: typeset serif headlines and clean sans body type, combined with detailed COLOURED-PENCIL objects — layered colour strokes with visible pencil grain, colour cross-hatching, and soft cool-shaded cast shadows — on a flat cool pale blue-grey background (~#EEF2F6). Objects are richly coloured; the page overall still reads cool, with no cream, beige, sepia or warm cast anywhere.
DESIGN SYSTEM: [restate §5 in full — never abbreviate]
COMPOSITION (composed editorial page, never a rigid zone stack): [kicker top-left and slide number top-right; the serif headline with its ink swash; one cyan-highlighted line; the dominant drawn object and supporting props placed asymmetrically with their positions; a short takeaway line; footer with the handle and the Swipe cue. Say explicitly where the empty breathing region is.]
TEXT TO RENDER (exact, verbatim, in the given LANGUAGE, typeset, must appear legibly as written):
- Kicker: "..."
- Headline (serif display): "..."
- Definition line (one cyan-highlighted keyword): "..."
- Body lines (laddered, one per line): "...", "..."
- Red-underlined phrase: "..."
- Takeaway bar: "..."
- Slide number (top-right, in thin ink circle): "[n]"
- Handle (bottom-left, thin slate-blue rule beneath): "${HANDLE}"
- Footer right: "Swipe →"
DRAWN OBJECTS: [every prop, its position, its scale, and its colours — each a detailed coloured-pencil illustration with layered colour strokes, visible pencil grain, colour cross-hatching and a soft cool-shaded cast shadow. Name the actual pencil colours used on each object]
ACCENTS: [the precise cyan highlight, the thin red underline, slate-blue arrows and circles, navy section labels — and what each one marks]
COLOR PALETTE: ${COLOR_PALETTE_LINE_COLOR}
STYLE TAGS: ${STYLE_TAGS_COLOR} --ar 4:5
AVOID: ${AVOID_LINE_COLOR}, any aspect ratio other than the one specified
Every line above sits directly beneath the previous one with zero blank lines anywhere inside the prompt.

8. CHECKLIST — verify before returning
- Exactly ONE image prompt is returned, inside ONE fenced code block, with no commentary, no script and no second slide.
- The full §5 design system is restated inside the prompt — not abbreviated, not referenced.
- Every line of copy obeys §4: plain speech, no banned phrasing, no stacked abstractions, one idea per line, read-aloud tested.
- The slide carries one new idea, at most two numbers, and at most three short text blocks besides the headline.
- The page is composed asymmetrically as an editorial spread — not as a stack of full-width zones.
- All type is typeset — modern serif display for the headline, clean sans for body. Nothing hand-lettered or marker.
- The background is flat cool pale blue-grey and the page reads cool overall; warm hues appear only as small local accents on objects that need them, never as a wash or the dominant colour; the AVOID line rules warm backgrounds out explicitly.
- Two to three props, one dominant at 25–40% of frame width, each a richly coloured coloured-pencil illustration with layered strokes, visible grain and a cool-shaded cast shadow — never monochrome graphite. The actual pencil colours are named.
- The handle reads exactly "${HANDLE}".
- One clearly empty breathing region is described.
- The palette, style tags and the correct --ar are present.

Return only the single fenced code block.`;
