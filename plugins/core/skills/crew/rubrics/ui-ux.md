# UI/UX rubric

The UI/UX gate asks whether the change does what the criterion says where the user sees it, with the states a user can reach, operable by keyboard, in the project's language and voice. It is planned on any route when the diff touches interface files; it runs only when the session has a browser to take captures, and without one it is recorded as not run, never as passed.

## What the reviewer receives

Captures the session took in a browser of each page the diff changes, one per page and state, under `review/ui/<page>-<state>.png`; the item's criteria; the diff (`review/diff.patch`) and the files it touches (`review/files.txt`) for what a capture cannot show.

## Questions

1. The criterion in the capture: does each changed page, in its default state, show what its criterion says?
2. States: do the empty, loading and error states exist where the page can reach them, and the success state of a form or an action? A reachable state with no capture is a gap in the run, reported under "Not answerable".
3. Keyboard and labels: can the change be reached and operated without a mouse; is focus visible; is every input tied to a label; does every icon that acts have a name?
4. Copy: is every string in the project's language, in the voice of the neighbouring pages, with no placeholder or developer text and no raw error reaching the user?
5. Consistency: does the change use the components, spacing and patterns the project already has for the same thing?
6. Responsive: where the project serves small screens, does the change hold at the narrowest width the project supports?

## Defect or advisory

A **defect**: the default state does not do what the criterion says (1); a reachable error or empty state that does not exist (2); an input without a label or a control unreachable by keyboard (3); a string in the wrong language or a raw error shown to the user (4). An **advisory**: spacing, alignment and colour differences (5); a sentence longer than it needs to be; a loading state missing where the wait is under a second; a layout that holds but crowds at the narrowest width (6).

## Only the change

The reviewer judges only the change, never the repository: a finding outside the changed files is advisory and marked debt. A page the diff did not touch, a component the project already had with a missing label, a site-wide copy problem: debt, under "Outside the change".
