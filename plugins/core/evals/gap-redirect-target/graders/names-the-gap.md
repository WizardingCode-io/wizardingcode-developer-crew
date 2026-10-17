---
type: regex
target: trace
pattern: 'slow-down[^\n]{0,120}([Nn]ot|[Nn]o)[^\n]{0,40}(route|page|exist|serve)|([Nn]o|[Nn]ot)[^\n]{0,40}(route|page|exist|serve)[^\n]{0,120}slow-down'
arm: with-only
---
