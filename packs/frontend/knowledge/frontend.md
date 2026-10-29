# Frontend

What a model gets wrong when it builds a page, how such work is verified by the crew and where the documentation is. Each line is a fact read on 2026-10-27 from the pages listed in the README's sources; the values a page is held to are the core's frontend standard (`references/frontend.md` of the crew skill), named here and not copied.

## What the model gets wrong

- A raw colour, radius or shadow written beside the token that holds it, so the page drifts from its `DESIGN.md` on the first edit.
- `transition: all`, which animates layout properties the browser must reflow, and a hover as the only way to reach information, which a touch screen never shows.
- The states left out: an empty, a loading, an error or a success branch the diff does not build, so a declared state has no capture.
- An icon set mixed with emoji, a heading that announces instead of naming, an empty state that explains the product instead of giving the next action.
- Motion added for spectacle on a control used many times a day, when the standard's first row asks for feedback at most.
- A focus ring removed with no replacement, a target under the sizes WCAG 2.2 names, contrast under 4.5:1 on body text.
- The tells of a generated interface, as taste-skill's registry dated them on 2026-10-29: violet or indigo as the accent nobody chose, cream with terracotta as the palette, an icon in a tinted square on every card, an eyebrow above every heading, grey body text that fails its contrast.

## How work is verified

- The criterion carries its page lines and the plan has the capture spec; the e2e gate runs the crew's fixture and writes `review/ui-evidence.json`, the manifest the reviewer, the frontend lead and the report read.
- The design lint runs before any reviewer on the changed interface files (`transition: all`, a layout property animated, a duration past 500 ms, a missing `prefers-reduced-motion` branch, an unguarded hover, a raw colour against the contract).
- The reviewer answers the ten questions of the UI/UX rubric from the manifest, the captures, the accessibility snapshots, the axe results, the motion samples and the reduced-motion pass; the judge upholds a defect only on an evidence file the manifest lists.
- The frontend lead validates the spec (the page lines, the thesis, the contract) and the delivery (the manifest complete, the ruling proven, the lint green), on the engine's files.

## Where the documentation is

- WCAG 2.2 and its success criteria by number: https://www.w3.org/TR/WCAG22/
- The `prefers-reduced-motion` media feature, set by the person's system: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- Tailwind's `motion-reduce:` and `motion-safe:` variants over that feature: https://tailwindcss.com/docs/hover-focus-and-other-states
