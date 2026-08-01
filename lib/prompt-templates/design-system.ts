// Single source of truth for the shared blocks every image-prompt template
// injects. These are prose fragments meant to be interpolated into the
// meta-prompt strings — keeping them here means the design system, palette,
// prop library, voice rules and handle can never drift between the carousel,
// book-carousel, video and single-slide templates.
//
// Design lineage: editorial-serif typography (typeset modern serif display +
// clean sans body, the original zone-based magazine layout) combined with
// detailed pencil-sketch objects. The palette is COOL — cool blue-grey paper,
// blue-black ink, slate-blue and navy accents, pale cyan highlighter. Warm
// tones (cream, beige, sepia, kraft, warm yellow, olive) are explicitly
// forbidden, because unconstrained "sketch on paper" prompts drift warm.

/** Account handle rendered in the footer of every slide/frame. */
export const HANDLE = "@RVX_traders";

/** The canonical palette line, repeated verbatim in every generated prompt. */
export const COLOR_PALETTE_LINE =
  "paper ~#EEF2F6, ink ~#16202B, slate blue ~#2E5C7E, deep navy ~#1E3D57, alert red ~#C0444E, cyan highlight ~#A9DCEC, panel grey ~#DCE4EB, plus cool blue-grey graphite tones.";

/**
 * Palette line for the coloured-pencil templates. The seven core hexes still
 * govern the ground, the type and the accents; the objects draw from a wider
 * cool-anchored pencil range on top of that.
 */
export const COLOR_PALETTE_LINE_COLOR =
  "ground and type — paper ~#EEF2F6, ink ~#16202B, slate blue ~#2E5C7E, deep navy ~#1E3D57, alert red ~#C0444E, cyan highlight ~#A9DCEC, panel grey ~#DCE4EB. Objects — a cool-anchored coloured-pencil range: teal, aqua, sky, slate blue, navy, sage, emerald, periwinkle, violet, coral and cool red, with citron or muted gold only as small local accents. Shadows shaded in cool blue or violet pencil, never flat grey or brown.";

/** Style tag tail for the monochrome templates. Ratio appended by the caller. */
export const STYLE_TAGS_BASE =
  "editorial infographic illustration, modern serif typography, detailed pencil-sketch objects, cross-hatched graphite shading, cool blue-grey palette, clean magazine layout, educational explainer, richly detailed, clean legible typography";

/** Style tag tail for the coloured-pencil templates. */
export const STYLE_TAGS_COLOR =
  "editorial infographic illustration, modern serif typography, detailed coloured-pencil objects, layered colour-pencil strokes with visible grain, colour cross-hatching, cool-toned ground with richly coloured objects, clean magazine layout, educational explainer, richly detailed, clean legible typography";

// Negative prompt. Warm suppression is the critical part, but it is aimed at the
// GROUND and the overall cast — the background, the shading and any global
// wash — rather than at hue in general. A blanket "no warm tones" would fight
// the coloured-pencil objects, which are allowed small warm accents.
const AVOID_SHARED =
  "a warm overall colour cast, cream or ivory or beige or sepia or kraft-paper backgrounds, vintage or aged-paper look, sepia or brown-grey shading, hand-lettered or marker or comic lettering, garbled or misspelled text, flat vector icons, uniform-weight outline pictograms, clip-art, extra fingers or limbs, distorted faces, cartoon mascot characters, photorealistic rendering, watermarks, real brand or institutional logos, cluttered illegible layout, low-contrast text, crowded or overlapping elements";

/** Negative prompt for the monochrome templates. */
export const AVOID_LINE = `${AVOID_SHARED}, warm yellow or olive or orange or tan anywhere, colours outside the stated palette`;

/** Negative prompt for the coloured-pencil templates. */
export const AVOID_LINE_COLOR = `${AVOID_SHARED}, warm hues used as a background wash or as the dominant colour of the frame, muddy or desaturated objects, flat uniform colour fills with no pencil texture, monochrome or greyscale objects, neon or fluorescent colour`;

