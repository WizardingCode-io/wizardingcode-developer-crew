---
type: regex
target: trace
pattern: '# ui-ux findings for(?:[^"\\]|\\.)*?## Findings(?:(?!## Not answerable)(?:[^"\\]|\\.))*?\\n- F-\d+ \S+ defect \S+ (?=(?:[^"\\]|\\[^n])*(?:transition|300 ?ms|eas(?:e|es|ing)\b|duration|animat))(?:[^"\\]|\\[^n])*public/styles/inbox\.css|# ui-ux findings for(?:[^"\\]|\\.)*?## Findings(?:(?!## Not answerable)(?:[^"\\]|\\.))*?\\n- F-\d+ \S+ defect \S+ (?:[^"\\]|\\[^n])*public/styles/inbox\.css(?:[^"\\]|\\[^n])*(?:transition|300 ?ms|eas(?:e|es|ing)\b|duration|animat)'
arm: with-only
---
