# Writing

Every text the crew writes is read by a person who did not watch the work: a document, an ADR, a spec, a code comment, a commit message, the report's prose, the session's ending. This page says what such a text must not carry, so it reads as written for its reader and not as generated filler. The gates catch what a phrase alone gives away (`references/gate.md`, the prose gate); the rest is the writer's to avoid and the reviewers' to name.

## The tells of prose

Each tell is a pattern of meaning, not a word. A listed word alone is never a finding: a tell needs the shape it names, and its guard says when the shape is honest.

- Inflated significance: a plain change described as pivotal, a milestone or a testament to something. Guard: a claim with its measure (a number, a before and after, a named consequence) is a fact, not inflation.
- Vague attribution: "experts say", "it is widely known", "studies show", with no source. Guard: a named source, a link or a file and line is attribution; keep it.
- Chatbot artefacts: a greeting, an offer of more help, a closing wish, an apology for the length, the phrases the prose gate lists. Guard: a string the change quotes on purpose (a parser's fixture, a help text about a chat tool), with the gate's allowance.
- Cutoff disclaimers: a sentence about what the writer could not know or see at the time of writing. Guard: a date that bounds a fact ("read on 2026-10-29") is provenance, not a disclaimer.
- Sycophancy: praise of the request, the question or the reader before the answer. Guard: none in a technical text; thank a person only where they did something.
- Stacked hedging: "may possibly", "could perhaps", "it seems that it might". Guard: one hedge that carries a real doubt stays; say once what is not known and why.
- A generic positive close: a last line that the work is now robust, seamless, elegant or ready for anything. Guard: a close that names what is proven and what is not is the report's own last line.
- An aphoristic closer: a quotable moral at the end of a paragraph. Guard: a conclusion that follows from the paragraph's facts and adds one.
- Negative parallelism: "it is not X, it is Y" where nobody said X. Guard: a correction of something a reader did say or believe.
- A rule of three where two items are true: a third adjective or example added for rhythm. Guard: three items that each carry their own fact.
- Bold overuse: bold on whole sentences or on every second phrase. Guard: bold on the first words of a list item, as a label.
- Rhythm with no content: every sentence the same length, every paragraph opened by a transition word. Guard: a list of parallel facts is meant to be parallel.
- The four copy tells of the frontend standard (`references/frontend.md`): a triplet of filler, a contrast nobody asked for, the dash aside, the stock phrase. Guard: the standard's own exceptions.

## Facts are kept

A rewrite that removes a tell keeps the meaning whole. It never invents a source to fix a vague attribution: it names the source it has, or marks the gap as `[source?]` and says so. It keeps every hedge and every scope limit that carries meaning (an "on macOS", a "for the standard route", a "not measured"), since cutting one turns a true sentence into a false one. It adds no fact the writer did not have. When a sentence cannot be made plain without changing what it claims, it stays as it is and the doubt is said beside it.

## Where it applies

To what the crew writes in this repository and in every project it works in: documents, ADRs, specs, plans, the brief and the conclave, code comments, commit messages and pull request bodies, the report's prose, the findings and the session's ending. A project's own documents follow the project's own conventions first (its language, its tone, its style guide); this page applies where they say nothing. A user's text is never rewritten for style unless the user asks; a change edits only what its criteria name.

## Provenance

Distilled on 2026-10-29 in the crew's words (ADR 0017), nothing of either catalogue quoted:

- department-of-prose (CyranoB, MIT, commit `60ef0cc`): the tells of prose as patterns of meaning with a false-positive guard each, the rule that a word alone is never a finding, and the fact-preservation rule. Its catalogue paraphrases Wikipedia's "Signs of AI writing" (CC BY-SA 4.0); the patterns enter in our words, and nothing of either is quoted.
- ai-slop-cleaner of oh-my-claudecode (Yeachan Heo, MIT, skill commit `8690a21`): the posture that a cleanup preserves behaviour and stays inside the change.
- taste-skill (Leonxlnx, MIT, tag v2.1.2, commit `b9ca2fd`; later tags exist, up to v2.1.5 on the day): the copy tells of shipped interfaces, folded into the frontend standard and its pack.
- slop-review (Dan Bachelder): read, taken for nothing (its upstream carried no licence when it was ported).
