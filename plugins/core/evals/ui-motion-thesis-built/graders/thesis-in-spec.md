---
type: regex
target: trace
pattern: '(?:"file_path":\s*"[^"]*spec\.md",\s*"(?:content|new_string)":\s*"|"command":\s*"(?:[^"\\]|\\.)*spec\.md)(?:[^"\\]|\\.)*?(?:\\n|[\s*\x60-])motion: (?!none)(?:(?!rejected:)(?:[^"\\]|\\[^n]))*?(?:\bjob\b|\bpurpose\b|\bso (?:that|a person)\b|\bto (?:say|show|draw|tell|mark|signal)\b|\bnotic)'
arm: with-only
---