/** §DESIGN SYSTEM — the full block, restated in every prompt. */
export const DESIGN_SYSTEM = `Reference: a modern editorial explainer — the calm, authoritative typography of a good magazine spread, paired with detailed hand-sketched objects. Clean, cool-toned, precise, never cute and never rustic. No mascot or recurring character appears anywhere.
BACKGROUND: flat cool pale blue-grey (~#EEF2F6), with at most a whisper of fine paper tooth. It reads as clean modern stock, NOT as aged, textured, cream or kraft paper. There is no vignette, no mottling, no smudging, no warm cast anywhere on the page.
TITLE / HEADLINE TYPE: typeset modern serif display, bold, ink (~#16202B), Title Case by default — ALL-CAPS reserved for a genuinely punchy line. Font analogues: "Playfair Display Bold", "Lora Bold", "Canela Bold". A thin hand-drawn ink swash sits above and to the left of the first letter. This is a real typeface, cleanly set — never hand-lettering, never marker, never comic or handwritten display type.
KICKER TYPE: small letter-spaced sans-serif small caps above the title, ink or slate blue, with a thin underline swash beneath.
BODY TYPE: clean modern sans-serif, ink (~#16202B). Font analogues: "Inter Regular", "Poppins Regular". Generous line spacing, comfortably large, always legible at thumbnail size. Select accent lines and the "Swipe →" cue use an italic serif.
DRAWN OBJECTS (this is the signature element — keep it detailed): every object is a finely observed PENCIL SKETCH — directional hatching and cross-hatching for shadow, tonal shading that gives real three-dimensional volume, confident contour lines with visible line-weight variation, and a soft cast shadow where the object meets the page. Objects are illustrated and dimensional, drawn with care and detail — never flat vector icons, never uniform-weight outline pictograms, never clip-art. Render the graphite in COOL blue-grey tones (never warm grey, never sepia, never brown). Objects may carry restrained flat colour from the palette where it clarifies meaning — a slate-blue chart line, a red circled date, a cyan highlighted band.
HIGHLIGHT TREATMENT: narrow, precise-edged pale cyan marker highlight (~#A9DCEC) sitting behind specific keywords only. Clean rectangular band, crisp edges, semi-transparent, never scribbled and never overshooting.
UNDERLINE TREATMENT: a thin, clean alert-red rule (~#C0444E) beneath the single most consequential phrase on the slide. One per slide at most.
SECTION LABELS: rounded-rectangle boxes with SOLID deep-navy fill (~#1E3D57) and pale text. Neutral definitional content sits in a plain panel-grey rounded box (~#DCE4EB).
ACCENT LOGIC: slate blue (~#2E5C7E) is the primary accent and marks the positive or resolved path; deep navy (~#1E3D57) carries labels and structure; alert red (~#C0444E) is reserved strictly for the flaw, the warning, the negative outcome; cyan highlight (~#A9DCEC) marks the one keyword that matters most.
ARROWS & CONNECTORS: thin, clean, ink or slate blue, gently curved, with a small precise triangular head. Dotted trails are evenly spaced round dots.
BOXES & FRAMES: crisp rounded rectangles with even corners and true-parallel sides — clean geometry, not hand-drawn wobble.
HUMAN FIGURES (allowed where they genuinely help): generic pencil-sketched people with simple, non-specific faces — someone at a desk, a person in an armchair, a head-and-shoulders bust, two hands shaking. Never a real person's likeness, never a recurring mascot, never a photorealistic face.
SLIDE NUMBER: top-right corner, the number set in the serif face inside a thin clean ink circle.
FOOTER: a thin plain horizontal rule as the only separator. Bottom-left: the handle "${HANDLE}" in small sans-serif with a thin slate-blue rule beneath it. Bottom-right: italic serif "Swipe →".
COLOR KEY (fixed — introduce no colour outside this key, ever): paper ~#EEF2F6 · ink ~#16202B · slate blue ~#2E5C7E · deep navy ~#1E3D57 · alert red ~#C0444E · cyan highlight ~#A9DCEC · panel grey ~#DCE4EB. Everything reads cool. If any element would render warm — cream, beige, sepia, tan, warm yellow, olive — it is wrong.`;

