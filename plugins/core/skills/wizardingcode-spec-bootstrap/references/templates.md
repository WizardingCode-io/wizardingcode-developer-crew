# The contracts `wizardingcode-spec-bootstrap` writes

## Component

For a directory with source files.

```markdown
# <Component>

## Overview
<What this component does and why it exists>

## Interface
- <Public classes, functions and symbols, each cited>
- <Child directories, each a link to its contract>

## Invariants
- <What must stay true for anyone who changes this>

## Side Effects
- <State changed, network, disk, locks>

## Verification
- Run: `<command>`
```

## Root blueprint

For the root of the run, always.

```markdown
# <Repository> Blueprint

## System Overview
<What this system does, from high up>

## Local Interface & Invariants
<Only when the root holds source files>

## Subdirectories & System Boundaries
- <Name>: <link to its contract> - <its role>

## Global Invariants
- <Constraints that cross components>

## Global Side Effects
- <Shared resources, databases, integrations>

## System Verification
- Run: `<command>`
```

## Intermediate blueprint

For a folder of folders.

```markdown
# <Directory>

## Overview
<What is grouped here>

## Subdirectories & Boundaries
- <Name>: <link to its contract> - <its role>
```

Provenance (ADR 0017): these distil the Elephant-Goldfish Model's `egm-bootstrap/references/templates.md` (Apache-2.0, Google, `403d888`), in the crew's words.
