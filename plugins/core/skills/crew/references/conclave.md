# Conclave

Standard and full routes, after the spec. Goal: say what the request leaves out before a line is written, and let the user decide what only they can.

## The gap round, always

Write `.crew/work/<id>/conclave.md` with the four headings below, each with content or the word "none". The engine refuses `crew phase <id> next` into Plan until all four have content, until every decision has a counted answer, and until every blocking objection is bound to a criterion or waived.

## Assumed by good practice

What you will do without asking, stated so the user can refuse: "The endpoint is authenticated and paginated." Each line becomes a criterion (`crew criteria <id> add "<text>"`), `preserve` when it keeps something as it is.

## Decisions only the user can make

What two competent engineers would build differently. Record each one as you find it: `crew decision <id> add "<question>" --default "<the conservative answer>"`. Ask the user on one screen (mark the work with `crew await <id> user` when the answers need a turn); record each answer with `crew decide <id> D-n "<answer>"`; the permission prompt is the user's signature. A decision without a counted answer blocks Plan. In an unattended session (headless, bypassPermissions or dontAsk), and only when `policy.json` sets `unattendedDecisions` to `validator`, the validator takes the stated default: `crew decide <id> D-n --mode <mode> --validator stated-default`. No default, no validator: the item waits for a person.

## Proposals

Optional improvements, each with its reason. The user takes or leaves each; a taken one becomes a criterion.

## Warnings

What the request asks for that goes against good practice, and why. Each one is an objection: `crew objection <id> add "<text>" --by gap-round --severity advisory`, or `blocking` when building it as asked would be wrong. A blocking objection is answered by binding it to the criterion whose proof resolves it (`crew objection <id> resolve O-n --criterion AC-k`) or by the user's waiver (`crew objection <id> waive O-n --reason "<why>"`, which asks the user and shows in the report as decided by the user). Plan is refused while a blocking objection is neither; the item is not proven while one is open or bound to an unproven criterion. The report lists every objection with its status, and its verdict line says how many were waived.

## When the debate opens

The debate opens on consequences, never on the route alone: a blocking objection from the round, a warning the user wants to build anyway on a risk area, a decision whose answer changes a risk area (who holds a permission, what is hard-deleted, which side of a conflict wins), or the user asking for it. Until SP2b ships the roles (researcher, experts, devil's advocate, fault-finder, judge), you run the round yourself in this context and record its outcome through the commands above; say so in the brief under `## Assumptions`.

## The validator

The validator decides only what a rule covers: a spec approval under `complete-gap-round` (`crew approve <id> spec --mode <mode> --validator complete-gap-round`, refused by the engine while a section, a default or a binding is missing) and a decision's stated default. The validator never waives an objection and never skips a gate or a test-first record. Its decisions count only under policy `validator`, and the record always says "by the validator (rule: …)", never "by the user".

## Then

`crew phase <id> next` into Plan, and on as the method says.