/**
 * Colour-pencil variant of DESIGN_SYSTEM. Identical typography, layout logic
 * and palette discipline — the only difference is that objects are rendered in
 * layered COLOURED pencil rather than monochrome graphite.
 *
 * Used by the general concept/fact explainer and by the single-slide test
 * prompt (which exists to preview that path). The book-carousel and video
 * templates deliberately stay on the monochrome DESIGN_SYSTEM above.
 */
export const DESIGN_SYSTEM_COLOR = DESIGN_SYSTEM.replace(
  /DRAWN OBJECTS \(this is the signature element[^\n]*\n/,
  `DRAWN OBJECTS (this is the signature element — keep it detailed AND colourful): every object is a finely observed COLOURED-PENCIL illustration. Build the colour the way a real coloured pencil does — layered directional strokes with visible pencil grain and tooth, cross-hatching in colour rather than in grey, several hues layered over one another for depth, edges firmed up with a darker tone of the same hue, and paper left showing through for the highlights. Every object carries real three-dimensional volume and a soft cast shadow where it meets the page (shade shadows with a cool blue or violet pencil, never with flat grey). Objects are richly coloured, not monochrome, not flat fills, and never flat vector icons, uniform-weight outline pictograms or clip-art.
OBJECT COLOUR RANGE: draw each object in the colours that object actually wants — a plant in sage and deep green, a coin stack in muted gold with cool grey edges, a monitor in slate and teal, a bucket in weathered blue, a book in oxblood or navy. Work from a cool-anchored spread: teal, aqua, sky, slate blue, navy, sage, emerald, periwinkle, violet, coral and cool red, with citron or muted gold as small accents. The page overall must still read COOL — warm hues appear only as small local accents on an object that genuinely needs them (a wooden handle, a copper coin, a terracotta pot) and never as a background wash, an overall cast, or the dominant colour of the frame.
`
);

// The variant is produced by rewriting one clause of DESIGN_SYSTEM. If that
// clause is ever reworded, the replace would silently no-op and the explainer
// would quietly fall back to monochrome objects — so fail loudly instead.
if (DESIGN_SYSTEM_COLOR === DESIGN_SYSTEM) {
  throw new Error(
    "design-system: DESIGN_SYSTEM_COLOR failed to apply — the DRAWN OBJECTS clause in DESIGN_SYSTEM was reworded and no longer matches the replace pattern."
  );
}

/** §PROP & OBJECT UNIVERSE — chosen by meaning, rendered per DESIGN_SYSTEM. */
export const PROP_UNIVERSE = `Pick props by MEANING — the object must be the thing the sentence is literally about — then render it as a detailed cool-toned pencil sketch per the design system. Two to three props per slide, one clearly dominant at 25–40% of frame width. This is a starting vocabulary, not a cage: if a beat calls for an object that is not listed but obviously fits, draw it in the same medium.
TIME & DEADLINE: spiral-bound desk calendar with a date circled in red; wall clock; alarm clock with twin bells; hourglass; stopwatch; a horizontal timeline rule with tick marks and labelled endpoints; a pinned countdown note.
MONEY & VALUE: a large ₹ rupee symbol; stacked coins; a glass jar of coins with a small label; piggy bank; a banded bundle of notes; wallet; safe with a dial; balance scales; a price tag on a string.
MARKET & PRICE: candlestick chart with hatched bodies and thin wicks; zigzag line chart with an arrow head; bar chart; two opposing ladders of buy and sell orders converging on one circled price; an order book; a ticker board; a desktop monitor displaying an index chart; volume bars beneath a price line.
AUTHORITY & RULES: a wooden gavel on its sound block; a pillared bank or regulator building; a rubber stamp; an embossed seal; a rolled notice or circular; a rule book; a large bell hanging from a yoke.
INVESTIGATION & TRUTH: a magnifying glass with a turned handle hovering over a number or chart segment, enlarging it; a flashlight beam; question marks in decreasing sizes trailing off in dots; a checklist with ✓ and ✗ boxes.
DOCUMENTS & PROOF: a clipboard; a stapled form; a folder with tabs; a certificate with a signature squiggle; an ID card; a sealed envelope; a pinned note; a receipt strip; a ledger book.
DESK & WORK: an open laptop with a dashboard on its screen; a desktop monitor; a calculator with visible keys; a coffee cup with rising steam; a notepad with a pen resting on it; a fountain pen; a paperclip; a desk lamp; a small potted plant; a pair of eyeglasses.
PEOPLE & PERSONAS: a person in an armchair beside a plant; a person seated at a desk; a head-and-shoulders bust labelled by role; two hands shaking; a figure pointing at a board. Generic and non-identifiable.
CONCEPT & INSIGHT: a lightbulb; a brain; two meshing gears; a puzzle piece; a key entering a lock; a map with a dotted route; a two-armed signpost; a ladder or staircase; a bridge; a funnel; two doors.
RISK & WARNING: an exclamation mark inside a circle; a warning triangle; a cracked wall; a leaking bucket; a storm cloud; a steep red descending arrow; a broken chain link.
GROWTH & OUTCOME: a seedling in a pot; an ascending staircase; a trophy; a medal on a ribbon; a mountain with a flag; a sunrise behind a rising line chart.
GLOBAL & TRADE: a globe with a marked route; a shipping container; a cargo ship; a fuel pump; an oil barrel; a passport; a boarding pass; a suitcase; an ATM.`;

/** §VOICE & CLARITY — how the on-slide copy and script must read. */
export const VOICE_RULES = `Write like a thoughtful person explaining something to a friend across a table — not like a brand, a textbook, or an AI.
- PLAIN SPEECH: use the words a person would actually say out loud. Short sentences. Contractions. Direct address. If a sentence would sound strange spoken aloud, rewrite it.
- BANNED PHRASING (never use these or anything like them): "delve", "moreover", "furthermore", "it is important to note", "in today's fast-paced world", "unlock", "leverage" as a verb, "navigate the landscape", "game-changer", "let's dive in", "buckle up", "in essence", "at the end of the day", "the bottom line is", "revolutionise", "seamless", "robust", "myriad", "plethora", "testament to", "stands as", "serves as a reminder". Also avoid the rhetorical tic of "It's not just X — it's Y."
- NO STACKED ABSTRACTIONS: never put two abstract nouns next to each other. "Policy divergence drives currency volatility" is machine language. "One country raised rates. The other cut. That gap moves the currency." is human language.
- ONE IDEA PER LINE: every line carries exactly one thought. Break anything longer.
- CONCRETE NOUNS BEAT ABSTRACT ONES: prefer the fuel pump, the phone, the ticket price, the salary. Abstractions like "market sentiment" and "macro headwinds" must be replaced by the thing they actually describe.
- DEFINE BEFORE YOU USE: no term appears before the line that explains it in ordinary words. Explain the thing first, then name it — never the reverse.
- CLARITY LIMITS PER SLIDE: one new idea, at most two numbers, at most three short text blocks besides the headline. If a slide needs more, it is two slides.
- NO FALSE DRAMA: don't manufacture urgency or stakes that aren't there. The real consequence, stated plainly, is always stronger than hype.
- READ-ALOUD TEST: read every line aloud in your head. If you stumble, or it sounds like marketing copy, rewrite it until it sounds like speech.`;
