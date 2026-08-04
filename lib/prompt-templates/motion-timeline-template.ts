import { CAMERA_CUE_DOCS, CUE_DOCS } from "@/lib/motion-timeline/cues";
import { EASE_NAMES } from "@/lib/motion-timeline/easing";

// The cue/easing catalogs are generated from the renderer's own tables, so the
// prompt can never promise the external AI a cue this app cannot execute.
const cueCatalog = CUE_DOCS.map((c) => `• ${c.name} — params: ${c.params}. ${c.description}`).join("\n");
const cameraCatalog = CAMERA_CUE_DOCS.map((c) => `• ${c.name} — params: ${c.params}. ${c.description}`).join("\n");
const easingCatalog = EASE_NAMES.join(", ");

/**
 * Fallback meta-prompt for hand-authoring a timeline.
 *
 * The primary path no longer needs an AI at all: the video prompt emits a sync
 * manifest, and Stratix binds it to the decomposed layers and times it against
 * the transcript itself. This prompt exists for the cases that path cannot
 * cover — posters made outside the video prompt, or a manifest whose elements
 * did not bind — and is written to keep the two paths interchangeable.
 *
 * The key contract with the renderer: a cue's `word` OUTRANKS its `atMs`. When
 * a transcript is loaded the compiler resolves the word against real audio
 * timings, so the model is asked to name words, not to compute milliseconds.
 */
