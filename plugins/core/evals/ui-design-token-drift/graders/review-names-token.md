---
type: regex
target: trace
pattern: '# ui-ux findings for(?:[^"\\]|\\.)*?## Findings(?:(?!## Not answerable)(?:[^"\\]|\\.))*?\\n- F-\d+ \S+ defect \S+ (?=(?:[^"\\]|\\[^n])*DESIGN\.md)(?:[^"\\]|\\[^n])*public/styles/inbox\.css|# ui-ux findings for(?:[^"\\]|\\.)*?## Findings(?:(?!## Not answerable)(?:[^"\\]|\\.))*?\\n- F-\d+ \S+ defect \S+ (?=(?:[^"\\]|\\[^n])*public/styles/inbox\.css)(?:[^"\\]|\\[^n])*DESIGN\.md'
arm: with-only
---
