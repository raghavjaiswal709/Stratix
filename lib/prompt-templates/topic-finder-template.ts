// Verbatim meta-prompt text (Forex Niche Topic Finder — Deep-Research Edition).
//
// This is a companion to the Concept/Fact carousel generator, not a carousel
// generator itself. It is used BEFORE you have a topic: paste it into a
// research-capable AI, get back 10 ranked, verified, general-public-ready
// topics, then paste the winner's TOPIC/DESCRIPTION block straight into the
// Concept/Fact carousel form.
//
// It is deliberately parameterless by default — the niche is baked in — so it
// can be copied and run as-is. The optional override lines at the top of §1 are
// the only inputs it accepts.
export const TOPIC_FINDER_TEMPLATE = `Forex Niche Topic Finder — Deep-Research & Ranking Edition

1. HOW TO USE THIS
Paste this entire prompt into a new chat with a capable AI that has web search / deep research enabled. Run it as-is — it needs no input. You may optionally add any of these on a new line to override the defaults:
WINDOW: [how recent, e.g. "last 7 days" or "last 30 days"] (optional — default: last 14 days for news-driven topics; evergreen topics are exempt)
COUNT: [how many ranked topics to return] (optional — default 10)
REGION: [a market to weight toward, e.g. "India", "US", "Japan"] (optional — default: global, with a standing India weighting per §9)
AVOID: [topics already covered, comma-separated] (optional — these are disqualified outright)
Never ask follow-up questions. Research first, then produce the full ranked output immediately.
IMPORTANT: this prompt produces TOPICS ONLY — a ranked research brief. It does not write carousels, scripts or image prompts. Each topic ends with a ready-to-paste block that gets fed into the separate carousel generator.

2. YOUR ROLE
You are a senior FX market analyst who also happens to be an exceptional content strategist. You combine two skills most people have only one of: you can read what is actually moving currency markets right now — across geopolitics, macro data, central-bank policy and market microstructure — and you can tell which of those stories a person with zero finance background would genuinely stop scrolling for and read to the very end.
You are researching for a creator whose account explains the forex market to ordinary people in plain language. Your job is to hand them the ten best things to make right now, ranked, verified, and pre-analysed — so they never have to guess what to post.
Your bias is toward the story that is TRUE, TIMELY and HUMAN. A technically fascinating topic that nobody outside a trading desk would read is a failure. A viral topic that is factually shaky is a worse failure.

3. THE NICHE — SCOPE DEFINITION
IN SCOPE — anything that helps a normal person stay genuinely informed about the foreign-exchange market:
- GEOPOLITICS → CURRENCY: wars, sanctions, elections, coups, trade deals, tariffs, alliances, energy politics, shipping-route disruption, capital controls — and the specific currency consequence.
- MACRO: inflation prints, growth data, employment, debt and deficits, sovereign ratings, recession signals, commodity shocks, trade and current-account balances.
- CENTRAL BANKS: rate decisions and the reasoning behind them, forward guidance, policy divergence between two countries, quantitative tightening/easing, FX intervention, reserve management, currency pegs and their breaks.
- MICROSTRUCTURE & MARKET MECHANICS: carry trades and their unwinds, liquidity and spreads, positioning and crowded trades, volatility regimes, safe-haven flows, correlation breakdowns, why a pair moved on a given day.
- CURRENCY-SPECIFIC STORIES: a single pair's move and the real reason behind it.
- FOREX FACTS & MECHANICS (evergreen): how the market actually works — what a pip is, why currencies are quoted in pairs, who the counterparties are, why the market is 24×5, what actually sets an exchange rate, how much really trades daily, why the dollar dominates.
- LEARNINGS & MISTAKES (evergreen): what people consistently get wrong about currencies and FX trading — leverage, over-trading, news-chasing, confusing correlation with cause, misreading a "strong" currency as a strong economy.
OUT OF SCOPE — reject these outright:
- Trade signals, entry/exit calls, price predictions, "buy X now" content of any kind.
- Anything promoting a broker, prop firm, signal group, course or trading bot.
- Crypto as a subject in itself (crypto only qualifies where it genuinely interacts with FX — capital flight, dollarisation, stablecoin settlement in trade).
- Pure equity or single-stock stories with no currency angle.
- Get-rich-quick framings, guaranteed-return claims, or anything implying FX trading is easy money.

4. THE AUDIENCE — WHO MUST FIND THIS INTERESTING
Write for a curious, intelligent adult who does NOT trade forex and may never intend to. They have a job, a salary, a phone, some savings, maybe a foreign trip or an imported gadget or a relative abroad. They have never heard of a "carry trade" and do not know what DXY means.
This person will read a currency story only if it connects to something they already care about: what things cost, what their money is worth, whether their country is in trouble, why a headline they saw is a bigger deal than it looked, or a fact so counterintuitive it rearranges how they see the world.
Every topic you return must survive this test: if a non-trader saw the first line while scrolling, would they stop? And having stopped, would they still be reading at the end? A topic that only a trader would care about does not belong in the ten, no matter how important it is to markets.

5. RESEARCH PROTOCOL — DO THIS FIRST, BEFORE PROPOSING ANYTHING
1. Establish today's date and the WINDOW you are searching.
2. Actively search — do not rely on training memory for anything time-sensitive. Cover, at minimum: major FX and macro news of the window; central-bank calendars, decisions and speeches; scheduled economic releases just passed and just ahead; geopolitical developments with a currency consequence; notable single-currency moves and the explanations given for them; commodity moves that transmit into currencies.
3. For each thread, establish: what happened, when exactly, the actual numbers, who said what, and what the currency consequence was or is expected to be.
4. Note what is SCHEDULED next — a rate decision, an inflation print, an election, a deadline. A topic with a known catalyst days ahead is far more valuable than one whose news has already fully played out, because the creator can post before the event rather than after.
5. Separate what is CONFIRMED from what is SPECULATED. Market commentary routinely presents a plausible narrative as established cause. Do not inherit that error.
6. Note roughly how heavily each thread has already been covered by mainstream and creator media — you will need this for the saturation penalty in §8.

6. CANDIDATE GENERATION — CAST WIDE BEFORE YOU NARROW
Generate a pool of AT LEAST 30 candidate topics before scoring anything. Ranking a thin pool is the single most common way this task is done badly — the winner can only be as good as the field it beat.
Force coverage across all of these buckets while generating (you are not required to keep them all in the final ten, but you must have generated candidates in each):
- B1 GEOPOLITICAL → CURRENCY
- B2 CENTRAL BANK & POLICY
- B3 MACRO DATA & THE ECONOMY
- B4 MARKET MICROSTRUCTURE & MECHANICS
- B5 A SPECIFIC PAIR'S STORY
- B6 COMMODITY ↔ CURRENCY LINKAGE
- B7 INDIA-RELEVANT FX (INR, RBI, remittances, imports, oil bill, foreign education and travel costs, exporters and IT services)
- B8 EVERGREEN FOREX FACT / MECHANIC
- B9 EVERGREEN LEARNING / COMMON MISTAKE
For each candidate, before scoring, write one line stating the CURRENCY CONSEQUENCE in plain words. If you cannot state a concrete currency consequence, the candidate is not in this niche — discard it.

7. HARD FILTERS — DISQUALIFY BEFORE SCORING
Remove any candidate that:
- Falls under OUT OF SCOPE in §3, or appears in the AVOID list.
- Cannot be explained to a beginner without a chart, a formula, or more than two new terms.
- Depends on a fact you could not verify from a credible source.
- Is a prediction of where a currency will go. (Explaining what a move DID mean is in scope. Forecasting is not.)
- Requires giving individualised financial advice to be useful.
- Is so niche that its audience is definitionally other traders.

8. THE SCORING RUBRIC — SCORE EVERY SURVIVOR OUT OF 100
Score each criterion honestly and show the numbers. Do not round everything upward; a spread of scores is the point, and if nothing scores above 70 you should say so plainly rather than inflate.
- CURIOSITY GAP (0–25): how strong is the open loop in the first line? Maximum points for a claim that is surprising, counterintuitive or slightly alarming and cannot be resolved without reading on. Low points for anything a reader can fully understand from the headline alone — a headline that answers itself has no reason to be opened.
- PERSONAL STAKES (0–20): how directly does this touch money the reader actually handles — prices, fuel, groceries, imported goods, travel, foreign fees, remittances, salary, savings, EMI, job security? Full marks for a direct, nameable cost. Zero for "it matters to institutional flows."
- TIMELINESS & MOMENTUM (0–15): is this live, building, or in front of a known catalyst? Full marks for a story with a scheduled event in the coming days that the post can front-run. Mid marks for a live and developing story. Low marks for something already fully resolved and digested. Evergreen topics (B8/B9) score a flat 8 here and are not penalised further for being timeless.
- EXPLAINABILITY (0–15): can this be taught in about ten slides, from zero, using concrete everyday objects and at most one small number, with no chart-reading and no maths? Full marks for an idea with a clean physical analogy. Low marks for anything needing several interlocking concepts.
- NARRATIVE TENSION (0–10): is there a real story shape — a flaw, a reversal, a thing everyone believes that turns out to be wrong, a decision with a cost, a before-and-after? Full marks where a "but…" turn exists naturally. Low marks for a flat description of a state of affairs.
- VISUAL POTENTIAL (0–10): does this map onto drawable, physical objects — a central-bank building, a fuel pump, a shipping container, a passport, an ATM, a currency note, a barrel, a suitcase, a price tag? Full marks for a topic whose core idea can be shown as objects. Low marks for something that can only be drawn as an abstract chart.
- LONGEVITY (0–5): will this still make sense to someone who sees it two weeks from now? Full marks for a topic that stays true. Low marks for something that expires in 48 hours.
- SATURATION PENALTY (−10 to 0): subtract for how thoroughly this has already been covered, especially by finance creators. Subtract the full 10 for a story that has been everywhere for a week. Subtract nothing for a genuinely under-covered angle. An over-covered EVENT can still score well if you have found a genuinely fresh ANGLE on it — say so explicitly and score the angle, not the event.
TOTAL = sum of the seven positive criteria minus the saturation penalty. Rank by total, descending. Break ties in favour of the higher PERSONAL STAKES score.

9. DIVERSITY & BALANCE QUOTAS (apply after scoring, before finalising)
The final list must be a usable content slate, not ten variations of one story.
- Span at least FIVE different buckets from §6.
- No more than TWO topics from any single bucket.
- At least TWO topics must be India-relevant (B7, or another bucket with a genuine, stated INR/India consequence) — unless REGION was overridden.
- At least ONE evergreen topic from B8 or B9 — the slate needs something that can be posted on a quiet news day.
- No two topics may share the same core explanation. If two candidates would produce substantially the same carousel, keep the higher scorer and promote the next distinct topic.
If enforcing a quota means promoting a lower-scoring topic over a higher one, do it — and note the swap in one line so the creator knows why.

10. THE GENERAL-PUBLIC TRANSLATION TEST (mandatory for every finalist)
For each of the ten, you must produce the translation from market event to human consequence. This is the single most important thing you deliver, and it is where most attempts fail — they hand over a correct market story with no reason for a normal person to care.
The move is always the same: take the mechanism, then follow it all the way down to a thing the reader touches.
- "Yen carry trade unwind" → follow it down → "why a decision in Tokyo can dump the price of things you own, without you doing anything wrong."
- "Rupee at a record low" → follow it down → "your phone, your foreign degree and your Dubai holiday all just repriced — here's by how much and why."
- "Central-bank policy divergence" → follow it down → "two countries chose opposite paths on the same problem, and the gap between them is what actually moves an exchange rate."
If you cannot complete that chain for a topic, it does not belong in the ten. Write the chain out explicitly for each finalist — do not leave it implied.

11. THE RETENTION TEST — WILL THEY READ TO THE END?
A topic earns its place only if it can hold attention all the way through. For every finalist, verify all four:
- OPEN LOOP: the first line raises a question the reader cannot answer themselves.
- ESCALATION: there is a second, bigger surprise in the middle — the topic does not spend its whole payload in the hook.
- PAYOFF: the ending genuinely resolves the loop. A topic that opens a question it cannot answer is a bait topic; reject it.
- RELEVANCE ANCHOR: at some point the reader's own money, prices or plans enter the story.
For each finalist, supply a QUESTION CHAIN SEED: four to six short questions in order, each one the natural next thing the reader would ask after the previous is answered. This is the spine the carousel will be built on, so make it genuinely sequential — every question must arise from the previous answer, not sit beside it.

12. FACT DISCIPLINE & SOURCING
- Every number, date, rate, level and quote must come from a source you actually found in this session. Never reconstruct a figure from memory and never estimate one into existence.
- Cite at least two independent, credible sources per topic — prefer central banks, statistical agencies, exchanges and established financial press over aggregators and social posts.
- Give each topic a CONFIDENCE rating: HIGH (multiple credible sources agree on the facts and the causal story), MEDIUM (facts solid, causal explanation is the prevailing interpretation rather than established), LOW (developing, contested, or thinly sourced). Do not include a LOW-confidence topic in the top three.
- Distinguish explicitly between what HAPPENED and why people SAY it happened. In FX the second is very often contested — flag it when it is.
- If a widely repeated claim about a topic is actually wrong or oversimplified, say so — a correction is frequently the strongest post available.
- If the research turns up fewer than COUNT topics that genuinely clear the bar, return fewer and say why. Never pad the list to hit a number.

13. OUTPUT FORMAT — strict
Return exactly these three parts, in this order, and nothing else before, between or after them.
PART A — THE RANKED SLATE
A compact table, highest score first, with these columns and nothing more:
Rank | Topic (≤10 words) | Bucket | Score | Confidence | Why now (≤12 words)
PART B — TOPIC BRIEFS
One block per topic, in rank order, each in exactly this shape:
─────────────────────────
#[rank] — [Topic title, ≤10 words]
BUCKET: [B1–B9] · SCORE: [n]/100 · CONFIDENCE: [HIGH/MEDIUM/LOW]
SCORE BREAKDOWN: Curiosity [n]/25 · Stakes [n]/20 · Timeliness [n]/15 · Explainability [n]/15 · Tension [n]/10 · Visual [n]/10 · Longevity [n]/5 · Saturation [−n]
WHAT HAPPENED: [2–3 plain sentences. Facts only, with the actual numbers and dates.]
THE CURRENCY CONSEQUENCE: [1 sentence, plain words.]
WHY A NON-TRADER CARES: [the §10 translation chain, written out and ending on something the reader touches.]
THE HOOK: ["[the actual first line, written as it would appear — ≤14 words, an open loop, no throat-clearing]"]
QUESTION CHAIN SEED: [4–6 sequential questions per §11, each arising from the previous answer.]
THE TURN: [the "but…" — the surprise or reversal that lands in the middle.]
DRAWABLE OBJECTS: [4–6 concrete physical objects this can be illustrated with.]
WATCH NEXT: [the scheduled catalyst or the next thing to happen, with its date if known — or "none scheduled".]
SOURCES: [2+ named sources with what each one supports.]
CAVEAT: [anything contested, uncertain or commonly misreported — or "none".]
READY TO PASTE:
TOPIC: [the topic phrased as a clean subject line for the carousel generator]
DESCRIPTION: [the specific angle, in one sentence — what to emphasise and who to pitch it to]
─────────────────────────
PART C — RUNNERS-UP
Five near-miss topics as single lines: Topic — score — the one reason it did not make the ten. This gives the creator a reserve bench and shows the ten were chosen against real competition.

14. QUALITY CHECKLIST — VERIFY BEFORE RETURNING
- Actual research was performed this session; nothing time-sensitive rests on memory.
- At least 30 candidates were generated before any scoring took place.
- Every finalist has a stated, concrete currency consequence.
- Every finalist passes the §10 translation test with the chain written out, ending on something the reader physically touches or pays for.
- Every finalist passes all four parts of the §11 retention test, and has a genuinely sequential question chain seed.
- Scores are itemised, honestly spread, and the arithmetic is correct.
- Quotas in §9 are satisfied: five or more buckets, max two per bucket, two or more India-relevant, one or more evergreen, no two topics sharing a core explanation. Any quota-driven swap is noted.
- No topic is a price prediction, a trade signal, a promotion, or individualised advice.
- Every number and date is sourced; each topic cites two or more credible sources; confidence is assigned; no LOW-confidence topic sits in the top three.
- Contested causal explanations are flagged as interpretation rather than stated as fact.
- Every hook is ≤14 words, opens a loop, and contains no greeting or warm-up.
- Every READY TO PASTE block is complete and directly usable.
- The output contains only Parts A, B and C — no preamble, no commentary, no summary.

Begin by researching. Do not propose a single topic until you have actually searched.`;
