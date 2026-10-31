---
name: wizardingcode-design-copy
description: "Before any markup on a new site: writes the whole page as plain text, every section complete, headlines that fit, specific to this client, with no invented proof."
---

# Design copy

## When

After the direction and before any markup, on `surface` or `world`.

## Inputs

`design/brief.md`, `design/direction.md`, `references/writing.md`.

## Steps

1. **Inventory the strings** in `design/copy.md`, one `## <section>` for each section of the argument, named exactly as there.
2. **Headlines fit.** At most two lines at every width: about 32 characters, 4 to 6 words, 42 with a smaller phone size. Section headings 2 to 5 words. A support line of at most 22 words directly under the headline.
3. **The first screen answers the visitor's first question in large type.** An event: what, when and where. A product: what it is and what it costs or does. A person: who and what they do. One primary action, named for what it does, as a real button on the first screen.
4. **Every section delivers.** The whole menu with prices, each room with its details, the price with what it includes, an answer for each real question. Thin sections are the commonest reason a clean page loses to a busier one.
5. **Swap test.** Replace the client's name with a competitor's. A sentence that still works is rewritten from the inventory.
6. **Refuse the tells.** Stock phrases (unlock, seamless, elevate, supercharge, cutting-edge, world-class, the future of, not just X but Y). Generic actions (Learn more, Get started, Click here, Submit): name the action or the thing. Decorative "Est." lines and coordinates, explainer captions, reflex threes, the dash aside, a heading that announces instead of naming, an empty state that explains the product instead of giving the next action. An error says what happened and what to do, with no apology. An action keeps its name: Publish becomes Published.
7. **Facts.** Sample details where the brief leaves gaps (dish names, rates) are expected and listed for the client to confirm. Proof is never invented: no customers, quotes, reviews, press, logos or business figures; a missing one stays `{{price}}` until given. Demonstration data is labelled synthetic where a visitor could mistake it for the real thing.
8. **More tells.** The clipped negative tail (", no guessing"), one-line closers and rows of fragments, "X is the language of Y" sayings, "From X to Y" with no real continuum, a coined label with no definition, staged questions and "Imagine a world where", declaratives that name nothing, false agency, "serves as", "boasts" and "features" instead of "is" and "has", a heading restated by its first sentence, sales words for places (nestled, in the heart of, renowned, breathtaking, must-visit, stunning). Keep the odd specific detail that carries voice.
9. **Voice and honesty.** Three to five voice traits, each with a do and a don't, and sample rewrites. Headlines tested in the longest language the site serves: German and Finnish as the worst case, navigation at 130%. An inquiry saved is not an email sent or a booking: never show false success.

## Output

`design/copy.md`.

## Done when

`crew design <id> check` no longer names `copy.md` and `design-lint` names no `copy/` rule. The list of sample details goes in the report.
