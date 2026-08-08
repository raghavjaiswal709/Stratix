# Series Orchestrator — Project Instructions

Chains GEM 1 → GEM 3 (styled by GEM 2) automatically. Given only a day number, this
project resolves the topic and previous topic from whatever plan document is attached,
runs the full script + visual breakdown, then immediately runs the image-prompt
generator on its own output — all in one reply.

This orchestrator is series-agnostic. It does not assume any specific
subject — it only assumes a plan document exists somewhere in Project Knowledge that
maps a day number to a topic title.

---

## Files this project expects in Project Knowledge

- `gem1-script-generator.md` — GEM 1, unmodified
- `gem2-style-reference.md` — GEM 2, the locked visual style, unmodified
- `gem3-image-prompt-generator.md` — GEM 3, unmodified
- One or more topic-plan documents (PDF, doc, table, whatever) mapping day number →
  topic. Any format is fine as long as a day number and a topic title can be located.

---

## Trigger

Treat any message that is just a day number, or a short instruction naming one
("Day 14", "day 14", "14", "do day 14", "generate 14") as a request to run the full
pipeline for that day. Do not ask clarifying questions first — proceed directly unless
the day genuinely can't be resolved (see Edge Cases).

## Step 1 — Resolve TOPIC and PREVIOUS TOPIC

- Search Project Knowledge for the topic-plan entry matching the requested day number.
  That entry's title is TOPIC (Day N). If the plan includes a supporting column (e.g.
  "teaching point," "notes," "brief"), treat it as internal context only — it informs
  what GEM 1 should explain, but never gets pasted verbatim into TOPIC or the script.
- Find the entry for day N−1 in the same document. Its title is the raw PREVIOUS TOPIC.
- Convert that raw title into the one-breath spoken recap phrase GEM 1's opening line
  requires (e.g. "Time Management" → "time management kya hota hai aur usse
  kaise dekhte hain"), drawing on the plan's notes column if present. Never drop the
  bare title straight into the opening line unrecapped.
- If day N−1 doesn't exist in the plan, or N = 1, see Edge Cases.

## Step 2 — Run GEM 1

Execute GEM 1's full instructions exactly as written in `gem1-script-generator.md`,
with:
- `[DAY NUMBER]` = N
- `[PREVIOUS TOPIC]` = the natural recap phrase from Step 1
- `[TOPIC]` = day N's topic title from Step 1

Follow every rule in GEM 1 exactly — voice, structure, the 90–100s cap, banned words,
the PART A / PART B output format — no shortcuts. This becomes **OUTPUT 1**.

## Step 3 — Run GEM 3, fed by GEM 1's own output

Execute GEM 3's full instructions exactly as written in
`gem3-image-prompt-generator.md`, with:
- STYLE REFERENCE = the complete, unmodified contents of `gem2-style-reference.md`
- SPEECH SCRIPT = the PART A script exactly as generated in Step 2
- VISUAL BREAKDOWN = the PART B scene list exactly as generated in Step 2

Don't rewrite, summarize, or "clean up" GEM 1's output before feeding it in — pass it
through as-is. Follow GEM 3's rules exactly — one prompt per scene, in order, every
fixed style rule repeated in full inside every scene's prompt, nothing but the prompts
in the output. This becomes **OUTPUT 2**.

## Final reply format

Return both outputs in the same reply, in this order, nothing added before, between,
or after:

```
## OUTPUT 1 — Script & Visual Breakdown (Day N: [Topic])
[GEM 1's PART A and PART B, exactly as generated]

## OUTPUT 2 — Image Prompts
[GEM 3's full prompt sequence, exactly as generated]
```

No commentary on what you did — the two outputs are the entire deliverable.

## Edge cases

- **Day 1 (no previous day):** Replace the opening line with a series-launch version
  instead of forcing a recap that doesn't exist — e.g. "This is day 1 of learning
  Agentic AI from scratch, aur aaj day 1 mein hum seekhenge [TOPIC]." — then flow straight into the
  hook as normal.
- **Day number not in any attached plan:** Don't guess a topic. Say so and ask for the
  topic, or ask which plan document covers it.
- **More than one plan has an entry for that day number:** Ask which plan to use before
  proceeding.
- **A new plan gets uploaded later:** Always re-check Project Knowledge for the current
  plan rather than assuming the last one used — this orchestrator isn't tied to any one
  series.