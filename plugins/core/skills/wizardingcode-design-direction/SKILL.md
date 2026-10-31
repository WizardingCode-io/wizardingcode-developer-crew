---
name: wizardingcode-design-direction
description: "After the design brief, on a surface or world: excludes the category's obvious page, deals directions from the open library, finds the idea with the competitor test, writes the contract."
---

# Design direction

## When

After `wizardingcode-design-brief`, on `surface` or `world`. Never for `extend`.

## Inputs

`design/brief.md`, `PRODUCT.md`, the engine's deal.

## Steps

1. **Name the rut.** The product's unique mechanism in one sentence, the audience's real scene, its cultural home, what this first page must prove. Then the page this category always ships and its predictable opposite: both stay off every list. A brief's literal metaphor gets at most one candidate.
2. **List seven candidates**, on `world`: concrete visual systems, artefacts, places or rituals the audience knows by heart, each with why it resonates and how it looks (ground, type voices, the one signature). Include its graphic and screen traditions. On `operate` and `read` never the tools the audience operates; on `persuade` and `experience` at most one. More than three in one material family means dig until three families exist. On `surface`, keep the world and list five to seven structures instead.
3. **Deal**: `crew design <id> deal`. It prints three options (direction, hero, type, palette, structure, grammar) from `plugins/core/design/library/`, seeded, avoiding what the last five sites used. Read each option's rows in the library. Hold each against the inventory: which way of composing can carry something only this client has?
4. **Weigh the candidates against the deal** on two axes: audience identification and product clarity. A dealt option that wins becomes the direction; one that holds one axis stays an alternative; one that loses both still gives the direction one named discipline, written as its own line.
5. **Present one direction with up to two alternatives**, each with its world, first screen, the visitor's path, signature interaction and an honest risk, plus the category standard as a quiet exit that you never recommend. A person picks; `crew design <id> choose <n>`. With nobody present, take the first dealt option and state the assumptions. A pinned brand beats the deal: `--redraw <slot> --reason "<why>"` is only for a stated reason (a brand constraint, an asset that does not exist), never for comfort.
6. **Find the idea**, in `design/direction.md` under `## Idea`: "On this page, <what belongs to the subject> becomes <the device the direction calls for>." Fill the first blank from the inventory, not from the category. Look at its output, its object or shape, its name, its place, its ritual, its printed artefact, its opposite.
7. **Run the competitor test**, under `## Competitor`: put the nearest real competitor in the sentence. If it still works, the idea belongs to the category; find another. "Clean and modern" is not an idea.
8. **Choose one live thing**, made from the idea: one thing the visitor can do, or that differs per visit. It uses the subject's real content, works with a thumb, has a plain fallback with no script, never blocks reading.
9. **Commit the world**: a colour strategy before any colour (Restrained, Committed, Full palette or Drenched), and light or dark from one sentence of physical scene (who, where, under what light). Refuse the four looks AI falls into when the brief leaves the look free: cream ground, serif and terracotta; near-black with one neon and glowing edges; broadsheet hairlines, italic serif and tracked mono labels; flat ink, black boxes and hard offset shadows. If someone could guess the look from the category alone, rework it.
10. **Write the contract** under `## Contract`, one line per block, about 150 words: `THESIS:` the one idea and the default arrangement it refuses. `OWN-WORLD:` palette and components, recognisable with the content removed. `STORY:` what the visitor understands, believes and does. `FIRST VIEWPORT:` what is where and at what size, where the action sits. `FORM:` the chosen form and the deal's seed. `FINISH:` unreviewed and undocumented is unfinished. A block that reads like a mood means the direction is not decided. Never copy the contract into shipped files.
11. **Say when it is hollow.** Each direction states what would empty it (no photography, no place content, a single product shot). Refuse a clay or low-poly diorama as a default as well. The picture cast: 4 to 6 roles, each section with one or text-led on purpose; one tactile object or material section, so the page is not purely digital. What the visitor chose in the live thing carries into the inquiry and never resets at the action.
12. **Keep the range honest.** Premium-minimal only when asked: loud asked for and charcoal returned means the questions were decorative. Variants differ on a named axis, and a colour swap does not count; three variants take three different primary axes. With tools present, study two or three real sites and record the URL, the date and the trait, each labelled measured, derived or inferred; otherwise label it "inferred, not viewed".

## Output

`design/deal.json` (the engine's), `design/direction.md`.

## Done when

`crew design <id> check` no longer names `direction.md` or the deal. The spec's page lines cite the contract, and each animation named in its motion line comes from it.