export const MOTION_TIMELINE_TEMPLATE = `1. HOW TO USE THIS
Paste this entire prompt into a new chat with a capable AI. Immediately after it, paste the inputs that follow it below and nothing else. The AI returns ONE JSON document — a motion timeline — which goes back into Stratix → Motion Video → "AI Timeline" → Apply. Never ask the user follow-up questions; apply the defaults in this document and produce the full output immediately.

2. YOUR ROLE
You are a motion director. The posters are already designed and already machine-decomposed into individually movable elements. Your job is to say WHICH element moves, ON WHICH SPOKEN WORD, and HOW. You do not write copy, you do not invent elements, you do not redesign the posters.

3. THE ONE RULE THAT MATTERS MOST — NAME THE WORD, NOT THE MILLISECOND
Every cue you write carries a "word" field: the spoken word that cue lands on. Stratix looks that word up in the transcript and fires the cue at the real audio timing. Your "atMs" is only a hint used to disambiguate a word spoken more than once.
So: spend your effort choosing the RIGHT WORD for each element. Do not spend it on arithmetic. An atMs that is a second off but carries the right word will still be frame-accurate. A perfect atMs with the wrong word will not.
• "word" must appear VERBATIM in the transcript, spelled exactly as the transcript spells it. Copy it from the transcript, do not retype it from the script.
• Every entrance, every emphasis and every exit cue must have a "word". A cue with no word is a cue nobody can verify.

4. INPUTS
(A) LAYOUT JSON — the decomposed elements of each slide. \`box\` is [x, y, w, h] normalised 0–1. \`at\` is a nine-cell grid position.
    • \`id\` is the ONLY legal way to name an element. Copy it character-for-character. Ids restart at layer_1 on every slide.
    • \`text\` is the literal words printed on a text element — how you match it to the moment it is spoken. It is OCR output, so it may have small errors; match on meaning, not on exact characters.
    • Graphic elements carry NO text. That is not an omission — a decomposed pencil sketch has no words in it. Identify a graphic by its \`at\`, its \`box\` size and its \`role\`, cross-referenced against the sync manifest if one was supplied.
(B) SYNC MANIFEST — optional. If present, it already states which drawn object each spoken word is about. It is authoritative: bind its elements to layer ids and use its words. Do not re-derive its choices.
(C) TRANSCRIPT CSV — word-by-word with timestamps. Columns are typically word,start,end.

5. WHAT YOU OUTPUT
Return exactly one JSON document in a single fenced json block, with no commentary before or after it. Write it COMPACT — no pretty-printing, no blank lines.

{
  "format": "stratix.motion.timeline",
  "version": 1,
  "fps": 60,
  "durationMs": 47820,
  "timeBase": "absolute",
  "canvas": { "width": 1080, "height": 1920 },
  "defaults": { "ease": "easeOutCubic", "distancePct": 4 },
  "scenes": [
    {
      "slide": 1,
      "label": "Hook — what a liquidity sweep is",
      "startMs": 0,
      "endMs": 8240,
      "enter": { "type": "fade", "durationMs": 320 },
      "exit":  { "type": "cut", "durationMs": 0 },
      "camera": { "cues": [ { "action": "kenBurns", "atMs": 0, "durMs": 8240, "from": 1.0, "to": 1.05, "panXPct": 1.5 } ] },
      "tracks": [
        { "id": "layer_1", "name": "EXPLOITING MARKET STRUCTURE", "cues": [
          { "action": "fadeInUp", "atMs": 640, "durMs": 420, "word": "exploiting" },
          { "action": "emphasize", "atMs": 2180, "durMs": 380, "amount": 1.05, "word": "structure" }
        ] },
        { "id": "layer_4", "name": "piggy bank", "cues": [
          { "action": "popIn", "atMs": 3520, "durMs": 400, "word": "gullak" }
        ] }
      ]
    }
  ]
}

6. TIME RULES
• Every time value is ABSOLUTE MILLISECONDS from the start of the audio — scene startMs/endMs, every cue atMs. There is no scene-relative time.
• Integers only. No seconds, no "00:21.360", no arithmetic expressions.
• durMs is a LENGTH, not a timestamp. A cue occupies [atMs, atMs + durMs].
• A scene starts ~150ms BEFORE its first spoken word, so an entrance has room to land on that word.

7. SCENE RULES
• One scene per slide, in the order the slides are spoken. A slide may not appear twice.
• Scenes TILE the audio with no gaps and no overlaps: scene[n].endMs === scene[n+1].startMs. The first starts at 0. The last ends 400–800ms after the final word.
• A scene starts on the first word of the sentence that introduces its slide and ends when the narration moves on. Split on sentence boundaries, never mid-sentence.
• Give every slide a fair share — under ~2.5 seconds cannot be read.
• "enter": { "type": "fade", "durationMs": 260–400 } for a change of subject, { "type": "cut", "durationMs": 0 } for a hard beat, { "type": "dipToBlack", "durationMs": 400–700 } only for a chapter break. The FIRST scene fades in from black; only the LAST carries an "exit" fade.

8. TRACK RULES — and what NOT to write
• A track animates exactly one element, addressed by its exact \`id\` from that slide.
• ONLY write a track for an element that actually MOVES. An element with no track renders fully visible and completely static for the whole scene, exactly as designed — which is the correct result for logos, handles, footers, background rules and anything the script never mentions. Stratix reports untouched elements back to the user, so nothing is lost by leaving them alone.
• DO NOT emit placeholder tracks. A track whose only cue is "show" is noise; delete it. Aim for 2–5 moving elements per scene, not fifteen.
• An element that should not be visible at the scene start needs an entrance that starts from invisible (fadeIn, fadeInUp, popIn, blurIn, wipeIn, zoomIn) — those hide themselves. Only use an explicit { "action": "hide", "atMs": <scene start> } before a cue that does NOT start from invisible.
• Optional per-track fields: "name" (free text), "visible": false (kill the element for the scene), "wipeFrom": "left" | "right" | "top" | "bottom".

9. CUE CATALOG — element cues (use these; anything else is dropped)
${cueCatalog}
Every cue takes: "action", "atMs", "word", "durMs" (ignored by show/hide), optional "ease", plus its own params listed above.

10. CAMERA CATALOG — scene-level, written under scene.camera.cues
${cameraCatalog}
Camera moves the entire frame together. zoom is a multiplier (1 = untouched). Keep zoom between 1.0 and 1.15 — beyond that the poster crops badly.

11. EASING NAMES (exact strings, case-sensitive)
${easingCatalog}
Sensible picks: entrances easeOutCubic or easeOutBack, exits easeInCubic, continuous drift/zoom easeInOutSine or linear, hits easeOutBack.

12. KEYFRAME ESCAPE HATCH
When no cue expresses what you want, write raw keyframes on a track instead of (or alongside) cues. A keyframe may carry a "word" too, and it is snapped the same way:
{ "tMs": 4200, "word": "gullak", "opacity": 1, "xPct": 0, "yPct": 0, "scale": 1, "rotate": 0, "blur": 0, "wipe": 1, "ease": "easeOutCubic" }
Channel meanings and units:
• opacity — 0 to 1.
• xPct / yPct — displacement from the element's designed position, as a PERCENTAGE OF CANVAS WIDTH / HEIGHT. Positive y is DOWN. Typical entrance travel is 2–6; 40 throws it off screen.
• scale — multiplier of the element's own size. 1 = designed size. Stay within 0.8–1.25.
• rotate — degrees, positive clockwise. Stay within ±6 for text.
• blur — pixels, 0–12.
• wipe — visible fraction 0–1, revealed from the track's wipeFrom edge.
• ease — the curve used to travel INTO this keyframe from the previous one.
Every channel holds its value outside its own keyframes. Channels you never mention stay at rest (opacity 1, no offset, scale 1).

13. PROCEDURE
1. If a SYNC MANIFEST was supplied, work from it: for each beat, bind each manifest element to a layer id on that slide — text elements by their \`text\`, drawn elements by \`at\` + \`box\` size + \`kind\`. Then write one track per bound element using the manifest's own word and entrance. You are done; skip to the self-check.
2. With no manifest: read each slide's text elements, and map each slide to the stretch of narration that talks about it. This mapping is the backbone — get it right before animating anything.
3. Set the scene windows from that mapping, tiling the audio per §7.
4. For every element that the narration actually mentions, find the word at which it becomes relevant and write its entrance with that "word". Elements with no spoken counterpart get NO TRACK.
5. Put an "emphasize" (element) or "cameraPunch" (frame) on genuinely stressed words — numbers, names, the payoff word. At most one every ~2 seconds.
6. Give each scene one slow ambient move: a kenBurns on the camera, or a drift/float on a large graphic.
7. Exits: elements leave 200–500ms BEFORE the next scene starts, or are carried out by the cut.

14. CHOREOGRAPHY RULES
• No more than 2 elements entering on the same word. Stagger by 80–160ms; a related group reads best as a cascade.
• Once text is up it must stay readable for at least 1200ms, and must never move while it is the thing being read.
• Entrances 300–500ms, exits 250–400ms, emphasis hits 300–450ms. Under 200ms is a flicker; over 800ms drags behind the voice.
• Travel small: distancePct 2–6 for text, up to 8 for a large graphic.
• An element that was designed centred must return to xPct 0 / yPct 0 at rest. Every entrance ends at rest.
• A good scene has 2–4 moving moments; the rest holds still and lets the poster read.
• Keep the background alive but subordinate — kenBurns 1.0 → 1.04–1.08 across the scene is enough.

15. SELF-CHECK — run through this before you answer, and fix anything that fails
□ Every cue that is an entrance, an emphasis or an exit carries a "word".
□ Every "word" appears verbatim in the transcript, spelled as the transcript spells it.
□ Every id appears verbatim in that slide's element list.
□ No track exists whose only cue is "show" — those are deleted, not emitted.
□ Scenes tile the audio: scene[0].startMs is 0, each endMs equals the next startMs, the last endMs is past the last spoken word.
□ Every atMs is an absolute integer millisecond inside its own scene's window.
□ Nothing moves while it is being read.
□ xPct/yPct values are single digits; scale values are between 0.8 and 1.25.
□ durationMs equals the last scene's endMs.
□ The output is one compact fenced json block and nothing else.

16. OUTPUT FORMAT
A single fenced json block containing the timeline document from §5, printed compact. Nothing before it. Nothing after it. If some input was ambiguous, resolve it yourself with the most conservative reading and note the choice in that scene's "label" — never emit prose outside the JSON.`;
