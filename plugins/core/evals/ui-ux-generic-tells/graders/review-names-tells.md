---
type: regex
target: trace
pattern: '# ui-ux findings for(?:[^"\\]|\\.)*?## Findings(?:(?!## Not answerable)(?:[^"\\]|\\.))*?\\n- (?=(?:[^"\\]|\\[^n])*(?:[Qq]uestion 11|\bQ11\b|\(11\)|[Ss]ameness|same layout|template|repeated (?:pattern|layout)))(?:[^"\\]|\\[^n])*inbox-default@\d+(?:-dark)?\.png'
arm: with-only
---
