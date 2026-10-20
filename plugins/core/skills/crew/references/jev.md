# Jev, the verification backend

Jev is TypeSafe's System One model: it answers typed questions (yes or no, one of a set, a level) with probabilities, never text. The engine asks it four things when it is configured, records every answer on the item (`evidence.verifications`, the report's `## Verifications` table) and lets the answer make the crew stricter or make it wait, never looser. The roles never call Jev; you never do either: the commands ask.

## Configured

- The key: `WIZARDINGCODE_JEV_API_KEY` in the environment of the session, read at each command, written to no file and printed nowhere.
- The endpoint and the model: `WIZARDINGCODE_JEV_ENDPOINT` and `WIZARDINGCODE_JEV_MODEL`, or `crew config jev.endpoint <url>` and `crew config jev.model <name>` (user's decisions; the environment wins); the defaults are `https://api.typesafe.ai/v1/systemone` and `jev-latest`. The key travels over `https://` only (or `http://` to a loopback host); an endpoint with userinfo is refused.
- The canned transport: `crew config jev.endpoint file:///path/to/answers.json` makes Jev "configured" with a JSON object keyed by question id whose values are answers as the API returns them; every record then says `model: "file"`. It is for the tests and the evals; a record made through it is a fixture's word, never a model's.

## What leaves the machine

`crew policy set verify.asks <subset of defect,validator,fact,triage,knowledge>` (default all five; a policy with no `asks` key, or an empty one, takes the default and so gains `knowledge`; a policy that lists some keeps its list as written) names the asks the engine may make; an ask outside it is never made and records nothing. Per ask:

- **defect** (`crew judgement record`, the item's and a todo's): for each upheld defect of a not-proven ruling that names a line inside the change: the file, the line, the finding's text (cut at 1000 characters) and the rubric's question in one sentence. Under `verify.send: claims` (the default) nothing else; under `claims-and-snippets`, the diff's lines from five before to five after the cited one.
- **validator** (`crew approve <id> spec --validator complete-gap-round`): `conclave.md` (cut at 16 KiB), the decisions (id, question, answer, default) and the objections (id, severity, status, criterion).
- **fact** (`crew research <id> verify`): for each fact of `conclave/researcher.md` whose quote the engine found in its source: the claim, the quote and 600 characters of the source around it. The engine fetches the source first (an `http(s)` URL with no header of yours, 15 s, 2 MiB, text only, no link-local or cloud-metadata host; or a tracked file under the root): a quote it does not find is `not-found` and asks nothing.
- **triage** (`crew start --source` with a proposed priority): the request's text (cut at 8 KiB), the channel, the connector and the proposal, the signed business priorities (cut at 8 KiB) when signed, and the open items' kinds and priorities.

- **knowledge** (at classification and `crew knowledge <id> lookup`): the request's title and kind, and for each entry the base listed for the item (visible ones alone: rule 13) its id, kind and title; every title goes through the secrets scanner first and a flagged one leaves as `[redacted: <rule>]`; the entry's text (cut at 4000) goes under `claims-and-snippets` alone, a marked entry's included, by the user's opt-in. At most `verify.maxClaimsPerItem` entries are asked.

## The marks and their effects

`verify.threshold` (default 0.8, settable 0.5 to 0.99): a yes-or-no answer at or above it is yes, at or below one minus it is no, between is unverified; a choice counts when its confidence reaches it.

- A defect: `verified by jev (0.93)`, `disputed by jev (0.95)` or `unverified: <reason>` under the gate's line and in the report; a disputed defect stays a defect, the verdict and the exit code do not change. Up to `verify.maxClaimsPerItem` (default 50) per record; the rest `unverified: over verify.maxClaimsPerItem`.
- The validator: both conditions yes, the approval proceeds `(verified by jev)`; any no, the approval is refused `disputed by jev: <condition> (<confidence>); the item waits for a person` and the item is marked waiting for the user (rule 15); between, it proceeds `(unverified: between the thresholds)`.
- A fact: marked in `conclave/researcher.verification.json` (engine-owned, with the researcher file's hash); `crew debate <id> close` refuses until the current file is verified (`run crew research <id> verify first`); pass the verification file to the experts with the researcher's.
- A knowledge entry: `likely <noul>` at or above the threshold, `unlikely <noul>` at or below one minus it, `unverified (<reason>)` between or when Jev could not answer, written after the entry's reasons in `knowledge.md`; likely entries come first, the rest keep the lookup's order; nothing is dropped and nothing hidden appears.
- A triage: `jev proposes <level> (<confidence>; production down <p>, signed deadline <p>, vague <p>)`, capped at the source's proposal (`, capped at the source's high`); below the threshold `jev: no proposal (…)`. A proposal to you, the lead; your confirmation (the triage) is the record.

## Jev down

A timeout, a network error, a 401, a 429 or a 529 after two retries, or a malformed answer: the records say `unverified: jev unavailable: <reason>`, nothing is recorded as an answer, the verdict stands on the judge's, the validator's or the lead's word, and a full-route item is marked waiting for the user after a judgement record (the command says so). `crew metrics` prints `verifications: <n> (defects verified <v>, disputed <d>, unverified <u>; agreement <a>)`, the agreement being verified over verified plus disputed over the defects.
