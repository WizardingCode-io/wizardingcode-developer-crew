---
type: regex
target: trace
pattern: '\|[^|\n]*\d[\d.,]*\s*(?:k\b|K\b|000)?[^|\n]*(?:members|users|messages|payments|requests|connections|GB|MB|TB|per second|per day|per month)[^|\n]*\|'
arm: with-only
---
