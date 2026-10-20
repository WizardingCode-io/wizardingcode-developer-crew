# Prompt

A system prompt, a skill or an instruction file. The kind where the untrusted inputs, the version and the eval get forgotten because the words were right.

## Assumed by good practice
- The instructions apart from the data: untrusted text separated and clearly marked, and every place external text enters named.
- The prompt versioned with the eval that pins it, and the eval rerun after every change.
- Its length and cost known: everything in the request counts toward the context window, and a cached prefix still occupies it.
- The cache order respected (tools, then system, then messages), the stable part first, so a change invalidates the least.

## Decisions only the user can make
- What the prompt promises the user, and what it refuses.
- Which sources it may read on the user's behalf.

## Proposals
- The stable part first and the variable part last, for the cache.
- An eval that compares the prompt with and without the change.

## Warnings
- A prompt that pipes a web page or a file into itself unmarked.
- A prompt changed without its eval rerun.
- A prompt that relies on a specific rule to override a deny rule: the order decides, not the specificity.
