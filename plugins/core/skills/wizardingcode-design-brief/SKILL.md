---
name: wizardingcode-design-brief
description: "Before a new site, page or frontend: decides the surface and how much to invent, inventories what only this client has, writes each section as a claim with its proof."
---

# Design brief

## When

An item that builds a new site, a new page or a replacement look, before the spec's page lines. Not for a section inside an established site: that is `extend`, and this skill ends at step 2.

## Inputs

The request, the repository (`DESIGN.md`, stylesheets, components, assets), `PRODUCT.md` when it exists.

## Steps

1. **Decide what is already true.** A coherent look already in the code is inherited, with or without a `DESIGN.md`. A redesign keeps the product's truth, content, function and constraints and replaces the look. An incomplete brand keeps what is confirmed. Only with no visual authority is a new world created.
2. **Record the surface and the amount of invention**: `crew design <id> surface <mode> --invention <amount>`.
   - The mode comes from the surface, not the product: `persuade` (someone must act), `operate` (a task done often), `read` (a reader's question), `experience` (the work itself leads).
   - The amount: `extend` inherits and needs nothing more; `surface` is a whole page in an established world; `world` creates or replaces the look. A new product cannot be `extend`.
3. **Ask what changes the work**, two or three questions at most, skipping what is settled, never CSS values or a style lane.
   - Persuade: who must act, what they should believe, what real proof exists.
   - Operate: the task, the information, the states, how often, the constraints.
   - Read: the reader's question, the source, the structure, the way around.
   - Experience: what leads, how exploring unfolds, which interaction matters.
   - Every mode: what success looks like, what must stay untouched, what would make a polished result feel wrong.
   - A vague brief is answered with your reading in one line; ask only when a missing fact blocks the work, such as the product's name.
4. **Name what exists.** The brand's colours, fonts and logo, and above all the imagery that truly exists. Do not plan around pictures you do not have.
5. **Write `PRODUCT.md`** when it is missing: Platform, Stack, Users, Purpose, Positioning, Operating Context, Capabilities and Constraints, Brand Commitments, Evidence on Hand, Principles, Accessibility. Confirmed facts only; an absence is said; no visual decisions.
6. **Inventory the subject**, in `.crew/work/<id>/design/brief.md` starting with the lines `Client: <name>` and `Address: <address>`, under `## Inventory`: 8 to 12 bullets that belong to this client and to no competitor. Look at its name and what it means; its address, street and what that place looks like (tiles, signs, shop fronts, light); the numbers in the brief (seats, minutes to the sea, the price, the year); the constraint it lives with (one batch a month, closed in winter); its materials; its rituals and hours; the printed things of its world (a timetable, a label, a ticket).
7. **Write the argument** under `## Argument`: one bullet per section, `- <section>: <claim> · proof: <what proves it>`. The claims decide which sections exist and in what order; a section with no claim is deleted. This is what avoids hero, logos, three features, testimonial, pricing, call to action.
8. **Check what was supplied.** Open every supplied asset: a filename is no proof of content. "Better", "fresh" or "redesign" name no direction: ask which. When the person's taste is known from earlier choices, keep it only when stated or after two decisions resolved the same way, never from a fallback.
9. **Ask for references**, once, with the default `no references`. A reference is a picture of the level the page must reach. With none, `design/brief.md` says `no references` and the work goes on.
   - What is taken: the user's own file, the client's own material, a page this project already ships, a comp the user approved. The user's own file is one the user or the client made or holds the rights to, and its row says so. A third party's page that the user hands over, and that is no gallery's, is taken with its owner named in its row. A capture of this project's own page is the session's to take.
   - What is not: a reference whose origin is not said is not taken, and the origin is asked before the file is opened. A file that came from a gallery is not taken as a picture, whoever hands it over. What enters is a written observation of the crew's own with the original site's link, as `wizardingcode-frontend-verification` says, unless the user decides, on record, to change the crew's rule on galleries; a gallery's own terms still bind whatever the crew's rule says. A third party's page is the user's to hand over. A page the session captures itself is not taken until the user decides.
   - Where they go: each in `design/refs/`, which is in the project's ignore file before the first reference is saved. `design/shots.md` holds one row per reference and width: `| Shot | Ref | Whose and from where | Shows | Take from it | Leave | Width |`. A shot is one state of one page at one width, and `Shot` names its capture: the page and the state. Its cells hold no person's name and no client's private name: whose is a role (the user's, the client's, a third party's) and, for a public site, its address.
   - What the build does with one: a reference that is the client's own may be recreated, and its row says so; any other is matched in quality, in this client's own look: only what is the client's is recreated. From a reference that is not the client's take quality and proportion, never its code, copy, pictures or signature effect.
   - A person in one: a reference that shows a real person's face, name or details is cropped or blurred by the user before it is taken, or is not taken.
   - Keeping them in: references never enter a commit and are never published. No file of `design/refs/` is staged before a commit, none is copied into a folder the site ships, and no capture of the build beside its reference is published.

## Output

`design/surface.json` (the engine's), `PRODUCT.md`, `design/brief.md`, and `design/shots.md` where references exist.

## Done when

`crew design <id> check` no longer names `brief.md`. Proof is never invented: no customers, quotes, reviews, press, logos or business figures that the brief does not give.
