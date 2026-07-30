import { CAMERA_CUE_DOCS, CUE_DOCS } from "@/lib/motion-timeline/cues";
import { EASE_NAMES } from "@/lib/motion-timeline/easing";

// The cue/easing catalogs are generated from the renderer's own tables, so the
// prompt can never promise the external AI a cue this app cannot execute.
const cueCatalog = CUE_DOCS.map((c) => `• ${c.name} — params: ${c.params}. ${c.description}`).join("\n");
const cameraCatalog = CAMERA_CUE_DOCS.map((c) => `• ${c.name} — params: ${c.params}. ${c.description}`).join("\n");
const easingCatalog = EASE_NAMES.join(", ");

/**
 * Verbatim meta-prompt for turning a decomposed motion-video layout plus a
 * word-level transcript into a Stratix motion timeline. Paste into any capable
 * chat AI, append the layout JSON and the transcript CSV, paste the answer back
 * into Content Creator → Motion Video → AI Timeline.
 */
export const MOTION_TIMELINE_TEMPLATE = `1. HOW TO USE THIS
Paste this entire prompt into a new chat with a capable AI. Immediately after it, paste exactly two things and nothing else:
(A) LAYOUT JSON — copied from Stratix → Content Creator → Motion Video → "Copy JSON". It describes every slide and every decomposed element on it.
(B) TRANSCRIPT CSV — a word-by-word transcription of the voiceover with precise timestamps.
The AI returns ONE JSON document — a motion timeline. That JSON is pasted back into Stratix → Motion Video → "AI Timeline" → Apply, and the app renders the animation frame-accurately against the same audio. Never ask the user follow-up questions; apply the defaults in this document and produce the full output immediately.

2. YOUR ROLE
You are a motion director and animation programmer. You are given a set of already-designed static posters that have been machine-decomposed into individually movable elements (each headline, each label, each graphic is its own layer with known pixel coordinates), plus the exact millisecond at which every spoken word occurs. Your job is to choreograph those elements so that what appears, moves, or leaves the screen is locked to what is being said at that instant. You do not write copy, you do not invent elements, you do not redesign the posters. You only decide WHAT MOVES, WHEN, and HOW.

3. INPUT (A) — THE LAYOUT JSON
Shape:
{ "version": 2, "slideCount": N, "slides": [ { "slide": 1, "fileName": "...", "canvas": { "width": 1080, "height": 1350, ... }, "totalElements": 9, "fullText": "...", "elements": [ { "id": "layer_3", "name": "...", "type": "text" | "graphic", "role": "title" | "heading" | "subtitle" | "body" | "caption" | "eyebrow" | "badge" | "tag" | "footer" | ..., "zIndex": 3, "position": "top-center", "normalizedPosition": { "x": 0.08, "y": 0.14, "width": 0.84, "height": 0.11 }, "pixelBounds": { "left": 86, "top": 189, "width": 907, "height": 148 }, "text": "EXPLOITING MARKET STRUCTURE", "textLines": ["EXPLOITING MARKET", "STRUCTURE"], "style": { "fontSizePx": 74, "color": "#F4F4F0", "textAlign": "center", "isUppercase": true, ... } } ] } ] }
Read it carefully. Two fields decide everything you do:
• elements[].id — the ONLY legal way to name an element. Copy it character-for-character. Never invent an id, never renumber, never reuse an id from a different slide (ids restart at layer_1 on every slide).
• elements[].text — the literal words printed on that element. This is how you match an element to the moment it is spoken.

4. INPUT (B) — THE TRANSCRIPT CSV
Columns are typically word,start,end (a header row may or may not be present; times may be in seconds like 4.32 or milliseconds like 4320, and may be ordered differently). Normalise it yourself before you start:
• Convert every timestamp to INTEGER MILLISECONDS from the beginning of the audio.
• Note the last word's end time — that is the natural length of the video.

5. WHAT YOU OUTPUT — THE TIMELINE SCHEMA
Return exactly one JSON document in a single fenced json block, with no commentary before or after it:

{
  "format": "stratix.motion.timeline",
  "version": 1,
  "fps": 60,
  "durationMs": 47820,
  "timeBase": "absolute",
  "canvas": { "width": 1080, "height": 1350 },
  "defaults": { "ease": "easeInOutCubic", "distancePct": 4 },
  "scenes": [
    {
      "slide": 1,
      "label": "Hook — what a liquidity sweep is",
      "startMs": 0,
      "endMs": 8240,
      "enter": { "type": "fade", "durationMs": 320 },
      "exit":  { "type": "cut", "durationMs": 0 },
      "camera": { "cues": [ { "action": "kenBurns", "atMs": 0, "durMs": 8240, "from": 1.0, "to": 1.05, "panXPct": 1.5 } ] },
      "background": { "cues": [ { "action": "fadeIn", "atMs": 0, "durMs": 300 } ] },
      "tracks": [
        {
          "id": "layer_1",
          "name": "EXPLOITING MARKET STRUCTURE",
          "cues": [
            { "action": "hide",       "atMs": 0 },
            { "action": "fadeInUp",   "atMs": 640,  "durMs": 420, "distancePct": 3.5, "word": "exploiting" },
            { "action": "emphasize",  "atMs": 2180, "durMs": 380, "amount": 1.05, "word": "structure" },
            { "action": "slideOutUp", "atMs": 7900, "durMs": 340 }
          ]
        },
        {
          "id": "layer_4",
          "keyframes": [
            { "tMs": 0,    "opacity": 0, "yPct": 2 },
            { "tMs": 3120, "opacity": 0, "yPct": 2 },
            { "tMs": 3520, "opacity": 1, "yPct": 0, "ease": "easeOutCubic" }
          ]
        }
      ]
    }
  ]
}

6. TIME RULES — THE MOST IMPORTANT SECTION
• EVERY time value in the entire document is ABSOLUTE MILLISECONDS measured from the start of the audio. This includes scene startMs/endMs, every cue atMs and every keyframe tMs. There is no scene-relative time. A cue in a scene that runs 20000–28000 has an atMs of, say, 21360 — never 1360.
• Integers only. No seconds, no "00:21.360", no arithmetic expressions.
• durMs is a LENGTH, not a timestamp. A cue occupies [atMs, atMs + durMs].
• Never let an element's cue fall outside its own scene window.

7. SCENE RULES
• One scene per slide, in the order the slides are meant to be spoken. A slide may not appear twice.
• Scenes must TILE the whole audio with no gaps and no overlaps: scene[n].endMs === scene[n+1].startMs. The first scene starts at 0. The last scene ends at (last word end + 400–800ms of tail).
• Decide each scene's span by reading the transcript against the slide's own text: a slide's scene starts on the first word of the sentence that introduces it and ends when the narration moves to the next slide's subject. Split on sentence boundaries, never mid-sentence, and never mid-word.
• Give every slide a fair share — a slide that gets under ~2.5 seconds cannot be read. If the narration genuinely spends 20 seconds on one slide, that is fine; use camera and internal cues to keep it alive.
• "enter": use { "type": "fade", "durationMs": 260–400 } for a soft change of subject, { "type": "cut", "durationMs": 0 } for a hard beat landing on a stressed word, { "type": "dipToBlack", "durationMs": 400–700 } only for a major chapter break. The FIRST scene should fade in from black. Only the LAST scene should carry an "exit" fade.

8. TRACK RULES
• A track animates exactly one element, addressed by its exact elements[].id from that slide.
• DEFAULT BEHAVIOUR MATTERS: any element you do NOT give a track to renders fully visible and completely static for the whole scene, exactly as it was uploaded. So — to build a poster up piece by piece, every element that should not be visible at the start needs a track that begins with { "action": "hide", "atMs": <scene start> } followed by its entrance.
• Cover EVERY element of the slide in that slide's tracks. If an element is deliberately static, still give it a track with a single { "action": "show", "atMs": <scene start> } so it is on the record that you considered it.
• Optional per-track fields: "name" (free text, for your own readability), "visible": false (kill the element for the whole scene), "wipeFrom": "left" | "right" | "top" | "bottom" (direction used by wipeIn / wipeOut).
• Put an optional "word": "<the spoken word this cue lands on>" on any cue. It is ignored by the renderer and exists so a human can audit your sync.

9. CUE CATALOG — element cues (use these; anything else is dropped)
${cueCatalog}
Every cue takes: "action", "atMs", "durMs" (ignored by show/hide), optional "ease", plus its own params listed above.

10. CAMERA CATALOG — scene-level, written under scene.camera.cues
${cameraCatalog}
Camera moves the entire frame, elements and background together. zoom is a multiplier (1 = untouched, 1.06 = a 6% push in). Keep zoom between 1.0 and 1.15 — beyond that the poster crops badly.

11. EASING NAMES (exact strings, case-sensitive)
${easingCatalog}
Sensible picks: entrances easeOutCubic or easeOutBack, exits easeInCubic, continuous drift/zoom easeInOutSine or linear, hits easeOutBack.

12. KEYFRAME ESCAPE HATCH
When no cue expresses what you want, write raw keyframes on a track instead of (or alongside) cues:
{ "tMs": 4200, "opacity": 1, "xPct": 0, "yPct": 0, "scale": 1, "rotate": 0, "blur": 0, "wipe": 1, "ease": "easeOutCubic" }
Channel meanings and units — get these exactly right:
• opacity — 0 to 1.
• xPct / yPct — displacement from the element's designed position, as a PERCENTAGE OF CANVAS WIDTH / HEIGHT. 4 means "4% of the canvas across". Positive y is DOWN. Typical entrance travel is 2–6. A value like 40 throws the element off the screen.
• scale — multiplier of the element's own size. 1 = designed size. Stay within 0.8–1.25.
• rotate — degrees, positive clockwise. Stay within ±6 for text.
• blur — pixels. 0–12.
• wipe — visible fraction, 0 to 1, revealed from the track's wipeFrom edge.
• ease — the curve used to travel INTO this keyframe from the previous one.
Every channel is independent and holds its value outside its own keyframes: before an element's first keyframe on a channel it sits at that first value, and after the last it stays at the last. Channels you never mention stay at rest (opacity 1, no offset, scale 1).

13. HOW TO ACTUALLY SYNC — follow this procedure
1. Normalise the transcript to integer ms. Write out, for yourself, the sentence boundaries and their start/end times.
2. Read every slide's fullText. Map each slide to the stretch of narration that talks about it, by matching the slide's own words to spoken words. This mapping is the backbone of the whole timeline — get it right before you animate anything.
3. Set the scene windows from that mapping, tiling the audio per §7.
4. Inside each scene, for every element: find the exact word at which that element becomes relevant — usually the word that appears in, or paraphrases, its text. Its entrance cue's atMs is that word's start time MINUS a 80–120ms lead-in, so the element has landed by the time the syllable is heard. Never let an entrance finish after the word has finished being spoken.
5. Elements with no spoken counterpart (logos, watermarks, footers, decorative rules, backgrounds) come in at the scene start with a short fade, or stay static for the whole scene.
6. Put an "emphasize" (element) or "cameraPunch" (frame) on genuinely stressed words — numbers, names, the payoff word of a sentence. Maximum one every ~2 seconds; more than that reads as jitter.
7. Give each scene one slow ambient move so it is never frozen: a kenBurns on the camera, or a drift/float on a large graphic.
8. Exits: elements leave 200–500ms BEFORE the next scene starts, so the screen is calm at the cut. Or leave them and let the scene transition carry them out.

14. CHOREOGRAPHY RULES — what makes it look professional
• No more than 2 elements entering at the same instant. Stagger by 80–160ms; a group of related items reads best as a cascade.
• Once a piece of text is up it must stay readable for at least 1200ms before anything happens to it, and must never move while it is the thing being read.
• Entrances 300–500ms, exits 250–400ms, emphasis hits 300–450ms. Anything under 200ms is a flicker; anything over 800ms drags behind the voice.
• Travel small: distancePct 2–6 for text, up to 8 for a large graphic. Big slides look cheap.
• Respect the design: an element that was designed centred must return to xPct 0 / yPct 0 at rest. Every entrance ends at rest.
• Do not animate every element on every beat. A good scene has 2–4 moving moments; the rest holds still and lets the poster read.
• Keep the background alive but subordinate — kenBurns from 1.0 to 1.04–1.08 across the scene is usually enough.

15. SELF-CHECK — run through this before you answer, and fix anything that fails
□ Every id in the output appears verbatim in that slide's elements[].id list.
□ Every element of every used slide appears in exactly one track of its scene.
□ Scenes tile the audio: scene[0].startMs is 0, each endMs equals the next startMs, the last endMs is past the last spoken word.
□ Every atMs and tMs is an absolute integer millisecond inside its own scene's window.
□ No cue ends after its scene ends.
□ Every element that should not be on screen at its scene's start begins with a "hide" (or an entrance cue that starts from invisible, like fadeIn/fadeInUp/popIn/blurIn).
□ Every entrance lands within 150ms of the word it belongs to.
□ Nothing moves while it is being read.
□ xPct/yPct values are single digits; scale values are between 0.8 and 1.25.
□ durationMs equals the last scene's endMs.
□ The output is one fenced json block and nothing else — no explanation, no notes outside the JSON.

16. OUTPUT FORMAT
A single fenced json block containing the timeline document from §5. Nothing before it. Nothing after it. If some part of the input was ambiguous, resolve it yourself with the most conservative reading and put a short "label" on the affected scene explaining the choice — never emit prose outside the JSON.`;
